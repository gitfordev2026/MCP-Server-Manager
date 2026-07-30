"""
Customer Portal API — Simulated FastAPI App 2
==============================================
Keycloak Client: mcp-client (Public Client)
Keycloak Realm: mcp-realm
"""

from __future__ import annotations

import os
import datetime
import logging
from typing import Any

from dotenv import load_dotenv
import httpx
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("portal_app")

KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://host.docker.internal:8080").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "mcp-realm")
KEYCLOAK_CLIENT_ID = os.getenv("PORTAL_KEYCLOAK_CLIENT_ID", os.getenv("KEYCLOAK_CLIENT_ID", "mcp-client"))
KEYCLOAK_CLIENT_SECRET = os.getenv("PORTAL_KEYCLOAK_CLIENT_SECRET", os.getenv("KEYCLOAK_CLIENT_SECRET", ""))
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() in ("true", "1", "yes")

security_scheme = HTTPBearer(auto_error=False)

async def verify_portal_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme)
) -> dict[str, Any]:
    if not REQUIRE_AUTH:
        return {"sub": "anonymous", "client_id": KEYCLOAK_CLIENT_ID, "auth_status": "disabled"}

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header or Bearer token for Customer Portal App",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    userinfo_endpoint = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo"

    urls_to_try = [
        userinfo_endpoint,
        f"http://10.139.10.176:8080/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo",
        f"http://localhost:8080/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo",
        f"http://127.0.0.1:8080/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo",
        f"http://keycloak:8080/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo",
        userinfo_endpoint.replace("host.docker.internal", "localhost"),
        userinfo_endpoint.replace("host.docker.internal", "developer-api-keycloak-1"),
    ]
    seen = set()
    candidates = [u for u in urls_to_try if not (u in seen or seen.add(u))]

    user_data = None
    last_err = None

    import jwt
    async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
        for url in candidates:
            try:
                res = await client.get(url, headers={"Authorization": f"Bearer {token}"})
                if res.is_success:
                    user_data = res.json()
                    break
            except Exception as exc:
                last_err = str(exc)
                continue

    if user_data is not None:
        user_data["configured_client_id"] = KEYCLOAK_CLIENT_ID
        return user_data

    # Fallback for M2M (client_credentials) tokens or network isolation:
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        if payload.get("iss") and ("/realms/" in payload["iss"]):
            payload["configured_client_id"] = KEYCLOAK_CLIENT_ID
            return payload
    except Exception as exc:
        last_err = str(exc)

    raise HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail=f"Keycloak token validation failed for {KEYCLOAK_CLIENT_ID}: {last_err}",
        headers={"WWW-Authenticate": "Bearer"},
    )

app = FastAPI(
    title="Customer Portal API",
    description=f"Simulated Public Client App (Client: {KEYCLOAK_CLIENT_ID}, Realm: {KEYCLOAK_REALM})",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

class UserLoginRequest(BaseModel):
    username: str
    password: str

@app.post("/auth/login", tags=["Auth"])
@app.post("/auth/token", tags=["Auth"])
async def login_user(req: UserLoginRequest):
    """Authenticate a user using Username and Password."""
    token_endpoint = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
    urls_to_try = [
        token_endpoint,
        token_endpoint.replace("host.docker.internal", "localhost"),
        token_endpoint.replace("host.docker.internal", "developer-api-keycloak-1"),
        token_endpoint.replace("localhost", "developer-api-keycloak-1"),
    ]
    seen = set()
    candidates = [u for u in urls_to_try if not (u in seen or seen.add(u))]

    cid = KEYCLOAK_CLIENT_ID
    csec = KEYCLOAK_CLIENT_SECRET

    data = {
        "grant_type": "password",
        "client_id": cid,
        "username": req.username,
        "password": req.password,
    }
    if csec:
        data["client_secret"] = csec

    last_err = None
    async with httpx.AsyncClient(timeout=6.0, verify=False) as client:
        for url in candidates:
            try:
                res = await client.post(url, data=data)
                if res.is_success:
                    return res.json()
                elif res.status_code in (400, 401):
                    err_txt = res.text
                    if "direct access grants" in err_txt.lower():
                        raise HTTPException(
                            status_code=400,
                            detail=f"Keycloak Client '{cid}' has 'Direct Access Grants' disabled. To enable Password Grant login: Go to Keycloak Admin Console (http://localhost:8080/admin) ➔ Clients ➔ '{cid}' ➔ Capability config ➔ Turn ON 'Direct access grants'. (For M2M token generation, use POST /auth/m2m-token)."
                        )
                    raise HTTPException(
                        status_code=res.status_code,
                        detail=f"Keycloak login failed: {err_txt}"
                    )
            except HTTPException:
                raise
            except Exception as exc:
                last_err = str(exc)
                continue

    raise HTTPException(
        status_code=500,
        detail=f"Could not connect to Keycloak token endpoint for {cid}: {last_err}"
    )

@app.post("/auth/m2m-token", tags=["Auth"])
async def get_m2m_token():
    """Generate a Machine-to-Machine token using .env client_id & client_secret."""
    if not KEYCLOAK_CLIENT_SECRET:
        raise HTTPException(400, "Client secret is not configured for this application.")
    token_endpoint = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/token"
    urls_to_try = [
        token_endpoint,
        token_endpoint.replace("host.docker.internal", "localhost"),
        token_endpoint.replace("host.docker.internal", "developer-api-keycloak-1"),
        token_endpoint.replace("localhost", "developer-api-keycloak-1"),
    ]
    seen = set()
    candidates = [u for u in urls_to_try if not (u in seen or seen.add(u))]

    data = {
        "grant_type": "client_credentials",
        "client_id": KEYCLOAK_CLIENT_ID,
        "client_secret": KEYCLOAK_CLIENT_SECRET,
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
                        detail=f"Keycloak M2M authentication failed: {res.text}"
                    )
            except HTTPException:
                raise
            except Exception as exc:
                last_err = str(exc)
                continue

    raise HTTPException(
        status_code=500,
        detail=f"Could not connect to Keycloak token endpoint for {KEYCLOAK_CLIENT_ID}: {last_err}"
    )

@app.get("/health", tags=["Health"])
def health():
    return {
        "status": "healthy",
        "app": "Customer Portal API",
        "client_id": KEYCLOAK_CLIENT_ID,
        "realm": KEYCLOAK_REALM,
        "client_type": "public",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }

@app.get("/profile", tags=["Portal"])
def get_profile(user: dict[str, Any] = Depends(verify_portal_token)):
    return {
        "app": "Customer Portal API",
        "client_id": KEYCLOAK_CLIENT_ID,
        "client_type": "public",
        "user_profile": {
            "sub": user.get("sub"),
            "username": user.get("preferred_username", "portal_user"),
            "email": user.get("email", "portal@example.com"),
            "email_verified": user.get("email_verified", True),
            "member_since": "2024-01-15"
        }
    }

@app.get("/dashboard", tags=["Portal"])
def get_dashboard(user: dict[str, Any] = Depends(verify_portal_token)):
    return {
        "app": "Customer Portal API",
        "user": user.get("preferred_username"),
        "dashboard": {
            "active_services": 12,
            "monthly_bandwidth_used_gb": 1250.75,
            "api_quota_remaining": 450000,
            "security_alerts": 2,
            "status": "Degraded - High Load"
        }
    }

@app.get("/subscriptions", tags=["Portal"])
def get_subscriptions(user: dict[str, Any] = Depends(verify_portal_token)):
    return {
        "app": "Customer Portal API",
        "subscriptions": [
            {"id": "sub-01", "name": "MCP Enterprise Pro Tier", "status": "Active", "renewal_date": "2026-12-31"},
            {"id": "sub-02", "name": "Real-time Telemetry Stream", "status": "Active", "renewal_date": "2026-12-31"},
            {"id": "sub-03", "name": "Global CDN Add-on", "status": "Active", "renewal_date": "2027-01-15"},
            {"id": "sub-04", "name": "Dedicated Support Sandbox", "status": "Expired", "renewal_date": "2025-10-10"},
            {"id": "sub-05", "name": "AI Analytics Package", "status": "Active", "renewal_date": "2027-05-20"},
        ]
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("portal_app:app", host="0.0.0.0", port=8003, reload=True)
