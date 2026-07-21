from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select

from app.core.cache import cache_delete_prefix, cache_get_json, cache_set_json
from app.env import ENV

class ToolCreate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    owner_id: str
    name: str
    description: str = Field(min_length=1)
    version: str = "1.0.0"
    source_type: str = "mcp"
    method: str | None = None
    path: str | None = None
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None
    is_enabled: bool = True
    admin_enabled: bool | None = None
    owner_enabled: bool | None = None


class ToolUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str | None = None
    description: str | None = None
    version: str | None = None
    method: str | None = None
    path: str | None = None
    input_schema: dict[str, Any] | None = None
    output_schema: dict[str, Any] | None = None
    is_enabled: bool | None = None
    admin_enabled: bool | None = None
    owner_enabled: bool | None = None


def create_tools_router(
    session_local_factory,
    mcp_tool_model,
    server_model,
    base_url_model,
    tool_version_model,
    write_audit_log_fn,
    audit_log_model,
    require_permission_fn,
) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/tools",
        summary="List Tools",
        description="List all non-deleted tools from the registry. Source: backend/app/routers/tools.py",
    )
    def list_tools(
        include_inactive: bool = Query(default=False),
    ) -> dict[str, Any]:
        cache_key = f"status:tools:include_inactive={str(include_inactive).lower()}"
        cached = cache_get_json(cache_key)
        if cached is not None:
            return cached
        with session_local_factory() as db:
            active_server_ids = {
                row.id
                for row in db.scalars(
                    select(server_model).where(
                        server_model.is_deleted == False,  # noqa: E712
                        server_model.is_enabled == True,  # noqa: E712
                        server_model.admin_allowed == True,  # noqa: E712
                        server_model.health_status.in_(["healthy", "degraded"]),
                    )
                ).all()
            }
            active_base_url_ids = {
                row.id
                for row in db.scalars(
                    select(base_url_model).where(
                        base_url_model.is_deleted == False,  # noqa: E712
                        base_url_model.is_enabled == True,  # noqa: E712
                        base_url_model.admin_allowed == True,  # noqa: E712
                        base_url_model.health_status.in_(["healthy", "degraded"]),
                    )
                ).all()
            }
            server_states = {
                row.id: {
                    "is_enabled": bool(row.is_enabled),
                    "is_deleted": bool(row.is_deleted),
                    "admin_allowed": bool(getattr(row, "admin_allowed", True)),
                    "health_status": str(getattr(row, "health_status", "unknown")),
                }
                for row in db.scalars(select(server_model)).all()
            }
            base_url_states = {
                row.id: {
                    "is_enabled": bool(row.is_enabled),
                    "is_deleted": bool(row.is_deleted),
                    "admin_allowed": bool(getattr(row, "admin_allowed", True)),
                    "health_status": str(getattr(row, "health_status", "unknown")),
                }
                for row in db.scalars(select(base_url_model)).all()
            }
            stmt = select(mcp_tool_model)
            if not include_inactive:
                stmt = stmt.where(
                    mcp_tool_model.is_deleted == False,  # noqa: E712
                    mcp_tool_model.admin_enabled == True,  # noqa: E712
                    mcp_tool_model.owner_enabled == True,  # noqa: E712
                )
            rows = db.scalars(stmt).all()

        visible_rows = []
        for row in rows:
            if include_inactive:
                visible_rows.append(row)
                continue
            if row.source_type == "mcp" and row.server_id is not None and row.server_id not in active_server_ids:
                continue
            if row.source_type == "openapi" and row.raw_api_id is not None and row.raw_api_id not in active_base_url_ids:
                continue
            visible_rows.append(row)

        result = {
            "tools": [
                {
                    "id": row.id,
                    "owner_id": row.owner_id,
                    "name": row.name,
                    "description": row.description,
                    "source_type": row.source_type,
                    "method": row.method,
                    "path": row.path,
                    "current_version": row.current_version,
                    "is_enabled": bool(row.admin_enabled and row.owner_enabled),
                    "admin_enabled": row.admin_enabled,
                    "owner_enabled": row.owner_enabled,
                    "is_deleted": row.is_deleted,
                    "parent_is_enabled": (
                        server_states.get(row.server_id, {}).get("is_enabled")
                        if row.source_type == "mcp" and row.server_id is not None
                        else base_url_states.get(row.raw_api_id, {}).get("is_enabled")
                        if row.source_type == "openapi" and row.raw_api_id is not None
                        else True
                    ),
                    "parent_is_deleted": (
                        server_states.get(row.server_id, {}).get("is_deleted")
                        if row.source_type == "mcp" and row.server_id is not None
                        else base_url_states.get(row.raw_api_id, {}).get("is_deleted")
                        if row.source_type == "openapi" and row.raw_api_id is not None
                        else False
                    ),
                    "parent_admin_allowed": (
                        server_states.get(row.server_id, {}).get("admin_allowed")
                        if row.source_type == "mcp" and row.server_id is not None
                        else base_url_states.get(row.raw_api_id, {}).get("admin_allowed")
                        if row.source_type == "openapi" and row.raw_api_id is not None
                        else True
                    ),
                    "parent_health_status": (
                        server_states.get(row.server_id, {}).get("health_status")
                        if row.source_type == "mcp" and row.server_id is not None
                        else base_url_states.get(row.raw_api_id, {}).get("health_status")
                        if row.source_type == "openapi" and row.raw_api_id is not None
                        else "unknown"
                    ),
                }
                for row in visible_rows
            ]
        }
        cache_set_json(cache_key, result, ENV.redis_list_ttl_sec)
        return result

    @router.post(
        "/tools",
        summary="Create Tool",
        description="Create a tool and write initial version metadata. Source: backend/app/routers/tools.py",
    )
    def create_tool(
        payload: ToolCreate,
        actor: dict[str, Any] = Depends(require_permission_fn("tool:manage")),
    ) -> dict[str, Any]:
        if not payload.description.strip():
            raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="description is required")

        with session_local_factory() as db:
            existing = db.scalar(
                select(mcp_tool_model).where(
                    mcp_tool_model.owner_id == payload.owner_id,
                    mcp_tool_model.name == payload.name,
                    mcp_tool_model.source_type == payload.source_type,
                    mcp_tool_model.is_deleted == False,  # noqa: E712
                )
            )
            if existing:
                raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Tool already exists")

            admin_enabled = payload.admin_enabled if payload.admin_enabled is not None else payload.is_enabled
            owner_enabled = payload.owner_enabled if payload.owner_enabled is not None else True
            effective_enabled = bool(admin_enabled and owner_enabled)
            tool = mcp_tool_model(
                owner_id=payload.owner_id,
                name=payload.name,
                description=payload.description.strip(),
                source_type=payload.source_type,
                method=payload.method,
                path=payload.path,
                current_version=payload.version,
                admin_enabled=admin_enabled,
                owner_enabled=owner_enabled,
                is_enabled=effective_enabled,
            )
            db.add(tool)
            db.flush()
            db.add(
                tool_version_model(
                    tool_id=tool.id,
                    version=payload.version,
                    description=payload.description.strip(),
                    input_schema=payload.input_schema,
                    output_schema=payload.output_schema,
                )
            )
            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="tool.create",
                resource_type="tool",
                resource_id=str(tool.id),
                before_state=None,
                after_state={
                    "owner_id": tool.owner_id,
                    "name": tool.name,
                    "description": tool.description,
                    "current_version": tool.current_version,
                    "admin_enabled": tool.admin_enabled,
                    "owner_enabled": tool.owner_enabled,
                    "is_enabled": tool.is_enabled,
                },
            )
            db.commit()
            cache_delete_prefix("status:")
            return {"status": "created", "id": tool.id}

    @router.patch(
        "/tools/{tool_id}",
        summary="Update Tool",
        description="Update tool metadata/state and optionally append a new version. Source: backend/app/routers/tools.py",
    )
    def update_tool(
        tool_id: int,
        payload: ToolUpdate,
        actor: dict[str, Any] = Depends(require_permission_fn("tool:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            tool = db.scalar(select(mcp_tool_model).where(mcp_tool_model.id == tool_id))
            if not tool:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
            if tool.is_deleted and not (
                payload.is_enabled is True
                or payload.admin_enabled is True
                or payload.owner_enabled is True
            ):
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
            if tool.source_type == "mcp" and tool.server_id is not None:
                server = db.scalar(select(server_model).where(server_model.id == tool.server_id))
                if server and (server.is_deleted or not server.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent server is disabled or deleted")
            if tool.source_type == "openapi" and tool.raw_api_id is not None:
                base_url = db.scalar(select(base_url_model).where(base_url_model.id == tool.raw_api_id))
                if base_url and (base_url.is_deleted or not base_url.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent application is disabled or deleted")

            before_state = {
                "name": tool.name,
                "description": tool.description,
                "current_version": tool.current_version,
                "method": tool.method,
                "path": tool.path,
                "admin_enabled": tool.admin_enabled,
                "owner_enabled": tool.owner_enabled,
                "is_enabled": tool.is_enabled,
            }

            if payload.description is not None and not payload.description.strip():
                raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="description cannot be empty")

            if payload.name is not None:
                tool.name = payload.name
            if payload.description is not None:
                tool.description = payload.description.strip()
            if payload.method is not None:
                tool.method = payload.method
            if payload.path is not None:
                tool.path = payload.path
            if payload.admin_enabled is not None:
                tool.admin_enabled = payload.admin_enabled
            if payload.owner_enabled is not None:
                tool.owner_enabled = payload.owner_enabled
            if payload.is_enabled is not None:
                tool.admin_enabled = payload.is_enabled
            tool.is_enabled = bool(tool.admin_enabled and tool.owner_enabled)
            if tool.is_enabled:
                tool.is_deleted = False

            metadata_changed = (
                payload.description is not None
                or payload.input_schema is not None
                or payload.output_schema is not None
            )
            if metadata_changed:
                if not payload.version:
                    raise HTTPException(
                        status_code=status.HTTP_400_BAD_REQUEST,
                        detail="version is required when updating tool metadata",
                    )
                tool.current_version = payload.version
                version_row = db.scalar(
                    select(tool_version_model).where(
                        tool_version_model.tool_id == tool.id,
                        tool_version_model.version == payload.version,
                    )
                )
                if version_row:
                    version_row.description = tool.description
                    version_row.input_schema = payload.input_schema
                    version_row.output_schema = payload.output_schema
                else:
                    db.add(
                        tool_version_model(
                            tool_id=tool.id,
                            version=payload.version,
                            description=tool.description,
                            input_schema=payload.input_schema,
                            output_schema=payload.output_schema,
                        )
                    )

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="tool.update",
                resource_type="tool",
                resource_id=str(tool.id),
                before_state=before_state,
                after_state={
                    "name": tool.name,
                    "description": tool.description,
                    "current_version": tool.current_version,
                    "method": tool.method,
                    "path": tool.path,
                    "admin_enabled": tool.admin_enabled,
                    "owner_enabled": tool.owner_enabled,
                    "is_enabled": tool.is_enabled,
                },
            )
            db.commit()
            cache_delete_prefix("status:")
            return {"status": "updated", "id": tool.id}

    @router.delete(
        "/tools/{tool_id}",
        summary="Delete Tool",
        description="Soft-delete or hard-delete a tool by id. Source: backend/app/routers/tools.py",
    )
    def delete_tool(
        tool_id: int,
        hard: bool = False,
        actor: dict[str, Any] = Depends(require_permission_fn("tool:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            tool = db.scalar(select(mcp_tool_model).where(mcp_tool_model.id == tool_id))
            if not tool:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")
            if tool.source_type == "mcp" and tool.server_id is not None:
                server = db.scalar(select(server_model).where(server_model.id == tool.server_id))
                if server and (server.is_deleted or not server.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent server is disabled or deleted")
            if tool.source_type == "openapi" and tool.raw_api_id is not None:
                base_url = db.scalar(select(base_url_model).where(base_url_model.id == tool.raw_api_id))
                if base_url and (base_url.is_deleted or not base_url.is_enabled):
                    raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="Parent application is disabled or deleted")

            before_state = {
                "name": tool.name,
                "description": tool.description,
                "is_deleted": tool.is_deleted,
            }
            if hard:
                db.delete(tool)
                action = "tool.delete.hard"
            else:
                tool.is_deleted = True
                action = "tool.delete.soft"

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action=action,
                resource_type="tool",
                resource_id=str(tool_id),
                before_state=before_state,
                after_state=None if hard else {"is_deleted": True, "is_enabled": tool.is_enabled},
            )
            db.commit()
            cache_delete_prefix("status:")
            return {"status": "deleted", "hard": hard}

    return router
