from sqlalchemy import select

from backend.app.models.db_models import AccessPolicyModel, BaseURLModel, ServerModel, DEFAULT_TOOL_ID


def resolve_owner_fk_ids(
    db,
    owner_id: str,
    fallback_server_id: int | None = None,
    fallback_base_url_id: int | None = None,
) -> tuple[int | None, int | None]:
    if owner_id.startswith("mcp:"):
        name = owner_id.split(":", 1)[1]
        server = db.scalar(select(ServerModel).where(ServerModel.name == name))
        return (server.id if server else fallback_server_id), None
    if owner_id.startswith("app:"):
        name = owner_id.split(":", 1)[1]
        base_url = db.scalar(select(BaseURLModel).where(BaseURLModel.name == name))
        return None, (base_url.id if base_url else fallback_base_url_id)
    return fallback_server_id, fallback_base_url_id


def ensure_default_access_policy_for_owner(
    db,
    owner_id: str,
    server_id: int | None = None,
    base_url_id: int | None = None,
) -> None:
    resolved_server_id, resolved_base_url_id = resolve_owner_fk_ids(
        db,
        owner_id,
        fallback_server_id=server_id,
        fallback_base_url_id=base_url_id,
    )
    policy = db.scalar(
        select(AccessPolicyModel).where(
            AccessPolicyModel.owner_id == owner_id,
            AccessPolicyModel.tool_id == DEFAULT_TOOL_ID,
        )
    )
    if policy:
        policy.server_id = resolved_server_id
        policy.base_url_id = resolved_base_url_id
        return

    db.add(
        AccessPolicyModel(
            owner_id=owner_id,
            tool_id=DEFAULT_TOOL_ID,
            mode="allow",
            server_id=resolved_server_id,
            base_url_id=resolved_base_url_id,
        )
    )


def ensure_tool_access_policy_for_owner(
    db,
    owner_id: str,
    tool_id: str,
    server_id: int | None = None,
    base_url_id: int | None = None,
) -> None:
    if not tool_id or tool_id == DEFAULT_TOOL_ID:
        return

    resolved_server_id, resolved_base_url_id = resolve_owner_fk_ids(
        db,
        owner_id,
        fallback_server_id=server_id,
        fallback_base_url_id=base_url_id,
    )
    policy = db.scalar(
        select(AccessPolicyModel).where(
            AccessPolicyModel.owner_id == owner_id,
            AccessPolicyModel.tool_id == tool_id,
        )
    )
    if policy:
        policy.server_id = resolved_server_id
        policy.base_url_id = resolved_base_url_id
        return

    db.add(
        AccessPolicyModel(
            owner_id=owner_id,
            tool_id=tool_id,
            mode="allow",
            server_id=resolved_server_id,
            base_url_id=resolved_base_url_id,
        )
    )
