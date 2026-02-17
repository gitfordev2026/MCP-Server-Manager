from enum import Enum
from typing import Any

from fastapi import APIRouter, HTTPException, status
from pydantic import BaseModel, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from app.models.db_models import AccessPolicyModel, DEFAULT_TOOL_ID


class AccessMode(str, Enum):
    allow = "allow"
    approval = "approval"
    deny = "deny"


class AccessPolicyUpdate(BaseModel):
    mode: AccessMode
    allowed_users: list[str] | None = None
    allowed_groups: list[str] | None = None


class AccessPolicyResponse(BaseModel):
    status: str | None = None
    owner_id: str | None = None
    default_mode: AccessMode | None = None
    tool_id: str | None = None
    mode: AccessMode | None = None
    allowed_users: list[str] | None = None
    allowed_groups: list[str] | None = None


class AccessPolicyBulkUpdate(BaseModel):
    mode: AccessMode
    tool_ids: list[str]
    allowed_users: list[str] | None = None
    allowed_groups: list[str] | None = None

    @field_validator("tool_ids")
    @classmethod
    def validate_tool_ids(cls, value: list[str]) -> list[str]:
        if not value:
            raise ValueError("tool_ids must not be empty")
        return list(set(value))


class AccessPolicyBulkResponse(BaseModel):
    status: str
    owner_id: str
    mode: AccessMode
    updated_count: int


def create_access_policy_router(session_local_factory, resolve_owner_fk_ids_fn):
    router = APIRouter()

    @router.get("/access-policies")
    def list_access_policies(
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        with session_local_factory() as db:
            policies = db.scalars(select(AccessPolicyModel)).all()

        result: dict[str, dict[str, Any]] = {}

        for policy in policies:
            owner = result.setdefault(
                policy.owner_id,
                {
                    "defaultMode": AccessMode.approval,
                    "endpointModes": {},
                    "defaultPolicy": {"mode": AccessMode.approval, "allowed_users": [], "allowed_groups": []},
                    "endpointPolicies": {},
                },
            )

            if policy.tool_id == DEFAULT_TOOL_ID:
                owner["defaultMode"] = policy.mode
                owner["defaultPolicy"] = {
                    "mode": policy.mode,
                    "allowed_users": policy.allowed_users or [],
                    "allowed_groups": policy.allowed_groups or [],
                }
            else:
                owner["endpointModes"][policy.tool_id] = policy.mode
                owner["endpointPolicies"][policy.tool_id] = {
                    "mode": policy.mode,
                    "allowed_users": policy.allowed_users or [],
                    "allowed_groups": policy.allowed_groups or [],
                }

        return {"policies": result}

    @router.put("/access-policies/{owner_id}", response_model=AccessPolicyResponse)
    def update_owner_default_policy(
        owner_id: str,
        policy: AccessPolicyUpdate,
        current_user: dict[str, Any] | None = None,
    ) -> AccessPolicyResponse:
        _ = current_user
        with session_local_factory() as db:
            try:
                stmt = select(AccessPolicyModel).where(
                    AccessPolicyModel.owner_id == owner_id,
                    AccessPolicyModel.tool_id == DEFAULT_TOOL_ID,
                )
                existing = db.scalar(stmt)

                if existing:
                    existing.mode = policy.mode
                    if policy.allowed_users is not None:
                        existing.allowed_users = policy.allowed_users
                    if policy.allowed_groups is not None:
                        existing.allowed_groups = policy.allowed_groups
                    server_id, base_url_id = resolve_owner_fk_ids_fn(
                        db,
                        owner_id,
                        fallback_server_id=existing.server_id,
                        fallback_base_url_id=existing.base_url_id,
                    )
                    existing.server_id = server_id
                    existing.base_url_id = base_url_id
                else:
                    return AccessPolicyResponse(
                        status="Not Found",
                        owner_id=owner_id,
                        default_mode=None,
                    )

                db.commit()

            except SQLAlchemyError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update default access policy",
                ) from exc

        return AccessPolicyResponse(
            status="updated",
            owner_id=owner_id,
            default_mode=policy.mode,
            allowed_users=policy.allowed_users,
            allowed_groups=policy.allowed_groups,
        )

    @router.put("/access-policies/{owner_id}/{tool_id}", response_model=AccessPolicyResponse)
    def update_tool_policy(
        owner_id: str,
        tool_id: str,
        policy: AccessPolicyUpdate,
        current_user: dict[str, Any] | None = None,
    ) -> AccessPolicyResponse:
        _ = current_user
        if tool_id == DEFAULT_TOOL_ID:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Use owner endpoint to update default policy",
            )

        with session_local_factory() as db:
            try:
                stmt = select(AccessPolicyModel).where(
                    AccessPolicyModel.owner_id == owner_id,
                    AccessPolicyModel.tool_id == tool_id,
                )
                existing = db.scalar(stmt)

                if existing:
                    existing.mode = policy.mode
                    if policy.allowed_users is not None:
                        existing.allowed_users = policy.allowed_users
                    if policy.allowed_groups is not None:
                        existing.allowed_groups = policy.allowed_groups
                    server_id, base_url_id = resolve_owner_fk_ids_fn(
                        db,
                        owner_id,
                        fallback_server_id=existing.server_id,
                        fallback_base_url_id=existing.base_url_id,
                    )
                    existing.server_id = server_id
                    existing.base_url_id = base_url_id
                else:
                    server_id, base_url_id = resolve_owner_fk_ids_fn(db, owner_id)
                    db.add(
                        AccessPolicyModel(
                            owner_id=owner_id,
                            tool_id=tool_id,
                            mode=policy.mode,
                            allowed_users=policy.allowed_users or [],
                            allowed_groups=policy.allowed_groups or [],
                            server_id=server_id,
                            base_url_id=base_url_id,
                        )
                    )

                db.commit()

            except SQLAlchemyError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to update tool access policy",
                ) from exc

        return AccessPolicyResponse(
            status="updated",
            owner_id=owner_id,
            tool_id=tool_id,
            mode=policy.mode,
            allowed_users=policy.allowed_users,
            allowed_groups=policy.allowed_groups,
        )

    @router.delete("/access-policies/{owner_id}/{tool_id}", response_model=AccessPolicyResponse)
    def delete_tool_policy(
        owner_id: str,
        tool_id: str,
        current_user: dict[str, Any] | None = None,
    ) -> AccessPolicyResponse:
        _ = current_user
        with session_local_factory() as db:
            try:
                stmt = delete(AccessPolicyModel).where(
                    AccessPolicyModel.owner_id == owner_id,
                    AccessPolicyModel.tool_id == tool_id,
                )
                result = db.execute(stmt)
                db.commit()

                if result.rowcount == 0:
                    raise HTTPException(
                        status_code=status.HTTP_404_NOT_FOUND,
                        detail="Policy not found",
                    )

            except SQLAlchemyError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to delete tool policy",
                ) from exc

        return AccessPolicyResponse(
            status="deleted",
            owner_id=owner_id,
            tool_id=tool_id,
        )

    @router.post(
        "/access-policies/{owner_id}/apply-all",
        response_model=AccessPolicyBulkResponse,
    )
    def bulk_apply_policy(
        owner_id: str,
        data: AccessPolicyBulkUpdate,
        current_user: dict[str, Any] | None = None,
    ) -> AccessPolicyBulkResponse:
        _ = current_user
        with session_local_factory() as db:
            try:
                server_id, base_url_id = resolve_owner_fk_ids_fn(db, owner_id)
                db.merge(
                    AccessPolicyModel(
                        owner_id=owner_id,
                        tool_id=DEFAULT_TOOL_ID,
                        mode=data.mode,
                        allowed_users=data.allowed_users or [],
                        allowed_groups=data.allowed_groups or [],
                        server_id=server_id,
                        base_url_id=base_url_id,
                    )
                )

                db.execute(
                    delete(AccessPolicyModel).where(
                        AccessPolicyModel.owner_id == owner_id,
                        AccessPolicyModel.tool_id != DEFAULT_TOOL_ID,
                        AccessPolicyModel.tool_id.not_in(data.tool_ids),
                    )
                )

                for tool_id in data.tool_ids:
                    db.merge(
                        AccessPolicyModel(
                            owner_id=owner_id,
                            tool_id=tool_id,
                            mode=data.mode,
                            allowed_users=data.allowed_users or [],
                            allowed_groups=data.allowed_groups or [],
                            server_id=server_id,
                            base_url_id=base_url_id,
                        )
                    )

                db.commit()

            except SQLAlchemyError as exc:
                db.rollback()
                raise HTTPException(
                    status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
                    detail="Failed to bulk apply access policies",
                ) from exc

        return AccessPolicyBulkResponse(
            status="bulk_updated",
            owner_id=owner_id,
            mode=data.mode,
            updated_count=len(data.tool_ids) + 1,
        )

    return router
