from __future__ import annotations

from contextlib import asynccontextmanager
from importlib import metadata
from typing import Any

from backend.app.core.logger import get_logger


logger = get_logger(__name__)


def _safe_version(package_name: str) -> str:
    try:
        return metadata.version(package_name)
    except metadata.PackageNotFoundError:
        return "not-installed"


try:
    # Preferred runtime: FastMCP v2 package.
    from fastmcp import FastMCP as FastMCP  # type: ignore[no-redef]

    MCP_RUNTIME_INFO = {
        "implementation": "fastmcp",
        "package": "fastmcp",
        "version": _safe_version("fastmcp"),
        "fallback_active": False,
    }
except Exception:
    # Fallback for environments that still use MCP SDK bundled FastMCP.
    from mcp.server.fastmcp import FastMCP as FastMCP  # type: ignore[no-redef]

    MCP_RUNTIME_INFO = {
        "implementation": "mcp.server.fastmcp",
        "package": "mcp",
        "version": _safe_version("mcp"),
        "fallback_active": True,
    }
    logger.warning(
        "fastmcp package is unavailable; falling back to legacy runtime '%s' (%s).",
        MCP_RUNTIME_INFO["implementation"],
        MCP_RUNTIME_INFO["version"],
    )


def build_fastmcp_asgi_app(server: Any, *, path: str = "/") -> Any:
    """Build an ASGI app from whichever FastMCP implementation is active."""
    if hasattr(server, "streamable_http_app"):
        return server.streamable_http_app()

    if hasattr(server, "http_app"):
        try:
            return server.http_app(path=path)
        except TypeError:
            return server.http_app()

    if hasattr(server, "asgi_app"):
        return server.asgi_app()

    if hasattr(server, "app"):
        return server.app

    raise RuntimeError(
        "Could not build FastMCP ASGI app; supported methods not found on server instance."
    )


@asynccontextmanager
async def run_mcp_server_lifespan(server: Any):
    """Runtime-safe MCP server lifespan handling.

    Legacy MCP FastMCP exposes `session_manager.run()`.
    Newer FastMCP handles lifecycle internally through ASGI app lifespan.
    """
    if server is None:
        yield
        return

    session_manager = getattr(server, "session_manager", None)
    if session_manager is not None and hasattr(session_manager, "run"):
        async with session_manager.run():
            yield
        return

    # No explicit server lifecycle API available/required.
    yield
