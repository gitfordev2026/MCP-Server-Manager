from __future__ import annotations

import asyncio
from time import perf_counter
from typing import Any

from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client


def _normalize_mcp_url(url: str) -> str:
    value = (url or "").strip()
    if not value:
        raise ValueError("MCP server URL is empty")
    if value.endswith("/mcp"):
        return f"{value}/"
    return value


async def list_server_tools(
    server_name: str,
    server_url: str,
    timeout_sec: float = 10.0,
) -> list[Any]:
    _ = server_name
    normalized_url = _normalize_mcp_url(server_url)

    async def _run() -> list[Any]:
        async with streamable_http_client(normalized_url, terminate_on_close=True) as (
            read_stream,
            write_stream,
            _get_session_id,
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                tools_result = await session.list_tools()
                return list(tools_result.tools)

    return await asyncio.wait_for(_run(), timeout=timeout_sec)


async def call_server_tool(
    server_name: str,
    server_url: str,
    tool_name: str,
    arguments: dict[str, Any] | None = None,
    timeout_sec: float = 30.0,
) -> dict[str, Any]:
    _ = server_name
    normalized_url = _normalize_mcp_url(server_url)

    async def _run() -> dict[str, Any]:
        async with streamable_http_client(normalized_url, terminate_on_close=True) as (
            read_stream,
            write_stream,
            _get_session_id,
        ):
            async with ClientSession(read_stream, write_stream) as session:
                await session.initialize()
                result = await session.call_tool(tool_name, arguments or {})
                return {
                    "content": [
                        {
                            "type": getattr(item, "type", "text"),
                            "text": getattr(item, "text", str(item)),
                        }
                        for item in (result.content or [])
                    ],
                    "isError": bool(getattr(result, "isError", False)),
                    "structuredContent": getattr(result, "structuredContent", None),
                }

    return await asyncio.wait_for(_run(), timeout=timeout_sec)


async def probe_server_status(
    server_name: str,
    server_url: str,
    timeout_sec: float = 8.0,
) -> dict[str, Any]:
    started = perf_counter()
    try:
        tools = await list_server_tools(server_name, server_url, timeout_sec=timeout_sec)
        return {
            "name": server_name,
            "url": server_url,
            "status": "alive",
            "latency_ms": int((perf_counter() - started) * 1000),
            "tool_count": len(tools),
            "error": None,
        }
    except Exception as exc:
        return {
            "name": server_name,
            "url": server_url,
            "status": "down",
            "latency_ms": int((perf_counter() - started) * 1000),
            "tool_count": 0,
            "error": str(exc),
        }
