import asyncio
from time import perf_counter
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, ConfigDict
from sqlalchemy import delete, select


def create_servers_router(
    session_local_factory,
    server_model,
    access_policy_model,
    mcp_tool_model,
    api_endpoint_model,
    api_server_link_model,
    tool_version_model,
    endpoint_version_model,
    server_registration_model,
    mcp_client_cls,
    ensure_default_access_policy_for_owner_fn,
    sync_api_server_links_by_host_fn,
    write_audit_log_fn,
    audit_log_model,
    get_actor_dep,
) -> APIRouter:
    router = APIRouter()
    allowed_domains = {"ADM", "OPS"}

    def _normalize_domain_type(value: str | None) -> str:
        domain = (value or "ADM").strip().upper()
        if domain not in allowed_domains:
            raise HTTPException(status_code=400, detail="domain_type must be ADM or OPS")
        return domain

    def _normalize_selected_tools(value: list[str] | None) -> list[str]:
        if not value:
            return []
        cleaned = [str(item).strip() for item in value if str(item).strip()]
        return list(dict.fromkeys(cleaned))

    class ServerUpdate(BaseModel):
        model_config = ConfigDict(extra="forbid")

        description: str | None = None
        url: str | None = None
        domain_type: str | None = None
        selected_tools: list[str] | None = None
        is_enabled: bool | None = None

    class ServerDiscoveryRequest(BaseModel):
        model_config = ConfigDict(extra="forbid")

        name: str
        url: str

    def _soft_delete_server_dependents(db, server_id: int, owner_id: str) -> dict[str, int]:
        tools = db.scalars(
            select(mcp_tool_model).where(
                (mcp_tool_model.server_id == server_id) | (mcp_tool_model.owner_id == owner_id)
            )
        ).all()
        for tool in tools:
            tool.is_deleted = True
            tool.is_enabled = False

        endpoints = db.scalars(
            select(api_endpoint_model).where(api_endpoint_model.owner_id == owner_id)
        ).all()
        for endpoint in endpoints:
            endpoint.is_deleted = True
            endpoint.is_enabled = False
            endpoint.exposed_to_mcp = False

        return {"tools": len(tools), "endpoints": len(endpoints)}

    def _hard_delete_server_dependents(db, server_id: int, owner_id: str) -> dict[str, int]:
        tool_ids = [
            row.id
            for row in db.scalars(
                select(mcp_tool_model).where(
                    (mcp_tool_model.server_id == server_id) | (mcp_tool_model.owner_id == owner_id)
                )
            ).all()
        ]
        endpoint_ids = [
            row.id
            for row in db.scalars(select(api_endpoint_model).where(api_endpoint_model.owner_id == owner_id)).all()
        ]

        if endpoint_ids:
            db.execute(
                delete(endpoint_version_model).where(endpoint_version_model.endpoint_id.in_(endpoint_ids))
            )
            db.execute(delete(api_endpoint_model).where(api_endpoint_model.id.in_(endpoint_ids)))

        if tool_ids:
            db.execute(delete(tool_version_model).where(tool_version_model.tool_id.in_(tool_ids)))
            db.execute(delete(mcp_tool_model).where(mcp_tool_model.id.in_(tool_ids)))

        db.execute(delete(access_policy_model).where(access_policy_model.owner_id == owner_id))
        db.execute(delete(access_policy_model).where(access_policy_model.server_id == server_id))
        db.execute(delete(api_server_link_model).where(api_server_link_model.server_id == server_id))

        return {"tools": len(tool_ids), "endpoints": len(endpoint_ids)}

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

    @router.post(
        "/discover-server-tools",
        summary="Discover MCP Server Tools",
        description="Discover tools from MCP server URL without registering it. Source: backend/app/routers/servers.py",
    )
    async def discover_server_tools(payload: ServerDiscoveryRequest) -> dict[str, Any]:
        probe_result = await probe_server_status(payload.name, payload.url, timeout_sec=8.0)
        if probe_result["status"] != "alive":
            error_detail = probe_result.get("error") or "Unknown connection error"
            raise HTTPException(
                status_code=400,
                detail=f"Server endpoint is not reachable or not MCP-compatible: {error_detail}",
            )

        config = {"mcpServers": {payload.name: {"url": payload.url}}}
        client = mcp_client_cls(config)
        await client.create_all_sessions()
        session = client.get_session(payload.name)
        tools = await session.list_tools()

        return {
            "name": payload.name,
            "url": payload.url,
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

    @router.post(
        "/register-server",
        summary="Register MCP Server",
        description="Create or update an MCP server registration after connectivity probe. Source: backend/app/routers/servers.py",
    )
    async def register_server(
        data: server_registration_model,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
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
                        "domain_type": existing.domain_type or "ADM",
                        "selected_tools": existing.selected_tools or [],
                        "is_enabled": bool(existing.is_enabled),
                        "is_deleted": bool(existing.is_deleted),
                    }
                    existing.url = data.url
                    existing.description = (getattr(data, "description", "") or "").strip()
                    existing.domain_type = _normalize_domain_type(getattr(data, "domain_type", "ADM"))
                    existing.selected_tools = _normalize_selected_tools(getattr(data, "selected_tools", []))
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
                        domain_type=_normalize_domain_type(getattr(data, "domain_type", "ADM")),
                        selected_tools=_normalize_selected_tools(getattr(data, "selected_tools", [])),
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
                        "domain_type": _normalize_domain_type(getattr(data, "domain_type", "ADM")),
                        "selected_tools": _normalize_selected_tools(getattr(data, "selected_tools", [])),
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
                "domain_type": _normalize_domain_type(getattr(data, "domain_type", "ADM")),
                "selected_tools_count": len(getattr(data, "selected_tools", []) or []),
                "selected_tools": _normalize_selected_tools(getattr(data, "selected_tools", [])),
            }

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get(
        "/servers/{server_name}/tools",
        summary="List MCP Server Tools",
        description="List tools from a specific MCP server with effective access mode. Source: backend/app/routers/servers.py",
    )
    async def get_server_tools(
        server_name: str,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        try:
            with session_local_factory() as db:
                server = db.scalar(select(server_model).where(server_model.name == server_name))
                selected_tools = [str(item).strip() for item in (server.selected_tools or [])] if server else []

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
                if selected_tools and tool.name not in selected_tools:
                    continue
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

    @router.get(
        "/servers",
        summary="List MCP Servers",
        description="List all registered MCP servers. Source: backend/app/routers/servers.py",
    )
    def list_servers(
        include_inactive: bool = Query(default=False),
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, list[dict[str, Any]]]:
        _ = current_user
        try:
            with session_local_factory() as db:
                stmt = select(server_model)
                if not include_inactive:
                    stmt = stmt.where(
                        server_model.is_deleted == False,  # noqa: E712
                        server_model.is_enabled == True,  # noqa: E712
                    )
                rows = db.scalars(stmt).all()
                servers = [
                    {
                        "name": row.name,
                        "url": row.url,
                        "description": row.description or "",
                        "domain_type": row.domain_type or "ADM",
                        "selected_tools": row.selected_tools or [],
                        "is_enabled": bool(row.is_enabled),
                        "is_deleted": bool(row.is_deleted),
                    }
                    for row in rows
                ]

            return {"servers": servers}

        except Exception as exc:
            raise HTTPException(status_code=500, detail=str(exc)) from exc

    @router.get(
        "/servers/status",
        summary="Get MCP Servers Status",
        description="Health/status rollup for all registered MCP servers. Source: backend/app/routers/servers.py",
    )
    async def list_servers_status(
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        try:
            with session_local_factory() as db:
                rows = db.scalars(
                    select(server_model).where(
                        server_model.is_deleted == False,  # noqa: E712
                        server_model.is_enabled == True,  # noqa: E712
                    )
                ).all()
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

    @router.get(
        "/servers/{server_name}/status",
        summary="Get MCP Server Status",
        description="Health/status details for one MCP server. Source: backend/app/routers/servers.py",
    )
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

    @router.patch(
        "/servers/{server_name}",
        summary="Update MCP Server",
        description="Update MCP server metadata/settings by name. Source: backend/app/routers/servers.py",
    )
    def update_server(
        server_name: str,
        payload: ServerUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            server = db.scalar(select(server_model).where(server_model.name == server_name))
            if not server or server.is_deleted or not server.is_enabled:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

            before_state = {
                "name": server.name,
                "url": server.url,
                "description": server.description or "",
                "domain_type": server.domain_type or "ADM",
                "selected_tools": server.selected_tools or [],
                "is_enabled": bool(server.is_enabled),
                "is_deleted": bool(server.is_deleted),
            }
            if payload.url is not None:
                server.url = payload.url
            if payload.description is not None:
                server.description = payload.description.strip()
            if payload.domain_type is not None:
                server.domain_type = _normalize_domain_type(payload.domain_type)
            if payload.selected_tools is not None:
                server.selected_tools = _normalize_selected_tools(payload.selected_tools)
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
                    "domain_type": server.domain_type or "ADM",
                    "selected_tools": server.selected_tools or [],
                    "is_enabled": bool(server.is_enabled),
                    "is_deleted": bool(server.is_deleted),
                },
            )
            db.commit()
        return {"status": "updated", "name": server_name}

    @router.delete(
        "/servers/{server_name}",
        summary="Delete MCP Server",
        description="Soft-delete or hard-delete an MCP server by name. Source: backend/app/routers/servers.py",
    )
    def delete_server(
        server_name: str,
        hard: bool = Query(default=False),
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            server = db.scalar(select(server_model).where(server_model.name == server_name))
            if not server or server.is_deleted or not server.is_enabled:
                raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")
            owner_id = f"mcp:{server.name}"
            before_state = {
                "name": server.name,
                "url": server.url,
                "description": server.description or "",
                "domain_type": server.domain_type or "ADM",
                "selected_tools": server.selected_tools or [],
                "is_enabled": bool(server.is_enabled),
                "is_deleted": bool(server.is_deleted),
            }
            try:
                if hard:
                    dependent_counts = _hard_delete_server_dependents(db, server.id, owner_id)
                    db.delete(server)
                    action = "mcp_server.delete.hard"
                    after_state = {
                        "deleted": True,
                        "hard": True,
                        "dependents_removed": dependent_counts,
                    }
                else:
                    dependent_counts = _soft_delete_server_dependents(db, server.id, owner_id)
                    server.is_deleted = True
                    server.is_enabled = False
                    action = "mcp_server.delete.soft"
                    after_state = {
                        "is_deleted": True,
                        "is_enabled": False,
                        "dependents_soft_deleted": dependent_counts,
                    }

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
            except Exception as exc:
                db.rollback()
                raise HTTPException(status_code=500, detail=f"Failed to delete server '{server_name}': {exc}") from exc
        return {"status": "deleted", "name": server_name, "hard": hard}

    return router
