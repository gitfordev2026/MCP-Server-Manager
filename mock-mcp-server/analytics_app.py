"""
Analytics & Reporting API — Simulated FastAPI App 3
====================================================
Keycloak Client: ops-client (Confidential Client)
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

logger = logging.getLogger("analytics_app")

KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://10.139.10.176:8080").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "IAF")
KEYCLOAK_CLIENT_ID = os.getenv("ANALYTICS_KEYCLOAK_CLIENT_ID", os.getenv("KEYCLOAK_CLIENT_ID", "mcp-client-secure"))
KEYCLOAK_CLIENT_SECRET = os.getenv("ANALYTICS_KEYCLOAK_CLIENT_SECRET", os.getenv("KEYCLOAK_CLIENT_SECRET", "oORQ1ynZJoiCRduW6aMVqpYq4BFgkPP27f7LMqHbwRUCxviUGzuHGQG9xulwqLXHeRfJASDx1wV3KEsoaT8xyB"))
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() in ("true", "1", "yes")

security_scheme = HTTPBearer(auto_error=False)

async def verify_analytics_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme)
) -> dict[str, Any]:
    if not REQUIRE_AUTH:
        return {"sub": "anonymous", "client_id": KEYCLOAK_CLIENT_ID, "auth_status": "disabled"}

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header or Bearer token for Analytics App",
            headers={"WWW-Authenticate": "Bearer"},
        )

    token = credentials.credentials
    userinfo_endpoint = f"{KEYCLOAK_SERVER_URL}/realms/{KEYCLOAK_REALM}/protocol/openid-connect/userinfo"

    urls_to_try = [
        userinfo_endpoint,
        userinfo_endpoint.replace("host.docker.internal", "localhost"),
        userinfo_endpoint.replace("host.docker.internal", "developer-api-keycloak-1"),
        userinfo_endpoint.replace("localhost", "developer-api-keycloak-1"),
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

    # Fallback for M2M (client_credentials) tokens where Keycloak /userinfo returns 401:
    try:
        payload = jwt.decode(token, options={"verify_signature": False})
        if payload.get("iss") and f"/realms/{KEYCLOAK_REALM}" in payload["iss"]:
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
    title="Analytics & Reporting API",
    description=f"Simulated Confidential Client App (Client: {KEYCLOAK_CLIENT_ID}, Realm: {KEYCLOAK_REALM})",
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

@app.get("/auth/m2m-token", tags=["Auth"])
@app.get("/auth/client-token", tags=["Auth"])
@app.get("/auth/token", tags=["Auth"])
@app.get("/token", tags=["Auth"])
@app.post("/auth/token", tags=["Auth"])
@app.post("/token", tags=["Auth"])
@app.post("/auth/client-token", tags=["Auth"])
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
        "app": "Analytics & Reporting API",
        "client_id": KEYCLOAK_CLIENT_ID,
        "realm": KEYCLOAK_REALM,
        "client_type": "confidential",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }

@app.get("/metrics", tags=["Analytics"])
def get_metrics(user: dict[str, Any] = Depends(verify_analytics_token)):
    return {
        "app": "Analytics & Reporting API",
        "client_id": KEYCLOAK_CLIENT_ID,
        "authenticated_as": user.get("preferred_username") or user.get("sub"),
        "metrics": {
            "requests_per_second": 1845,
            "avg_latency_ms": 11.2,
            "error_rate_pct": 0.008,
            "cpu_utilization_pct": 28.5,
            "memory_utilization_pct": 52.1
        }
    }

@app.get("/reports", tags=["Analytics"])
def get_reports(user: dict[str, Any] = Depends(verify_analytics_token)):
    return {
        "app": "Analytics & Reporting API",
        "reports": [
            {"id": "rep-901", "title": "Q3 Infrastructure Efficiency Report", "status": "Final", "generated_by": user.get("preferred_username")},
            {"id": "rep-902", "title": "Security & Compliance Audit 2026", "status": "In-Progress", "generated_by": user.get("preferred_username")},
            {"id": "rep-903", "title": "Annual Marketing Spend Analysis", "status": "Final", "generated_by": user.get("preferred_username")},
            {"id": "rep-904", "title": "Customer Retention Metrics Q1-Q2", "status": "Draft", "generated_by": user.get("preferred_username")},
            {"id": "rep-905", "title": "Platform Reliability and Uptime", "status": "Final", "generated_by": user.get("preferred_username")},
        ]
    }

@app.get("/logs", tags=["Analytics"])
def get_telemetry_logs(user: dict[str, Any] = Depends(verify_analytics_token)):
    return {
        "app": "Analytics & Reporting API",
        "logs": [
            {"timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z", "level": "INFO", "message": "Keycloak token validated successfully"},
            {"timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z", "level": "INFO", "message": "Telemetry stream synced"},
            {"timestamp": (datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=5)).isoformat() + "Z", "level": "WARN", "message": "High memory usage detected on node worker-04"},
            {"timestamp": (datetime.datetime.now(datetime.UTC) - datetime.timedelta(minutes=15)).isoformat() + "Z", "level": "INFO", "message": "Scheduled background job completed"},
            {"timestamp": (datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=1)).isoformat() + "Z", "level": "ERROR", "message": "Failed to connect to primary database cluster, retrying..."},
            {"timestamp": (datetime.datetime.now(datetime.UTC) - datetime.timedelta(hours=1, minutes=1)).isoformat() + "Z", "level": "INFO", "message": "Database failover triggered successfully"},
        ]
    }

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8004))
    uvicorn.run("analytics_app:app", host="0.0.0.0", port=port, reload=True)
