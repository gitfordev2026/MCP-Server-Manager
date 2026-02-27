from typing import Any

from fastapi import APIRouter, Query
from sqlalchemy import select


def create_catalog_router(
    session_local_factory,
    access_policy_model,
    mcp_tool_model,
    base_url_model,
    server_model,
    build_openapi_tool_catalog_fn,
    fetch_all_mcp_server_tools_fn,
    openapi_mcp_fetch_retries: int,
    openapi_mcp_cache_ttl_sec: int,
) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/mcp/openapi/catalog",
        summary="Get Unified Tool Catalog",
        description="Return OpenAPI + MCP server tool catalog with policy modes. Source: backend/app/routers/catalog.py",
    )
    async def get_openapi_tool_catalog(
        force_refresh: bool = Query(default=True),
        retries: int = Query(default=openapi_mcp_fetch_retries, ge=0, le=5),
        registry_only: bool = Query(
            default=True,
            description="When true, return catalog strictly from DB registry tables (no live upstream fetch).",
        ),
        public_only: bool = Query(
            default=False,
            description="When true, include only tools with effective access_mode='allow' (public/client-allowed).",
        ),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        from backend.app.services.registry.exposure_service import resolve_exposable_tools
        
        tools_list, mcp_server_tool_list = resolve_exposable_tools(
            db=session_local_factory(),
            mcp_tool_model=mcp_tool_model,
            access_policy_model=access_policy_model,
            registry_only=registry_only,
            public_only=public_only
        )
        
        with session_local_factory() as db:
            active_apps = db.scalars(
                select(base_url_model).where(
                    base_url_model.is_deleted == False,  # noqa: E712
                    base_url_model.is_enabled == True,  # noqa: E712
                )
            ).all()

        app_count = len(active_apps)
        healthy_count = sum(
            1 for app in active_apps
            if str(getattr(app, "registry_state", "active")) == "active"
            and str(getattr(app, "last_sync_status", "never")) != "failed"
        )
        unreachable_count = sum(
            1 for app in active_apps if str(getattr(app, "last_sync_status", "never")) == "failed"
        )
        
        zero_count = 0  # Simplified calculation for isolated service architecture
        
        apps = [
            {
                "name": app.name,
                "url": app.url,
                "status": "unreachable"
                if str(getattr(app, "last_sync_status", "never")) == "failed"
                else "healthy",
                "tool_count": 0, # Could aggregate from tools_list
                "last_sync_status": getattr(app, "last_sync_status", "never"),
                "registry_state": getattr(app, "registry_state", "active"),
            }
            for app in active_apps
        ]
        sync_errors = [
            str(getattr(app, "last_sync_error", "")).strip()
            for app in active_apps
            if str(getattr(app, "last_sync_error", "")).strip()
        ]
        generated_at = 0.0


        if public_only:
            tools_list = [tool for tool in tools_list if tool.get("access_mode") == "allow"]
            mcp_server_tool_list = [tool for tool in mcp_server_tool_list if tool.get("access_mode") == "allow"]

        return {
            "mcp_endpoint": "/mcp/apps",
            "generated_at": generated_at,
            "tool_count": len(tools_list),
            "summary": {
                "apps_total": app_count,
                "healthy": healthy_count,
                "zero_endpoints": zero_count,
                "unreachable": unreachable_count,
                "mcp_servers": len({tool.get("app") for tool in mcp_server_tool_list}),
                "mcp_server_tools": len(mcp_server_tool_list),
            },
            "settings": {
                "retries": retries,
                "cache_ttl_sec": openapi_mcp_cache_ttl_sec,
                "registry_only": registry_only,
            },
            "sync_errors": sync_errors,
            "apps": apps,
            "tools": tools_list,
            "mcp_server_tools": mcp_server_tool_list,
        }

    @router.get(
        "/mcp/openapi/diagnostics",
        summary="Get Catalog Diagnostics",
        description="Return OpenAPI sync diagnostics and per-app discovery status. Source: backend/app/routers/catalog.py",
    )
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
