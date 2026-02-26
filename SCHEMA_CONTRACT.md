# Schema Contract (Phase 1)

## Goal
Use DB registry as single source of truth for management and exposure.  
Only backend discovery/sync/runtime processes may fetch live upstream data.

## Canonical Tables

### `raw_apis` (Application/API owner registry)
Purpose: owner-level registration + sync lifecycle state.

Key fields:
- `name`, `url`: owner identity and upstream base URL
- `selected_endpoints`: explicit registration selection set
- `is_enabled`, `is_deleted`: owner activation and deletion lifecycle
- `sync_mode`: `manual|scheduled|webhook`
- `registry_state`: `active|disabled|deleted|stale`
- `last_sync_status`: `never|running|success|failed`
- `last_sync_started_on`, `last_sync_completed_on`, `last_discovered_on`
- `last_sync_error`: latest sync error detail

### `mcp_tools` (Registered tools registry)
Purpose: canonical registered tool records consumed by admin/access-policy/exposure.

Key fields:
- `source_type`, `owner_id`, `name`: unique canonical tool identity
- `method`, `path`, `description`, `current_version`: exposed metadata
- `external_id`, `display_name`: upstream identity/display mapping
- `registration_state`: `selected|unselected|stale`
- `exposure_state`: `active|disabled|deleted`
- `last_discovered_on`, `last_synced_on`, `source_updated_on`
- `discovery_hash`: upstream signature for drift detection
- `sync_error`: latest per-tool sync error
- `is_enabled`, `is_deleted`: hard filters for management and exposure

## Read/Write Rules
- UI/admin/access control pages: read registry tables only.
- Live upstream calls: only discovery/sync/runtime backend paths.
- Combined MCP exposure: derived from registry + access policy only.

## Phase 1 Scope
- Added lifecycle/sync/state columns to `raw_apis` and `mcp_tools`.
- Added startup schema auto-add + default backfill for new columns.
- No breaking API contract changes in this phase.
