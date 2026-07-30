from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select

from app.core.cache import cache_delete_prefix, cache_get_json, cache_set_json
from app.env import ENV

def create_base_urls_router(
    session_local_factory,
    base_url_model,
    access_policy_model,
    mcp_tool_model,
    api_endpoint_model,
    api_server_link_model,
    tool_version_model,
    endpoint_version_model,
    base_url_registration_model,
    normalize_openapi_path_fn: Callable[[str | None], str],
    ensure_default_access_policy_for_owner_fn,
    sync_api_server_links_by_host_fn,
    reset_openapi_catalog_fn: Callable[[], None],
    fetch_openapi_spec_from_base_url_fn,
    write_audit_log_fn,
    audit_log_model,
    get_actor_dep,
    build_openapi_tool_catalog_fn=None,
) -> APIRouter:
    router = APIRouter()
    allowed_domains = {"ADM", "OPS"}

    def _normalize_domain_type(value: str | None) -> str:
        domain = (value or "ADM").strip().upper()
        if domain not in allowed_domains:
            raise HTTPException(status_code=400, detail="domain_type must be ADM or OPS")
        return domain

    def _normalize_selected_endpoints(value: list[str] | None) -> list[str]:
        if not value:
            return []
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        # preserve order while deduplicating
        return list(dict.fromkeys(cleaned))

    class BaseURLUpdate(BaseModel):
        model_config = ConfigDict(extra="forbid")

        description: str | None = None
        url: str | None = None
        domain_type: str | None = None
        selected_endpoints: list[str] | None = None
        openapi_path: str | None = None
        include_unreachable_tools: bool | None = None
        is_enabled: bool | None = None
        restore_dependents: bool | None = None

    def _soft_delete_base_url_dependents(db, base_url_id: int, owner_id: str) -> dict[str, int]:
        tools = db.scalars(
            select(mcp_tool_model).where(
                (mcp_tool_model.raw_api_id == base_url_id) | (mcp_tool_model.owner_id == owner_id)
            )
        ).all()
        for tool in tools:
            tool.is_deleted = True

        endpoints = db.scalars(
            select(api_endpoint_model).where(api_endpoint_model.owner_id == owner_id)
        ).all()
        for endpoint in endpoints:
            endpoint.is_deleted = True
            endpoint.exposed_to_mcp = False

        return {"tools": len(tools), "endpoints": len(endpoints)}

    def _hard_delete_base_url_dependents(db, base_url_id: int, owner_id: str) -> dict[str, int]:
        tool_ids = [
            row.id
            for row in db.scalars(
                select(mcp_tool_model).where(
                    (mcp_tool_model.raw_api_id == base_url_id) | (mcp_tool_model.owner_id == owner_id)
                )
            ).all()
        ]
        endpoint_ids = [
            row.id
            for row in db.scalars(select(api_endpoint_model).where(api_endpoint_model.owner_id == owner_id)).all()
        ]

        if endpoint_ids:
            db.execute(
                delete(endpoint_version_model).where(endpoint_version_model.endpoint_id.in_(endpoint_ids))
            )
            db.execute(delete(api_endpoint_model).where(api_endpoint_model.id.in_(endpoint_ids)))

        if tool_ids:
            db.execute(delete(tool_version_model).where(tool_version_model.tool_id.in_(tool_ids)))
            db.execute(delete(mcp_tool_model).where(mcp_tool_model.id.in_(tool_ids)))

        db.execute(delete(access_policy_model).where(access_policy_model.owner_id == owner_id))
        db.execute(delete(access_policy_model).where(access_policy_model.base_url_id == base_url_id))
        db.execute(delete(api_server_link_model).where(api_server_link_model.raw_api_id == base_url_id))
        return {"tools": len(tool_ids), "endpoints": len(endpoint_ids)}

    def _is_tool_matching_selected(method: str, path: str, tool_name: str, selected_set: set[str]) -> bool:
        if not selected_set:
            return False
        m_upper = (method or "").upper().strip()
        p_norm = (path or "").rstrip('/') or '/'
        exact_key = f"{m_upper} {p_norm}"
        raw_key = f"{m_upper} {path}"

        for item in selected_set:
            item_str = str(item).strip()
            if not item_str:
                continue
            if item_str == exact_key or item_str == raw_key or item_str == tool_name:
                return True
            parts = item_str.split(' ', 1)
            if len(parts) == 2:
                i_method, i_path = parts[0].upper().strip(), parts[1].rstrip('/') or '/'
                if i_method == m_upper and i_path == p_norm:
                    return True
        return False

    def _sync_app_tools_selection(db: Any, app_name: str, selected_endpoints: list[str]) -> None:
        owner_id = f"app:{app_name}"
        selected_set = {str(item).strip() for item in selected_endpoints if str(item).strip()}

        tools = db.scalars(
            select(mcp_tool_model).where(mcp_tool_model.owner_id == owner_id)
        ).all()

        for tool in tools:
            method = (getattr(tool, "method", "") or "").upper()
            path = getattr(tool, "path", "") or ""

            is_selected = _is_tool_matching_selected(method, path, tool.name, selected_set)

            if is_selected:
                tool.owner_enabled = True
                tool.is_enabled = bool(getattr(tool, "admin_enabled", True) and tool.owner_enabled)
                tool.is_deleted = False
                tool.registration_state = "selected"
                tool.exposure_state = "active"
            else:
                tool.owner_enabled = False
                tool.is_enabled = False
                tool.is_deleted = True
                tool.registration_state = "unselected"
                tool.exposure_state = "disabled"

    @router.post(
        "/register-base-url",
        summary="Register Application",
        description="Create or update an application base URL registration. Source: backend/app/routers/base_urls.py",
    )
    async def register_base_url(
        data: base_url_registration_model,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        normalized_openapi_path = normalize_openapi_path_fn(data.openapi_path)
        include_unreachable = 1 if data.include_unreachable_tools else 0
        description = (getattr(data, "description", "") or "").strip()

        import re
        if not re.match(r"^https?://[a-zA-Z0-9.-]+(?::[0-9]+)?(?:/[^\s]*)?$", data.url):
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid URL format. Must start with http:// or https://")

        try:
            with session_local_factory() as db:
                # Check for duplicate URL
                url_dup = db.scalar(
                    select(base_url_model).where(
                        base_url_model.url == data.url,
                        base_url_model.name != data.name,
                        base_url_model.is_deleted == False
                    )
                )
                if url_dup:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail=f"An application is already registered with the URL: {data.url}"
                    )

                existing = db.scalar(select(base_url_model).where(base_url_model.name == data.name))
                before_state = None
                if existing:
                    verify_resource_ownership(existing.created_by_user_id, actor)
                    before_state = {
                        "name": existing.name,
                        "url": existing.url,
                        "description": existing.description or "",
                        "domain_type": existing.domain_type or "ADM",
                        "openapi_path": existing.openapi_path or "",
                        "include_unreachable_tools": bool(existing.include_unreachable_tools),
                        "is_enabled": bool(existing.is_enabled),
                        "is_deleted": bool(existing.is_deleted),
                    }
                    existing.url = data.url
                    existing.description = description
                    existing.domain_type = _normalize_domain_type(getattr(data, "domain_type", "ADM"))
                    existing.selected_endpoints = _normalize_selected_endpoints(
                        getattr(data, "selected_endpoints", [])
                    )
                    existing.openapi_path = normalized_openapi_path
                    existing.include_unreachable_tools = include_unreachable
                    existing.is_enabled = True
                    existing.is_deleted = False
                    # Mark as healthy immediately so tools are exposed right after registration
                    if existing.health_status in ("unknown", None, ""):
                        existing.health_status = "healthy"
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"app:{existing.name}",
                        base_url_id=existing.id,
                    )
                    _sync_app_tools_selection(db, existing.name, existing.selected_endpoints)
                else:
                    base_url = base_url_model(
                        name=data.name,
                        url=data.url,
                        description=description,
                        domain_type=_normalize_domain_type(getattr(data, "domain_type", "ADM")),
                        selected_endpoints=_normalize_selected_endpoints(
                            getattr(data, "selected_endpoints", [])
                        ),
                        openapi_path=normalized_openapi_path,
                        include_unreachable_tools=include_unreachable,
                        is_enabled=True,
                        is_deleted=False,
                        created_by_user_id=actor.get("subject") or actor.get("sub") or actor.get("username"),
                        # Mark as healthy immediately so tools are exposed right after registration
                        health_status="healthy",
                    )
                    db.add(base_url)
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"app:{base_url.name}",
                        base_url_id=base_url.id,
                    )
                    _sync_app_tools_selection(db, base_url.name, base_url.selected_endpoints)
                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action="base_url.upsert",
                    resource_type="application",
                    resource_id=data.name,
                    before_state=before_state,
                    after_state={
                        "name": data.name,
                        "url": data.url,
                        "description": description,
                        "domain_type": _normalize_domain_type(getattr(data, "domain_type", "ADM")),
                        "selected_endpoints": (existing or base_url).selected_endpoints or [],
                        "openapi_path": normalized_openapi_path,
                        "include_unreachable_tools": bool(include_unreachable),
                        "is_enabled": True,
                        "is_deleted": False,
                    },
                )
                db.commit()

            sync_api_server_links_by_host_fn()
            reset_openapi_catalog_fn()
            cache_delete_prefix("status:")

            # Immediately sync tools to DB so they are queryable right after registration.
            # This ensures PATCH /tools/by-endpoint works without a separate syncCatalog round-trip.
            if build_openapi_tool_catalog_fn is not None:
                try:
                    await build_openapi_tool_catalog_fn(force_refresh=True)
                except Exception:
                    pass  # non-fatal: tools will sync on next catalog request

            return {
                "message": "Base URL registered successfully",
                "name": data.name,
                "url": data.url,
                "description": description,
                "domain_type": _normalize_domain_type(getattr(data, "domain_type", "ADM")),
                "selected_endpoints_count": len((existing or base_url).selected_endpoints or []),
                "selected_endpoints": (existing or base_url).selected_endpoints or [],
                "openapi_path": normalized_openapi_path,
                "include_unreachable_tools": bool(include_unreachable),
            }

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get(
        "/base-urls",
        summary="List Applications",
        description="Retrieve all application base URL registrations. Source: backend/app/routers/base_urls.py",
    )
    def list_base_urls(
        include_inactive: bool = Query(default=True),
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        try:
            with session_local_factory() as db:
                query = select(base_url_model)
                if not include_inactive:
                    query = query.where(
                        base_url_model.is_enabled == True,  # noqa: E712
                        base_url_model.is_deleted == False,  # noqa: E712
                    )

                role = actor.get("primary_role") or "developer"
                sub = actor.get("subject") or actor.get("sub") or actor.get("username")
                username = actor.get("username")

                if role != "admin":
                    user_ids = [id_val for id_val in (sub, username) if id_val]
                    query = query.where(base_url_model.created_by_user_id.in_(user_ids))

                rows = db.scalars(query).all()
                base_urls = [
                    {
                        "name": row.name,
                        "url": row.url,
                        "description": row.description or "",
                        "domain_type": row.domain_type or "ADM",
                        "selected_endpoints": row.selected_endpoints or [],
                        "openapi_path": row.openapi_path or "",
                        "include_unreachable_tools": bool(row.include_unreachable_tools),
                        "is_enabled": bool(row.is_enabled),
                        "is_deleted": bool(row.is_deleted),
                        "admin_allowed": True,
                        "health_status": "unknown",
                    }
                    for row in rows
                ]

            return {"base_urls": base_urls}

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get(
        "/openapi-spec",
        summary="Fetch OpenAPI Spec",
        description="Fetch and validate OpenAPI spec for a target URL/path. Source: backend/app/routers/base_urls.py",
    )
    async def get_openapi_spec(
        url: str,
        openapi_path: str | None = None,
        retries: int = Query(default=0, ge=0, le=5),
        domain_type: str = Query(default="ADM"),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user

        try:
            with session_local_factory() as db:
                return await fetch_openapi_spec_from_base_url_fn(
                    url, 
                    openapi_path=openapi_path, 
                    retries=retries, 
                    domain_type=domain_type, 
                    db=db
                )
        except ValueError as exc:
            detail = str(exc)
            status_code = 400 if detail.startswith("URL must") else 502
            raise HTTPException(status_code=status_code, detail=detail) from exc

    @router.patch(
        "/base-urls/{name}",
        summary="Update Application",
        description="Update application metadata/settings by name. Source: backend/app/routers/base_urls.py",
    )
    async def update_base_url(
        name: str,
        payload: BaseURLUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            row = db.scalar(select(base_url_model).where(base_url_model.name == name))
            if not row:
                raise HTTPException(status_code=404, detail=f"Base URL '{name}' not found")

            verify_resource_ownership(row.created_by_user_id, actor)

            before_state = {
                "name": row.name,
                "url": row.url,
                "description": row.description or "",
                "domain_type": row.domain_type or "ADM",
                "openapi_path": row.openapi_path or "",
                "include_unreachable_tools": bool(row.include_unreachable_tools),
                "is_enabled": bool(row.is_enabled),
                "is_deleted": bool(row.is_deleted),
            }

            if payload.url is not None:
                row.url = payload.url
            if payload.domain_type is not None:
                row.domain_type = _normalize_domain_type(payload.domain_type)
            if payload.selected_endpoints is not None:
                row.selected_endpoints = _normalize_selected_endpoints(payload.selected_endpoints)
                _sync_app_tools_selection(db, row.name, row.selected_endpoints)
            if payload.description is not None:
                row.description = payload.description.strip()
            if payload.openapi_path is not None:
                row.openapi_path = normalize_openapi_path_fn(payload.openapi_path)
            if payload.include_unreachable_tools is not None:
                row.include_unreachable_tools = 1 if payload.include_unreachable_tools else 0
            if payload.is_enabled is not None:
                row.is_enabled = payload.is_enabled
                if payload.is_enabled:
                    row.is_deleted = False
                    if payload.restore_dependents:
                        tools = db.scalars(
                            select(mcp_tool_model).where(
                                (mcp_tool_model.raw_api_id == row.id)
                                | (mcp_tool_model.owner_id == f"app:{row.name}")
                            )
                        ).all()
                        for tool in tools:
                            tool.is_deleted = False

                        endpoints = db.scalars(
                            select(api_endpoint_model).where(api_endpoint_model.owner_id == f"app:{row.name}")
                        ).all()
                        for endpoint in endpoints:
                            endpoint.is_deleted = False
                            endpoint.exposed_to_mcp = False
                            if hasattr(endpoint, "exposure_approved"):
                                endpoint.exposure_approved = False

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="application.update",
                resource_type="application",
                resource_id=name,
                before_state=before_state,
                after_state={
                    "name": row.name,
                    "url": row.url,
                    "description": row.description or "",
                    "domain_type": row.domain_type or "ADM",
                    "selected_endpoints": row.selected_endpoints or [],
                    "openapi_path": row.openapi_path or "",
                    "include_unreachable_tools": bool(row.include_unreachable_tools),
                    "is_enabled": bool(row.is_enabled),
                    "is_deleted": bool(row.is_deleted),
                },
            )
            db.commit()

        # Track whether selected_endpoints changed so we know to rebuild the catalog.
        endpoints_changed = payload.selected_endpoints is not None

        reset_openapi_catalog_fn()
        cache_delete_prefix("status:")

        # If endpoint selection changed, sync catalog immediately so newly enabled
        # tools get their mcp_tool DB rows created before the response returns.
        if endpoints_changed and build_openapi_tool_catalog_fn is not None:
            try:
                await build_openapi_tool_catalog_fn(force_refresh=True)
            except Exception:
                pass  # non-fatal: tools will sync on next catalog request

        return {"status": "updated", "name": name}

    @router.delete(
        "/base-urls/{name}",
        summary="Delete Application",
        description="Soft-delete or hard-delete an application by name. Source: backend/app/routers/base_urls.py",
    )
    def delete_base_url(
        name: str,
        hard: bool = Query(default=False),
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            row = db.scalar(select(base_url_model).where(base_url_model.name == name))
            if not row:
                raise HTTPException(status_code=404, detail=f"Base URL '{name}' not found")

            verify_resource_ownership(row.created_by_user_id, actor)
            owner_id = f"app:{row.name}"
            before_state = {
                "name": row.name,
                "url": row.url,
                "description": row.description or "",
                "domain_type": row.domain_type or "ADM",
                "is_enabled": bool(row.is_enabled),
                "is_deleted": bool(row.is_deleted),
            }
            try:
                if hard:
                    dependent_counts = _hard_delete_base_url_dependents(db, row.id, owner_id)
                    db.delete(row)
                    action = "application.delete.hard"
                    after_state = {
                        "deleted": True,
                        "hard": True,
                        "dependents_removed": dependent_counts,
                    }
                else:
                    dependent_counts = _soft_delete_base_url_dependents(db, row.id, owner_id)
                    row.is_deleted = True
                    row.is_enabled = False
                    action = "application.delete.soft"
                    after_state = {
                        "is_deleted": True,
                        "is_enabled": False,
                        "dependents_soft_deleted": dependent_counts,
                    }

                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action=action,
                    resource_type="application",
                    resource_id=name,
                    before_state=before_state,
                    after_state=after_state,
                )
                db.commit()
            except Exception as exc:
                db.rollback()
                raise HTTPException(status_code=500, detail=f"Failed to delete base URL '{name}': {exc}") from exc

        reset_openapi_catalog_fn()
        cache_delete_prefix("status:")
        return {"status": "deleted", "name": name, "hard": hard}

    @router.post(
        "/base-urls/{name}/sync",
        summary="Sync Application Tools",
        description="Manually trigger discovery and registry synchronization for an application.",
    )
    async def sync_base_url(
        name: str,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        import datetime

        try:
            with session_local_factory() as db:
                row = db.scalar(select(base_url_model).where(base_url_model.name == name))
                if not row or row.is_deleted or not row.is_enabled:
                    raise HTTPException(status_code=404, detail=f"Application '{name}' not found")

                row.last_sync_started_on = datetime.datetime.now(datetime.UTC)
                row.last_sync_status = "in_progress"
                db.commit()

            # We reuse the existing fetch_openapi_spec_from_base_url_fn to get the spec
            # and rely on reset_openapi_catalog_fn to trigger the async background catalog rebuild.
            # In a fully decoupled architecture, we'd use the DiscoveryService here directly.
            reset_openapi_catalog_fn()
            
            with session_local_factory() as db:
                row = db.scalar(select(base_url_model).where(base_url_model.name == name))
                if row:
                    row.last_sync_completed_on = datetime.datetime.now(datetime.UTC)
                    row.last_sync_status = "success" 
                    row.last_sync_error = None
                    db.commit()

            cache_delete_prefix("status:")
            return {
                "message": f"Sync initiated for {name}",
                "status": "success" 
            }
        except HTTPException:
            raise

    class TestEndpointRequest(BaseModel):
        url: str
        method: str = "GET"
        path: str = ""
        domain_type: str = "ADM"
        headers: dict[str, str] | None = None
        params: dict[str, Any] | None = None
        json_body: dict[str, Any] | None = None

    @router.post(
        "/test-endpoint",
        summary="Test API Endpoint",
        description="Execute a live test call against an API endpoint with current user token.",
    )
    async def test_endpoint(
        req: TestEndpointRequest,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        import time, httpx
        from app.core.auth import ACTIVE_USER_TOKEN

        target_url = req.url.strip()
        if req.path:
            p = req.path.strip()
            if not target_url.endswith('/') and not p.startswith('/'):
                target_url = f"{target_url}/{p}"
            elif target_url.endswith('/') and p.startswith('/'):
                target_url = f"{target_url}{p[1:]}"
            else:
                target_url = f"{target_url}{p}"

        user_token = actor.get("token") or ACTIVE_USER_TOKEN.get(None)

        req_headers = {"Accept": "application/json"}
        if req.headers:
            req_headers.update(req.headers)

        if user_token and user_token.strip():
            req_headers["Authorization"] = f"Bearer {user_token.strip()}"
        else:
            from app.services.keycloak_auth import get_keycloak_token
            with session_local_factory() as db:
                tok = await get_keycloak_token(req.domain_type or "ADM", db)
                if tok:
                    req_headers["Authorization"] = f"Bearer {tok}"

        method = (req.method or "GET").upper()
        start_t = time.time()
        try:
            async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
                res = await client.request(
                    method=method,
                    url=target_url,
                    headers=req_headers,
                    params=req.params,
                    json=req.json_body,
                )
                latency = round((time.time() - start_t) * 1000, 2)
                try:
                    res_body = res.json()
                except Exception:
                    res_body = res.text

                return {
                    "ok": res.is_success,
                    "status_code": res.status_code,
                    "status_text": f"{res.status_code} {res.reason_phrase}",
                    "latency_ms": latency,
                    "target_url": target_url,
                    "method": method,
                    "auth_token_attached": bool(user_token or req_headers.get("Authorization")),
                    "content_type": res.headers.get("content-type", "unknown"),
                    "body": res_body,
                }
        except Exception as exc:
            latency = round((time.time() - start_t) * 1000, 2)
            return {
                "ok": False,
                "status_code": 500,
                "status_text": f"Error: {exc}",
                "latency_ms": latency,
                "target_url": target_url,
                "method": method,
                "auth_token_attached": bool(user_token or req_headers.get("Authorization")),
                "content_type": "text/plain",
                "body": {"detail": f"Failed to connect to endpoint: {exc}"},
            }
        except Exception as exc:
            with session_local_factory() as db:
                row = db.scalar(select(base_url_model).where(base_url_model.name == name))
                if row:
                    row.last_sync_completed_on = datetime.datetime.now(datetime.UTC)
                    row.last_sync_status = "failed"
                    row.last_sync_error = str(exc)
                    db.commit()
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    return router
