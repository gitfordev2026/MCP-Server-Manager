from time import perf_counter

import httpx
from fastapi import APIRouter
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

        if auth_enabled and issuer:
            discovery_url = f"{issuer}/.well-known/openid-configuration"
            try:
                async with httpx.AsyncClient(timeout=5.0, follow_redirects=True) as client:
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
    def auth_config() -> dict[str, object]:
        keycloak_url = ENV.keycloak_server_url
        realm = ENV.keycloak_realm
        oidc_base = f"{keycloak_url}/realms/{realm}/protocol/openid-connect" if keycloak_url and realm else ""

        return {
            "auth_enabled": AUTH_ENABLED,
            "keycloak_url": keycloak_url,
            "realm": realm,
            "client_id": KEYCLOAK_CLIENT_ID,
            "authorization_endpoint": f"{oidc_base}/auth" if oidc_base else "",
            "token_endpoint": f"{oidc_base}/token" if oidc_base else "",
            "logout_endpoint": f"{oidc_base}/logout" if oidc_base else "",
        }

    return router
