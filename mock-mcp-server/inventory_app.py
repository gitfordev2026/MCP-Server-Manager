"""
Inventory & Supply Chain API — Simulated FastAPI App 1
======================================================
Keycloak Client: adm-client (Confidential Client)
Keycloak Realm: mcp-realm
"""

from __future__ import annotations

import os
import datetime
import logging
from typing import Any

import httpx
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

load_dotenv()

logger = logging.getLogger("inventory_app")

KEYCLOAK_SERVER_URL = os.getenv("KEYCLOAK_SERVER_URL", "http://host.docker.internal:8080").rstrip("/")
KEYCLOAK_REALM = os.getenv("KEYCLOAK_REALM", "mcp-realm")
KEYCLOAK_CLIENT_ID = os.getenv("INVENTORY_KEYCLOAK_CLIENT_ID", os.getenv("KEYCLOAK_CLIENT_ID", "adm-client"))
KEYCLOAK_CLIENT_SECRET = os.getenv("INVENTORY_KEYCLOAK_CLIENT_SECRET", os.getenv("KEYCLOAK_CLIENT_SECRET", ""))
REQUIRE_AUTH = os.getenv("REQUIRE_AUTH", "true").lower() in ("true", "1", "yes")

security_scheme = HTTPBearer(auto_error=False)

async def verify_inventory_token(
    credentials: HTTPAuthorizationCredentials | None = Depends(security_scheme)
) -> dict[str, Any]:
    if not REQUIRE_AUTH:
        return {"sub": "anonymous", "client_id": KEYCLOAK_CLIENT_ID, "auth_status": "disabled"}

    if not credentials or not credentials.credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing Authorization header or Bearer token for Inventory App",
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
    title="Inventory & Supply Chain API",
    description=f"Simulated Confidential Client App (Client: {KEYCLOAK_CLIENT_ID}, Realm: {KEYCLOAK_REALM})",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_inventory_items: dict[str, dict] = {
    "inv-101": {"id": "inv-101", "name": "Server Rack Cabinet 42U", "quantity": 14, "warehouse": "A-12", "unit_price": 1200.0},
    "inv-102": {"id": "inv-102", "name": "Fiber Optic Patch Cable 10m", "quantity": 350, "warehouse": "B-04", "unit_price": 25.5},
    "inv-103": {"id": "inv-103", "name": "Gigabit Ethernet Switch 48-Port", "quantity": 28, "warehouse": "A-08", "unit_price": 850.0},
    "inv-104": {"id": "inv-104", "name": "UPS Battery Backup 1500VA", "quantity": 42, "warehouse": "C-01", "unit_price": 150.0},
    "inv-105": {"id": "inv-105", "name": "Cat6 Ethernet Cable 1000ft", "quantity": 12, "warehouse": "B-15", "unit_price": 115.0},
    "inv-106": {"id": "inv-106", "name": "Wireless Access Point WiFi 6", "quantity": 65, "warehouse": "A-02", "unit_price": 299.99},
}

class UserLoginRequest(BaseModel):
    username: str
    password: str

class CreateItemRequest(BaseModel):
    name: str
    quantity: int
    warehouse: str
    unit_price: float

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
        "app": "Inventory & Supply Chain API",
        "client_id": KEYCLOAK_CLIENT_ID,
        "realm": KEYCLOAK_REALM,
        "client_type": "confidential",
        "timestamp": datetime.datetime.now(datetime.UTC).isoformat() + "Z"
    }

@app.get("/items", tags=["Inventory"])
def list_items(user: dict[str, Any] = Depends(verify_inventory_token)):
    return {
        "app": "Inventory & Supply Chain API",
        "client_id": KEYCLOAK_CLIENT_ID,
        "authenticated_as": user.get("preferred_username") or user.get("sub"),
        "total": len(_inventory_items),
        "items": list(_inventory_items.values())
    }

@app.get("/items/{item_id}", tags=["Inventory"])
def get_item(item_id: str, user: dict[str, Any] = Depends(verify_inventory_token)):
    item = _inventory_items.get(item_id)
    if not item:
        raise HTTPException(404, f"Inventory item '{item_id}' not found")
    return {"item": item, "authenticated_as": user.get("preferred_username")}

@app.post("/items", status_code=201, tags=["Inventory"])
def create_item(req: CreateItemRequest, user: dict[str, Any] = Depends(verify_inventory_token)):
    iid = f"inv-{len(_inventory_items) + 101}"
    item = {
        "id": iid,
        "name": req.name,
        "quantity": req.quantity,
        "warehouse": req.warehouse,
        "unit_price": req.unit_price,
    }
    _inventory_items[iid] = item
    return {"item": item, "created_by": user.get("preferred_username")}

if __name__ == "__main__":
    import uvicorn
    port = int(os.getenv("PORT", 8002))
    uvicorn.run("inventory_app:app", host="0.0.0.0", port=port, reload=True)
