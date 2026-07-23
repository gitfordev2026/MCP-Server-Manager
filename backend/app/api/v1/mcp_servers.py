from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict
from sqlalchemy import select
from app.core.cache import cache_delete_prefix


class PreviewToolsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    timeout_sec: float | None = None


def create_mcp_servers_v1_router(
    session_local_factory,
    server_model,
    list_server_tools_fn,
    write_audit_log_fn,
    audit_log_model,
    require_permission_fn,
) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/mcp-servers/{server_id}/preview-tools",
        summary="Preview MCP Server Tools",
        description="Fetch tools from an external MCP server for preview only.",
    )
    async def preview_tools(
        server_id: int,
        payload: PreviewToolsRequest,
        actor: dict[str, Any] = Depends(require_permission_fn("mcp_server:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            server = db.scalar(select(server_model).where(server_model.id == server_id))
        if not server:
            raise HTTPException(status_code=404, detail="MCP server not found")

        timeout_sec = float(payload.timeout_sec or 8.0)
        tools = await list_server_tools_fn(server.name, server.url, timeout_sec=timeout_sec)

        with session_local_factory() as db:
            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="mcp_server.preview_tools",
                resource_type="mcp_server",
                resource_id=str(server_id),
                before_state=None,
                after_state={"tool_count": len(tools)},
            )
            db.commit()
        cache_delete_prefix("status:")

        return {
            "server_id": server_id,
            "name": server.name,
            "url": server.url,
            "tool_count": len(tools),
            "tools": [
                {
                    "name": tool.name,
                    "description": getattr(tool, "description", "") or "",
                    "inputSchema": getattr(tool, "inputSchema", {}) or {},
                }
                for tool in tools
            ],
        }

    return router
