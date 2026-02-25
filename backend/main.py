from pathlib import Path
import sys
import asyncio
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from time import perf_counter, time
from urllib.parse import quote, urlparse, urlunparse
import httpx
import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from mcp.types import Tool as MCPTool
from mcp_use import MCPClient
from sqlalchemy import (
    select,
    inspect,
)

# Allow running `python main.py` from the `backend/` directory.
# In that mode, Python does not automatically include the repository root
# in sys.path, so absolute imports like `backend.app.*` would fail.
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

from backend.env import ENV
from backend.app.core.auth import AUTH_ENABLED, KEYCLOAK_ISSUER, KEYCLOAK_VERIFY_AUD
from backend.app.core.rbac import build_require_permission, get_request_actor
from backend.app.core.mcp_runtime import (
    MCP_RUNTIME_INFO,
    FastMCP,
    build_fastmcp_asgi_app,
    run_mcp_server_lifespan,
)
from backend.app.core.db import DB_BACKEND, SessionLocal, engine
from backend.app.models.db_models import (
    APIEndpointModel,
    APIServerLinkModel,
    AccessPolicyModel,
    AuditLogModel,
    Base,
    BaseURLModel,
    DEFAULT_TOOL_ID,
    GroupModel,
    MCPToolModel,
    PermissionModel,
    RoleModel,
    RolePermissionModel,
    ServerModel,
    ToolVersionModel,
    EndpointVersionModel,
    DomainAuthProfileModel,
    UserModel,
    DOMAIN_ADM,
    DOMAIN_OPS,
    utc_now,
)
from backend.app.routers.audit import create_audit_router
from backend.app.routers.agent import create_agent_router
from backend.app.routers.access_policies import create_access_policy_router
from backend.app.routers.base_urls import create_base_urls_router
from backend.app.routers.catalog import create_catalog_router
from backend.app.routers.dashboard import create_dashboard_router
from backend.app.routers.endpoints import create_endpoints_router
from backend.app.routers.health import create_health_router
from backend.app.routers.servers import create_servers_router
from backend.app.routers.tools import create_tools_router
from backend.app.schemas.registration import BaseURLRegistration, ServerRegistration
from backend.app.services.agent_runtime import build_default_agent
from backend.app.services.audit import write_audit_log
from backend.app.services.policy_utils import (
    ensure_default_access_policy_for_owner,
    ensure_tool_access_policy_for_owner,
    resolve_owner_fk_ids,
)

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    mcp_server = globals().get("combined_apps_mcp")
    if mcp_server is None:
        yield
        return

    async with run_mcp_server_lifespan(mcp_server):
        yield


app = FastAPI(lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Allow all origins (use specific domains in production)
    allow_credentials=True,
    allow_methods=["*"],  # Allow all methods including POST, GET, OPTIONS
    allow_headers=["*"],  # Allow all headers
)


@app.get(
    "/mcp/runtime",
    tags=["Health"],
    summary="MCP Runtime Info",
    description="Shows active FastMCP runtime implementation/version and fallback state. Source: backend/main.py",
)
def get_mcp_runtime() -> dict[str, Any]:
    return MCP_RUNTIME_INFO


def init_db() -> None:
    expected_tables = set(Base.metadata.tables.keys())
    if not expected_tables:
        raise RuntimeError("No SQLAlchemy models are registered in Base.metadata")

    Base.metadata.create_all(bind=engine)
    ensure_access_policy_schema_columns()
    ensure_phase2_schema_columns()
    ensure_domain_defaults()
    sync_rbac_baseline()
    sync_domain_auth_profiles()
    sync_access_policy_links_and_defaults()
    sync_tool_policies_from_registry()
    sync_api_server_links_by_host()

    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    missing_tables = sorted(expected_tables - existing_tables)

    if missing_tables:
        # Retry once in case of race/reconnect on backend restart.
        Base.metadata.create_all(bind=engine)
        inspector = inspect(engine)
        existing_tables = set(inspector.get_table_names())
        missing_tables = sorted(expected_tables - existing_tables)

    if missing_tables:
        raise RuntimeError(
            f"Database startup check failed. Missing tables: {', '.join(missing_tables)}"
        )

    print(f"[DB] Startup check ok. Verified tables: {', '.join(sorted(expected_tables))}")


def sync_rbac_baseline() -> None:
    role_definitions = (
        ("super_admin", "Super Admin"),
        ("admin", "Admin"),
        ("operator", "Operator"),
        ("read_only", "Read Only"),
    )
    permission_definitions = (
        ("dashboard:view", "Read dashboard stats"),
        ("application:manage", "Create/update/delete applications"),
        ("mcp_server:manage", "Create/update/delete MCP servers"),
        ("tool:manage", "Create/update/delete tools"),
        ("endpoint:manage", "Create/update/delete endpoints"),
        ("policy:manage", "Manage access policies"),
        ("audit:view", "Read audit logs"),
    )
    role_permission_map = {
        "super_admin": {code for code, _ in permission_definitions},
        "admin": {code for code, _ in permission_definitions},
        "operator": {"dashboard:view", "tool:manage", "endpoint:manage", "policy:manage", "audit:view"},
        "read_only": {"dashboard:view", "audit:view"},
    }
    with SessionLocal() as db:
        existing_roles = {row.name for row in db.scalars(select(RoleModel)).all()}
        for role_name, role_description in role_definitions:
            if role_name in existing_roles:
                continue
            db.add(RoleModel(name=role_name, description=role_description))

        existing_permissions = {row.code for row in db.scalars(select(PermissionModel)).all()}
        for code, description in permission_definitions:
            if code in existing_permissions:
                continue
            db.add(PermissionModel(code=code, description=description))
        db.flush()

        roles_by_name = {row.name: row for row in db.scalars(select(RoleModel)).all()}
        permissions_by_code = {row.code: row for row in db.scalars(select(PermissionModel)).all()}
        existing_pairs = {
            (row.role_id, row.permission_id)
            for row in db.scalars(select(RolePermissionModel)).all()
        }
        for role_name, permission_codes in role_permission_map.items():
            role = roles_by_name.get(role_name)
            if role is None:
                continue
            for code in permission_codes:
                permission = permissions_by_code.get(code)
                if permission is None:
                    continue
                pair = (role.id, permission.id)
                if pair in existing_pairs:
                    continue
                db.add(RolePermissionModel(role_id=role.id, permission_id=permission.id))
                existing_pairs.add(pair)

        db.commit()


def sync_domain_auth_profiles() -> None:
    domain_rows = (
        (
            DOMAIN_ADM,
            ENV.adm_keycloak_server_url,
            ENV.adm_keycloak_realm,
            ENV.adm_keycloak_client_id,
        ),
        (
            DOMAIN_OPS,
            ENV.ops_keycloak_server_url,
            ENV.ops_keycloak_realm,
            ENV.ops_keycloak_client_id,
        ),
    )

    with SessionLocal() as db:
        existing = {
            row.domain_type: row
            for row in db.scalars(select(DomainAuthProfileModel)).all()
        }
        for domain_type, issuer_url, realm, client_id in domain_rows:
            profile = existing.get(domain_type)
            enabled = bool(issuer_url and realm and client_id)
            if profile is None:
                db.add(
                    DomainAuthProfileModel(
                        domain_type=domain_type,
                        issuer_url=issuer_url,
                        realm=realm,
                        client_id=client_id,
                        enabled=enabled,
                        profile_metadata={"source": "env"},
                    )
                )
                continue

            profile.issuer_url = issuer_url
            profile.realm = realm
            profile.client_id = client_id
            profile.enabled = enabled
            profile.profile_metadata = {"source": "env"}
        db.commit()


def ensure_access_policy_schema_columns() -> None:
    table_name = AccessPolicyModel.__tablename__
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    if table_name not in existing_tables:
        return

    existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
    missing_columns = [
        col_name
        for col_name in ("allowed_users", "allowed_groups")
        if col_name not in existing_columns
    ]
    if not missing_columns:
        return

    with engine.begin() as conn:
        for col_name in missing_columns:
            # Keep this migration simple and cross-dialect (PostgreSQL + SQLite).
            conn.exec_driver_sql(
                f"ALTER TABLE {table_name} ADD COLUMN {col_name} JSON"
            )
    print(f"[DB] Added missing columns on {table_name}: {', '.join(missing_columns)}")


def ensure_phase2_schema_columns() -> None:
    inspector = inspect(engine)
    existing_tables = set(inspector.get_table_names())
    table_to_columns: dict[str, list[tuple[str, str]]] = {
        MCPToolModel.__tablename__: [
            ("description", "TEXT"),
            ("current_version", "VARCHAR(64)"),
            ("is_enabled", "BOOLEAN"),
            ("is_deleted", "BOOLEAN"),
        ],
        ServerModel.__tablename__: [
            ("description", "TEXT"),
            ("is_enabled", "BOOLEAN"),
            ("is_deleted", "BOOLEAN"),
            ("domain_type", "VARCHAR(16)"),
            ("auth_profile_ref", "VARCHAR(64)"),
            ("selected_tools", "JSON"),
        ],
        BaseURLModel.__tablename__: [
            ("description", "TEXT"),
            ("is_enabled", "BOOLEAN"),
            ("is_deleted", "BOOLEAN"),
            ("domain_type", "VARCHAR(16)"),
            ("auth_profile_ref", "VARCHAR(64)"),
            ("selected_endpoints", "JSON"),
        ],
        EndpointVersionModel.__tablename__: [
            ("endpoint_id", "INTEGER"),
        ],
    }
    for table_name, additions in table_to_columns.items():
        if table_name not in existing_tables:
            continue
        existing_columns = {col["name"] for col in inspector.get_columns(table_name)}
        missing = [(name, col_type) for name, col_type in additions if name not in existing_columns]
        if not missing:
            continue
        with engine.begin() as conn:
            for name, col_type in missing:
                conn.exec_driver_sql(f"ALTER TABLE {table_name} ADD COLUMN {name} {col_type}")
        print(f"[DB] Added missing columns on {table_name}: {', '.join(name for name, _ in missing)}")


def ensure_domain_defaults() -> None:
    with engine.begin() as conn:
        conn.exec_driver_sql(
            f"UPDATE {ServerModel.__tablename__} SET domain_type = '{DOMAIN_ADM}' WHERE domain_type IS NULL OR domain_type = ''"
        )
        conn.exec_driver_sql(
            f"UPDATE {BaseURLModel.__tablename__} SET domain_type = '{DOMAIN_ADM}' WHERE domain_type IS NULL OR domain_type = ''"
        )
        conn.exec_driver_sql(
            f"UPDATE {ServerModel.__tablename__} SET selected_tools = '[]' WHERE selected_tools IS NULL"
        )
        conn.exec_driver_sql(
            f"UPDATE {BaseURLModel.__tablename__} SET selected_endpoints = '[]' WHERE selected_endpoints IS NULL"
        )


def sync_access_policy_links_and_defaults() -> None:
    with SessionLocal() as db:
        servers = db.scalars(select(ServerModel)).all()
        for server in servers:
            ensure_default_access_policy_for_owner(
                db,
                owner_id=f"mcp:{server.name}",
                server_id=server.id,
            )

        base_urls = db.scalars(select(BaseURLModel)).all()
        for base_url in base_urls:
            ensure_default_access_policy_for_owner(
                db,
                owner_id=f"app:{base_url.name}",
                base_url_id=base_url.id,
            )

        policies = db.scalars(select(AccessPolicyModel)).all()
        for policy in policies:
            server_id, base_url_id = resolve_owner_fk_ids(
                db,
                policy.owner_id,
                fallback_server_id=policy.server_id,
                fallback_base_url_id=policy.base_url_id,
            )
            policy.server_id = server_id
            policy.base_url_id = base_url_id

        db.commit()


def sync_tool_policies_from_registry() -> None:
    """Ensure every registered tool has an explicit deny policy row by default."""
    with SessionLocal() as db:
        tools = db.scalars(select(MCPToolModel)).all()
        for tool in tools:
            if not tool.owner_id or not tool.name:
                continue
            ensure_default_access_policy_for_owner(
                db,
                owner_id=tool.owner_id,
                server_id=tool.server_id,
                base_url_id=tool.raw_api_id,
            )
            ensure_tool_access_policy_for_owner(
                db,
                owner_id=tool.owner_id,
                tool_id=tool.name,
                server_id=tool.server_id,
                base_url_id=tool.raw_api_id,
            )
        db.commit()


def _host_of(url: str) -> str:
    parsed = urlparse((url or "").strip())
    return (parsed.netloc or parsed.hostname or "").lower()


def sync_api_server_links_by_host() -> None:
    """Link raw APIs to MCP servers when they share the same host:port."""
    with SessionLocal() as db:
        servers = db.scalars(
            select(ServerModel).where(
                ServerModel.is_deleted == False,  # noqa: E712
                ServerModel.is_enabled == True,  # noqa: E712
            )
        ).all()
        apis = db.scalars(
            select(BaseURLModel).where(
                BaseURLModel.is_deleted == False,  # noqa: E712
                BaseURLModel.is_enabled == True,  # noqa: E712
            )
        ).all()
        existing_links = {
            (link.server_id, link.raw_api_id)
            for link in db.scalars(select(APIServerLinkModel)).all()
        }

        for server in servers:
            server_host = _host_of(server.url)
            if not server_host:
                continue
            for api in apis:
                if _host_of(api.url) != server_host:
                    continue
                key = (server.id, api.id)
                if key in existing_links:
                    continue
                db.add(APIServerLinkModel(server_id=server.id, raw_api_id=api.id))
                existing_links.add(key)

        db.commit()


def sync_mcp_tool_registry_from_openapi(tools: dict[str, "OpenAPIToolDefinition"]) -> None:
    """Upsert OpenAPI-discovered tools into mcp_tools."""
    with SessionLocal() as db:
        selected_names_by_owner: dict[str, set[str]] = {}
        for tool in tools.values():
            owner_id = f"app:{tool.app_name}"
            raw_api = db.scalar(select(BaseURLModel).where(BaseURLModel.name == tool.app_name))
            selected_endpoints = (
                [str(item).strip() for item in (raw_api.selected_endpoints or []) if str(item).strip()]
                if raw_api is not None
                else []
            )
            endpoint_key = f"{tool.method.upper()} {tool.path}"
            # Backward compatible matching: allow method+path key or tool name.
            is_selected = not selected_endpoints or (
                endpoint_key in selected_endpoints or tool.name in selected_endpoints
            )
            if not is_selected:
                continue

            selected_names_by_owner.setdefault(owner_id, set()).add(tool.name)
            ensure_default_access_policy_for_owner(
                db,
                owner_id=owner_id,
                base_url_id=raw_api.id if raw_api else None,
            )
            ensure_tool_access_policy_for_owner(
                db,
                owner_id=owner_id,
                tool_id=tool.name,
                base_url_id=raw_api.id if raw_api else None,
            )
            existing = db.scalar(
                select(MCPToolModel).where(
                    MCPToolModel.source_type == "openapi",
                    MCPToolModel.owner_id == owner_id,
                    MCPToolModel.name == tool.name,
                )
            )
            if existing:
                existing.method = tool.method
                existing.path = tool.path
                existing.raw_api_id = raw_api.id if raw_api else existing.raw_api_id
                continue

            db.add(
                MCPToolModel(
                    source_type="openapi",
                    owner_id=owner_id,
                    name=tool.name,
                    method=tool.method,
                    path=tool.path,
                    raw_api_id=raw_api.id if raw_api else None,
                )
            )

        # If owner has explicit selection, hide unselected OpenAPI tools.
        base_rows = db.scalars(select(BaseURLModel)).all()
        for base in base_rows:
            owner_id = f"app:{base.name}"
            selected_endpoints = [str(item).strip() for item in (base.selected_endpoints or []) if str(item).strip()]
            if not selected_endpoints:
                continue
            selected_names = selected_names_by_owner.get(owner_id, set())
            rows = db.scalars(
                select(MCPToolModel).where(
                    MCPToolModel.source_type == "openapi",
                    MCPToolModel.owner_id == owner_id,
                )
            ).all()
            for row in rows:
                if row.name in selected_names:
                    row.is_deleted = False
                    row.is_enabled = True
                else:
                    row.is_deleted = True
                    row.is_enabled = False
        db.commit()


def sync_mcp_tool_registry_from_mcp(
    discovered: dict[str, tuple[str, str, Any]],
) -> None:
    """Upsert MCP-native tools into mcp_tools."""
    with SessionLocal() as db:
        selected_names_by_owner: dict[str, set[str]] = {}
        for _, (server_name, tool_name, _tool_obj) in discovered.items():
            owner_id = f"mcp:{server_name}"
            server = db.scalar(select(ServerModel).where(ServerModel.name == server_name))
            selected_tools = (
                [str(item).strip() for item in (server.selected_tools or []) if str(item).strip()]
                if server is not None
                else []
            )
            if selected_tools and tool_name not in selected_tools:
                continue

            selected_names_by_owner.setdefault(owner_id, set()).add(tool_name)
            ensure_default_access_policy_for_owner(
                db,
                owner_id=owner_id,
                server_id=server.id if server else None,
            )
            ensure_tool_access_policy_for_owner(
                db,
                owner_id=owner_id,
                tool_id=tool_name,
                server_id=server.id if server else None,
            )
            existing = db.scalar(
                select(MCPToolModel).where(
                    MCPToolModel.source_type == "mcp",
                    MCPToolModel.owner_id == owner_id,
                    MCPToolModel.name == tool_name,
                )
            )
            if existing:
                existing.server_id = server.id if server else existing.server_id
                continue

            db.add(
                MCPToolModel(
                    source_type="mcp",
                    owner_id=owner_id,
                    name=tool_name,
                    server_id=server.id if server else None,
                )
            )

        server_rows = db.scalars(select(ServerModel)).all()
        for server in server_rows:
            owner_id = f"mcp:{server.name}"
            selected_tools = [str(item).strip() for item in (server.selected_tools or []) if str(item).strip()]
            if not selected_tools:
                continue
            selected_names = selected_names_by_owner.get(owner_id, set())
            rows = db.scalars(
                select(MCPToolModel).where(
                    MCPToolModel.source_type == "mcp",
                    MCPToolModel.owner_id == owner_id,
                )
            ).all()
            for row in rows:
                if row.name in selected_names:
                    row.is_deleted = False
                    row.is_enabled = True
                else:
                    row.is_deleted = True
                    row.is_enabled = False
        db.commit()


def get_servers_from_db() -> list[tuple[str, str]]:
    """Get all registered MCP servers from database."""
    try:
        with SessionLocal() as db:
            rows = db.scalars(
                select(ServerModel).where(
                    ServerModel.is_deleted == False,  # noqa: E712
                    ServerModel.is_enabled == True,  # noqa: E712
                )
            ).all()
            return [(row.name, row.url) for row in rows]
    except Exception as exc:
        print(f"Error getting servers from database: {exc}")
        return []


def get_config() -> dict[str, dict[str, dict[str, str]]]:
    """Build MCP config dynamically from servers."""
    try:
        servers = get_servers_from_db()

        # Build mcpServers dict from servers
        mcp_servers: dict[str, dict[str, str]] = {}
        for name, url in servers:
            mcp_servers[name] = {"url": url}

        config = {"mcpServers": mcp_servers}
        print(f"Built config from servers: {config}")
        return config

    except Exception as exc:
        print(f"Error building config: {exc}")
        return {"mcpServers": {}}


# ---------------------------------------------------
# 3. Base models for server registration and config
# ---------------------------------------------------
def normalize_openapi_path(openapi_path: str | None) -> str:
    if openapi_path is None:
        return ""
    value = openapi_path.strip()
    return value


def build_openapi_candidates(raw_url: str, openapi_path: str | None = "") -> list[str]:
    """Build candidate OpenAPI URLs from a base URL."""
    value = raw_url.strip()
    parsed = urlparse(value)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc:
        raise ValueError("URL must be a valid http:// or https:// endpoint")

    def _compose(path: str) -> str:
        return urlunparse((parsed.scheme, parsed.netloc, path, "", "", ""))

    path = parsed.path or ""
    candidates: list[str] = []
    seen: set[str] = set()

    normalized_custom_path = normalize_openapi_path(openapi_path)
    if normalized_custom_path:
        if normalized_custom_path.startswith(("http://", "https://")):
            candidates.append(normalized_custom_path)
            seen.add(normalized_custom_path)
        else:
            base_path = path.rstrip("/")
            if normalized_custom_path.startswith("/"):
                custom_candidate = _compose(normalized_custom_path)
            else:
                custom_path = (
                    f"{base_path}/{normalized_custom_path}" if base_path else f"/{normalized_custom_path}"
                )
                custom_candidate = _compose(custom_path)
            candidates.append(custom_candidate)
            seen.add(custom_candidate)

    if path.endswith("/openapi.json"):
        candidate = _compose(path)
        if candidate not in seen:
            candidates.append(candidate)
        return candidates

    normalized_path = path.rstrip("/")
    default_openapi_path = f"{normalized_path}/openapi.json" if normalized_path else "/openapi.json"
    candidate = _compose(default_openapi_path)
    if candidate not in seen:
        candidates.append(candidate)
        seen.add(candidate)

    # Fallback for when app URL was registered with a resource path (for example /mcp)
    # but the OpenAPI spec is served from the root path.
    if normalized_path:
        fallback = _compose("/openapi.json")
        if fallback not in seen:
            candidates.append(fallback)

    return candidates


HTTP_METHODS = {"get", "post", "put", "patch", "delete", "head", "options", "trace"}
OPENAPI_MCP_CACHE_TTL_SEC = ENV.openapi_mcp_cache_ttl_sec
OPENAPI_MCP_FETCH_RETRIES = ENV.openapi_mcp_fetch_retries


@dataclass
class OpenAPIToolDefinition:
    name: str
    title: str
    description: str
    app_name: str
    base_url: str
    method: str
    path: str
    input_schema: dict[str, Any]
    body_content_type: str | None
    domain_type: str = "ADM"
    is_placeholder: bool = False
    placeholder_reason: str | None = None


@dataclass
class OpenAPIToolCatalog:
    generated_at: float
    tools: dict[str, OpenAPIToolDefinition]
    sync_errors: list[str]
    apps: list[dict[str, Any]]


openapi_tool_catalog_lock = asyncio.Lock()
openapi_tool_catalog = OpenAPIToolCatalog(generated_at=0.0, tools={}, sync_errors=[], apps=[])


def sanitize_tool_component(value: str, fallback: str = "tool") -> str:
    normalized = re.sub(r"[^a-zA-Z0-9_]+", "_", value.strip().lower()).strip("_")
    return normalized or fallback


def choose_unique_tool_name(base_name: str, existing_names: set[str]) -> str:
    candidate = base_name[:120]
    suffix = 2
    while candidate in existing_names:
        token = f"_{suffix}"
        candidate = f"{base_name[: max(1, 120 - len(token))]}{token}"
        suffix += 1
    return candidate


def merge_openapi_parameters(path_level: list[dict[str, Any]], op_level: list[dict[str, Any]]) -> list[dict[str, Any]]:
    merged: dict[tuple[str, str], dict[str, Any]] = {}
    for item in path_level + op_level:
        if not isinstance(item, dict):
            continue
        name = item.get("name")
        location = item.get("in")
        if isinstance(name, str) and isinstance(location, str):
            merged[(name, location)] = item
    return list(merged.values())


def build_tool_input_schema(
    parameters: list[dict[str, Any]],
    request_body: dict[str, Any] | None,
) -> tuple[dict[str, Any], str | None]:
    grouped: dict[str, dict[str, Any]] = {
        "path": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        "query": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        "headers": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
        "cookies": {"type": "object", "properties": {}, "required": [], "additionalProperties": False},
    }
    location_map = {"path": "path", "query": "query", "header": "headers", "cookie": "cookies"}

    for parameter in parameters:
        name = parameter.get("name")
        location = parameter.get("in")
        if not isinstance(name, str) or not isinstance(location, str):
            continue
        group_key = location_map.get(location.lower())
        if not group_key:
            continue

        schema = parameter.get("schema")
        if not isinstance(schema, dict):
            schema = {"type": "string"}

        entry = dict(schema)
        description = parameter.get("description")
        if isinstance(description, str) and description.strip():
            entry["description"] = description.strip()

        grouped[group_key]["properties"][name] = entry
        if parameter.get("required"):
            grouped[group_key]["required"].append(name)

    top_level_schema: dict[str, Any] = {
        "type": "object",
        "properties": {},
        "additionalProperties": False,
    }
    top_level_required: list[str] = []

    for key, schema in grouped.items():
        if schema["properties"]:
            top_level_schema["properties"][key] = schema
            if schema["required"]:
                top_level_required.append(key)

    body_content_type: str | None = None
    if isinstance(request_body, dict):
        content = request_body.get("content")
        body_schema: dict[str, Any] = {"type": "object"}
        if isinstance(content, dict):
            preferred = [
                "application/json",
                "application/*+json",
                "application/x-www-form-urlencoded",
                "multipart/form-data",
                "*/*",
            ]
            for media_type in preferred + list(content.keys()):
                media = content.get(media_type)
                if not isinstance(media, dict):
                    continue
                maybe_schema = media.get("schema")
                if isinstance(maybe_schema, dict):
                    body_schema = maybe_schema
                    body_content_type = media_type
                    break

        top_level_schema["properties"]["body"] = body_schema
        if request_body.get("required"):
            top_level_required.append("body")

    top_level_schema["properties"]["timeout_sec"] = {
        "type": "number",
        "minimum": 1,
        "maximum": 120,
        "default": 30,
        "description": "Optional request timeout (seconds)",
    }

    if top_level_required:
        top_level_schema["required"] = sorted(set(top_level_required))

    return top_level_schema, body_content_type


def build_app_operation_tools(
    app_name: str, app_url: str, spec: dict[str, Any], domain_type: str = "ADM"
) -> list[OpenAPIToolDefinition]:
    paths = spec.get("paths")
    if not isinstance(paths, dict):
        return []

    app_component = sanitize_tool_component(app_name, fallback="app")
    definitions: list[OpenAPIToolDefinition] = []
    seen_names: set[str] = set()

    for raw_path, path_item in paths.items():
        if not isinstance(raw_path, str) or not isinstance(path_item, dict):
            continue

        path_parameters = path_item.get("parameters")
        if not isinstance(path_parameters, list):
            path_parameters = []

        for method, operation in path_item.items():
            if method.lower() not in HTTP_METHODS:
                continue
            if not isinstance(operation, dict):
                continue

            operation_id = operation.get("operationId")
            if isinstance(operation_id, str) and operation_id.strip():
                op_component = sanitize_tool_component(operation_id, fallback=method.lower())
            else:
                path_component = sanitize_tool_component(raw_path.replace("{", "").replace("}", ""))
                op_component = f"{method.lower()}_{path_component}"

            base_name = f"{app_component}__{op_component}"
            tool_name = choose_unique_tool_name(base_name, seen_names)
            seen_names.add(tool_name)

            op_parameters = operation.get("parameters")
            if not isinstance(op_parameters, list):
                op_parameters = []
            merged_parameters = merge_openapi_parameters(path_parameters, op_parameters)

            request_body = operation.get("requestBody")
            if not isinstance(request_body, dict):
                request_body = None

            input_schema, body_content_type = build_tool_input_schema(merged_parameters, request_body)

            summary = operation.get("summary")
            description = operation.get("description")
            text = summary if isinstance(summary, str) and summary.strip() else description
            if not isinstance(text, str) or not text.strip():
                text = f"Call {method.upper()} {raw_path}"

            definitions.append(
                OpenAPIToolDefinition(
                    name=tool_name,
                    title=f"{app_name}: {method.upper()} {raw_path}",
                    description=text.strip(),
                    app_name=app_name,
                    base_url=app_url,
                    method=method.upper(),
                    path=raw_path,
                    input_schema=input_schema,
                    body_content_type=body_content_type,
                    domain_type=domain_type,
                )
            )

    return definitions


def count_openapi_operations(spec: dict[str, Any]) -> int:
    paths = spec.get("paths")
    if not isinstance(paths, dict):
        return 0

    total = 0
    for path_item in paths.values():
        if not isinstance(path_item, dict):
            continue
        total += sum(1 for method in path_item.keys() if isinstance(method, str) and method.lower() in HTTP_METHODS)
    return total


async def fetch_openapi_spec_with_diagnostics(
    raw_url: str,
    openapi_path: str | None = "",
    retries: int = 0,
    domain_type: str = "ADM",
    db: Any = None,
) -> dict[str, Any]:
    candidates = build_openapi_candidates(raw_url, openapi_path)
    errors: list[str] = []
    requests_attempted = 0
    rounds_attempted = 0
    started = perf_counter()

    from backend.app.services.keycloak_auth import get_keycloak_token
    
    headers = {"Accept": "application/json"}
    if db is not None:
        token = await get_keycloak_token(domain_type, db)
        if token:
            headers["Authorization"] = f"Bearer {token}"

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for attempt in range(max(0, retries) + 1):
            rounds_attempted = attempt + 1
            for candidate in candidates:
                requests_attempted += 1
                try:
                    response = await client.get(candidate, headers=headers)
                except httpx.RequestError as exc:
                    errors.append(f"{candidate}: {exc}")
                    continue

                if response.status_code >= 400:
                    errors.append(f"{candidate}: HTTP {response.status_code}")
                    continue

                try:
                    payload = response.json()
                except ValueError:
                    errors.append(f"{candidate}: invalid JSON response")
                    continue

                if isinstance(payload, dict):
                    return {
                        "ok": True,
                        "spec": payload,
                        "used_url": candidate,
                        "candidate_urls": candidates,
                        "rounds_attempted": rounds_attempted,
                        "requests_attempted": requests_attempted,
                        "latency_ms": int((perf_counter() - started) * 1000),
                        "errors": errors,
                        "error": None,
                    }
                errors.append(f"{candidate}: payload is not a JSON object")

    detail = "Could not fetch a valid OpenAPI spec. "
    if errors:
        detail += "Tried: " + "; ".join(errors)
    return {
        "ok": False,
        "spec": None,
        "used_url": None,
        "candidate_urls": candidates,
        "rounds_attempted": rounds_attempted,
        "requests_attempted": requests_attempted,
        "latency_ms": int((perf_counter() - started) * 1000),
        "errors": errors,
        "error": detail.strip(),
    }


async def fetch_openapi_spec_from_base_url(
    raw_url: str,
    openapi_path: str | None = "",
    retries: int = 0,
    domain_type: str = "ADM",
    db: Any = None,
) -> dict[str, Any]:
    outcome = await fetch_openapi_spec_with_diagnostics(raw_url, openapi_path, retries, domain_type, db)
    if outcome["ok"] and isinstance(outcome["spec"], dict):
        return outcome["spec"]
    raise ValueError(str(outcome.get("error") or "Could not fetch a valid OpenAPI spec"))


def make_placeholder_tool(
    app_name: str, app_url: str, reason: str, domain_type: str = "ADM"
) -> OpenAPIToolDefinition:
    component = sanitize_tool_component(app_name, fallback="app")
    return OpenAPIToolDefinition(
        name=f"{component}__endpoint_unavailable",
        title=f"{app_name}: Endpoint Unavailable",
        description="Placeholder tool because API could not be discovered at sync time",
        app_name=app_name,
        base_url=app_url,
        method="GET",
        path="/__placeholder__",
        input_schema={
            "type": "object",
            "properties": {
                "message": {
                    "type": "string",
                    "description": "Optional client note. This placeholder always returns diagnostics.",
                }
            },
            "additionalProperties": False,
        },
        body_content_type=None,
        domain_type=domain_type,
        is_placeholder=True,
        placeholder_reason=reason,
    )


async def build_openapi_tool_catalog(
    force_refresh: bool = False,
    retries_override: int | None = None,
) -> OpenAPIToolCatalog:
    global openapi_tool_catalog

    retries = OPENAPI_MCP_FETCH_RETRIES if retries_override is None else max(0, retries_override)
    cache_allowed = retries_override is None
    now = time()
    if (
        cache_allowed
        and
        not force_refresh
        and openapi_tool_catalog.tools
        and now - openapi_tool_catalog.generated_at < OPENAPI_MCP_CACHE_TTL_SEC
    ):
        return openapi_tool_catalog

    async with openapi_tool_catalog_lock:
        now = time()
        if (
            cache_allowed
            and
            not force_refresh
            and openapi_tool_catalog.tools
            and now - openapi_tool_catalog.generated_at < OPENAPI_MCP_CACHE_TTL_SEC
        ):
            return openapi_tool_catalog

        with SessionLocal() as db:
            rows = db.scalars(
                select(BaseURLModel).where(
                    BaseURLModel.is_deleted == False,  # noqa: E712
                    BaseURLModel.is_enabled == True,  # noqa: E712
                )
            ).all()
            base_urls = [
                {
                    "name": row.name,
                    "url": row.url,
                    "openapi_path": row.openapi_path or "",
                    "include_unreachable_tools": bool(row.include_unreachable_tools),
                    "domain_type": row.domain_type or "ADM",
                }
                for row in rows
            ]

        async def fetch_one(base_url: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
            with SessionLocal() as fetch_db:
                outcome = await fetch_openapi_spec_with_diagnostics(
                    raw_url=base_url["url"],
                    openapi_path=base_url.get("openapi_path") or "",
                    retries=retries,
                    domain_type=base_url["domain_type"],
                    db=fetch_db,
                )
            return base_url, outcome

        fetched = await asyncio.gather(*(fetch_one(item) for item in base_urls))

        tools: dict[str, OpenAPIToolDefinition] = {}
        sync_errors: list[str] = []
        app_diagnostics: list[dict[str, Any]] = []
        existing_names: set[str] = set()

        for base_url, outcome in fetched:
            app_name = base_url["name"]
            app_url = base_url["url"]
            custom_openapi_path = base_url.get("openapi_path") or ""
            include_unreachable_tools = bool(base_url.get("include_unreachable_tools"))

            status = "healthy"
            error_message: str | None = None
            operation_count = 0
            generated_tools: list[OpenAPIToolDefinition] = []
            placeholder_tool_added = False

            if outcome["ok"] and isinstance(outcome.get("spec"), dict):
                spec = outcome["spec"]
                operation_count = count_openapi_operations(spec)
                generated_tools = build_app_operation_tools(
                    app_name, app_url, spec, base_url.get("domain_type", "ADM")
                )
                if operation_count == 0:
                    status = "zero_endpoints"
                    error_message = "No OpenAPI operations found in discovered spec."
            else:
                status = "unreachable"
                error_message = str(outcome.get("error") or "OpenAPI fetch failed")

            if include_unreachable_tools and (status == "unreachable" or status == "zero_endpoints"):
                placeholder_tool_added = True
                generated_tools.append(
                    make_placeholder_tool(
                        app_name=app_name,
                        app_url=app_url,
                        reason=error_message or "No operations available",
                        domain_type=base_url.get("domain_type", "ADM"),
                    )
                )

            app_tool_count = 0
            for tool in generated_tools:
                if tool.name in tools:
                    renamed = choose_unique_tool_name(tool.name, existing_names)
                    tool = OpenAPIToolDefinition(
                        name=renamed,
                        title=tool.title,
                        description=tool.description,
                        app_name=tool.app_name,
                        base_url=tool.base_url,
                        method=tool.method,
                        path=tool.path,
                        input_schema=tool.input_schema,
                        body_content_type=tool.body_content_type,
                        domain_type=tool.domain_type,
                        is_placeholder=tool.is_placeholder,
                        placeholder_reason=tool.placeholder_reason,
                    )
                tools[tool.name] = tool
                existing_names.add(tool.name)
                app_tool_count += 1

            if status != "healthy":
                sync_errors.append(f"{app_name} ({app_url}): {error_message}")

            app_diagnostics.append(
                {
                    "name": app_name,
                    "url": app_url,
                    "openapi_path": custom_openapi_path,
                    "include_unreachable_tools": include_unreachable_tools,
                    "status": status,
                    "operation_count": operation_count,
                    "tool_count": app_tool_count,
                    "placeholder_tool_added": placeholder_tool_added,
                    "used_openapi_url": outcome.get("used_url"),
                    "candidate_urls": outcome.get("candidate_urls", []),
                    "rounds_attempted": outcome.get("rounds_attempted", 0),
                    "requests_attempted": outcome.get("requests_attempted", 0),
                    "latency_ms": outcome.get("latency_ms", 0),
                    "error": error_message,
                }
            )

        openapi_tool_catalog = OpenAPIToolCatalog(
            generated_at=time(),
            tools=tools,
            sync_errors=sync_errors,
            apps=app_diagnostics,
        )
        sync_mcp_tool_registry_from_openapi(openapi_tool_catalog.tools)
        return openapi_tool_catalog


def render_openapi_path(path_template: str, path_args: dict[str, Any]) -> str:
    def replace(match: re.Match[str]) -> str:
        key = match.group(1)
        if key not in path_args:
            raise ValueError(f"Missing required path parameter '{key}'")
        return quote(str(path_args[key]), safe="")

    return re.sub(r"{([^}]+)}", replace, path_template)


def combine_base_and_path(base_url: str, path: str) -> str:
    parsed = urlparse(base_url.strip())
    base_path = parsed.path.rstrip("/")
    suffix = path if path.startswith("/") else f"/{path}"
    final_path = f"{base_path}{suffix}" if base_path else suffix
    return urlunparse((parsed.scheme, parsed.netloc, final_path, "", "", ""))


async def invoke_openapi_tool(tool: OpenAPIToolDefinition, arguments: dict[str, Any]) -> dict[str, Any]:
    if tool.is_placeholder:
        return {
            "app": tool.app_name,
            "tool": tool.name,
            "method": "PLACEHOLDER",
            "url": tool.base_url,
            "status_code": None,
            "ok": False,
            "content_type": "application/json",
            "error": tool.placeholder_reason or "Endpoint unavailable",
            "body": {
                "message": "This is a placeholder tool. Upstream API spec is unreachable or has zero endpoints.",
                "reason": tool.placeholder_reason,
                "suggestion": "Check app health diagnostics and OpenAPI path configuration.",
            },
        }

    path_args = arguments.get("path") or {}
    query_args = arguments.get("query") or {}
    header_args = arguments.get("headers") or {}
    cookie_args = arguments.get("cookies") or {}
    body = arguments.get("body")
    timeout_sec = arguments.get("timeout_sec", 30)

    if not isinstance(path_args, dict):
        raise ValueError("`path` must be an object")
    if not isinstance(query_args, dict):
        raise ValueError("`query` must be an object")
    if not isinstance(header_args, dict):
        raise ValueError("`headers` must be an object")
    if not isinstance(cookie_args, dict):
        raise ValueError("`cookies` must be an object")

    try:
        timeout_value = float(timeout_sec)
    except (TypeError, ValueError) as exc:
        raise ValueError("`timeout_sec` must be numeric") from exc

    rendered_path = render_openapi_path(tool.path, path_args)
    request_url = combine_base_and_path(tool.base_url, rendered_path)

    request_headers = {str(k): str(v) for k, v in header_args.items()}
    request_cookies = {str(k): str(v) for k, v in cookie_args.items()}
    params = {str(k): v for k, v in query_args.items()}

    from backend.app.services.keycloak_auth import get_keycloak_token
    with SessionLocal() as db:
        token = await get_keycloak_token(tool.domain_type, db)
        if token:
            request_headers["Authorization"] = f"Bearer {token}"

    request_kwargs: dict[str, Any] = {
        "params": params,
        "headers": request_headers,
        "cookies": request_cookies,
    }

    if body is not None:
        if isinstance(body, (dict, list)):
            request_kwargs["json"] = body
        else:
            request_kwargs["content"] = str(body)
        if tool.body_content_type and "Content-Type" not in request_headers and "content-type" not in request_headers:
            request_headers["Content-Type"] = tool.body_content_type

    async with httpx.AsyncClient(timeout=timeout_value, follow_redirects=True) as client:
        response = await client.request(tool.method, request_url, **request_kwargs)

    content_type = response.headers.get("content-type", "")
    parsed_body: Any
    if "application/json" in content_type.lower():
        try:
            parsed_body = response.json()
        except ValueError:
            parsed_body = response.text
    else:
        parsed_body = response.text

    return {
        "app": tool.app_name,
        "tool": tool.name,
        "method": tool.method,
        "url": str(response.request.url),
        "status_code": response.status_code,
        "ok": response.is_success,
        "content_type": content_type,
        "body": parsed_body,
    }


async def _fetch_all_mcp_server_tools() -> dict[str, tuple[str, str, Any]]:
    """Connect to every registered MCP server and list its tools.

    Returns a dict mapping  prefixed_name -> (server_name, original_tool_name, tool_object).
    Tool names are prefixed as  mcp__{server_name}__{original_name}  to avoid collisions
    with OpenAPI-generated tool names.
    Servers that are unreachable are silently skipped.
    """
    import asyncio as _aio

    with SessionLocal() as db:
        rows = db.scalars(
            select(ServerModel).where(
                ServerModel.is_deleted == False,  # noqa: E712
                ServerModel.is_enabled == True,  # noqa: E712
            )
        ).all()
        servers = [(row.name, row.url) for row in rows]

    if not servers:
        return {}

    result: dict[str, tuple[str, str, Any]] = {}

    async def _probe(name: str, url: str) -> list[tuple[str, str, Any]]:
        try:
            config = {"mcpServers": {name: {"url": url}}}
            client = MCPClient(config)
            await client.create_all_sessions()
            session = client.get_session(name)
            tools = await _aio.wait_for(session.list_tools(), timeout=10.0)
            return [
                (f"mcp__{name}__{t.name}", name, t.name, t)
                for t in tools
            ]
        except Exception as exc:
            print(f"[combined-mcp] Could not list tools for server '{name}': {exc}")
            return []

    tasks = [_probe(name, url) for name, url in servers]
    results = await _aio.gather(*tasks, return_exceptions=True)

    for batch in results:
        if isinstance(batch, BaseException):
            continue
        for prefixed_name, srv_name, orig_name, tool_obj in batch:
            result[prefixed_name] = (srv_name, orig_name, tool_obj)

    sync_mcp_tool_registry_from_mcp(result)
    return result


def _load_policy_mode_map(owner_ids: set[str]) -> dict[str, dict[str, str]]:
    if not owner_ids:
        return {}
    with SessionLocal() as db:
        rows = db.scalars(
            select(AccessPolicyModel).where(AccessPolicyModel.owner_id.in_(list(owner_ids)))
        ).all()
    policy_map: dict[str, dict[str, str]] = {}
    for row in rows:
        owner_map = policy_map.setdefault(row.owner_id, {})
        owner_map[row.tool_id] = row.mode
    return policy_map


def _effective_access_mode(policy_map: dict[str, dict[str, str]], owner_id: str, tool_id: str) -> str:
    owner_policies = policy_map.get(owner_id, {})
    if tool_id in owner_policies:
        return owner_policies[tool_id]
    if DEFAULT_TOOL_ID in owner_policies:
        return owner_policies[DEFAULT_TOOL_ID]
    # Strict fallback: if no policy row exists yet, deny exposure/execution.
    return "deny"


class CombinedAppsOpenAPIMCP(FastMCP[Any]):
    async def list_tools(self) -> list[MCPTool]:
        import asyncio as _aio

        # Fetch both sources concurrently
        catalog_task = build_openapi_tool_catalog()
        mcp_task = _fetch_all_mcp_server_tools()
        catalog, mcp_tools = await _aio.gather(catalog_task, mcp_task)

        owner_ids = {f"app:{tool.app_name}" for tool in catalog.tools.values()}
        owner_ids.update({f"mcp:{server_name}" for server_name, _, _ in mcp_tools.values()})
        policy_map = _load_policy_mode_map(owner_ids)

        tools: list[MCPTool] = []
        for tool in catalog.tools.values():
            owner_id = f"app:{tool.app_name}"
            if _effective_access_mode(policy_map, owner_id, tool.name) == "deny":
                continue
            tools.append(
                MCPTool(
                    name=tool.name,
                    title=tool.title,
                    description=tool.description,
                    inputSchema=tool.input_schema,
                )
            )

        for prefixed_name, (server_name, orig_name, tool_obj) in mcp_tools.items():
            owner_id = f"mcp:{server_name}"
            if _effective_access_mode(policy_map, owner_id, orig_name) == "deny":
                continue
            tools.append(
                MCPTool(
                    name=prefixed_name,
                    title=getattr(tool_obj, "name", prefixed_name),
                    description=f"[MCP: {server_name}] {getattr(tool_obj, 'description', '') or 'No description'}",
                    inputSchema=getattr(tool_obj, "inputSchema", {}) or {},
                )
            )

        return tools


    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        # Helper to check access policy
        def _check_access(owner_id: str, tool_id: str) -> None:
            mode = _effective_access_mode(
                _load_policy_mode_map({owner_id}),
                owner_id=owner_id,
                tool_id=tool_id,
            )
            if mode == "deny":
                raise HTTPException(status_code=403, detail=f"Access denied to tool '{tool_id}' on '{owner_id}'")

        # ---- Native MCP server tool ----
        if name.startswith("mcp__"):
            parts = name.split("__", 2)  # ["mcp", server_name, tool_name]
            if len(parts) != 3:
                raise ValueError(f"Malformed MCP tool name: '{name}'")
            server_name, orig_tool_name = parts[1], parts[2]

            _check_access(f"mcp:{server_name}", orig_tool_name)

            with SessionLocal() as db:
                server = db.scalar(select(ServerModel).where(ServerModel.name == server_name))
            if not server:
                raise ValueError(f"MCP server '{server_name}' not found in database.")

            config = {"mcpServers": {server_name: {"url": server.url}}}
            client = MCPClient(config)
            await client.create_all_sessions()
            session = client.get_session(server_name)
            result = await session.call_tool(orig_tool_name, arguments or {})
            # Convert CallToolResult to a plain dict for JSON response
            return {
                "content": [
                    {"type": getattr(c, "type", "text"), "text": getattr(c, "text", str(c))}
                    for c in (result.content if hasattr(result, "content") else [])
                ],
                "isError": getattr(result, "isError", False),
            }

        # ---- OpenAPI app tool ----
        catalog = await build_openapi_tool_catalog()
        tool = catalog.tools.get(name)

        if tool is None:
            catalog = await build_openapi_tool_catalog(force_refresh=True)
            tool = catalog.tools.get(name)

        if tool is None:
            raise ValueError(f"Unknown tool '{name}'. Refresh your MCP tool list and try again.")

        _check_access(f"app:{tool.app_name}", tool.name)

        return await invoke_openapi_tool(tool, arguments or {})

def _create_combined_apps_mcp() -> CombinedAppsOpenAPIMCP:
    base_kwargs = {
        "name": "combined-apps-openapi",
        "instructions": (
            "Combined MCP server exposing all registered app OpenAPI operations as tools. "
            "Use list_tools to discover operations and call_tool to invoke them."
        ),
    }
    variants = (
        ("minimal", {}),
        ("streamable-path-only", {"streamable_http_path": "/"}),
        ("mcp-legacy-http", {"streamable_http_path": "/", "json_response": True, "stateless_http": True}),
    )
    last_error: Exception | None = None
    for variant_name, extra_kwargs in variants:
        try:
            server = CombinedAppsOpenAPIMCP(**base_kwargs, **extra_kwargs)
            MCP_RUNTIME_INFO["constructor_variant"] = variant_name
            return server
        except TypeError as exc:
            last_error = exc
            continue
    raise RuntimeError(f"Failed to initialize FastMCP server with known constructor variants: {last_error}")


combined_apps_mcp = _create_combined_apps_mcp()
combined_mcp_asgi_app = build_fastmcp_asgi_app(combined_apps_mcp, path="/")
app.mount("/mcp/apps", combined_mcp_asgi_app)
MCP_RUNTIME_INFO["mounted_path"] = "/mcp/apps"
agent = build_default_agent()
require_permission = build_require_permission(
    SessionLocal,
    RoleModel,
    PermissionModel,
    RolePermissionModel,
)


def _reset_openapi_catalog() -> None:
    global openapi_tool_catalog
    openapi_tool_catalog = OpenAPIToolCatalog(generated_at=0.0, tools={}, sync_errors=[], apps=[])


app.include_router(
    create_health_router(
        DB_BACKEND,
        AUTH_ENABLED,
        KEYCLOAK_ISSUER,
        KEYCLOAK_VERIFY_AUD,
    ),
    tags=["Health"],
)
app.include_router(
    create_base_urls_router(
        SessionLocal,
        BaseURLModel,
        AccessPolicyModel,
        MCPToolModel,
        APIEndpointModel,
        APIServerLinkModel,
        ToolVersionModel,
        EndpointVersionModel,
        BaseURLRegistration,
        normalize_openapi_path,
        ensure_default_access_policy_for_owner,
        sync_api_server_links_by_host,
        _reset_openapi_catalog,
        fetch_openapi_spec_from_base_url,
        write_audit_log,
        AuditLogModel,
        get_request_actor,
    ),
    tags=["Applications"],
)
app.include_router(
    create_catalog_router(
        SessionLocal,
        AccessPolicyModel,
        build_openapi_tool_catalog,
        _fetch_all_mcp_server_tools,
        OPENAPI_MCP_FETCH_RETRIES,
        OPENAPI_MCP_CACHE_TTL_SEC,
    ),
    tags=["Catalog"],
)
app.include_router(
    create_servers_router(
        SessionLocal,
        ServerModel,
        AccessPolicyModel,
        MCPToolModel,
        APIEndpointModel,
        APIServerLinkModel,
        ToolVersionModel,
        EndpointVersionModel,
        ServerRegistration,
        MCPClient,
        ensure_default_access_policy_for_owner,
        sync_api_server_links_by_host,
        write_audit_log,
        AuditLogModel,
        get_request_actor,
    ),
    tags=["MCP Servers"],
)
app.include_router(create_agent_router(agent), tags=["Agent"])
app.include_router(
    create_access_policy_router(
        SessionLocal,
        ServerModel,
        BaseURLModel,
        resolve_owner_fk_ids,
        write_audit_log,
        AuditLogModel,
        get_request_actor,
    ),
    tags=["Access Policies"],
)
app.include_router(
    create_dashboard_router(
        SessionLocal,
        BaseURLModel,
        ServerModel,
        MCPToolModel,
        MCPClient,
    ),
    tags=["Dashboard"],
)
app.include_router(
    create_audit_router(
        SessionLocal,
        AuditLogModel,
    ),
    tags=["Audit Logs"],
)
app.include_router(
    create_tools_router(
        SessionLocal,
        MCPToolModel,
        ServerModel,
        BaseURLModel,
        ToolVersionModel,
        write_audit_log,
        AuditLogModel,
        require_permission,
    ),
    tags=["Tools"],
)
app.include_router(
    create_endpoints_router(
        SessionLocal,
        APIEndpointModel,
        ServerModel,
        BaseURLModel,
        EndpointVersionModel,
        write_audit_log,
        AuditLogModel,
        require_permission,
    ),
    tags=["API Endpoints"],
)


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8091, reload=True)


