import asyncio
import datetime
from typing import Any

import httpx
from sqlalchemy import select

from app.env import ENV
from app.core.db import SessionLocal
from app.models.db_models import MCPToolModel, ServerModel, BaseURLModel
from mcp_use import MCPClient


HEALTH_CHANNEL = "mcp_tool_health"


async def _publish(payload: dict[str, Any]) -> None:
    if not ENV.redis_url:
        return
    try:
        import redis.asyncio as redis  # type: ignore
        client = redis.from_url(ENV.redis_url, encoding="utf-8", decode_responses=True)
        await client.publish(HEALTH_CHANNEL, json_dumps(payload))
        await client.close()
    except Exception:
        # Ignore publish errors to avoid crashing monitor
        return


def json_dumps(payload: dict[str, Any]) -> str:
    import json
    return json.dumps(payload, default=str)


async def _check_mcp_server(name: str, url: str, timeout_sec: int) -> tuple[bool, int | None, str | None]:
    started = asyncio.get_event_loop().time()
    try:
        config = {"mcpServers": {name: {"url": url}}}
        client = MCPClient(config)
        await asyncio.wait_for(client.create_all_sessions(), timeout=timeout_sec)
        session = client.get_session(name)
        await asyncio.wait_for(session.list_tools(), timeout=timeout_sec)
        latency_ms = int((asyncio.get_event_loop().time() - started) * 1000)
        return True, latency_ms, None
    except Exception as exc:
        latency_ms = int((asyncio.get_event_loop().time() - started) * 1000)
        return False, latency_ms, str(exc)


async def _check_base_url(url: str, timeout_sec: int) -> tuple[bool, int | None, str | None]:
    started = asyncio.get_event_loop().time()
    try:
        async with httpx.AsyncClient(timeout=timeout_sec, follow_redirects=True) as client:
            resp = await client.get(url)
        latency_ms = int((asyncio.get_event_loop().time() - started) * 1000)
        return resp.status_code < 500, latency_ms, None if resp.status_code < 500 else f"HTTP {resp.status_code}"
    except Exception as exc:
        latency_ms = int((asyncio.get_event_loop().time() - started) * 1000)
        return False, latency_ms, str(exc)


async def _mark_tools(
    db,
    owner_id: str,
    healthy: bool,
    latency_ms: int | None,
    error: str | None,
) -> None:
    status = "healthy" if healthy else "stale"
    now = datetime.datetime.utcnow()
    tools = db.scalars(
        select(MCPToolModel).where(
            MCPToolModel.owner_id == owner_id,
            MCPToolModel.is_deleted == False,  # noqa: E712
        )
    ).all()
    for tool in tools:
        tool.health_status = status
        tool.last_health_checked_on = now
        tool.health_latency_ms = latency_ms
        tool.health_error = error
    await _publish(
        {
            "owner_id": owner_id,
            "status": status,
            "latency_ms": latency_ms,
            "error": error,
            "checked_on": now,
        }
    )


async def run_health_monitor(stop_event: asyncio.Event) -> None:
    interval = max(1, int(ENV.health_check_interval_sec))
    timeout_sec = max(1, int(ENV.health_check_timeout_sec))

    while not stop_event.is_set():
        try:
            with SessionLocal() as db:
                servers = db.scalars(
                    select(ServerModel).where(
                        ServerModel.is_deleted == False,  # noqa: E712
                        ServerModel.is_enabled == True,  # noqa: E712
                    )
                ).all()
                apps = db.scalars(
                    select(BaseURLModel).where(
                        BaseURLModel.is_deleted == False,  # noqa: E712
                        BaseURLModel.is_enabled == True,  # noqa: E712
                    )
                ).all()

            # MCP servers
            for server in servers:
                healthy, latency_ms, error = await _check_mcp_server(
                    server.name, server.url, timeout_sec
                )
                with SessionLocal() as db:
                    await _mark_tools(
                        db,
                        owner_id=f"mcp:{server.name}",
                        healthy=healthy,
                        latency_ms=latency_ms,
                        error=error,
                    )
                    db.commit()

            # Base URLs (OpenAPI)
            for app in apps:
                healthy, latency_ms, error = await _check_base_url(app.url, timeout_sec)
                with SessionLocal() as db:
                    await _mark_tools(
                        db,
                        owner_id=f"app:{app.name}",
                        healthy=healthy,
                        latency_ms=latency_ms,
                        error=error,
                    )
                    db.commit()
        except Exception:
            # Avoid crashing the monitor loop
            pass

        try:
            await asyncio.wait_for(stop_event.wait(), timeout=interval)
        except asyncio.TimeoutError:
            continue
