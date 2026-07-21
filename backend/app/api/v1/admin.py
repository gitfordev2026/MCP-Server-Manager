from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from app.core.cache import cache_delete_prefix


class AllowRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    admin_allowed: bool


def create_admin_v1_router(
    session_local_factory,
    base_url_model,
    server_model,
    api_endpoint_model,
    mcp_tool_model,
    write_audit_log_fn,
    audit_log_model,
    require_permission_fn,
) -> APIRouter:
    router = APIRouter()

    @router.patch(
        "/admin/applications/{app_id}/allow",
        summary="Allow or block an application",
        description="Admin toggle for application-level visibility.",
    )
    def allow_application(
        app_id: int,
        payload: AllowRequest,
        actor: dict[str, Any] = Depends(require_permission_fn("application:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            app = db.scalar(select(base_url_model).where(base_url_model.id == app_id))
            if not app:
                raise HTTPException(status_code=404, detail="Application not found")
            before = {"admin_allowed": bool(getattr(app, "admin_allowed", True))}
            app.admin_allowed = bool(payload.admin_allowed)
            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="application.admin_allow",
                resource_type="application",
                resource_id=str(app_id),
                before_state=before,
                after_state={"admin_allowed": app.admin_allowed},
            )
            db.commit()
        cache_delete_prefix("status:")
        return {"status": "updated", "admin_allowed": payload.admin_allowed}

    @router.patch(
        "/admin/mcp-servers/{server_id}/allow",
        summary="Allow or block an MCP server",
        description="Admin toggle for MCP server visibility.",
    )
    def allow_server(
        server_id: int,
        payload: AllowRequest,
        actor: dict[str, Any] = Depends(require_permission_fn("mcp_server:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            server = db.scalar(select(server_model).where(server_model.id == server_id))
            if not server:
                raise HTTPException(status_code=404, detail="MCP server not found")
            before = {"admin_allowed": bool(getattr(server, "admin_allowed", True))}
            server.admin_allowed = bool(payload.admin_allowed)
            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="mcp_server.admin_allow",
                resource_type="mcp_server",
                resource_id=str(server_id),
                before_state=before,
                after_state={"admin_allowed": server.admin_allowed},
            )
            db.commit()
        cache_delete_prefix("status:")
        return {"status": "updated", "admin_allowed": payload.admin_allowed}

    @router.patch(
        "/admin/endpoints/{endpoint_id}/allow",
        summary="Allow or block an endpoint",
        description="Admin toggle for endpoint visibility.",
    )
    def allow_endpoint(
        endpoint_id: int,
        payload: AllowRequest,
        actor: dict[str, Any] = Depends(require_permission_fn("endpoint:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            endpoint = db.scalar(select(api_endpoint_model).where(api_endpoint_model.id == endpoint_id))
            if not endpoint:
                raise HTTPException(status_code=404, detail="Endpoint not found")
            before = {"admin_allowed": bool(getattr(endpoint, "admin_allowed", True))}
            endpoint.admin_allowed = bool(payload.admin_allowed)
            endpoint.admin_enabled = bool(payload.admin_allowed)
            endpoint.is_enabled = bool(endpoint.admin_enabled and endpoint.owner_enabled)

            owner_id = endpoint.owner_id or ""
            tool = db.scalar(
                select(mcp_tool_model).where(
                    mcp_tool_model.owner_id == owner_id,
                    mcp_tool_model.method == endpoint.method,
                    mcp_tool_model.path == endpoint.path,
                )
            )
            if tool is not None:
                tool.admin_enabled = bool(payload.admin_allowed)
                tool.is_enabled = bool(tool.admin_enabled and tool.owner_enabled)

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="endpoint.admin_allow",
                resource_type="endpoint",
                resource_id=str(endpoint_id),
                before_state=before,
                after_state={"admin_allowed": endpoint.admin_allowed},
            )
            db.commit()
        cache_delete_prefix("status:")
        return {"status": "updated", "admin_allowed": payload.admin_allowed}

    return router
