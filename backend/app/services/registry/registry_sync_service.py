import datetime
from typing import Callable, Any
from sqlalchemy import select
from backend.app.services.registry.discovery_service import DiscoveredServerSnapshot

def sync_tools_from_discovery(
    db: Any,
    mcp_tool_model: Any,
    owner_id: str,
    snapshot: DiscoveredServerSnapshot,
    selected_tool_names: list[str] | None = None,
) -> dict[str, int]:
    """
    Reconciles the latest discovery snapshot into the canonical mcp_tools table.
    """
    now = datetime.datetime.utcnow()
    
    # 1. Fetch existing tool records for this owner
    existing_records = db.scalars(
        select(mcp_tool_model).where(mcp_tool_model.owner_id == owner_id)
    ).all()
    existing_map = {record.name: record for record in existing_records}
    
    stats = {"inserted": 0, "updated": 0, "soft_deleted": 0}
    
    if snapshot.error or not snapshot.is_alive:
        # If server is down, don't delete tools, just record that sync failed
        return stats
        
    discovered_map = {tool.name: tool for tool in snapshot.tools}
    
    # Update mapping
    for name, tool_data in discovered_map.items():
        is_selected = selected_tool_names is None or name in selected_tool_names
        registration_state = "selected" if is_selected else "unselected"

        if name in existing_map:
            record = existing_map[name]
            record.description = tool_data.description
            record.method = tool_data.method
            record.path = tool_data.path
            record.last_discovered_on = now
            record.last_synced_on = now
            record.registration_state = registration_state
            record.sync_error = None
            if record.is_deleted:
                # recover
                record.is_deleted = False
                record.is_enabled = True
            stats["updated"] += 1
        else:
            new_record = mcp_tool_model(
                source_type=snapshot.source_type,
                owner_id=owner_id,
                name=tool_data.name,
                description=tool_data.description,
                method=tool_data.method,
                path=tool_data.path,
                registration_state=registration_state,
                exposure_state="active",
                last_discovered_on=now,
                last_synced_on=now,
                is_enabled=True,
                is_deleted=False
            )
            db.add(new_record)
            stats["inserted"] += 1
            
    # Soft delete those not found in latest discovery
    for name, record in existing_map.items():
        if name not in discovered_map:
            if not record.is_deleted:
                record.is_deleted = True
                record.is_enabled = False
                record.registration_state = "stale"
                stats["soft_deleted"] += 1
                
    return stats
