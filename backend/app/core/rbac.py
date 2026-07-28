import os
from typing import Any, Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select

from app.core.auth import AUTH_ENABLED
from app.core.jwt_validator import TokenValidationError, validate_token
from app.env import ENV
from app.core.logger import get_logger


logger = get_logger(__name__)

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
    """Extract the raw JWT from Authorization header or HTTP cookies."""
    auth_header = request.headers.get("authorization", "")
    if auth_header.lower().startswith("bearer "):
        raw = auth_header[7:].strip()
        # Reject the placeholder "[SECURE_COOKIE]" injected by earlier buggy
        # frontend code — it's not a real JWT.
        if raw and raw != "[SECURE_COOKIE]":
            return raw

    # HttpOnly cookie is the primary auth mechanism
    cookie_token = request.cookies.get("access_token") or request.cookies.get("mcp_access_token")
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    return None


def get_request_actor(request: Request) -> dict[str, Any]:
    # Return cached actor if already validated in this request cycle
    # (avoids double-validation when both the global dependency and
    # router-level require_permission call get_request_actor).
    cached = getattr(request.state, "_validated_actor", None)
    if cached is not None:
        return cached

    if not AUTH_ENABLED:
        username = (request.headers.get("x-user") or "system").strip() or "system"
        roles = _parse_roles(request.headers.get("x-roles"))
        if not roles:
            roles = ["admin"]
        primary = resolve_primary_role(roles) or "admin"
        return {"username": username, "roles": roles, "primary_role": primary, "subject": username, "sub": username, "email": f"{username}@local"}

    # --- AUTH_ENABLED=true: require a valid JWT ---
    token = _extract_bearer_token(request)

    # Allow X-User header fallback in testing/dev environments (for test suites)
    is_test_env = os.getenv("ENV", "development").lower() in {"dev", "development", "testing", "test"}
    x_user_header = request.headers.get("x-user", "").strip()

    if not token and not (is_test_env and x_user_header):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Missing authentication token",
            headers={"WWW-Authenticate": "Bearer"},
        )

    username = None
    sub = None

    if token:
        try:
            claims = validate_token(token)
            username = claims.username
            sub = claims.subject
        except TokenValidationError as exc:
            # In test/dev, fall back to X-User header if token validation fails
            if is_test_env and x_user_header:
                username = x_user_header
                sub = f"sub-{username}"
            else:
                raise HTTPException(
                    status_code=status.HTTP_401_UNAUTHORIZED,
                    detail=str(exc),
                    headers={"WWW-Authenticate": 'Bearer error="invalid_token"'},
                )
    elif is_test_env and x_user_header:
        # No token but X-User header present in test/dev mode
        username = x_user_header
        sub = f"sub-{username}"

    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not resolve user identity",
        )

    # --- Fetch application role exclusively from Database UserModel table ---
    # Match by username (case-insensitive) OR by keycloak_sub.
    # On first login, update keycloak_sub if it was a placeholder.
    db_role = ""
    try:
        from app.core.db import SessionLocal
        from app.models.db_models import UserModel

        with SessionLocal() as db:
            # Try matching by username first (primary key for identity)
            user_row = db.scalar(
                select(UserModel).where(
                    func.lower(UserModel.username) == username.lower()
                )
            )
            # Fallback: try matching by keycloak_sub
            if not user_row and sub:
                user_row = db.scalar(
                    select(UserModel).where(UserModel.keycloak_sub == sub)
                )

            if user_row:
                # Update keycloak_sub if it was a placeholder or different
                if sub and user_row.keycloak_sub != sub:
                    user_row.keycloak_sub = sub
                    db.commit()
                db_role = (user_row.role or "").strip().lower()
            elif username:
                # Auto-provision user on first Keycloak authentication.
                # If database has zero users, automatically assign 'admin' role;
                # otherwise default to 'developer'.
                total_users = db.scalar(select(func.count(UserModel.id))) or 0
                assigned_role = "admin" if total_users == 0 else "developer"
                try:
                    new_user = UserModel(
                        username=username,
                        keycloak_sub=sub or f"sub-{username}",
                        role=assigned_role,
                    )
                    db.add(new_user)
                    db.commit()
                    db.refresh(new_user)
                    db_role = assigned_role
                    logger.info(f"[Auto-Provision] Auto-registered user '{username}' with role '{assigned_role}' (total_users before insert: {total_users})")
                except Exception as exc:
                    db.rollback()
                    user_row = db.scalar(select(UserModel).where(func.lower(UserModel.username) == username.lower()))
                    if user_row:
                        db_role = (user_row.role or "").strip().lower()
                    else:
                        db_role = "developer"
            elif x_user_header and not token:
                # Only for unit test suite using X-User header without JWT
                db_role = "admin" if (username and username.lower() == "admin") or request.headers.get("x-roles") == "super_admin" else "developer"

    except Exception as exc:
        logger.warning(f"Database role lookup error: {exc}")

    primary_role = resolve_primary_role([db_role]) if db_role else None

    if not primary_role:
        logger.warning(f"Access denied for user {username} ({sub}): No DB role assigned")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="No application role assigned. Contact Support and Application Owner to request access.",
        )

    actor = {
        "username": username,
        "roles": [primary_role],
        "primary_role": primary_role,
        "subject": sub,
        "sub": sub,
    }
    request.state._validated_actor = actor
    return actor


def resolve_primary_role(roles: list[str]) -> str | None:
    norm_roles = [r.lower() for r in roles]
    if "admin" in norm_roles or "super_admin" in norm_roles:
        return "admin"
    if "developer" in norm_roles or "dev" in norm_roles or "operator" in norm_roles:
        return "developer"
    return None


def verify_resource_ownership(resource_created_by_user_id: str | None, actor: dict[str, Any]) -> bool:
    role = actor.get("primary_role") or "developer"
    roles = [r.lower() for r in actor.get("roles", [])]
    if role == "admin" or "admin" in roles or "super_admin" in roles:
        return True

    sub = actor.get("subject") or actor.get("sub") or actor.get("username")
    if not resource_created_by_user_id or resource_created_by_user_id == sub:
        return True

    raise HTTPException(
        status_code=status.HTTP_403_FORBIDDEN,
        detail="Access denied: You do not own this resource.",
    )


def require_role(allowed_roles: list[str]):
    def _check(actor: dict[str, Any] = Depends(get_request_actor)) -> dict[str, Any]:
        role = actor.get("primary_role")
        if role not in allowed_roles and "admin" not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Required role: {allowed_roles}. Your role: {role}",
            )
        return actor
    return _check


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
