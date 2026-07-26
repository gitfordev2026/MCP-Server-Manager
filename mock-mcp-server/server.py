"""
Mock MCP Server  ·  FastMCP + FastAPI
======================================
Install:
    pip install "fastmcp>=2.0" "fastapi>=0.115" "uvicorn[standard]>=0.34"

Run:
    uvicorn server:app --reload --port 8000

Endpoints:
    MCP (Streamable HTTP)  ->  http://localhost:8000/mcp/
    REST Swagger docs      ->  http://localhost:8000/docs
"""

from __future__ import annotations

import os
import random
import datetime
import logging
from contextlib import asynccontextmanager
from typing import Any

from dotenv import load_dotenv
import httpx

load_dotenv()

from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from fastmcp import FastMCP
import uvicorn

logger = logging.getLogger("mock_server")

# ─────────────────────────────────────────────────────────────
#  Keycloak Configuration
# ─────────────────────────────────────────────────────────────
KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://host.docker.internal:8080").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "mcp-realm")
KEYCLOAK_CLIENT_ID = os.getenv("KEYCLOAK_CLIENT_ID", "")
KEYCLOAK_CLIENT_SECRET = os.getenv("KEYCLOAK_CLIENT_SECRET", "")
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() in ("true", "1", "yes")

security_scheme = HTTPBearer(auto_error=False)

async def get_confidential_client_token(
    client_id: str | None = None,
    client_secret: str | None = None,
) -> dict[str, Any]:
    cid = client_id or KEYCLOAK_CLIENT_ID
    csecret = client_secret or KEYCLOAK_CLIENT_SECRET
    if not cid or not csecret:
        raise HTTPException(
            status_code=400,
            detail="Client ID and Client Secret are required to authenticate as a Confidential Client. Set KEYCLOAK_CLIENT_ID and KEYCLOAK_CLIENT_SECRET or pass them in request."
        )

    token_endpoint = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
    urls_to_try = [
        token_endpoint,
        token_endpoint.replace("host.docker.internal", "localhost"),
        token_endpoint.replace("host.docker.internal", "developer-api-keycloak-1"),
        token_endpoint.replace("localhost", "developer-api-keycloak-1"),
        token_endpoint.replace("host.docker.internal", "keycloak"),
    ]
    seen = set()
    candidates = [u for u in urls_to_try if not (u in seen or seen.add(u))]

    data = {
        "grant_type": "client_credentials",
        "client_id": cid,
        "client_secret": csecret,
    }

    last_err = None
    async with httpx.AsyncClient(timeout=6.0, verify=False) as client:
        for url in candidates:
            try:
                res = await client.post(url, data=data)
                if res.is_success:
                    return res.json()
                elif res.status_code in (400, 401):
                    raise HTTPException(
                        status_code=res.status_code,
                        detail=f"Keycloak client authentication failed ({res.status_code}): {res.text}"
                    )
            except HTTPException:
                raise
            except Exception as exc:
                last_err = str(exc)
                continue

    raise HTTPException(
        status_code=500,
        detail=f"Could not connect to Keycloak token endpoint: {last_err}"
    )

async def verify_keycloak_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme)
) -> dict[str, Any]:
    if not REQUIRE_AUTH:
        return {"sub": "anonymous", "preferred_username": "anonymous", "auth_status": "disabled"}

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header or Bearer token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    userinfo_endpoint = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo"

    urls_to_try = [
        userinfo_endpoint,
        userinfo_endpoint.replace("host.docker.internal", "localhost"),
        userinfo_endpoint.replace("host.docker.internal", "developer-api-keycloak-1"),
        userinfo_endpoint.replace("localhost", "developer-api-keycloak-1"),
        userinfo_endpoint.replace("host.docker.internal", "keycloak"),
    ]
    seen = set()
    candidates = [u for u in urls_to_try if not (u in seen or seen.add(u))]

    user_data = None
    last_err = None

    async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
        for url in candidates:
            try:
                res = await client.get(url, headers={"Authorization": f"Bearer {token}"})
                if res.is_success:
                    user_data = res.json()
                    break
                elif res.status_code in (401, 403):
                    raise HTTPException(
                        status_code=status.HTTP_401_UNAUTHORIZED,
                        detail="Invalid or expired Keycloak access token",
                        headers={"WWW-Authenticate": "Bearer"},
                    )
            except HTTPException:
                raise
            except Exception as exc:
                last_err = str(exc)
                continue

    if user_data is not None:
        return user_data

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Keycloak verification failed. Could not reach Keycloak userinfo endpoint: {last_err}",
        headers={"WWW-Authenticate": "Bearer"},
    )


# ─────────────────────────────────────────────────────────────
#  Fake in-memory "database"
# ─────────────────────────────────────────────────────────────
_users: dict[str, dict] = {
    "u1": {"id": "u1", "name": "Alice",   "email": "alice@example.com",   "role": "admin"},
    "u2": {"id": "u2", "name": "Bob",     "email": "bob@example.com",     "role": "editor"},
    "u3": {"id": "u3", "name": "Charlie", "email": "charlie@example.com", "role": "viewer"},
    "u4": {"id": "u4", "name": "Diana",   "email": "diana@example.com",   "role": "viewer"},
    "u5": {"id": "u5", "name": "Edward",  "email": "edward@example.com",  "role": "editor"},
    "u6": {"id": "u6", "name": "Fiona",   "email": "fiona@example.com",   "role": "admin"},
}

_notes: dict[str, dict] = {
    "n1": {"id": "n1", "title": "Meeting Notes", "body": "Discuss Q3 roadmap.",   "author": "u1"},
    "n2": {"id": "n2", "title": "Ideas",          "body": "Build a cool MCP app.", "author": "u2"},
    "n3": {"id": "n3", "title": "System Architecture", "body": "Draft for new microservices.", "author": "u6"},
    "n4": {"id": "n4", "title": "Bug Report #45", "body": "Login fails on mobile app.", "author": "u4"},
    "n5": {"id": "n5", "title": "Weekly Status", "body": "Completed the backend refactor.", "author": "u5"},
}

# ─────────────────────────────────────────────────────────────
#  1. FastMCP server  (positional name only — no description kwarg)
# ─────────────────────────────────────────────────────────────
mcp = FastMCP("MockDevServer")


@mcp.tool
def call_external_protected_api(target_url: str, client_id: str = "", client_secret: str = "") -> dict:
    """Act as a Confidential Client: Fetch Keycloak M2M token and call a downstream protected API."""
    import asyncio
    async def _run():
        token_data = await get_confidential_client_token(
            client_id=client_id or None,
            client_secret=client_secret or None,
        )
        access_token = token_data.get("access_token")
        if not access_token:
            return {"error": "Failed to acquire token from Keycloak"}

        async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
            res = await client.get(target_url, headers={"Authorization": f"Bearer {access_token}"})
            return {
                "target_url": target_url,
                "status_code": res.status_code,
                "response": res.json() if "application/json" in res.headers.get("content-type", "") else res.text,
            }

    try:
        return asyncio.run(_run())
    except Exception as exc:
        return {"error": f"Failed to invoke protected API: {exc}"}

@mcp.tool
def add(a: float, b: float) -> float:
    """Add two numbers and return the sum."""
    return a + b

@mcp.tool
def get_current_time() -> str:
    """Return the current UTC timestamp as an ISO-8601 string."""
    return datetime.datetime.now(datetime.UTC).isoformat() + "Z"

@mcp.tool
def random_number(low: int = 1, high: int = 100) -> int:
    """Generate a random integer between low and high (inclusive)."""
    if low > high:
        raise ValueError("`low` must be <= `high`")
    return random.randint(low, high)

@mcp.tool
def reverse_string(text: str) -> str:
    """Reverse the given string."""
    return text[::-1]

@mcp.tool
def word_count(text: str) -> dict:
    """Count words and characters in the supplied text."""
    words = text.split()
    return {
        "word_count":     len(words),
        "char_count":     len(text),
        "char_no_spaces": len(text.replace(" ", "")),
    }

@mcp.tool
def get_user(user_id: str) -> dict:
    """Look up a user by ID (try: u1, u2, u3)."""
    return _users.get(user_id) or {"error": f"User '{user_id}' not found"}

@mcp.tool
def create_note(title: str, body: str, author_id: str) -> dict:
    """Create a new note. author_id must be an existing user ID."""
    if author_id not in _users:
        return {"error": f"Author '{author_id}' not found"}
    nid = f"n{len(_notes) + 1}"
    note = {"id": nid, "title": title, "body": body, "author": author_id}
    _notes[nid] = note
    return note

@mcp.tool
def transform_case(text: str, mode: str = "upper") -> str:
    """Transform text case. mode: upper | lower | title."""
    modes = {"upper": str.upper, "lower": str.lower, "title": str.title}
    fn = modes.get(mode.lower())
    if not fn:
        raise ValueError(f"Unknown mode '{mode}'. Choose: upper | lower | title")
    return fn(text)

@mcp.tool
def calculate(a: float, b: float, operation: str = "add") -> dict:
    """Simple calculator. operation: add | subtract | multiply | divide."""
    if operation == "add":       result = a + b
    elif operation == "subtract": result = a - b
    elif operation == "multiply": result = a * b
    elif operation == "divide":
        if b == 0:
            return {"error": "Division by zero"}
        result = a / b
    else:
        raise ValueError(f"Unknown operation '{operation}'")
    return {"a": a, "b": b, "operation": operation, "result": result}


# ═════════════ RESOURCES ═════════════════════════════════════

@mcp.resource("data://users/all")
def resource_all_users() -> list:
    """All users in the system."""
    return list(_users.values())

@mcp.resource("data://notes/all")
def resource_all_notes() -> list:
    """All notes in the system."""
    return list(_notes.values())

@mcp.resource("data://server/info")
def resource_server_info() -> dict:
    """Server metadata and capability list."""
    return {
        "name":      "MockDevServer",
        "version":   "1.0.0",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z",
        "tools":     ["add", "get_current_time", "random_number", "reverse_string",
                      "word_count", "get_user", "create_note", "transform_case", "calculate"],
        "resources": ["data://users/all", "data://notes/all",
                      "data://server/info", "data://config/roles"],
        "prompts":   ["greeting_prompt", "summarise_prompt",
                      "bullets_to_prose_prompt", "code_review_prompt"],
    }

@mcp.resource("data://config/roles")
def resource_roles() -> dict:
    """User role definitions and their permissions."""
    return {
        "admin":  {"read": True,  "write": True,  "delete": True},
        "editor": {"read": True,  "write": True,  "delete": False},
        "viewer": {"read": True,  "write": False, "delete": False},
    }


# ═════════════ PROMPTS ═══════════════════════════════════════

@mcp.prompt
def greeting_prompt(user_name: str, tone: str = "formal") -> str:
    """Generate a greeting for a named user in formal or casual tone."""
    style = "warmly and professionally" if tone == "formal" else "casually and cheerfully"
    return (
        f"You are a helpful assistant. Greet the user named '{user_name}' {style}. "
        "Keep it to 2-3 sentences."
    )

@mcp.prompt
def summarise_prompt(text: str, max_words: int = 50) -> str:
    """Ask the model to summarise a block of text within a word limit."""
    return (
        f"Summarise the following text in no more than {max_words} words. "
        f"Be concise and preserve key points.\n\n---\n{text}\n---"
    )

@mcp.prompt
def bullets_to_prose_prompt(bullets: str) -> str:
    """Convert bullet points into a polished paragraph."""
    return (
        "Convert the following bullet points into a single, coherent paragraph "
        "using natural language. Do not add new information.\n\n"
        f"Bullets:\n{bullets}"
    )

@mcp.prompt
def code_review_prompt(code: str, language: str = "Python") -> str:
    """Code-review prompt for a given snippet and language."""
    return (
        f"You are a senior {language} developer. Review the following code for "
        "bugs, style issues, and potential improvements. Provide concise, "
        f"actionable feedback.\n\n```{language.lower()}\n{code}\n```"
    )


# ─────────────────────────────────────────────────────────────
#  2. Build MCP ASGI app (path="/mcp")
# ─────────────────────────────────────────────────────────────
# We specify path="/mcp" so FastMCP creates routes at /mcp natively.
# This avoids FastAPI's aggressive 307 trailing slash redirects when mounting.
mcp_app = mcp.http_app(path="/")


# ─────────────────────────────────────────────────────────────
#  3. Combined lifespan (REQUIRED for session manager to start)
# ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    async with mcp_app.router.lifespan_context(app):
        yield


# ─────────────────────────────────────────────────────────────
#  4. FastAPI app
# ─────────────────────────────────────────────────────────────
app = FastAPI(
    title="Mock MCP + REST API",
    description="FastMCP server embedded in FastAPI with REST endpoints for testing.",
    version="1.0.0",
    lifespan=lifespan,
)

app.mount("/mcp/", mcp_app)

# ─────────────────────────────────────────────────────────────
#  5. Mount Individual Sub-Apps (Independent FastAPI instances)
# ─────────────────────────────────────────────────────────────
from inventory_app import app as inventory_fastapi_app
from portal_app import app as portal_fastapi_app
from analytics_app import app as analytics_fastapi_app

app.mount("/apps/inventory", inventory_fastapi_app)
app.mount("/apps/portal", portal_fastapi_app)
app.mount("/apps/analytics", analytics_fastapi_app)


# ──── Pydantic models ────────────────────────────────────────
class CreateUserRequest(BaseModel):
    name:  str
    email: str
    role:  str = "viewer"

class CreateNoteRequest(BaseModel):
    title:     str
    body:      str
    author_id: str

class EchoRequest(BaseModel):
    message: str
    repeat:  int = 1

class ClientCredentialsRequest(BaseModel):
    client_id: str | None = None
    client_secret: str | None = None

class CallAppRequest(BaseModel):
    target_url: str
    method: str = "GET"
    client_id: str | None = None
    client_secret: str | None = None
    json_body: dict[str, Any] | None = None


# ═════════════ REST — Health & Auth ═══════════════════════════

@app.get("/", tags=["Health"])
def root():
    return {"status": "ok", "message": "Mock MCP + FastAPI server is running"}

@app.get("/health", tags=["Health"])
def health():
    return {"status": "healthy", "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z"}

@app.get("/info", tags=["Health"])
def info():
    return {
        "server": "MockDevServer", 
        "version": "1.0.0", 
        "mcp_url": "/mcp/", 
        "docs": "/docs",
        "keycloak_realm": KEYCLOAK_REALM,
        "auth_required": REQUIRE_AUTH,
    }

@app.get("/auth/config", tags=["Auth"])
def auth_config():
    issuer = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}"
    return {
        "realm": KEYCLOAK_REALM,
        "issuer": issuer,
        "token_endpoint": f"{issuer}/protocol/openid-connect/token",
        "userinfo_endpoint": f"{issuer}/protocol/openid-connect/userinfo",
        "jwks_uri": f"{issuer}/protocol/openid-connect/certs",
        "auth_required": REQUIRE_AUTH,
    }

@app.post("/auth/client-token", tags=["Auth"])
async def get_client_token(req: ClientCredentialsRequest | None = None):
    """Act as a Confidential Client: Fetch M2M Access Token from Keycloak using client_credentials grant."""
    cid = req.client_id if req else None
    csec = req.client_secret if req else None
    return await get_confidential_client_token(client_id=cid, client_secret=csec)

@app.post("/proxy/call-protected-app", tags=["Confidential Client Testing"])
async def call_protected_app(req: CallAppRequest):
    """Act as a Confidential Client: Acquire Keycloak token via client_credentials and invoke a downstream protected API/app."""
    token_data = await get_confidential_client_token(client_id=req.client_id, client_secret=req.client_secret)
    access_token = token_data.get("access_token")
    if not access_token:
        raise HTTPException(500, "Failed to retrieve access token from Keycloak")

    headers = {"Authorization": f"Bearer {access_token}", "Accept": "application/json"}

    async with httpx.AsyncClient(timeout=10.0, verify=False) as client:
        try:
            res = await client.request(
                method=req.method.upper(),
                url=req.target_url,
                headers=headers,
                json=req.json_body if req.json_body else None,
            )
            return {
                "target_url": req.target_url,
                "status_code": res.status_code,
                "token_type": token_data.get("token_type"),
                "expires_in": token_data.get("expires_in"),
                "response": res.json() if "application/json" in res.headers.get("content-type", "") else res.text,
            }
        except Exception as exc:
            raise HTTPException(502, f"Error communicating with target application: {exc}")

@app.get("/protected/data", tags=["Protected"])
def protected_data(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "status": "authenticated",
        "user": user,
        "message": f"Successfully accessed Keycloak protected API as {user.get('preferred_username', 'user')}",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }


# ═════════════ SIMULATED DUMMY APPS (SAME KEYCLOAK REALM) ═════════════════

SIMULATED_APPS = [
    {
        "id": "inventory-app",
        "name": "Inventory & Supply Chain API",
        "client_type": "confidential",
        "client_id": "adm-client",
        "realm": KEYCLOAK_REALM,
        "port": 8002,
        "base_url": "http://localhost:8002",
        "openapi_path": "/openapi.json",
        "description": "Enterprise inventory tracking API running on port 8002 requiring M2M Confidential Client authentication."
    },
    {
        "id": "portal-app",
        "name": "Customer Portal API",
        "client_type": "public",
        "client_id": "mcp-client",
        "realm": KEYCLOAK_REALM,
        "port": 8003,
        "base_url": "http://localhost:8003",
        "openapi_path": "/openapi.json",
        "description": "User-facing portal API running on port 8003 requiring Keycloak Bearer token authentication."
    },
    {
        "id": "analytics-app",
        "name": "Analytics & Reporting API",
        "client_type": "confidential",
        "client_id": "ops-client",
        "realm": KEYCLOAK_REALM,
        "port": 8004,
        "base_url": "http://localhost:8004",
        "openapi_path": "/openapi.json",
        "description": "High-performance analytics data service running on port 8004 requiring Confidential Client authentication."
    }
]

@app.get("/apps/catalog", tags=["Simulated Apps"])
def list_simulated_apps():
    """List all simulated applications available for registration in the MCP Server Manager."""
    return {"apps": SIMULATED_APPS, "realm": KEYCLOAK_REALM, "total": len(SIMULATED_APPS)}

# -------------------------------------------------------------
# 1. App: Inventory & Supply Chain API (/apps/inventory)
# -------------------------------------------------------------
@app.get("/apps/inventory/openapi.json", tags=["Simulated App - Inventory"])
def inventory_openapi_spec():
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "Inventory & Supply Chain API",
            "version": "1.0.0",
            "description": "Simulated Confidential Client App in mcp-realm"
        },
        "servers": [{"url": "http://localhost:8001/apps/inventory"}],
        "paths": {
            "/items": {
                "get": {
                    "summary": "List Inventory Items",
                    "operationId": "list_inventory_items",
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {"application/json": {"schema": {"type": "object"}}}
                        }
                    }
                }
            },
            "/stock": {
                "get": {
                    "summary": "Check Stock Level",
                    "operationId": "check_stock_level",
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {"application/json": {"schema": {"type": "object"}}}
                        }
                    }
                }
            }
        }
    }

@app.get("/apps/inventory/items", tags=["Simulated App - Inventory"])
def inventory_items(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "app": "Inventory & Supply Chain API",
        "client_type": "confidential",
        "authenticated_as": user.get("preferred_username") or user.get("sub"),
        "items": [
            {"id": "inv-101", "name": "Server Rack Cabinet 42U", "quantity": 14, "warehouse": "A-12"},
            {"id": "inv-102", "name": "Fiber Optic Patch Cable 10m", "quantity": 350, "warehouse": "B-04"},
            {"id": "inv-103", "name": "Gigabit Ethernet Switch 48-Port", "quantity": 28, "warehouse": "A-08"},
        ]
    }

@app.get("/apps/inventory/stock", tags=["Simulated App - Inventory"])
def inventory_stock(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "app": "Inventory & Supply Chain API",
        "total_stock_count": 392,
        "status": "healthy",
        "last_updated": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }

# -------------------------------------------------------------
# 2. App: Customer Portal API (/apps/portal)
# -------------------------------------------------------------
@app.get("/apps/portal/openapi.json", tags=["Simulated App - Portal"])
def portal_openapi_spec():
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "Customer Portal API",
            "version": "1.0.0",
            "description": "Simulated Public Client App in mcp-realm"
        },
        "servers": [{"url": "http://localhost:8001/apps/portal"}],
        "paths": {
            "/profile": {
                "get": {
                    "summary": "Get Customer Profile",
                    "operationId": "get_customer_profile",
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {"application/json": {"schema": {"type": "object"}}}
                        }
                    }
                }
            },
            "/dashboard": {
                "get": {
                    "summary": "Get Portal Dashboard Summary",
                    "operationId": "get_portal_dashboard",
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {"application/json": {"schema": {"type": "object"}}}
                        }
                    }
                }
            }
        }
    }

@app.get("/apps/portal/profile", tags=["Simulated App - Portal"])
def portal_profile(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "app": "Customer Portal API",
        "client_type": "public",
        "profile": {
            "username": user.get("preferred_username", "portal_user"),
            "email": user.get("email", "user@example.com"),
            "account_status": "Active",
            "tier": "Enterprise Premium"
        }
    }

@app.get("/apps/portal/dashboard", tags=["Simulated App - Portal"])
def portal_dashboard(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "app": "Customer Portal API",
        "active_services": 5,
        "pending_tickets": 0,
        "system_health": "100% Operational",
        "last_login": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }

# -------------------------------------------------------------
# 3. App: Analytics & Reporting API (/apps/analytics)
# -------------------------------------------------------------
@app.get("/apps/analytics/openapi.json", tags=["Simulated App - Analytics"])
def analytics_openapi_spec():
    return {
        "openapi": "3.0.3",
        "info": {
            "title": "Analytics & Reporting API",
            "version": "1.0.0",
            "description": "Simulated Confidential Client App in mcp-realm"
        },
        "servers": [{"url": "http://localhost:8001/apps/analytics"}],
        "paths": {
            "/metrics": {
                "get": {
                    "summary": "Get System Performance Metrics",
                    "operationId": "get_system_metrics",
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {"application/json": {"schema": {"type": "object"}}}
                        }
                    }
                }
            },
            "/reports": {
                "get": {
                    "summary": "Get Executive Summary Report",
                    "operationId": "get_executive_reports",
                    "responses": {
                        "200": {
                            "description": "Successful Response",
                            "content": {"application/json": {"schema": {"type": "object"}}}
                        }
                    }
                }
            }
        }
    }

@app.get("/apps/analytics/metrics", tags=["Simulated App - Analytics"])
def analytics_metrics(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "app": "Analytics & Reporting API",
        "client_type": "confidential",
        "metrics": {
            "requests_per_second": 1420,
            "avg_latency_ms": 12.4,
            "error_rate_pct": 0.01,
            "cpu_utilization_pct": 34.2,
            "memory_utilization_pct": 58.7
        }
    }

@app.get("/apps/analytics/reports", tags=["Simulated App - Analytics"])
def analytics_reports(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {
        "app": "Analytics & Reporting API",
        "report_id": "rep-99042",
        "title": "Q3 Infrastructure Efficiency Report",
        "generated_by": user.get("preferred_username", "m2m_service"),
        "status": "Final",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }


# ═════════════ REST — Users ═══════════════════════════════════

@app.get("/users", tags=["Users"])
def list_users(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {"users": list(_users.values()), "total": len(_users), "authenticated_as": user.get("preferred_username")}

@app.get("/users/{user_id}", tags=["Users"])
def get_user_rest(user_id: str, user: dict[str, Any] = Depends(verify_keycloak_token)):
    u = _users.get(user_id)
    if not u:
        raise HTTPException(404, f"User '{user_id}' not found")
    return u

@app.post("/users", status_code=201, tags=["Users"])
def create_user(req: CreateUserRequest):
    if req.role not in {"admin", "editor", "viewer"}:
        raise HTTPException(400, "Invalid role. Choose: admin | editor | viewer")
    uid = f"u{len(_users) + 1}"
    user = {"id": uid, "name": req.name, "email": req.email, "role": req.role}
    _users[uid] = user
    return user

@app.delete("/users/{user_id}", tags=["Users"])
def delete_user(user_id: str):
    if user_id not in _users:
        raise HTTPException(404, f"User '{user_id}' not found")
    return {"deleted": _users.pop(user_id)}


# ═════════════ REST — Notes ═══════════════════════════════════

@app.get("/notes", tags=["Notes"])
def list_notes(user: dict[str, Any] = Depends(verify_keycloak_token)):
    return {"notes": list(_notes.values()), "total": len(_notes), "authenticated_as": user.get("preferred_username")}

@app.get("/notes/{note_id}", tags=["Notes"])
def get_note(note_id: str, user: dict[str, Any] = Depends(verify_keycloak_token)):
    note = _notes.get(note_id)
    if not note:
        raise HTTPException(404, f"Note '{note_id}' not found")
    return note

@app.post("/notes", status_code=201, tags=["Notes"])
def create_note_rest(req: CreateNoteRequest, user: dict[str, Any] = Depends(verify_keycloak_token)):
    if req.author_id not in _users:
        raise HTTPException(400, f"Author '{req.author_id}' not found")
    nid = f"n{len(_notes) + 1}"
    note = {"id": nid, "title": req.title, "body": req.body, "author": req.author_id}
    _notes[nid] = note
    return note

@app.delete("/notes/{note_id}", tags=["Notes"])
def delete_note(note_id: str):
    if note_id not in _notes:
        raise HTTPException(404, f"Note '{note_id}' not found")
    return {"deleted": _notes.pop(note_id)}


# ═════════════ REST — Utilities ═══════════════════════════════

@app.post("/echo", tags=["Utilities"])
def echo(req: EchoRequest):
    if not 1 <= req.repeat <= 10:
        raise HTTPException(400, "`repeat` must be between 1 and 10")
    return {"messages": [req.message] * req.repeat}

@app.get("/random", tags=["Utilities"])
def random_endpoint(low: int = 1, high: int = 100):
    if low > high:
        raise HTTPException(400, "`low` must be <= `high`")
    return {"value": random.randint(low, high), "range": [low, high]}

@app.get("/time", tags=["Utilities"])
def current_time():
    now = datetime.datetime.now(datetime.UTC)
    return {
        "utc":       now.isoformat() + "Z",
        "date":      now.date().isoformat(),
        "time":      now.time().isoformat(),
        "timestamp": int(now.timestamp()),
    }

@app.post("/calculate", tags=["Utilities"])
def calculate_rest(a: float, b: float, op: str = "add"):
    if op == "divide" and b == 0:
        raise HTTPException(400, "Division by zero")
    ops: dict[str, Any] = {
        "add":      a + b,
        "subtract": a - b,
        "multiply": a * b,
        "divide":   a / b if b != 0 else None,
    }
    if op not in ops:
        raise HTTPException(400, f"Unknown op '{op}'. Use: add | subtract | multiply | divide")
    return {"a": a, "b": b, "op": op, "result": ops[op]}

if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True, ws="wsproto")


######################## RAPID API WRAPPER ########################

# @app.post("/get_movies_data")
# def get_movies_data():
#     pass


@app.post("/get_weather_data")
def get_weather_data():
    import requests

    url = "https://weatherbit-v1-mashape.p.rapidapi.com/forecast/3hourly"

    querystring = {"lat":"35.5","lon":"-78.5","units":"imperial","lang":"en"}

    headers = {
        "x-rapidapi-key": "e0d113dbcemshe95f38550c29117p110a12jsnef56109312e9",
        "x-rapidapi-host": "weatherbit-v1-mashape.p.rapidapi.com",
        "Content-Type": "application/json"
    }

    response = requests.get(url, headers=headers, params=querystring)

    print(response.json())


    return response.json()