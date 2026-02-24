from typing import Any, Callable

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select


def create_base_urls_router(
    session_local_factory,
    base_url_model,
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

    class BaseURLUpdate(BaseModel):
        model_config = ConfigDict(extra="forbid")

        description: str | None = None
        url: str | None = None
        openapi_path: str | None = None
        include_unreachable_tools: bool | None = None
        is_enabled: bool | None = None

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
                        "openapi_path": existing.openapi_path or "",
                        "include_unreachable_tools": bool(existing.include_unreachable_tools),
                        "is_enabled": bool(existing.is_enabled),
                        "is_deleted": bool(existing.is_deleted),
                    }
                    existing.url = data.url
                    existing.description = description
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
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        _ = current_user
        try:
            with session_local_factory() as db:
                rows = db.scalars(select(base_url_model)).all()
                base_urls = [
                    {
                        "name": row.name,
                        "url": row.url,
                        "description": row.description or "",
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
                "openapi_path": row.openapi_path or "",
                "include_unreachable_tools": bool(row.include_unreachable_tools),
                "is_enabled": bool(row.is_enabled),
                "is_deleted": bool(row.is_deleted),
            }

            if payload.url is not None:
                row.url = payload.url
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
            before_state = {
                "name": row.name,
                "url": row.url,
                "description": row.description or "",
                "is_enabled": bool(row.is_enabled),
                "is_deleted": bool(row.is_deleted),
            }
            if hard:
                db.delete(row)
                action = "application.delete.hard"
                after_state = None
            else:
                row.is_deleted = True
                row.is_enabled = False
                action = "application.delete.soft"
                after_state = {"is_deleted": True, "is_enabled": False}

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

        reset_openapi_catalog_fn()
        return {"status": "deleted", "name": name, "hard": hard}

    return router
