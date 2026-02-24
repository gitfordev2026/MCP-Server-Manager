from enum import Enum
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, field_validator
from sqlalchemy import delete, select
from sqlalchemy.exc import SQLAlchemyError

from backend.app.models.db_models import AccessPolicyModel, DEFAULT_TOOL_ID


class AccessMode(str, Enum):
    allow = "allow"
    approval = "approval"
    deny = "deny"


class AccessPolicyUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid")

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
    model_config = ConfigDict(extra="forbid")

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


def _optional_current_user() -> dict[str, Any] | None:
    return None


def create_access_policy_router(
    session_local_factory,
    resolve_owner_fk_ids_fn,
    write_audit_log_fn,
    audit_log_model,
    get_actor_dep,
):
    router = APIRouter()

    @router.get(
        "/access-policies",
        summary="List Access Policies",
        description="List default and per-tool access policies grouped by owner. Source: backend/app/routers/access_policies.py",
    )
    def list_access_policies(
        current_user: dict[str, Any] | None = Depends(_optional_current_user),
    ) -> dict[str, Any]:
        _ = current_user
        with session_local_factory() as db:
            policies = db.scalars(select(AccessPolicyModel)).all()

        result: dict[str, dict[str, Any]] = {}

        for policy in policies:
            owner = result.setdefault(
                policy.owner_id,
                {
                    "defaultMode": AccessMode.deny,
                    "endpointModes": {},
                    "defaultPolicy": {"mode": AccessMode.deny, "allowed_users": [], "allowed_groups": []},
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

    @router.put(
        "/access-policies/{owner_id}",
        response_model=AccessPolicyResponse,
        summary="Update Default Owner Policy",
        description="Update default (__default__) access policy for an owner. Source: backend/app/routers/access_policies.py",
    )
    def update_owner_default_policy(
        owner_id: str,
        policy: AccessPolicyUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> AccessPolicyResponse:
        with session_local_factory() as db:
            try:
                stmt = select(AccessPolicyModel).where(
                    AccessPolicyModel.owner_id == owner_id,
                    AccessPolicyModel.tool_id == DEFAULT_TOOL_ID,
                )
                existing = db.scalar(stmt)

                if existing:
                    before_state = {
                        "mode": existing.mode,
                        "allowed_users": existing.allowed_users or [],
                        "allowed_groups": existing.allowed_groups or [],
                    }
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

                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action="access_policy.update_default",
                    resource_type="access_policy",
                    resource_id=f"{owner_id}:{DEFAULT_TOOL_ID}",
                    before_state=before_state if existing else None,
                    after_state={
                        "mode": policy.mode.value,
                        "allowed_users": policy.allowed_users or [],
                        "allowed_groups": policy.allowed_groups or [],
                    },
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

    @router.put(
        "/access-policies/{owner_id}/{tool_id}",
        response_model=AccessPolicyResponse,
        summary="Update Tool Policy",
        description="Create or update access policy for one tool under an owner. Source: backend/app/routers/access_policies.py",
    )
    def update_tool_policy(
        owner_id: str,
        tool_id: str,
        policy: AccessPolicyUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> AccessPolicyResponse:
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
                    before_state = {
                        "mode": existing.mode,
                        "allowed_users": existing.allowed_users or [],
                        "allowed_groups": existing.allowed_groups or [],
                    }
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
                    before_state = None

                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action="access_policy.update_tool",
                    resource_type="access_policy",
                    resource_id=f"{owner_id}:{tool_id}",
                    before_state=before_state,
                    after_state={
                        "mode": policy.mode.value,
                        "allowed_users": policy.allowed_users or [],
                        "allowed_groups": policy.allowed_groups or [],
                    },
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

    @router.delete(
        "/access-policies/{owner_id}/{tool_id}",
        response_model=AccessPolicyResponse,
        summary="Delete Tool Policy",
        description="Delete a per-tool access policy for an owner. Source: backend/app/routers/access_policies.py",
    )
    def delete_tool_policy(
        owner_id: str,
        tool_id: str,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> AccessPolicyResponse:
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

                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action="access_policy.delete_tool",
                    resource_type="access_policy",
                    resource_id=f"{owner_id}:{tool_id}",
                    before_state=None,
                    after_state=None,
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
        summary="Bulk Apply Policy",
        description="Apply one policy mode/users/groups across owner default and selected tools. Source: backend/app/routers/access_policies.py",
    )
    def bulk_apply_policy(
        owner_id: str,
        data: AccessPolicyBulkUpdate,
        actor: dict[str, Any] = Depends(get_actor_dep),
    ) -> AccessPolicyBulkResponse:
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

                write_audit_log_fn(
                    db,
                    audit_log_model,
                    actor=actor.get("username", "system"),
                    action="access_policy.bulk_apply",
                    resource_type="access_policy",
                    resource_id=owner_id,
                    before_state=None,
                    after_state={
                        "mode": data.mode.value,
                        "tool_ids": data.tool_ids,
                        "allowed_users": data.allowed_users or [],
                        "allowed_groups": data.allowed_groups or [],
                    },
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
