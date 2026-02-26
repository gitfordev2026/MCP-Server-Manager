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
        _ = current_user

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
            return "allow"

        if registry_only:
            with session_local_factory() as db:
                active_apps = db.scalars(
                    select(base_url_model).where(
                        base_url_model.is_deleted == False,  # noqa: E712
                        base_url_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
                active_servers = db.scalars(
                    select(server_model).where(
                        server_model.is_deleted == False,  # noqa: E712
                        server_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
                rows = db.scalars(
                    select(mcp_tool_model).where(
                        mcp_tool_model.is_deleted == False,  # noqa: E712
                        mcp_tool_model.is_enabled == True,  # noqa: E712
                    )
                ).all()

            active_app_ids = {row.id for row in active_apps}
            active_app_names = {row.name for row in active_apps}
            active_server_ids = {row.id for row in active_servers}
            active_server_names = {row.name for row in active_servers}
            app_tools_by_owner: dict[str, int] = {f"app:{row.name}": 0 for row in active_apps}

            tools_list: list[dict[str, Any]] = []
            mcp_server_tool_list: list[dict[str, Any]] = []

            for row in rows:
                owner_id = row.owner_id or ""
                owner_name = owner_id.split(":", 1)[1] if ":" in owner_id else owner_id

                if row.source_type == "openapi":
                    if row.raw_api_id is not None and row.raw_api_id not in active_app_ids:
                        continue
                    if row.raw_api_id is None and owner_name not in active_app_names:
                        continue
                    app_tools_by_owner[owner_id] = app_tools_by_owner.get(owner_id, 0) + 1
                    tools_list.append(
                        {
                            "name": row.name,
                            "title": row.display_name or row.name,
                            "app": owner_name or owner_id,
                            "method": (row.method or "").upper(),
                            "path": row.path or "",
                            "is_placeholder": False,
                            "placeholder_reason": None,
                            "source": "openapi",
                            "access_mode": _get_mode(owner_id, row.name),
                        }
                    )
                    continue

                if row.source_type == "mcp":
                    if row.server_id is not None and row.server_id not in active_server_ids:
                        continue
                    if row.server_id is None and owner_name not in active_server_names:
                        continue
                    entry = {
                        "name": f"mcp__{owner_name}__{row.name}",
                        "title": row.display_name or row.name,
                        "app": owner_name or owner_id,
                        "method": "MCP",
                        "path": row.name,
                        "is_placeholder": False,
                        "placeholder_reason": None,
                        "source": "mcp_server",
                        "access_mode": _get_mode(owner_id, row.name),
                    }
                    tools_list.append(entry)
                    mcp_server_tool_list.append(entry)

            app_count = len(active_apps)
            healthy_count = sum(
                1
                for app in active_apps
                if str(getattr(app, "registry_state", "active")) == "active"
                and str(getattr(app, "last_sync_status", "never")) != "failed"
            )
            unreachable_count = sum(
                1 for app in active_apps if str(getattr(app, "last_sync_status", "never")) == "failed"
            )
            zero_count = sum(
                1 for owner_id in app_tools_by_owner if int(app_tools_by_owner.get(owner_id, 0)) == 0
            )
            apps = [
                {
                    "name": app.name,
                    "url": app.url,
                    "status": "unreachable"
                    if str(getattr(app, "last_sync_status", "never")) == "failed"
                    else ("zero_endpoints" if app_tools_by_owner.get(f"app:{app.name}", 0) == 0 else "healthy"),
                    "tool_count": app_tools_by_owner.get(f"app:{app.name}", 0),
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
        else:
            catalog = await build_openapi_tool_catalog_fn(force_refresh=force_refresh, retries_override=retries)
            mcp_server_tools = await fetch_all_mcp_server_tools_fn()

            app_count = len(catalog.apps)
            healthy_count = sum(1 for app in catalog.apps if app.get("status") == "healthy")
            zero_count = sum(1 for app in catalog.apps if app.get("status") == "zero_endpoints")
            unreachable_count = sum(1 for app in catalog.apps if app.get("status") == "unreachable")

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
            for prefixed_name, (server_name, orig_name, _tool_obj) in mcp_server_tools.items():
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

            apps = catalog.apps
            sync_errors = catalog.sync_errors
            generated_at = catalog.generated_at

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
