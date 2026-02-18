from fastapi import APIRouter


def create_health_router(db_backend: str, auth_enabled: bool, issuer: str, audience_check: bool) -> APIRouter:
    router = APIRouter()

    @router.get("/health")
    def health() -> dict[str, object]:
        return {
            "status": "ok",
            "db_backend": db_backend,
            "auth_enabled": auth_enabled,
            "issuer": issuer,
            "audience_check": audience_check,
        }

    return router
