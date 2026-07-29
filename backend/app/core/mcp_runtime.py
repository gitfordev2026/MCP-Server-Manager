from __future__ import annotations

from contextlib import asynccontextmanager
from importlib import metadata
from typing import Any

from app.core.logger import get_logger


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


def build_fastmcp_asgi_app(
    server: Any,
    *,
    path: str = "/",
    allowed_hosts: list[str] | None = None,
    allowed_origins: list[str] | None = None,
) -> Any:
    """Build an ASGI app from whichever FastMCP implementation is active.

    Uses ``server.http_app()`` which is the stable API in FastMCP v3.x.
    Passes ``host_origin_protection``, ``allowed_hosts``, and ``allowed_origins``
    to enable DNS-rebinding protection with proper allowlisting for
    MCP Inspector, Claude Desktop, Cursor, and other MCP clients.
    """

    # FastMCP v3.x: http_app() is the canonical method.
    if hasattr(server, "http_app"):
        kwargs: dict[str, Any] = {"path": path}

        # Inject host/origin protection if supported.
        import inspect
        sig = inspect.signature(server.http_app)
        if "host_origin_protection" in sig.parameters:
            kwargs["host_origin_protection"] = "auto"
        if "allowed_hosts" in sig.parameters and allowed_hosts:
            kwargs["allowed_hosts"] = allowed_hosts
        if "allowed_origins" in sig.parameters and allowed_origins:
            kwargs["allowed_origins"] = allowed_origins

        try:
            app = server.http_app(**kwargs)
            MCP_RUNTIME_INFO["asgi_builder"] = "http_app"
            MCP_RUNTIME_INFO["host_origin_protection"] = kwargs.get("host_origin_protection", "none")
            MCP_RUNTIME_INFO["allowed_hosts"] = allowed_hosts or []
            MCP_RUNTIME_INFO["allowed_origins"] = allowed_origins or []
            logger.info(
                "FastMCP ASGI app built via http_app() with host_origin_protection=%s, "
                "allowed_hosts=%s, allowed_origins=%s",
                kwargs.get("host_origin_protection", "none"),
                allowed_hosts or [],
                allowed_origins or [],
            )
            return app
        except TypeError:
            # Fallback: call without kwargs if signature doesn't match.
            app = server.http_app()
            MCP_RUNTIME_INFO["asgi_builder"] = "http_app_fallback"
            logger.warning("FastMCP http_app() called without protection kwargs (signature mismatch).")
            return app

    # Legacy fallback paths.
    if hasattr(server, "asgi_app"):
        MCP_RUNTIME_INFO["asgi_builder"] = "asgi_app"
        return server.asgi_app()

    if hasattr(server, "app"):
        MCP_RUNTIME_INFO["asgi_builder"] = "app_attribute"
        return server.app

    raise RuntimeError(
        "Could not build FastMCP ASGI app; supported methods not found on server instance."
    )


@asynccontextmanager
async def run_mcp_asgi_lifespan(asgi_app: Any):
    """Enter lifespan of a mounted FastMCP ASGI app when available.

    FastMCP streamable HTTP manager requires its app lifespan to run,
    otherwise requests fail with "Task group is not initialized".
    """
    if asgi_app is None:
        yield
        return

    router = getattr(asgi_app, "router", None)
    lifespan_context = getattr(router, "lifespan_context", None)
    if callable(lifespan_context):
        async with lifespan_context(asgi_app):
            yield
        return

    lifespan = getattr(asgi_app, "lifespan", None)
    if callable(lifespan):
        async with lifespan(asgi_app):
            yield
        return

    yield


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
