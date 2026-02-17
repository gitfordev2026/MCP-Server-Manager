import asyncio
from time import perf_counter
from typing import Any

from fastapi import APIRouter, HTTPException
from sqlalchemy import select


def create_servers_router(
    session_local_factory,
    server_model,
    access_policy_model,
    server_registration_model,
    mcp_client_cls,
    ensure_default_access_policy_for_owner_fn,
    sync_api_server_links_by_host_fn,
) -> APIRouter:
    router = APIRouter()

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
                if existing:
                    existing.url = data.url
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"mcp:{existing.name}",
                        server_id=existing.id,
                    )
                else:
                    server = server_model(name=data.name, url=data.url)
                    db.add(server)
                    db.flush()
                    ensure_default_access_policy_for_owner_fn(
                        db,
                        owner_id=f"mcp:{server.name}",
                        server_id=server.id,
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
                default_mode = policy_map.get("__default__", "approval")

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
    ) -> dict[str, list[dict[str, str]]]:
        _ = current_user
        try:
            with session_local_factory() as db:
                rows = db.scalars(select(server_model)).all()
                servers = [{"name": row.name, "url": row.url} for row in rows]

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

    return router
