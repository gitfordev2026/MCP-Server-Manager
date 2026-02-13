import os
import asyncio
import ipaddress
import re
from contextlib import asynccontextmanager
from dataclasses import dataclass
from typing import Any
from time import perf_counter, time
from urllib.parse import quote, urlparse, urlunparse

import httpx
import jwt
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient
from langchain_core.callbacks import BaseCallbackHandler
from langchain_ollama import ChatOllama
from mcp.server.fastmcp import FastMCP
from mcp.types import Tool as MCPTool
from mcp_use import MCPAgent, MCPClient
from pydantic import BaseModel, field_validator
from sqlalchemy import Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    mcp_server = globals().get("combined_apps_mcp")
    if mcp_server is None:
        yield
        return

    async with mcp_server.session_manager.run():
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

DB_PATH = "servers.db"
DATABASE_URL = f"sqlite:///{DB_PATH}"


class Base(DeclarativeBase):
    pass


class ServerModel(Base):
    __tablename__ = "servers"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)


class BaseURLModel(Base):
    __tablename__ = "base_urls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    name: Mapped[str] = mapped_column(String, unique=True, nullable=False)
    url: Mapped[str] = mapped_column(String, nullable=False)
    openapi_path: Mapped[str] = mapped_column(String, nullable=False, default="")
    include_unreachable_tools: Mapped[int] = mapped_column(Integer, nullable=False, default=0)


engine = create_engine(
    DATABASE_URL,
    connect_args={"check_same_thread": False},
)
SessionLocal = sessionmaker(bind=engine, autocommit=False, autoflush=False, expire_on_commit=False)


# ---------------------------------------------------
# 1. Keycloak Auth Config + JWT Validation
# ---------------------------------------------------
KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "")
KEYCLOAK_VERIFY_AUD = os.getenv("KEYCLOAK_VERIFY_AUD", "true").lower() == "true"
AUTH_ENABLED = os.getenv("AUTH_ENABLED", "true").lower() == "true"

if KEYCLOAK_SERVER_URL and KEYCLOAK_REALM:
    KEYCLOAK_ISSUER = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}"
    KEYCLOAK_JWKS_URL = f"{KEYCLOAK_ISSUER}/protocol/openid-connect/certs"
    JWKS_CLIENT = PyJWKClient(KEYCLOAK_JWKS_URL)

else:
    KEYCLOAK_ISSUER = ""
    KEYCLOAK_JWKS_URL = ""
    JWKS_CLIENT = None

# security = HTTPBearer(auto_error=False)


# def get_current_user(
#     credentials: HTTPAuthorizationCredentials | None = Security(security),
# ) -> dict[str, Any]:
#     """Validate bearer token from Keycloak and return JWT claims."""
#     if not AUTH_ENABLED:
#         return {"sub": "local-dev", "auth": "disabled"}

#     if not KEYCLOAK_SERVER_URL or not KEYCLOAK_REALM:
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail="Keycloak auth misconfigured: set KEYCLOAK_SERVER_URL and KEYCLOAK_REALM",
#         )

#     if KEYCLOAK_VERIFY_AUD and not KEYCLOAK_CLIENT_ID:
#         raise HTTPException(
#             status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#             detail="Keycloak auth misconfigured: set KEYCLOAK_CLIENT_ID when KEYCLOAK_VERIFY_AUD=true",
#         )

#     if credentials is None or not credentials.credentials:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail="Missing bearer token",
#             headers={"WWW-Authenticate": "Bearer"},
#         )

#     token = credentials.credentials

#     try:
#         if JWKS_CLIENT is None:
#             raise HTTPException(
#                 status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
#                 detail="Keycloak JWKS client not initialized",
#             )

#         signing_key = JWKS_CLIENT.get_signing_key_from_jwt(token).key

#         decode_kwargs: dict[str, Any] = {
#             "key": signing_key,
#             "algorithms": ["RS256"],
#             "issuer": KEYCLOAK_ISSUER,
#             "options": {"verify_aud": KEYCLOAK_VERIFY_AUD},
#         }

#         if KEYCLOAK_VERIFY_AUD:
#             decode_kwargs["audience"] = KEYCLOAK_CLIENT_ID

#         payload = jwt.decode(token, **decode_kwargs)
#         return payload

#     except InvalidTokenError as exc:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail=f"Invalid token: {exc}",
#             headers={"WWW-Authenticate": "Bearer"},
#         ) from exc
#     except HTTPException:
#         raise
#     except Exception as exc:
#         raise HTTPException(
#             status_code=status.HTTP_401_UNAUTHORIZED,
#             detail=f"Token validation failed: {exc}",
#             headers={"WWW-Authenticate": "Bearer"},
#         ) from exc


# ---------------------------------------------------
# 2. Initialize SQLite database
# ---------------------------------------------------
def init_db() -> None:
    Base.metadata.create_all(bind=engine)
    migrate_base_urls_schema()


def migrate_base_urls_schema() -> None:
    """Apply additive schema migrations for base_urls table."""
    with engine.begin() as conn:
        columns = {row[1] for row in conn.exec_driver_sql("PRAGMA table_info(base_urls)").fetchall()}

        if "openapi_path" not in columns:
            conn.exec_driver_sql("ALTER TABLE base_urls ADD COLUMN openapi_path TEXT")
        if "include_unreachable_tools" not in columns:
            conn.exec_driver_sql(
                "ALTER TABLE base_urls ADD COLUMN include_unreachable_tools INTEGER NOT NULL DEFAULT 0"
            )

        conn.exec_driver_sql("UPDATE base_urls SET openapi_path = '' WHERE openapi_path IS NULL")
        conn.exec_driver_sql(
            "UPDATE base_urls SET include_unreachable_tools = 0 WHERE include_unreachable_tools IS NULL"
        )


def get_servers_from_db() -> list[tuple[str, str]]:
    """Get all registered MCP servers from database."""
    try:
        with SessionLocal() as db:
            rows = db.scalars(select(ServerModel)).all()
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
class ServerRegistration(BaseModel):
    name: str
    url: str

    @field_validator("url")
    @classmethod
    def validate_server_url(cls, value: str) -> str:
        url = value.strip()
        parsed = urlparse(url)

        if parsed.scheme not in {"http", "https"}:
            raise ValueError("URL must start with http:// or https://")
        if not parsed.hostname:
            raise ValueError("URL must include a valid hostname or IP address")

        hostname = parsed.hostname
        try:
            ipaddress.ip_address(hostname)
        except ValueError:
            if hostname != "localhost" and "." not in hostname:
                raise ValueError(
                    "URL host must be a valid IP, localhost, or a fully qualified domain (e.g. api.example.com)"
                )

        try:
            port = parsed.port
        except ValueError as exc:
            raise ValueError("URL must include a valid numeric port") from exc

        if port is None:
            raise ValueError("URL must include an explicit port, e.g. :8005")

        return url


class BaseURLRegistration(BaseModel):
    name: str
    url: str
    openapi_path: str | None = ""
    include_unreachable_tools: bool = False


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
OPENAPI_MCP_CACHE_TTL_SEC = int(os.getenv("OPENAPI_MCP_CACHE_TTL_SEC", "30"))
OPENAPI_MCP_FETCH_RETRIES = int(os.getenv("OPENAPI_MCP_FETCH_RETRIES", "1"))


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


def build_app_operation_tools(app_name: str, app_url: str, spec: dict[str, Any]) -> list[OpenAPIToolDefinition]:
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
) -> dict[str, Any]:
    candidates = build_openapi_candidates(raw_url, openapi_path)
    errors: list[str] = []
    requests_attempted = 0
    rounds_attempted = 0
    started = perf_counter()

    async with httpx.AsyncClient(timeout=10.0, follow_redirects=True) as client:
        for attempt in range(max(0, retries) + 1):
            rounds_attempted = attempt + 1
            for candidate in candidates:
                requests_attempted += 1
                try:
                    response = await client.get(candidate, headers={"Accept": "application/json"})
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
) -> dict[str, Any]:
    outcome = await fetch_openapi_spec_with_diagnostics(raw_url, openapi_path, retries)
    if outcome["ok"] and isinstance(outcome["spec"], dict):
        return outcome["spec"]
    raise ValueError(str(outcome.get("error") or "Could not fetch a valid OpenAPI spec"))


def make_placeholder_tool(app_name: str, app_url: str, reason: str) -> OpenAPIToolDefinition:
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
            rows = db.scalars(select(BaseURLModel)).all()
            base_urls = [
                {
                    "name": row.name,
                    "url": row.url,
                    "openapi_path": row.openapi_path or "",
                    "include_unreachable_tools": bool(row.include_unreachable_tools),
                }
                for row in rows
            ]

        async def fetch_one(base_url: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
            outcome = await fetch_openapi_spec_with_diagnostics(
                raw_url=base_url["url"],
                openapi_path=base_url.get("openapi_path") or "",
                retries=retries,
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
                generated_tools = build_app_operation_tools(app_name, app_url, spec)
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


class CombinedAppsOpenAPIMCP(FastMCP[Any]):
    async def list_tools(self) -> list[MCPTool]:
        catalog = await build_openapi_tool_catalog()
        return [
            MCPTool(
                name=tool.name,
                title=tool.title,
                description=tool.description,
                inputSchema=tool.input_schema,
            )
            for tool in catalog.tools.values()
        ]

    async def call_tool(self, name: str, arguments: dict[str, Any]) -> dict[str, Any]:
        catalog = await build_openapi_tool_catalog()
        tool = catalog.tools.get(name)

        if tool is None:
            catalog = await build_openapi_tool_catalog(force_refresh=True)
            tool = catalog.tools.get(name)

        if tool is None:
            raise ValueError(f"Unknown tool '{name}'. Refresh your MCP tool list and try again.")

        return await invoke_openapi_tool(tool, arguments or {})


# ---------------------------------------------------
# 4. Auth helper endpoints
# ---------------------------------------------------
@app.get("/health")
def health() -> dict[str, Any]:
    return {
        "status": "ok",
        "auth_enabled": AUTH_ENABLED,
        "issuer": KEYCLOAK_ISSUER,
        "audience_check": KEYCLOAK_VERIFY_AUD,
    }


# @app.get("/auth/me")
# def auth_me(current_user: dict[str, Any] = Depends(get_current_user)) -> dict[str, Any]:
#     return {
#         "sub": current_user.get("sub"),
#         "preferred_username": current_user.get("preferred_username"),
#         "email": current_user.get("email"),
#         "realm_access": current_user.get("realm_access", {}),
#         "resource_access": current_user.get("resource_access", {}),
#     }


# ---------------------------------------------------
# 5. Base URL Endpoints (App Registration)
# ---------------------------------------------------
@app.post("/register-base-url")
def register_base_url(
    data: BaseURLRegistration,
) -> dict[str, Any]:
    """Register base URL for app."""
    global openapi_tool_catalog
    normalized_openapi_path = normalize_openapi_path(data.openapi_path)
    include_unreachable = 1 if data.include_unreachable_tools else 0
    try:
        with SessionLocal() as db:
            existing = db.scalar(select(BaseURLModel).where(BaseURLModel.name == data.name))
            if existing:
                existing.url = data.url
                existing.openapi_path = normalized_openapi_path
                existing.include_unreachable_tools = include_unreachable
            else:
                db.add(
                    BaseURLModel(
                        name=data.name,
                        url=data.url,
                        openapi_path=normalized_openapi_path,
                        include_unreachable_tools=include_unreachable,
                    )
                )
            db.commit()

        openapi_tool_catalog = OpenAPIToolCatalog(generated_at=0.0, tools={}, sync_errors=[], apps=[])

        return {
            "message": "Base URL registered successfully",
            "name": data.name,
            "url": data.url,
            "openapi_path": normalized_openapi_path,
            "include_unreachable_tools": bool(include_unreachable),
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/base-urls")
def list_base_urls(
    current_user: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, Any]]]:
    """Get all registered base URLs."""
    _ = current_user
    try:
        with SessionLocal() as db:
            rows = db.scalars(select(BaseURLModel)).all()
            base_urls = [
                {
                    "name": row.name,
                    "url": row.url,
                    "openapi_path": row.openapi_path or "",
                    "include_unreachable_tools": bool(row.include_unreachable_tools),
                }
                for row in rows
            ]

        return {"base_urls": base_urls}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/openapi-spec")
async def get_openapi_spec(
    url: str,
    openapi_path: str | None = None,
    retries: int = Query(default=0, ge=0, le=5),
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Fetch OpenAPI JSON from a registered app URL via backend to avoid browser CORS issues."""
    _ = current_user

    try:
        return await fetch_openapi_spec_from_base_url(url, openapi_path=openapi_path, retries=retries)
    except ValueError as exc:
        detail = str(exc)
        status_code = 400 if detail.startswith("URL must") else 502
        raise HTTPException(status_code=status_code, detail=detail) from exc


combined_apps_mcp = CombinedAppsOpenAPIMCP(
    name="combined-apps-openapi",
    instructions=(
        "Combined MCP server exposing all registered app OpenAPI operations as tools. "
        "Use list_tools to discover operations and call_tool to invoke them."
    ),
    streamable_http_path="/",
    json_response=True,
    stateless_http=True,
)
app.mount("/mcp/apps", combined_apps_mcp.streamable_http_app())


@app.get("/mcp/openapi/catalog")
async def get_openapi_tool_catalog(
    force_refresh: bool = Query(default=True),
    retries: int = Query(default=OPENAPI_MCP_FETCH_RETRIES, ge=0, le=5),
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Inspect generated MCP tools from registered app OpenAPI specs."""
    _ = current_user
    catalog = await build_openapi_tool_catalog(force_refresh=force_refresh, retries_override=retries)
    app_count = len(catalog.apps)
    healthy_count = sum(1 for app in catalog.apps if app.get("status") == "healthy")
    zero_count = sum(1 for app in catalog.apps if app.get("status") == "zero_endpoints")
    unreachable_count = sum(1 for app in catalog.apps if app.get("status") == "unreachable")

    return {
        "mcp_endpoint": "/mcp/apps",
        "generated_at": catalog.generated_at,
        "tool_count": len(catalog.tools),
        "summary": {
            "apps_total": app_count,
            "healthy": healthy_count,
            "zero_endpoints": zero_count,
            "unreachable": unreachable_count,
        },
        "settings": {
            "retries": retries,
            "cache_ttl_sec": OPENAPI_MCP_CACHE_TTL_SEC,
        },
        "sync_errors": catalog.sync_errors,
        "apps": catalog.apps,
        "tools": [
            {
                "name": tool.name,
                "title": tool.title,
                "app": tool.app_name,
                "method": tool.method,
                "path": tool.path,
                "is_placeholder": tool.is_placeholder,
                "placeholder_reason": tool.placeholder_reason,
            }
            for tool in catalog.tools.values()
        ],
    }


@app.get("/mcp/openapi/diagnostics")
async def get_openapi_sync_diagnostics(
    retries: int = Query(default=2, ge=0, le=5),
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Run app OpenAPI sync diagnostics with retries and return per-app health details."""
    _ = current_user
    catalog = await build_openapi_tool_catalog(force_refresh=True, retries_override=retries)
    return {
        "generated_at": catalog.generated_at,
        "retries": retries,
        "apps": catalog.apps,
        "sync_errors": catalog.sync_errors,
    }


# ---------------------------------------------------
# 6. Server Endpoints (MCP Servers)
# ---------------------------------------------------
@app.post("/register-server")
async def register_server(
    data: ServerRegistration,
) -> dict[str, str]:
    """Register MCP server."""
    try:
        probe_result = await probe_server_status(data.name, data.url, timeout_sec=8.0)
        if probe_result["status"] != "alive":
            error_detail = probe_result.get("error") or "Unknown connection error"
            raise HTTPException(
                status_code=400,
                detail=f"Server endpoint is not reachable or not MCP-compatible: {error_detail}",
            )

        with SessionLocal() as db:
            existing = db.scalar(select(ServerModel).where(ServerModel.name == data.name))
            if existing:
                existing.url = data.url
            else:
                db.add(ServerModel(name=data.name, url=data.url))
            db.commit()

        return {
            "message": "Server registered successfully",
            "name": data.name,
            "url": data.url,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/servers/{server_name}/tools")
async def get_server_tools(
    server_name: str,
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Get all tools available for a specific server."""
    _ = current_user
    try:
        with SessionLocal() as db:
            server = db.scalar(select(ServerModel).where(ServerModel.name == server_name))

        if not server:
            raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

        server_url = server.url

        # Create config for this server
        config = {
            "mcpServers": {
                server_name: {"url": server_url},
            }
        }

        # Initialize client for this server
        client = MCPClient(config)
        await client.create_all_sessions()

        # Get session for the server
        session = client.get_session(server_name)

        # List all tools
        tools = await session.list_tools()

        tools_list = []
        for tool in tools:
            tools_list.append(
                {
                    "name": tool.name,
                    "description": tool.description,
                    "inputSchema": tool.inputSchema if hasattr(tool, "inputSchema") else {},
                }
            )

        return {
            "server": server_name,
            "url": server_url,
            "tools": tools_list,
            "tool_count": len(tools_list),
        }

    except HTTPException:
        raise
    except Exception as exc:
        print(f"Error getting tools for server {server_name}: {exc}")
        raise HTTPException(status_code=500, detail=f"Error retrieving tools: {exc}") from exc


@app.get("/servers")
def list_servers(
    current_user: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, str]]]:
    """Get all registered MCP servers."""
    _ = current_user
    try:
        with SessionLocal() as db:
            rows = db.scalars(select(ServerModel)).all()
            servers = [{"name": row.name, "url": row.url} for row in rows]

        return {"servers": servers}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


async def probe_server_status(server_name: str, server_url: str, timeout_sec: float = 8.0) -> dict[str, Any]:
    """Check if an MCP server is reachable by creating a session and listing tools."""
    started = perf_counter()
    server_config = {"mcpServers": {server_name: {"url": server_url}}}
    probe_client = MCPClient(server_config)

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


@app.get("/servers/status")
async def list_servers_status(
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Get live status for all registered MCP servers."""
    _ = current_user
    try:
        with SessionLocal() as db:
            rows = db.scalars(select(ServerModel)).all()
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


@app.get("/servers/{server_name}/status")
async def get_server_status(
    server_name: str,
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Get live status for one MCP server."""
    _ = current_user
    try:
        with SessionLocal() as db:
            server = db.scalar(select(ServerModel).where(ServerModel.name == server_name))

        if not server:
            raise HTTPException(status_code=404, detail=f"Server '{server_name}' not found")

        return await probe_server_status(server.name, server.url)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Error retrieving server status: {exc}") from exc


class LLMDebugCallback(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print("\n=================== LLM PROMPT SENT ===================")
        for prompt in prompts:
            print(prompt)
        print("=======================================================\n")

    def on_llm_end(self, response, **kwargs):
        print("\n=================== RAW LLM RESPONSE ===================")
        print(response)
        print("=======================================================\n")


config = {
    "mcpServers": {
        "http_server": {
            "url": "http://11.0.25.132:8005/mcp",
        }
    }
}

client = MCPClient(config)

llm = ChatOllama(
    model="gpt-oss:120b",
    base_url="http://11.0.25.132:11434",
    temperature=0.7,
    callbacks=[LLMDebugCallback()],
)

agent = MCPAgent(llm=llm, client=client, callbacks=[LLMDebugCallback()])


# ---------------------------------------------------
# 7. Direct agent reply
# ---------------------------------------------------
@app.get("/agent/query")
async def query(
    prompt: str,
    current_user: dict[str, Any] | None = None,
) -> dict[str, Any]:
    _ = current_user
    result = await agent.run(prompt)
    return {"response": result}


if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8090, reload=True)
