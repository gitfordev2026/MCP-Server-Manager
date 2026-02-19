from typing import Any, Callable

from fastapi import Depends, HTTPException, Request, status
from sqlalchemy import func, select

from backend.app.core.auth import AUTH_ENABLED

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


def get_request_actor(request: Request) -> dict[str, Any]:
    username = (request.headers.get("x-user") or "system").strip() or "system"
    roles = _parse_roles(request.headers.get("x-roles"))
    if not roles:
        roles = ["read_only"] if AUTH_ENABLED else ["super_admin"]
    return {"username": username, "roles": roles}


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

