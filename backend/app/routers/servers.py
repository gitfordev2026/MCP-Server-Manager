import asyncio
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from sqlalchemy import select


def create_servers_router(
    session_local_factory,
    server_model,
    access_policy_model,
    server_registration_model,
    mcp_client_cls,
    ensure_default_access_policy_for_owner_fn,
    sync_api_server_links_by_host_fn,
    write_audit_log_fn,
    audit_log_model,
    get_actor_dep,
) -> APIRouter:
    router = APIRouter()

    class ServerUpdate(BaseModel):
        description: str | None = None
        url: str | None = None
        is_enabled: bool | None = None

    async def probe_server_status(server_name: str, server_url: str, timeout_sec: float = 8.0) -> dict[str, Any]:
        started = perf_counter()
        server_config = {"mcpServers": {server_name: {"url": server_url}}}
        probe_client = mcp_client_cls(server_config)

        try:
            await asyncio.wait_for(probe_client.create_all_sessions(), timeout=timeout_sec)
            session = probe_client.get_session(server_name)
            tools = await asyncio.wait_for(session.list_tools(), timeout=timeout_sec)

            latency_ms = int((perf_counter() - started) * 1000)
            return {
                "name": server_name,
                "url": server_url,
                "status": "alive",
                "latency_ms": latency_ms,
                "tool_count": len(tools),
                "error": None,
            }
        except Exception as exc:
            latency_ms = int((perf_counter() - started) * 1000)
            return {
                "name": server_name,
                "url": server_url,
                "status": "down",
                "latency_ms": latency_ms,
                "tool_count": 0,
                "error": str(exc),
            }

    @router.post("/register-server")
    async def register_server(
        data: server_registration_model,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, str]:
        try:
            probe_result = await probe_server_status(data.name, data.url, timeout_sec=8.0)
            if probe_result["status"] != "alive":
                error_detail = probe_result.get("error") or "Unknown connection error"
                raise HTTPException(
                    status_code=400,
                    detail=f"Server endpoint is not reachable or not MCP-compatible: {error_detail}",
                )

            with session_local_factory() as db:
                existing = db.scalar(select(server_model).where(server_model.name == data.name))
                before_state = None
                if existing:
                    before_state = {
                        "name": existing.name,
                        "url": existing.url,
                        "description": existing.description or "",
                        "is_enabled": bool(existing.is_enabled),
                        "is_deleted": bool(existing.is_deleted),
                    }
                    existing.url = data.url
                    existing.description = (getattr(data, "description", "") or "").strip()
                    existing.is_enabled = True
                    existing.is_deleted = False
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"mcp:{existing.name}",
                        server_id=existing.id,
                    )
                else:
                    server = server_model(
                        name=data.name,
                        url=data.url,
                        description=(getattr(data, "description", "") or "").strip(),
                        is_enabled=True,
                        is_deleted=False,
                    )
                    db.add(server)
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"mcp:{server.name}",
                        server_id=server.id,
                    )
                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action="mcp_server.upsert",
                    resource_type="mcp_server",
                    resource_id=data.name,
                    before_state=before_state,
                    after_state={
                        "name": data.name,
                        "url": data.url,
                        "description": (getattr(data, "description", "") or "").strip(),
                        "is_enabled": True,
                        "is_deleted": False,
                    },
                )
                db.commit()

            sync_api_server_links_by_host_fn()
            return {
                "message": "Server registered successfully",
                "name": data.name,
                "url": data.url,
            }

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get("/servers/{server_name}/tools")
    async def get_server_tools(
        server_name: str,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        try:
            with session_local_factory() as db:
                server = db.scalar(select(server_model).where(server_model.name == server_name))

                policies = db.scalars(
                    select(access_policy_model).where(access_policy_model.owner_id == f"mcp:{server_name}")
                ).all()

                policy_map = {p.tool_id: p.mode for p in policies}
                default_mode = policy_map.get("__default__", "deny")

            if not server:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

            config = {
                "mcpServers": {
                    server_name: {"url": server.url},
                }
            }

            client = mcp_client_cls(config)
            await client.create_all_sessions()
            session = client.get_session(server_name)
            tools = await session.list_tools()

            tools_list = []
            for tool in tools:
                mode = policy_map.get(tool.name, default_mode)
                tools_list.append(
                    {
                        "name": tool.name,
                        "description": tool.description,
                        "inputSchema": tool.inputSchema if hasattr(tool, "inputSchema") else {},
                        "access_mode": mode,
                    }
                )

            return {
                "server": server_name,
                "url": server.url,
                "tools": tools_list,
                "tool_count": len(tools_list),
            }

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Error retrieving tools: {exc}") from exc

    @router.get("/servers")
    def list_servers(
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        _ = current_user
        try:
            with session_local_factory() as db:
                rows = db.scalars(select(server_model)).all()
                servers = [
                    {
                        "name": row.name,
                        "url": row.url,
                        "description": row.description or "",
                        "is_enabled": bool(row.is_enabled),
                        "is_deleted": bool(row.is_deleted),
                    }
                    for row in rows
                ]

            return {"servers": servers}

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get("/servers/status")
    async def list_servers_status(
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        try:
            with session_local_factory() as db:
                rows = db.scalars(select(server_model)).all()
                servers = [{"name": row.name, "url": row.url} for row in rows]

            checks = [probe_server_status(s["name"], s["url"]) for s in servers]
            statuses = await asyncio.gather(*checks)

            alive_count = sum(1 for s in statuses if s["status"] == "alive")
            down_count = len(statuses) - alive_count

            return {
                "servers": statuses,
                "summary": {
                    "total": len(statuses),
                    "alive": alive_count,
                    "down": down_count,
                },
            }
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Error retrieving server statuses: {exc}") from exc

    @router.get("/servers/{server_name}/status")
    async def get_server_status(
        server_name: str,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        try:
            with session_local_factory() as db:
                server = db.scalar(select(server_model).where(server_model.name == server_name))

            if not server:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

            return await probe_server_status(server.name, server.url)
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Error retrieving server status: {exc}") from exc

    @router.patch("/servers/{server_name}")
    def update_server(
        server_name: str,
        payload: ServerUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            server = db.scalar(select(server_model).where(server_model.name == server_name))
            if not server:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

            before_state = {
                "name": server.name,
                "url": server.url,
                "description": server.description or "",
                "is_enabled": bool(server.is_enabled),
                "is_deleted": bool(server.is_deleted),
            }
            if payload.url is not None:
                server.url = payload.url
            if payload.description is not None:
                server.description = payload.description.strip()
            if payload.is_enabled is not None:
                server.is_enabled = payload.is_enabled

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="mcp_server.update",
                resource_type="mcp_server",
                resource_id=server_name,
                before_state=before_state,
                after_state={
                    "name": server.name,
                    "url": server.url,
                    "description": server.description or "",
                    "is_enabled": bool(server.is_enabled),
                    "is_deleted": bool(server.is_deleted),
                },
            )
            db.commit()
        return {"status": "updated", "name": server_name}

    @router.delete("/servers/{server_name}")
    def delete_server(
        server_name: str,
        hard: bool = Query(default=False),
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            server = db.scalar(select(server_model).where(server_model.name == server_name))
            if not server:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")
            before_state = {
                "name": server.name,
                "url": server.url,
                "description": server.description or "",
                "is_enabled": bool(server.is_enabled),
                "is_deleted": bool(server.is_deleted),
            }
            if hard:
                db.delete(server)
                action = "mcp_server.delete.hard"
                after_state = None
            else:
                server.is_deleted = True
                server.is_enabled = False
                action = "mcp_server.delete.soft"
                after_state = {"is_deleted": True, "is_enabled": False}

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action=action,
                resource_type="mcp_server",
                resource_id=server_name,
                before_state=before_state,
                after_state=after_state,
            )
            db.commit()
        return {"status": "deleted", "name": server_name, "hard": hard}

    return router
