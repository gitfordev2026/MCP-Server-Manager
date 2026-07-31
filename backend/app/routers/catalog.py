from typing import Any

from fastapi import APIRouter, Query, Depends
from sqlalchemy import select
from app.core.rbac import get_request_actor


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
    get_actor_dep=get_request_actor,
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
        current_user: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        from app.services.registry.exposure_service import resolve_exposable_tools

        if force_refresh or not registry_only:
            # Trigger background pull and DB sync
            await build_openapi_tool_catalog_fn(force_refresh=True, retries_override=retries)
            await fetch_all_mcp_server_tools_fn()

        role = current_user.get("primary_role") or "developer"
        sub = current_user.get("subject") or current_user.get("sub") or current_user.get("username")
        username = current_user.get("username")
        user_ids = [u for u in (sub, username) if u]

        with session_local_factory() as db:
            tools_list, mcp_server_tool_list = resolve_exposable_tools(
                db=db,
                mcp_tool_model=mcp_tool_model,
                access_policy_model=access_policy_model,
                server_model=server_model,
                base_url_model=base_url_model,
                registry_only=registry_only,
                public_only=public_only
            )

            base_app_stmt = select(base_url_model).where(
                base_url_model.is_deleted == False,  # noqa: E712
                base_url_model.is_enabled == True,  # noqa: E712
            )
            server_stmt = select(server_model).where(
                server_model.is_deleted == False,  # noqa: E712
                server_model.is_enabled == True,  # noqa: E712
            )
            if role != "admin":
                base_app_stmt = base_app_stmt.where(base_url_model.created_by_user_id.in_(user_ids))
                server_stmt = server_stmt.where(server_model.created_by_user_id.in_(user_ids))

            active_apps = db.scalars(base_app_stmt).all()
            active_servers = db.scalars(server_stmt).all()
            active_app_names = {app.name for app in active_apps}
            active_server_names = {srv.name for srv in active_servers}

            if role != "admin":
                tools_list = [tool for tool in tools_list if tool.get("app") in active_app_names]
                mcp_server_tool_list = [tool for tool in mcp_server_tool_list if tool.get("app") in active_server_names]

        app_count = len(active_apps) + len(active_servers)
        healthy_count = sum(
            1 for app in (active_apps + active_servers)
            if str(getattr(app, "health_status", "unknown")) in {"healthy", "degraded", "unknown"}
        )
        unreachable_count = sum(
            1 for app in (active_apps + active_servers)
            if str(getattr(app, "health_status", "unknown")) == "down"
        )
        zero_count = 0

        all_tools = tools_list + mcp_server_tool_list
        tool_count = len(all_tools)

        apps = [
            {
                "name": app.name,
                "url": app.url,
                "status": str(getattr(app, "health_status", "unknown")),
                "tool_count": 0,
                "last_sync_status": getattr(app, "last_sync_status", "never"),
                "registry_state": getattr(app, "registry_state", "active"),
                "last_health_check_at": getattr(app, "last_health_check_at", None),
                "consecutive_failures": int(getattr(app, "consecutive_failures", 0) or 0),
                "mcp_endpoint": f"/mcp/app/{app.name}",
                "mcp_proxy_endpoint": f"/api/proxy/mcp/app/{app.name}",
            }
            for app in (active_apps + active_servers)
        ]
        sync_errors = [
            str(getattr(app, "last_sync_error", "")).strip()
            for app in (active_apps + active_servers)
            if str(getattr(app, "last_sync_error", "")).strip()
        ]
        generated_at = 0.0

        summary_data = {
            "apps_total": app_count,
            "total_apps": app_count,
            "healthy": healthy_count,
            "healthy_apps": healthy_count,
            "unreachable": unreachable_count,
            "unreachable_apps": unreachable_count,
            "zero_endpoints": zero_count,
            "zero_tool_apps": zero_count,
            "total_tools": tool_count,
        }

        return {
            "mcp_endpoint": "/mcp/apps",
            "generated_at": generated_at,
            "tool_count": tool_count,
            "summary": summary_data,
            "apps_summary": summary_data,
            "apps": apps,
            "tools": all_tools,
            "openapi_tools": tools_list,
            "mcp_server_tools": mcp_server_tool_list,
            "sync_errors": sync_errors,
        }

    return router
