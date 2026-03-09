from fastapi import APIRouter

from app.core.auth import (
    AUTH_ENABLED,
    KEYCLOAK_CLIENT_ID,
    KEYCLOAK_ISSUER,
    KEYCLOAK_VERIFY_AUD,
)
from app.env import ENV


def create_health_router(db_backend: str, auth_enabled: bool, issuer: str, audience_check: bool) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/health",
        summary="Health Check",
        description="Service health and auth/db runtime flags. Source: backend/app/routers/health.py",
    )
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "db_backend": db_backend,
            "auth_enabled": auth_enabled,
            "issuer": issuer,
            "audience_check": audience_check,
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
