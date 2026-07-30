"""Admin User Management & Current User Profile Router.

Endpoints:
- GET /api/me: Get current authenticated user profile and assigned primary role
- GET /api/admin/users: List all registered users (Admin only)
- POST /api/admin/users: Create/Register a user with an assigned role (Admin only)
- PUT /api/admin/users/{user_id}/role: Update user role (Admin only)
- PATCH /api/admin/users/{user_id}: Edit user (Admin only)
- DELETE /api/admin/users/{user_id}: Delete user (Admin only)
"""

from __future__ import annotations

from typing import Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select

from app.core.rbac import get_request_actor, require_role
from app.models.db_models import UserModel
from app.core.logger import get_logger

logger = get_logger(__name__)


class RoleUpdateRequest(BaseModel):
    role: str  # "admin" or "developer"


class CreateUserRequest(BaseModel):
    username: str
    role: str = "developer"  # "admin" or "developer"


def create_admin_users_router(session_local_factory) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/api/me",
        summary="Current User Profile",
        description="Returns profile information and assigned primary role for the current user.",
    )
    def get_me(actor: dict[str, Any] = Depends(get_request_actor)) -> dict[str, Any]:
        is_prod = any(
            os.getenv(k, "").strip().lower() in ("production", "prod")
            for k in ("ENV", "ENVIRONMENT", "APP_ENV", "NODE_ENV")
        ) or os.getenv("MINIMIZE_USER_DATA", "false").strip().lower() in ("true", "1", "yes")

        data: dict[str, Any] = {
            "username": actor.get("username"),
            "roles": actor.get("roles", []),
            "primary_role": actor.get("primary_role"),
        }
        if not is_prod:
            data["sub"] = actor.get("subject") or actor.get("sub")
        return data

    @router.get(
        "/api/admin/users",
        summary="List Users (Admin Only)",
        description="List all registered users and their assigned application roles.",
    )
    def list_users(
        actor: dict[str, Any] = Depends(require_role(["admin"])),
    ) -> dict[str, list[dict[str, Any]]]:
        with session_local_factory() as db:
            user_rows = db.scalars(select(UserModel).order_by(UserModel.created_on.desc())).all()
            
            users_data = [
                {
                    "id": row.id,
                    "keycloak_sub": row.keycloak_sub or f"sub-{row.username}",
                    "username": row.username,
                    "role": row.role,
                    "created_on": row.created_on.isoformat() if row.created_on else "",
                }
                for row in user_rows
            ]

            if not users_data:
                users_data = [
                    {
                        "id": 1,
                        "keycloak_sub": "sub-admin-01",
                        "username": "admin",
                        "role": "admin",
                        "created_on": "2026-01-01T00:00:00",
                    },
                ]

            return {"users": users_data}

    @router.put(
        "/api/admin/users/{user_id}/role",
        summary="Update User Role (Admin Only)",
        description="Updates the application role for a user (admin or developer).",
    )
    def update_user_role(
        user_id: str,
        payload: RoleUpdateRequest,
        actor: dict[str, Any] = Depends(require_role(["admin"])),
    ) -> dict[str, Any]:
        target_role = payload.role.strip().lower()
        if target_role not in {"admin", "developer"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Invalid role. Target role must be 'admin' or 'developer'.",
            )

        with session_local_factory() as db:
            user_row = None
            if user_id.isdigit():
                user_row = db.scalar(select(UserModel).where(UserModel.id == int(user_id)))
            if not user_row:
                user_row = db.scalar(select(UserModel).where(UserModel.keycloak_sub == user_id))
            if not user_row:
                user_row = db.scalar(select(UserModel).where(UserModel.username == user_id))

            if user_row:
                user_row.role = target_role
                db.commit()
                logger.info(f"[Admin] User {user_row.username} role updated to '{target_role}' by {actor.get('username')}")
                return {
                    "status": "success",
                    "user_id": user_id,
                    "username": user_row.username,
                    "new_role": target_role,
                }
            else:
                new_user = UserModel(
                    username=user_id,
                    keycloak_sub=user_id,
                    role=target_role,
                )
                db.add(new_user)
                db.commit()
                return {
                    "status": "success",
                    "user_id": user_id,
                    "username": user_id,
                    "new_role": target_role,
                }

    @router.post(
        "/api/admin/users",
        summary="Add New User (Admin Only)",
        description="Register a new user in the database matching Keycloak username and assign an application role.",
    )
    def create_user(
        payload: CreateUserRequest,
        actor: dict[str, Any] = Depends(require_role(["admin"])),
    ) -> dict[str, Any]:
        username = payload.username.strip()
        if not username:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Username cannot be empty.",
            )
        role = payload.role.strip().lower()
        if role not in {"admin", "developer"}:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Role must be 'admin' or 'developer'.",
            )

        with session_local_factory() as db:
            existing = db.scalar(select(UserModel).where(UserModel.username == username))
            if existing:
                existing.role = role
                db.commit()
                db.refresh(existing)
                return {
                    "status": "updated",
                    "id": existing.id,
                    "username": existing.username,
                    "role": existing.role,
                }

            new_user = UserModel(
                username=username,
                keycloak_sub=f"sub-{username}",
                role=role,
            )
            db.add(new_user)
            db.commit()
            db.refresh(new_user)
            logger.info(f"[Admin] Registered user {username} with role '{role}' by {actor.get('username')}")

            return {
                "status": "created",
                "id": new_user.id,
                "username": new_user.username,
                "role": new_user.role,
            }

    @router.patch(
        "/api/admin/users/{user_id}",
        summary="Edit User (Admin Only)",
        description="Updates username or role of an existing user in database.",
    )
    def edit_user(
        user_id: str,
        payload: CreateUserRequest,
        actor: dict[str, Any] = Depends(require_role(["admin"])),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            user_row = None
            if user_id.isdigit():
                user_row = db.scalar(select(UserModel).where(UserModel.id == int(user_id)))
            if not user_row:
                user_row = db.scalar(select(UserModel).where(UserModel.username == user_id))

            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")

            if payload.username and payload.username.strip():
                user_row.username = payload.username.strip()
            if payload.role and payload.role.strip().lower() in {"admin", "developer"}:
                user_row.role = payload.role.strip().lower()

            db.commit()
            db.refresh(user_row)
            return {
                "status": "success",
                "id": user_row.id,
                "username": user_row.username,
                "role": user_row.role,
            }

    @router.delete(
        "/api/admin/users/{user_id}",
        summary="Delete User (Admin Only)",
        description="Deletes a user record from the database.",
    )
    def delete_user(
        user_id: str,
        actor: dict[str, Any] = Depends(require_role(["admin"])),
    ) -> dict[str, Any]:
        with session_local_factory() as db:
            user_row = None
            if user_id.isdigit():
                user_row = db.scalar(select(UserModel).where(UserModel.id == int(user_id)))
            if not user_row:
                user_row = db.scalar(select(UserModel).where(UserModel.username == user_id))

            if not user_row:
                raise HTTPException(status_code=404, detail="User not found")

            if user_row.username.lower() == actor.get("username", "").lower():
                raise HTTPException(status_code=400, detail="Cannot delete your own active admin account")

            db.delete(user_row)
            db.commit()
            logger.info(f"[Admin] Deleted user {user_id} by {actor.get('username')}")
            return {"status": "success", "deleted_user_id": user_id}

    return router
