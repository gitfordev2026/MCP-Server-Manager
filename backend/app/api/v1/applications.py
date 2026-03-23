from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, ConfigDict, Field
from sqlalchemy import select
from app.core.cache import cache_delete_prefix


class ImportOpenAPIRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    url: str | None = None
    spec: dict[str, Any] | None = None
    openapi_path: str | None = None


class EndpointSelection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    method: str
    path: str
    name: str
    description: str = Field(min_length=1)
    selected: bool = True
    version: str = "1.0.0"
    suggested_input_schema: dict[str, Any] | None = None


class RegisterEndpointsRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    endpoints: list[EndpointSelection]


def _param_mapping_from_schema(schema: dict[str, Any] | None) -> dict[str, list[str]]:
    if not isinstance(schema, dict):
        return {}
    props = schema.get("properties") or {}
    mapping: dict[str, list[str]] = {}
    for key in ("path", "query", "headers", "cookies", "body"):
        bucket = props.get(key) or {}
        bucket_props = bucket.get("properties") if isinstance(bucket, dict) else None
        if isinstance(bucket_props, dict):
            mapping[key] = sorted([str(k) for k in bucket_props.keys()])
    return mapping


def create_applications_v1_router(
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
) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/applications/{app_id}/import-openapi",
        summary="Import OpenAPI (Preview Only)",
        description="Fetch and parse an OpenAPI spec for preview. Returns editable endpoint list.",
    )
    async def import_openapi(
        app_id: int,
        payload: ImportOpenAPIRequest,
        actor: dict[str, Any] = Depends(require_permission_fn("application:manage")),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            app = db.scalar(select(base_url_model).where(base_url_model.id == app_id))
        if not app:
            raise HTTPException(status_code=404, detail="Application not found")

        if payload.spec is None and not payload.url:
            raise HTTPException(status_code=400, detail="Provide either url or spec")

        spec = payload.spec
        if spec is None:
            spec = await fetch_openapi_spec_from_base_url_fn(
                payload.url,
                openapi_path=payload.openapi_path or app.openapi_path,
                retries=0,
                domain_type=getattr(app, "domain_type", "ADM"),
            )

        tools = build_app_operation_tools_fn(app.name, app.url, spec, getattr(app, "domain_type", "ADM"))
        preview = [
            {
                "method": tool.method,
                "path": tool.path,
                "name": tool.name,
                "description": tool.description,
                "suggested_input_schema": tool.input_schema,
                "param_mapping": _param_mapping_from_schema(tool.input_schema),
            }
            for tool in tools
        ]

        return {
            "app_id": app.id,
            "app_name": app.name,
            "tool_count": len(preview),
            "tools": preview,
        }

    @router.post(
        "/applications/{app_id}/register-endpoints",
        summary="Register Selected Endpoints",
        description="Persist selected endpoints with edited descriptions and refresh registry.",
    )
    async def register_endpoints(
        app_id: int,
        payload: RegisterEndpointsRequest,
        actor: dict[str, Any] = Depends(require_permission_fn("application:manage")),
    ) -> dict[str, Any]:
        if not payload.endpoints:
            raise HTTPException(status_code=400, detail="No endpoints provided")

        with session_local_factory() as db:
            app = db.scalar(select(base_url_model).where(base_url_model.id == app_id))
            if not app:
                raise HTTPException(status_code=404, detail="Application not found")

            owner_id = f"app:{app.name}"
            selected_keys: list[str] = []
            upserted = 0
            disabled = 0

            for item in payload.endpoints:
                method = item.method.upper()
                path = item.path
                key = f"{method} {path}"
                endpoint = db.scalar(
                    select(api_endpoint_model).where(
                        api_endpoint_model.owner_id == owner_id,
                        api_endpoint_model.method == method,
                        api_endpoint_model.path == path,
                    )
                )

                if item.selected:
                    selected_keys.append(key)
                    if endpoint is None:
                        endpoint = api_endpoint_model(
                            owner_id=owner_id,
                            method=method,
                            path=path,
                            description=item.description.strip(),
                            current_version=item.version,
                            admin_allowed=True,
                            admin_enabled=True,
                            owner_enabled=True,
                            is_enabled=True,
                            exposed_to_mcp=False,
                            exposure_approved=False,
                            is_deleted=False,
                        )
                        db.add(endpoint)
                        db.flush()
                    else:
                        endpoint.description = item.description.strip()
                        endpoint.current_version = item.version
                        endpoint.is_deleted = False
                        endpoint.owner_enabled = True
                        endpoint.admin_allowed = bool(getattr(endpoint, "admin_allowed", True))
                        endpoint.admin_enabled = bool(getattr(endpoint, "admin_enabled", endpoint.admin_allowed))
                        endpoint.is_enabled = bool(endpoint.admin_enabled and endpoint.owner_enabled)

                    version_row = db.scalar(
                        select(endpoint_version_model).where(
                            endpoint_version_model.endpoint_id == endpoint.id,
                            endpoint_version_model.version == item.version,
                        )
                    )
                    if version_row is None:
                        db.add(
                            endpoint_version_model(
                                endpoint_id=endpoint.id,
                                owner_id=endpoint.owner_id,
                                method=endpoint.method,
                                path=endpoint.path,
                                version=item.version,
                                description=endpoint.description,
                                schema=item.suggested_input_schema,
                                exposed_to_mcp=endpoint.exposed_to_mcp,
                            )
                        )
                    else:
                        version_row.description = endpoint.description
                        version_row.schema = item.suggested_input_schema
                    upserted += 1
                else:
                    if endpoint is not None:
                        endpoint.is_deleted = True
                        endpoint.owner_enabled = False
                        endpoint.is_enabled = False
                        disabled += 1

            app.selected_endpoints = selected_keys

            write_audit_log_fn(
                db,
                audit_log_model,
                actor=actor.get("username", "system"),
                action="application.register_endpoints",
                resource_type="application",
                resource_id=str(app_id),
                before_state=None,
                after_state={
                    "selected_endpoints": selected_keys,
                    "upserted": upserted,
                    "disabled": disabled,
                },
            )
            db.commit()
        cache_delete_prefix("status:")

        # Refresh registry from upstream OpenAPI to ensure mcp_tools are synced.
        await build_openapi_tool_catalog_fn(force_refresh=True)

        # Apply edited descriptions to mcp_tools.
        with session_local_factory() as db:
            owner_id = f"app:{app.name}"
            for item in payload.endpoints:
                if not item.selected:
                    continue
                tool = db.scalar(
                    select(mcp_tool_model).where(
                        mcp_tool_model.owner_id == owner_id,
                        mcp_tool_model.method == item.method.upper(),
                        mcp_tool_model.path == item.path,
                    )
                )
                if tool is None:
                    continue
                tool.description = item.description.strip()
            db.commit()
        cache_delete_prefix("status:")

        return {
            "status": "registered",
            "app_id": app_id,
            "selected_count": len([item for item in payload.endpoints if item.selected]),
        }

    return router
