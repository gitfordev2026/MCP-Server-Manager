from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.cache import cache_delete_prefix, cache_get_json, cache_set_json
from app.env import ENV

class EndpointCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_id: str
    method: str
    path: str
    description: str = Field(min_length=1)
    version: str = "1.0.0"
    mcp_tool_id: int | None = None
    is_enabled: bool = True
    admin_enabled: bool | None = None
    owner_enabled: bool | None = None
    exposed_to_mcp: bool = False
    exposure_approved: bool = False
    payload_schema: dict[str, Any] | None = None


class EndpointUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: str | None = None
    path: str | None = None
    description: str | None = None
    version: str | None = None
    mcp_tool_id: int | None = None
    is_enabled: bool | None = None
    admin_enabled: bool | None = None
    owner_enabled: bool | None = None
    exposed_to_mcp: bool | None = None
    exposure_approved: bool | None = None
    payload_schema: dict[str, Any] | None = None


def create_endpoints_router(
    session_local_factory,
    api_endpoint_model,
    server_model,
    base_url_model,
    endpoint_version_model,
    write_audit_log_fn,
    audit_log_model,
    require_permission_fn,
) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/endpoints",
        summary="List API Endpoints",
        description="List all non-deleted API endpoints from the registry. Source: backend/app/routers/endpoints.py",
    )
    def list_endpoints(
        include_inactive: bool = Query(default=False),
    ) -> dict[str, Any]:
        cache_key = f"status:endpoints:include_inactive={str(include_inactive).lower()}"
        cached = cache_get_json(cache_key)
        if cached is not None:
            return cached
        with session_local_factory() as db:
            active_server_names = {
                row.name
                for row in db.scalars(
                    select(server_model).where(
                        server_model.is_deleted == False,  # noqa: E712
                        server_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
            }
            active_base_url_names = {
                row.name
                for row in db.scalars(
                    select(base_url_model).where(
                        base_url_model.is_deleted == False,  # noqa: E712
                        base_url_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
            }
            server_states = {
                row.name: {"is_enabled": bool(row.is_enabled), "is_deleted": bool(row.is_deleted)}
                for row in db.scalars(select(server_model)).all()
            }
            base_url_states = {
                row.name: {"is_enabled": bool(row.is_enabled), "is_deleted": bool(row.is_deleted)}
                for row in db.scalars(select(base_url_model)).all()
            }
            stmt = select(api_endpoint_model)
            if not include_inactive:
                stmt = stmt.where(
                    api_endpoint_model.is_deleted == False,  # noqa: E712
                    api_endpoint_model.admin_enabled == True,  # noqa: E712
                    api_endpoint_model.owner_enabled == True,  # noqa: E712
                )
            rows = db.scalars(stmt).all()

        visible_rows = []
        for row in rows:
            if include_inactive:
                visible_rows.append(row)
                continue
            owner_id = row.owner_id or ""
            if owner_id.startswith("mcp:"):
                owner_name = owner_id[4:]
                if owner_name not in active_server_names:
                    continue
            elif owner_id.startswith("app:"):
                owner_name = owner_id[4:]
                if owner_name not in active_base_url_names:
                    continue
            visible_rows.append(row)

        result = {
            "endpoints": [
                {
                    "id": row.id,
                    "owner_id": row.owner_id,
                    "method": row.method,
                    "path": row.path,
                    "description": row.description,
                    "mcp_tool_id": row.mcp_tool_id,
                    "current_version": row.current_version,
                    "is_enabled": bool(row.admin_enabled and row.owner_enabled),
                    "admin_enabled": row.admin_enabled,
                    "owner_enabled": row.owner_enabled,
                    "is_deleted": row.is_deleted,
                    "exposed_to_mcp": row.exposed_to_mcp,
                    "exposure_approved": row.exposure_approved,
                    "parent_is_enabled": (
                        server_states.get(row.owner_id[4:], {}).get("is_enabled")
                        if (row.owner_id or "").startswith("mcp:")
                        else base_url_states.get(row.owner_id[4:], {}).get("is_enabled")
                        if (row.owner_id or "").startswith("app:")
                        else True
                    ),
                    "parent_is_deleted": (
                        server_states.get(row.owner_id[4:], {}).get("is_deleted")
                        if (row.owner_id or "").startswith("mcp:")
                        else base_url_states.get(row.owner_id[4:], {}).get("is_deleted")
                        if (row.owner_id or "").startswith("app:")
                        else False
                    ),
                }
                for row in visible_rows
            ]
        }
        cache_set_json(cache_key, result, ENV.redis_list_ttl_sec)
        return result

    @router.post(
        "/endpoints",
        summary="Create API Endpoint",
        description="Create an API endpoint and write initial version metadata. Source: backend/app/routers/endpoints.py",
    )
    def create_endpoint(
        payload: EndpointCreate,
        actor: dict[str, Any] = Depends(require_permission_fn("endpoint:manage")),
    ) -> dict[str, Any]:
        if not payload.description.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="description is required")
        if payload.exposed_to_mcp and not payload.exposure_approved:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Cannot expose endpoint without explicit exposure_approved=true",
            )

        with session_local_factory() as db:
            existing = db.scalar(
                select(api_endpoint_model).where(
                    api_endpoint_model.owner_id == payload.owner_id,
                    api_endpoint_model.method == payload.method.upper(),
                    api_endpoint_model.path == payload.path,
                    api_endpoint_model.is_deleted == False,  # noqa: E712
                )
            )
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Endpoint already exists")

            admin_enabled = payload.admin_enabled if payload.admin_enabled is not None else payload.is_enabled
            owner_enabled = payload.owner_enabled if payload.owner_enabled is not None else True
            effective_enabled = bool(admin_enabled and owner_enabled)
            endpoint = api_endpoint_model(
                owner_id=payload.owner_id,
                method=payload.method.upper(),
                path=payload.path,
                description=payload.description.strip(),
                mcp_tool_id=payload.mcp_tool_id,
                current_version=payload.version,
                admin_enabled=admin_enabled,
                owner_enabled=owner_enabled,
                is_enabled=effective_enabled,
                exposed_to_mcp=payload.exposed_to_mcp,
                exposure_approved=payload.exposure_approved,
            )
            db.add(endpoint)
            db.flush()
            db.add(
                endpoint_version_model(
                    endpoint_id=endpoint.id,
                    owner_id=endpoint.owner_id,
                    method=endpoint.method,
                    path=endpoint.path,
                    version=payload.version,
                    description=endpoint.description,
                    schema=payload.payload_schema,
                    exposed_to_mcp=endpoint.exposed_to_mcp,
                )
            )
            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="endpoint.create",
                resource_type="endpoint",
                resource_id=str(endpoint.id),
                before_state=None,
                after_state={
                    "owner_id": endpoint.owner_id,
                    "method": endpoint.method,
                    "path": endpoint.path,
                    "description": endpoint.description,
                    "current_version": endpoint.current_version,
                    "admin_enabled": endpoint.admin_enabled,
                    "owner_enabled": endpoint.owner_enabled,
                    "is_enabled": endpoint.is_enabled,
                },
            )
            db.commit()
            cache_delete_prefix("status:")
            return {"status": "created", "id": endpoint.id}

    @router.patch(
        "/endpoints/{endpoint_id}",
        summary="Update API Endpoint",
        description="Update API endpoint metadata/state and optionally append a new version. Source: backend/app/routers/endpoints.py",
    )
    def update_endpoint(
        endpoint_id: int,
        payload: EndpointUpdate,
        actor: dict[str, Any] = Depends(require_permission_fn("endpoint:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            endpoint = db.scalar(select(api_endpoint_model).where(api_endpoint_model.id == endpoint_id))
            if not endpoint:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
            if endpoint.is_deleted and not (
                payload.is_enabled is True
                or payload.admin_enabled is True
                or payload.owner_enabled is True
            ):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
            owner_id = endpoint.owner_id or ""
            if owner_id.startswith("mcp:"):
                server = db.scalar(select(server_model).where(server_model.name == owner_id[4:]))
                if server and (server.is_deleted or not server.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent server is disabled or deleted")
            elif owner_id.startswith("app:"):
                base_url = db.scalar(select(base_url_model).where(base_url_model.name == owner_id[4:]))
                if base_url and (base_url.is_deleted or not base_url.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent application is disabled or deleted")

            if payload.description is not None and not payload.description.strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="description cannot be empty")

            new_exposed = endpoint.exposed_to_mcp if payload.exposed_to_mcp is None else payload.exposed_to_mcp
            new_approved = endpoint.exposure_approved if payload.exposure_approved is None else payload.exposure_approved
            if new_exposed and not new_approved:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Cannot expose endpoint without explicit exposure_approved=true",
                )

            before_state = {
                "method": endpoint.method,
                "path": endpoint.path,
                "description": endpoint.description,
                "current_version": endpoint.current_version,
                "admin_enabled": endpoint.admin_enabled,
                "owner_enabled": endpoint.owner_enabled,
                "is_enabled": endpoint.is_enabled,
                "exposed_to_mcp": endpoint.exposed_to_mcp,
                "exposure_approved": endpoint.exposure_approved,
            }

            if payload.method is not None:
                endpoint.method = payload.method.upper()
            if payload.path is not None:
                endpoint.path = payload.path
            if payload.description is not None:
                endpoint.description = payload.description.strip()
            if payload.mcp_tool_id is not None:
                endpoint.mcp_tool_id = payload.mcp_tool_id
            if payload.admin_enabled is not None:
                endpoint.admin_enabled = payload.admin_enabled
            if payload.owner_enabled is not None:
                endpoint.owner_enabled = payload.owner_enabled
            if payload.is_enabled is not None:
                endpoint.admin_enabled = payload.is_enabled
            endpoint.is_enabled = bool(endpoint.admin_enabled and endpoint.owner_enabled)
            if endpoint.is_enabled:
                endpoint.is_deleted = False
            if payload.exposed_to_mcp is not None:
                endpoint.exposed_to_mcp = payload.exposed_to_mcp
            if payload.exposure_approved is not None:
                endpoint.exposure_approved = payload.exposure_approved

            metadata_changed = payload.description is not None or payload.payload_schema is not None
            if metadata_changed:
                if not payload.version:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="version is required when updating endpoint metadata",
                    )
                endpoint.current_version = payload.version
                version_row = db.scalar(
                    select(endpoint_version_model).where(
                        endpoint_version_model.endpoint_id == endpoint.id,
                        endpoint_version_model.version == payload.version,
                    )
                )
                if version_row:
                    version_row.owner_id = endpoint.owner_id
                    version_row.method = endpoint.method
                    version_row.path = endpoint.path
                    version_row.description = endpoint.description
                    version_row.schema = payload.payload_schema
                    version_row.exposed_to_mcp = endpoint.exposed_to_mcp
                else:
                    db.add(
                        endpoint_version_model(
                            endpoint_id=endpoint.id,
                            owner_id=endpoint.owner_id,
                            method=endpoint.method,
                            path=endpoint.path,
                            version=payload.version,
                            description=endpoint.description,
                            schema=payload.payload_schema,
                            exposed_to_mcp=endpoint.exposed_to_mcp,
                        )
                    )

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="endpoint.update",
                resource_type="endpoint",
                resource_id=str(endpoint.id),
                before_state=before_state,
                after_state={
                    "method": endpoint.method,
                    "path": endpoint.path,
                    "description": endpoint.description,
                    "current_version": endpoint.current_version,
                    "admin_enabled": endpoint.admin_enabled,
                    "owner_enabled": endpoint.owner_enabled,
                    "is_enabled": endpoint.is_enabled,
                    "exposed_to_mcp": endpoint.exposed_to_mcp,
                    "exposure_approved": endpoint.exposure_approved,
                },
            )
            db.commit()
            cache_delete_prefix("status:")
            return {"status": "updated", "id": endpoint.id}

    @router.delete(
        "/endpoints/{endpoint_id}",
        summary="Delete API Endpoint",
        description="Soft-delete or hard-delete an API endpoint by id. Source: backend/app/routers/endpoints.py",
    )
    def delete_endpoint(
        endpoint_id: int,
        hard: bool = False,
        actor: dict[str, Any] = Depends(require_permission_fn("endpoint:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            endpoint = db.scalar(select(api_endpoint_model).where(api_endpoint_model.id == endpoint_id))
            if not endpoint:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Endpoint not found")
            owner_id = endpoint.owner_id or ""
            if owner_id.startswith("mcp:"):
                server = db.scalar(select(server_model).where(server_model.name == owner_id[4:]))
                if server and (server.is_deleted or not server.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent server is disabled or deleted")
            elif owner_id.startswith("app:"):
                base_url = db.scalar(select(base_url_model).where(base_url_model.name == owner_id[4:]))
                if base_url and (base_url.is_deleted or not base_url.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent application is disabled or deleted")

            before_state = {
                "method": endpoint.method,
                "path": endpoint.path,
                "is_deleted": endpoint.is_deleted,
            }
            if hard:
                db.delete(endpoint)
                action = "endpoint.delete.hard"
            else:
                endpoint.is_deleted = True
                endpoint.exposed_to_mcp = False
                action = "endpoint.delete.soft"
            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action=action,
                resource_type="endpoint",
                resource_id=str(endpoint_id),
                before_state=before_state,
                after_state=None if hard else {"is_deleted": True, "is_enabled": endpoint.is_enabled, "exposed_to_mcp": False},
            )
            db.commit()
            cache_delete_prefix("status:")
            return {"status": "deleted", "hard": hard}

    return router
