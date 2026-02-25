from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select


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

    def _soft_delete_base_url_dependents(db, base_url_id: int, owner_id: str) -> dict[str, int]:
        tools = db.scalars(
            select(mcp_tool_model).where(
                (mcp_tool_model.raw_api_id == base_url_id) | (mcp_tool_model.owner_id == owner_id)
            )
        ).all()
        for tool in tools:
            tool.is_deleted = True
            tool.is_enabled = False

        endpoints = db.scalars(
            select(api_endpoint_model).where(api_endpoint_model.owner_id == owner_id)
        ).all()
        for endpoint in endpoints:
            endpoint.is_deleted = True
            endpoint.is_enabled = False
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

    @router.post(
        "/register-base-url",
        summary="Register Application",
        description="Create or update an application base URL registration. Source: backend/app/routers/base_urls.py",
    )
    def register_base_url(
        data: base_url_registration_model,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        normalized_openapi_path = normalize_openapi_path_fn(data.openapi_path)
        include_unreachable = 1 if data.include_unreachable_tools else 0
        description = (getattr(data, "description", "") or "").strip()
        try:
            with session_local_factory() as db:
                existing = db.scalar(select(base_url_model).where(base_url_model.name == data.name))
                before_state = None
                if existing:
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
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"app:{existing.name}",
                        base_url_id=existing.id,
                    )
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
                    )
                    db.add(base_url)
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"app:{base_url.name}",
                        base_url_id=base_url.id,
                    )
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
                        "selected_endpoints": _normalize_selected_endpoints(
                            getattr(data, "selected_endpoints", [])
                        ),
                        "openapi_path": normalized_openapi_path,
                        "include_unreachable_tools": bool(include_unreachable),
                        "is_enabled": True,
                        "is_deleted": False,
                    },
                )
                db.commit()

            sync_api_server_links_by_host_fn()
            reset_openapi_catalog_fn()

            return {
                "message": "Base URL registered successfully",
                "name": data.name,
                "url": data.url,
                "description": description,
                "domain_type": _normalize_domain_type(getattr(data, "domain_type", "ADM")),
                "selected_endpoints_count": len(getattr(data, "selected_endpoints", []) or []),
                "selected_endpoints": _normalize_selected_endpoints(getattr(data, "selected_endpoints", [])),
                "openapi_path": normalized_openapi_path,
                "include_unreachable_tools": bool(include_unreachable),
            }

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get(
        "/base-urls",
        summary="List Applications",
        description="List all registered application base URLs. Source: backend/app/routers/base_urls.py",
    )
    def list_base_urls(
        include_inactive: bool = Query(default=False),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        _ = current_user
        try:
            with session_local_factory() as db:
                stmt = select(base_url_model)
                if not include_inactive:
                    stmt = stmt.where(
                        base_url_model.is_deleted == False,  # noqa: E712
                        base_url_model.is_enabled == True,  # noqa: E712
                    )
                rows = db.scalars(stmt).all()
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
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user

        try:
            return await fetch_openapi_spec_from_base_url_fn(url, openapi_path=openapi_path, retries=retries)
        except ValueError as exc:
            detail = str(exc)
            status_code = 400 if detail.startswith("URL must") else 502
            raise HTTPException(status_code=status_code, detail=detail) from exc

    @router.patch(
        "/base-urls/{name}",
        summary="Update Application",
        description="Update application metadata/settings by name. Source: backend/app/routers/base_urls.py",
    )
    def update_base_url(
        name: str,
        payload: BaseURLUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            row = db.scalar(select(base_url_model).where(base_url_model.name == name))
            if not row:
                raise HTTPException(status_code=404, detail=f"Base URL '{name}' not found")

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
            if payload.description is not None:
                row.description = payload.description.strip()
            if payload.openapi_path is not None:
                row.openapi_path = normalize_openapi_path_fn(payload.openapi_path)
            if payload.include_unreachable_tools is not None:
                row.include_unreachable_tools = 1 if payload.include_unreachable_tools else 0
            if payload.is_enabled is not None:
                row.is_enabled = payload.is_enabled

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

        reset_openapi_catalog_fn()
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
        return {"status": "deleted", "name": name, "hard": hard}

    return router
