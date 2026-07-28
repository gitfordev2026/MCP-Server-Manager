from time import perf_counter
from typing import Any

import httpx
from fastapi import APIRouter, Request, Response
from sqlalchemy import text

from app.core.auth import (
    AUTH_ENABLED,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_ISSUER,
    KEYCLOAK_VERIFY_AUD,
)
from app.core.cache import cache_health_status
from app.core.db import engine
from app.env import ENV


from app.core.rate_limiter import limiter


def create_health_router(db_backend: str, auth_enabled: bool, issuer: str, audience_check: bool) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/health",
        summary="Health Check",
        description="Service health and auth/db runtime flags. Source: backend/app/routers/health.py",
    )
    async def health() -> dict[str, object]:
        started = perf_counter()
        systems: list[dict[str, object]] = []

        db_name = "PostgreSQL DB" if db_backend == "postgresql" else "SQLite DB"
        try:
            with engine.connect() as conn:
                conn.execute(text("SELECT 1"))
            systems.append(
                {
                    "name": db_name,
                    "key": "database",
                    "status": "up",
                    "ok": True,
                    "detail": f"{db_backend} connection healthy",
                }
            )
        except Exception as exc:
            systems.append(
                {
                    "name": db_name,
                    "key": "database",
                    "status": "down",
                    "ok": False,
                    "detail": str(exc),
                }
            )

        redis_status = cache_health_status()
        redis_status["key"] = "redis"
        systems.append(redis_status)

        if auth_enabled:
            server_url = ENV.keycloak_server_url or (issuer.rsplit('/realms/', 1)[0] if '/realms/' in issuer else issuer)
            realm = ENV.keycloak_realm
            discovery_url = f"{server_url}/realms/{realm}/.well-known/openid-configuration" if realm else f"{issuer}/.well-known/openid-configuration"
            try:
                async with httpx.AsyncClient(timeout=5.0, follow_redirects=True, verify=ENV.keycloak_verify_ssl) as client:
                    response = await client.get(discovery_url)
                if response.is_success:
                    systems.append(
                        {
                            "name": "Keycloak",
                            "key": "keycloak",
                            "status": "up",
                            "ok": True,
                            "detail": f"OIDC discovery reachable at {discovery_url}",
                        }
                    )
                else:
                    systems.append(
                        {
                            "name": "Keycloak",
                            "key": "keycloak",
                            "status": "down",
                            "ok": False,
                            "detail": f"OIDC discovery returned HTTP {response.status_code}",
                        }
                    )
            except Exception as exc:
                systems.append(
                    {
                        "name": "Keycloak",
                        "key": "keycloak",
                        "status": "down",
                        "ok": False,
                        "detail": str(exc),
                    }
                )
        else:
            systems.append(
                {
                    "name": "Keycloak",
                    "key": "keycloak",
                    "status": "disabled",
                    "ok": False,
                    "detail": "Authentication is disabled or Keycloak is not configured",
                }
            )

        systems.insert(
            0,
            {
                "name": "Backend API",
                "key": "backend",
                "status": "up",
                "ok": True,
                "detail": "FastAPI service is responding",
            },
        )

        has_down = any(item["status"] == "down" for item in systems)
        has_disabled = any(item["status"] == "disabled" for item in systems)
        overall_status = "down" if has_down else "degraded" if has_disabled else "ok"

        return {
            "status": overall_status,
            "db_backend": db_backend,
            "auth_enabled": auth_enabled,
            "issuer": issuer,
            "audience_check": audience_check,
            "systems": systems,
            "response_time_ms": round((perf_counter() - started) * 1000),
        }

    @router.get(
        "/auth/config",
        summary="Auth Configuration",
        description="Public endpoint returning Keycloak OIDC configuration for the frontend.",
    )
    def auth_config(request: Request) -> dict[str, object]:
        keycloak_url = ENV.keycloak_frontend_url or ENV.keycloak_server_url
        realm = ENV.keycloak_realm
        oidc_base = f"{keycloak_url}/realms/{realm}/protocol/openid-connect" if keycloak_url and realm else ""

        base_url = str(request.base_url).rstrip("/")
        
        return {
            "auth_enabled": AUTH_ENABLED,
            "keycloak_url": keycloak_url,
            "realm": realm,
            "client_id": KEYCLOAK_CLIENT_ID,
            "client_secret": "",
            "authorization_endpoint": f"{oidc_base}/auth" if oidc_base else "",
            "token_endpoint": f"{base_url}/auth/token" if oidc_base else "",
            "logout_endpoint": f"{base_url}/auth/logout" if oidc_base else "",
        }

    @router.post(
        "/auth/token",
        summary="Proxy Token Exchange",
        description="Proxies token exchange to Keycloak and sets secure HttpOnly cookies.",
    )
    @limiter.limit(ENV.rate_limit_auth)
    async def auth_token_proxy(request: Request, response: Response) -> Any:
        form = await request.form()
        data = dict(form)
        data["client_secret"] = ENV.keycloak_client_secret
        
        keycloak_url = ENV.keycloak_server_url
        realm = ENV.keycloak_realm
        token_endpoint = f"{keycloak_url}/realms/{realm}/protocol/openid-connect/token"

        async with httpx.AsyncClient() as client:
            resp = await client.post(token_endpoint, data=data)
            
            if resp.status_code != 200:
                # If error, return the raw error to frontend
                return Response(
                    content=resp.content,
                    status_code=resp.status_code,
                    media_type=resp.headers.get("content-type", "application/json")
                )

            # Success: Parse tokens and set HttpOnly cookies
            token_data = resp.json()
            access_token = token_data.get("access_token")
            refresh_token = token_data.get("refresh_token")
            expires_in = token_data.get("expires_in", 3600)
            
            # Secure cookie attributes
            # In a production environment behind HTTPS, you should use secure=True
            cookie_kwargs = {
                "httponly": True,
                "samesite": "lax",
                "max_age": expires_in,
                "path": "/"
            }
            
            if access_token:
                response.set_cookie(key="access_token", value=access_token, **cookie_kwargs)
            if refresh_token:
                # Refresh tokens usually last longer, so use their specific expiry if available
                refresh_expires = token_data.get("refresh_expires_in", 30 * 24 * 3600)
                refresh_kwargs = {**cookie_kwargs, "max_age": refresh_expires}
                response.set_cookie(key="refresh_token", value=refresh_token, **refresh_kwargs)
            
            # Return sanitized payload to frontend (NO tokens exposed!)
            return {
                "authenticated": True,
                "expires_in": expires_in
            }

    @router.get(
        "/auth/logout",
        summary="Proxy Logout",
        description="Revokes Keycloak tokens, terminates Keycloak session, clears HttpOnly cookies, and redirects.",
    )
    async def auth_logout_proxy(request: Request, client_id: str = "", post_logout_redirect_uri: str = "") -> Response:
        keycloak_url = ENV.keycloak_server_url or ENV.keycloak_frontend_url
        realm = ENV.keycloak_realm
        oidc_base = f"{keycloak_url}/realms/{realm}/protocol/openid-connect"
        
        access_token = request.cookies.get("access_token") or request.cookies.get("mcp_access_token")
        refresh_token = request.cookies.get("refresh_token")
        
        cid = client_id or ENV.keycloak_client_id
        csec = ENV.keycloak_client_secret

        # 1. Invalidate tokens with Keycloak via RFC 7009 Token Revocation endpoint
        if refresh_token or access_token:
            revoke_url = f"{oidc_base}/revoke"
            async with httpx.AsyncClient(timeout=4.0, verify=False) as client:
                for tok in (refresh_token, access_token):
                    if tok:
                        data = {"client_id": cid, "token": tok}
                        if csec:
                            data["client_secret"] = csec
                        try:
                            await client.post(revoke_url, data=data)
                        except Exception:
                            pass

        # 2. Build Keycloak end-session logout URL
        from urllib.parse import urlencode
        from fastapi.responses import RedirectResponse
        
        params = {}
        if cid:
            params["client_id"] = cid
        if post_logout_redirect_uri:
            params["post_logout_redirect_uri"] = post_logout_redirect_uri
        if refresh_token:
            params["refresh_token"] = refresh_token
            
        logout_url = f"{oidc_base}/logout?{urlencode(params)}" if params else f"{oidc_base}/logout"
        
        response = RedirectResponse(url=logout_url)
        response.delete_cookie("access_token", path="/")
        response.delete_cookie("mcp_access_token", path="/")
        response.delete_cookie("refresh_token", path="/")
        return response

    return router
