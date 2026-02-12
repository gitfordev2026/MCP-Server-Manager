import os
import asyncio
import ipaddress
from contextlib import asynccontextmanager
from typing import Any
from time import perf_counter
from urllib.parse import urlparse

import jwt
import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Security, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import InvalidTokenError, PyJWKClient
from langchain_core.callbacks import BaseCallbackHandler
from langchain_ollama import ChatOllama
from mcp_use import MCPAgent, MCPClient
from pydantic import BaseModel, field_validator
from sqlalchemy import Integer, String, create_engine, select
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, sessionmaker

load_dotenv()

@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
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
) -> dict[str, str]:
    """Register base URL for app."""
    try:
        with SessionLocal() as db:
            existing = db.scalar(select(BaseURLModel).where(BaseURLModel.name == data.name))
            if existing:
                existing.url = data.url
            else:
                db.add(BaseURLModel(name=data.name, url=data.url))
            db.commit()

        return {
            "message": "Base URL registered successfully",
            "name": data.name,
            "url": data.url,
        }

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


@app.get("/base-urls")
def list_base_urls(
    current_user: dict[str, Any] | None = None,
) -> dict[str, list[dict[str, str]]]:
    """Get all registered base URLs."""
    _ = current_user
    try:
        with SessionLocal() as db:
            rows = db.scalars(select(BaseURLModel)).all()
            base_urls = [{"name": row.name, "url": row.url} for row in rows]

        return {"base_urls": base_urls}

    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc


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
