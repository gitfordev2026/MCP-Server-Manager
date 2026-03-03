from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select


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
    def list_tools() -> dict[str, Any]:
        with session_local_factory() as db:
            active_server_ids = {
                row.id
                for row in db.scalars(
                    select(server_model).where(
                        server_model.is_deleted == False,  # noqa: E712
                        server_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
            }
            active_base_url_ids = {
                row.id
                for row in db.scalars(
                    select(base_url_model).where(
                        base_url_model.is_deleted == False,  # noqa: E712
                        base_url_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
            }
            rows = db.scalars(
                select(mcp_tool_model).where(mcp_tool_model.is_deleted == False)  # noqa: E712
            ).all()

        visible_rows = []
        for row in rows:
            if row.source_type == "mcp" and row.server_id is not None and row.server_id not in active_server_ids:
                continue
            if row.source_type == "openapi" and row.raw_api_id is not None and row.raw_api_id not in active_base_url_ids:
                continue
            visible_rows.append(row)

        return {
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
                    "is_enabled": row.is_enabled,
                }
                for row in visible_rows
            ]
        }

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

            tool = mcp_tool_model(
                owner_id=payload.owner_id,
                name=payload.name,
                description=payload.description.strip(),
                source_type=payload.source_type,
                method=payload.method,
                path=payload.path,
                current_version=payload.version,
                is_enabled=payload.is_enabled,
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
                    "is_enabled": tool.is_enabled,
                },
            )
            db.commit()
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
            if not tool or tool.is_deleted:
                raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Tool not found")

            before_state = {
                "name": tool.name,
                "description": tool.description,
                "current_version": tool.current_version,
                "method": tool.method,
                "path": tool.path,
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
            if payload.is_enabled is not None:
                tool.is_enabled = payload.is_enabled

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
                    "is_enabled": tool.is_enabled,
                },
            )
            db.commit()
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
                tool.is_enabled = False
                action = "tool.delete.soft"

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action=action,
                resource_type="tool",
                resource_id=str(tool_id),
                before_state=before_state,
                after_state=None if hard else {"is_deleted": True, "is_enabled": False},
            )
            db.commit()
            return {"status": "deleted", "hard": hard}

    return router
