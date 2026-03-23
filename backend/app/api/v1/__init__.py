from fastapi import APIRouter

from app.api.v1.applications import create_applications_v1_router
from app.api.v1.mcp_servers import create_mcp_servers_v1_router
from app.api.v1.admin import create_admin_v1_router


def create_api_v1_router(
    session_local_factory,
    base_url_model,
    server_model,
    mcp_tool_model,
    api_endpoint_model,
    tool_version_model,
    endpoint_version_model,
    fetch_openapi_spec_from_base_url_fn,
    build_app_operation_tools_fn,
    build_openapi_tool_catalog_fn,
    list_server_tools_fn,
    write_audit_log_fn,
    audit_log_model,
    require_permission_fn,
) -> APIRouter:
    router = APIRouter()

    router.include_router(
        create_applications_v1_router(
            session_local_factory,
            base_url_model,
            mcp_tool_model,
            api_endpoint_model,
            endpoint_version_model,
            fetch_openapi_spec_from_base_url_fn,
            build_app_operation_tools_fn,
            build_openapi_tool_catalog_fn,
            write_audit_log_fn,
            audit_log_model,
            require_permission_fn,
        ),
        tags=["Applications"],
    )
    router.include_router(
        create_mcp_servers_v1_router(
            session_local_factory,
            server_model,
            list_server_tools_fn,
            write_audit_log_fn,
            audit_log_model,
            require_permission_fn,
        ),
        tags=["MCP Servers"],
    )
    router.include_router(
        create_admin_v1_router(
            session_local_factory,
            base_url_model,
            server_model,
            api_endpoint_model,
            mcp_tool_model,
            write_audit_log_fn,
            audit_log_model,
            require_permission_fn,
        ),
        tags=["Admin"],
    )

    return router

