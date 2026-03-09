from typing import Any, Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select

from app.core.auth import AUTH_ENABLED
from app.core.jwt_validator import TokenValidationError, validate_token

ROLE_PERMISSION_FALLBACK: dict[str, set[str]] = {
    "super_admin": {"*"},
    "admin": {
        "dashboard:view",
        "application:manage",
        "mcp_server:manage",
        "tool:manage",
        "endpoint:manage",
        "policy:manage",
        "audit:view",
    },
    "operator": {
        "dashboard:view",
        "tool:manage",
        "endpoint:manage",
        "policy:manage",
        "audit:view",
    },
    "read_only": {
        "dashboard:view",
        "audit:view",
    },
}


def _parse_roles(raw_value: str | None) -> list[str]:
    if not raw_value:
        return []
    return [item.strip().lower() for item in raw_value.split(",") if item.strip()]


def _extract_bearer_token(request: Request) -> str | None:
    """Extract the raw JWT from an ``Authorization: Bearer <token>`` header."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        return auth_header[7:].strip()
    return None


def get_request_actor(request: Request) -> dict[str, Any]:
    # Return cached actor if already validated in this request cycle
    # (avoids double-validation when both the global dependency and
    # router-level require_permission call get_request_actor).
    cached = getattr(request.state, "_validated_actor", None)
    if cached is not None:
        return cached

    if not AUTH_ENABLED:
        # Dev mode — trust headers as before.
        username = (request.headers.get("x-user") or "system").strip() or "system"
        roles = _parse_roles(request.headers.get("x-roles"))
        if not roles:
            roles = ["super_admin"]
        return {"username": username, "roles": roles}

    # --- AUTH_ENABLED=true: require a valid JWT ---
    token = _extract_bearer_token(request)
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    try:
        claims = validate_token(token)
    except TokenValidationError as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=str(exc),
            headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
        )

    roles = claims.roles if claims.roles else ["read_only"]

    actor = {
        "username": claims.username,
        "roles": roles,
        "email": claims.email,
        "subject": claims.subject,
    }

    # Cache on request so subsequent calls in the same cycle are free.
    request.state._validated_actor = actor
    return actor


def build_require_permission(
    session_local_factory,
    role_model,
    permission_model,
    role_permission_model,
) -> Callable[[str], Callable[[dict[str, Any]], dict[str, Any]]]:
    def require_permission(permission_code: str):
        def _check(actor: dict[str, Any] = Depends(get_request_actor)) -> dict[str, Any]:
            roles = [str(r).lower() for r in actor.get("roles", [])]
            if not roles:
                raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="No roles assigned")
            if "super_admin" in roles:
                return actor

            # Fallback quick check.
            for role_name in roles:
                perms = ROLE_PERMISSION_FALLBACK.get(role_name, set())
                if "*" in perms or permission_code in perms:
                    return actor

            with session_local_factory() as db:
                role_rows = db.scalars(select(role_model).where(role_model.name.in_(roles))).all()
                if not role_rows:
                    raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Role not recognized")

                permission = db.scalar(
                    select(permission_model).where(permission_model.code == permission_code)
                )
                if not permission:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Permission '{permission_code}' is not configured",
                    )

                role_ids = [row.id for row in role_rows]
                allowed_count = db.scalar(
                    select(func.count())
                    .select_from(role_permission_model)
                    .where(
                        role_permission_model.role_id.in_(role_ids),
                        role_permission_model.permission_id == permission.id,
                    )
                )
                if int(allowed_count or 0) <= 0:
                    raise HTTPException(
                        status_code=status.HTTP_403_FORBIDDEN,
                        detail=f"Missing permission '{permission_code}'",
                    )
            return actor

        return _check

    return require_permission
