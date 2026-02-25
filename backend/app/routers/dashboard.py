import asyncio
from time import perf_counter
from typing import Any

import httpx
from fastapi import APIRouter
from sqlalchemy import select


def create_dashboard_router(
    session_local_factory,
    base_url_model,
    server_model,
    mcp_tool_model,
    mcp_client_cls,
) -> APIRouter:
    router = APIRouter()

    async def probe_app_status(name: str, url: str, timeout_sec: float = 5.0) -> dict[str, Any]:
        started = perf_counter()
        try:
            async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=True) as client:
                response = await client.get(url)
            return {
                "name": name,
                "url": url,
                "status": "alive" if response.status_code < 500 else "down",
                "latency_ms": int((perf_counter() - started) * 1000),
            }
        except Exception as exc:
            return {
                "name": name,
                "url": url,
                "status": "down",
                "latency_ms": int((perf_counter() - started) * 1000),
                "error": str(exc),
            }

    async def probe_server_status(name: str, url: str, timeout_sec: float = 8.0) -> dict[str, Any]:
        started = perf_counter()
        try:
            config = {"mcpServers": {name: {"url": url}}}
            client = mcp_client_cls(config)
            await asyncio.wait_for(client.create_all_sessions(), timeout=timeout_sec)
            session = client.get_session(name)
            tools = await asyncio.wait_for(session.list_tools(), timeout=timeout_sec)
            return {
                "name": name,
                "url": url,
                "status": "alive",
                "tool_count": len(tools),
                "latency_ms": int((perf_counter() - started) * 1000),
            }
        except Exception as exc:
            return {
                "name": name,
                "url": url,
                "status": "down",
                "tool_count": 0,
                "latency_ms": int((perf_counter() - started) * 1000),
                "error": str(exc),
            }

    @router.get(
        "/dashboard/stats",
        summary="Get Dashboard Stats",
        description="Return dashboard cards and live status checks for apps and MCP servers. Source: backend/app/routers/dashboard.py",
    )
    async def get_dashboard_stats() -> dict[str, Any]:
        with session_local_factory() as db:
            apps = db.scalars(select(base_url_model).where(base_url_model.is_deleted == False)).all()  # noqa: E712
            servers = db.scalars(select(server_model).where(server_model.is_deleted == False)).all()  # noqa: E712
            tools = db.scalars(select(mcp_tool_model).where(mcp_tool_model.is_deleted == False)).all()  # noqa: E712

        active_server_ids = {server.id for server in servers if getattr(server, "is_enabled", True)}
        active_api_ids = {app.id for app in apps if getattr(app, "is_enabled", True)}
        visible_tools = []
        for tool in tools:
            source_type = getattr(tool, "source_type", "")
            if source_type == "mcp":
                server_id = getattr(tool, "server_id", None)
                if server_id is not None and server_id not in active_server_ids:
                    continue
            elif source_type == "openapi":
                raw_api_id = getattr(tool, "raw_api_id", None)
                if raw_api_id is not None and raw_api_id not in active_api_ids:
                    continue
            visible_tools.append(tool)

        app_checks = [probe_app_status(app.name, app.url) for app in apps]
        server_checks = [probe_server_status(server.name, server.url) for server in servers]
        app_statuses = await asyncio.gather(*app_checks) if app_checks else []
        server_statuses = await asyncio.gather(*server_checks) if server_checks else []

        apps_alive = sum(1 for item in app_statuses if item.get("status") == "alive")
        servers_alive = sum(1 for item in server_statuses if item.get("status") == "alive")

        return {
            "cards": {
                "total_applications": len(apps),
                "applications_alive": apps_alive,
                "applications_down": len(apps) - apps_alive,
                "total_mcp_servers": len(servers),
                "mcp_servers_alive": servers_alive,
                "mcp_servers_down": len(servers) - servers_alive,
                "total_tools": sum(1 for t in visible_tools if getattr(t, "source_type", "") == "mcp"),
                "total_api_endpoints": sum(1 for t in visible_tools if getattr(t, "source_type", "") == "openapi"),
            },
            "applications": app_statuses,
            "mcp_servers": server_statuses,
        }

    return router
