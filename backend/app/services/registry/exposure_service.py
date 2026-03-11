from sqlalchemy import select
from typing import Any
from app.env import ENV

def resolve_exposable_tools(
    db: Any,
    mcp_tool_model: Any,
    access_policy_model: Any,
    tool_version_model: Any | None = None,
    registry_only: bool = True,
    public_only: bool = False
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """
    Computes exposable set from mcp_tools + access_policies.
    Returns: (all_tools_list, only_mcp_source_list)
    """
    
    policies = db.scalars(select(access_policy_model)).all()
    policy_map: dict[str, dict[str, str]] = {}
    for p in policies:
        if p.owner_id not in policy_map:
            policy_map[p.owner_id] = {}
        policy_map[p.owner_id][p.tool_id] = p.mode

    def _get_mode(owner_id: str, tool_id: str) -> str:
        owner_policies = policy_map.get(owner_id, {})
        if tool_id in owner_policies:
            return owner_policies[tool_id]
        if "__default__" in owner_policies:
            return owner_policies["__default__"]
        return "allow"

    tools_list: list[dict[str, Any]] = []
    mcp_server_tool_list: list[dict[str, Any]] = []

    # Get all active tools across everything from mcp_tools single truth
    stmt = select(mcp_tool_model).where(
        mcp_tool_model.is_deleted == False,
        mcp_tool_model.is_enabled == True,
        mcp_tool_model.registration_state == "selected",
        mcp_tool_model.exposure_state == "active",
    )
    if getattr(mcp_tool_model, "health_status", None) is not None and ENV.live_monitor_enabled:
        stmt = stmt.where(mcp_tool_model.health_status.in_(["healthy", "unknown"]))

    rows = db.scalars(stmt).all()

    version_map: dict[int, dict[str, Any]] = {}
    if tool_version_model is not None and rows:
        tool_ids = [row.id for row in rows]
        versions = db.scalars(
            select(tool_version_model).where(tool_version_model.tool_id.in_(tool_ids))
        ).all()
        for v in versions:
            # prefer the latest entry for current_version if available
            version_map.setdefault(v.tool_id, {})[v.version] = v

    for row in rows:
        owner_id = row.owner_id or ""
        owner_name = owner_id.split(":", 1)[1] if ":" in owner_id else owner_id
        
        mode = _get_mode(owner_id, row.name)
        if public_only and mode != "allow":
            continue
        input_schema = {}
        if tool_version_model is not None:
            versions = version_map.get(row.id, {})
            current = versions.get(row.current_version)
            if current and getattr(current, "input_schema", None):
                input_schema = current.input_schema or {}

        if row.source_type == "openapi":
            is_resource = (row.method or "").upper() == "GET"
            tools_list.append({
                "name": row.name,
                "title": row.display_name or row.name,
                "description": row.description or "",
                "app": owner_name or owner_id,
                "method": (row.method or "").upper(),
                "path": row.path or "",
                "resource": is_resource,
                "is_placeholder": False,
                "placeholder_reason": None,
                "source": "openapi",
                "access_mode": mode,
                "inputSchema": input_schema,
            })
        elif row.source_type == "mcp":
            prefixed = f"mcp__{owner_name}__{row.name}"
            entry = {
                "name": prefixed,
                "title": row.display_name or row.name,
                "description": row.description or "",
                "app": owner_name or owner_id,
                "method": "MCP",
                "path": row.name,
                "is_placeholder": False,
                "placeholder_reason": None,
                "source": "mcp_server",
                "access_mode": mode,
                "inputSchema": input_schema,
            }
            tools_list.append(entry)
            mcp_server_tool_list.append(entry)

    return tools_list, mcp_server_tool_list
