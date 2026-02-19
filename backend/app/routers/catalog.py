from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import select


def create_catalog_router(
    session_local_factory,
    access_policy_model,
    build_openapi_tool_catalog_fn,
    fetch_all_mcp_server_tools_fn,
    openapi_mcp_fetch_retries: int,
    openapi_mcp_cache_ttl_sec: int,
) -> APIRouter:
    router = APIRouter()

    @router.get("/mcp/openapi/catalog")
    async def get_openapi_tool_catalog(
        force_refresh: bool = Query(default=True),
        retries: int = Query(default=openapi_mcp_fetch_retries, ge=0, le=5),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        catalog = await build_openapi_tool_catalog_fn(force_refresh=force_refresh, retries_override=retries)
        mcp_server_tools = await fetch_all_mcp_server_tools_fn()

        app_count = len(catalog.apps)
        healthy_count = sum(1 for app in catalog.apps if app.get("status") == "healthy")
        zero_count = sum(1 for app in catalog.apps if app.get("status") == "zero_endpoints")
        unreachable_count = sum(1 for app in catalog.apps if app.get("status") == "unreachable")

        with session_local_factory() as db:
            policies = db.scalars(select(access_policy_model)).all()
            policy_map: dict[str, dict[str, str]] = {}
            for p in policies:
                if p.owner_id not in policy_map:
                    policy_map[p.owner_id] = {}
                policy_map[p.owner_id][p.tool_id] = p.mode

        def _get_mode(owner_id: str, tool_id: str) -> str:
            owner_policies = policy_map.get(owner_id, {})
            if tool_id in owner_policies:
                return owner_policies[tool_id]
            if "__default__" in owner_policies:
                return owner_policies["__default__"]
            return "deny"

        tools_list = [
            {
                "name": tool.name,
                "title": tool.title,
                "app": tool.app_name,
                "method": tool.method,
                "path": tool.path,
                "is_placeholder": tool.is_placeholder,
                "placeholder_reason": tool.placeholder_reason,
                "source": "openapi",
                "access_mode": _get_mode(f"app:{tool.app_name}", tool.name),
            }
            for tool in catalog.tools.values()
        ]

        mcp_server_tool_list = []
        for prefixed_name, (server_name, orig_name, tool_obj) in mcp_server_tools.items():
            entry = {
                "name": prefixed_name,
                "title": orig_name,
                "app": server_name,
                "method": "MCP",
                "path": orig_name,
                "is_placeholder": False,
                "placeholder_reason": None,
                "source": "mcp_server",
                "access_mode": _get_mode(f"mcp:{server_name}", orig_name),
            }
            tools_list.append(entry)
            mcp_server_tool_list.append(entry)

        return {
            "mcp_endpoint": "/mcp/apps",
            "generated_at": catalog.generated_at,
            "tool_count": len(tools_list),
            "summary": {
                "apps_total": app_count,
                "healthy": healthy_count,
                "zero_endpoints": zero_count,
                "unreachable": unreachable_count,
                "mcp_servers": len(set(s for _, (s, _, _) in mcp_server_tools.items())),
                "mcp_server_tools": len(mcp_server_tools),
            },
            "settings": {
                "retries": retries,
                "cache_ttl_sec": openapi_mcp_cache_ttl_sec,
            },
            "sync_errors": catalog.sync_errors,
            "apps": catalog.apps,
            "tools": tools_list,
            "mcp_server_tools": mcp_server_tool_list,
        }

    @router.get("/mcp/openapi/diagnostics")
    async def get_openapi_sync_diagnostics(
        retries: int = Query(default=2, ge=0, le=5),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        catalog = await build_openapi_tool_catalog_fn(force_refresh=True, retries_override=retries)
        return {
            "generated_at": catalog.generated_at,
            "retries": retries,
            "apps": catalog.apps,
            "sync_errors": catalog.sync_errors,
        }

    return router
