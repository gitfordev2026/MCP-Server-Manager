-- Schema defaults + backfills for Postgres (read carefully before running)
-- Date: 2026-03-11

-- 1) Column defaults
ALTER TABLE exposed_mcp_tools
  ALTER COLUMN mode SET DEFAULT 'allow';

ALTER TABLE mcp_tools
  ALTER COLUMN source_type SET DEFAULT 'mcp',
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN current_version SET DEFAULT '1.0.0',
  ALTER COLUMN registration_state SET DEFAULT 'selected',
  ALTER COLUMN exposure_state SET DEFAULT 'active',
  ALTER COLUMN is_enabled SET DEFAULT TRUE,
  ALTER COLUMN is_deleted SET DEFAULT FALSE;

ALTER TABLE raw_apis
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN domain_type SET DEFAULT 'ADM',
  ALTER COLUMN selected_endpoints SET DEFAULT '[]'::json,
  ALTER COLUMN openapi_path SET DEFAULT '',
  ALTER COLUMN include_unreachable_tools SET DEFAULT 0,
  ALTER COLUMN sync_mode SET DEFAULT 'manual',
  ALTER COLUMN registry_state SET DEFAULT 'active',
  ALTER COLUMN last_sync_status SET DEFAULT 'never',
  ALTER COLUMN is_enabled SET DEFAULT TRUE,
  ALTER COLUMN is_deleted SET DEFAULT FALSE;

ALTER TABLE mcp_servers
  ALTER COLUMN description SET DEFAULT '',
  ALTER COLUMN domain_type SET DEFAULT 'ADM',
  ALTER COLUMN selected_tools SET DEFAULT '[]'::json,
  ALTER COLUMN sync_mode SET DEFAULT 'manual',
  ALTER COLUMN last_sync_status SET DEFAULT 'never',
  ALTER COLUMN is_enabled SET DEFAULT TRUE,
  ALTER COLUMN is_deleted SET DEFAULT FALSE;

ALTER TABLE api_endpoints
  ALTER COLUMN is_enabled SET DEFAULT TRUE,
  ALTER COLUMN exposed_to_mcp SET DEFAULT FALSE,
  ALTER COLUMN exposure_approved SET DEFAULT FALSE,
  ALTER COLUMN is_deleted SET DEFAULT FALSE;

-- 2) Backfills (clean nulls)
UPDATE exposed_mcp_tools SET mode = 'allow' WHERE mode IS NULL OR mode = '';

UPDATE mcp_tools SET description = '' WHERE description IS NULL;
UPDATE mcp_tools SET current_version = '1.0.0' WHERE current_version IS NULL OR current_version = '';
UPDATE mcp_tools SET registration_state = 'selected' WHERE registration_state IS NULL OR registration_state = '';
UPDATE mcp_tools SET exposure_state = 'active' WHERE exposure_state IS NULL OR exposure_state = '';
UPDATE mcp_tools SET is_enabled = TRUE WHERE is_enabled IS NULL;
UPDATE mcp_tools SET is_deleted = FALSE WHERE is_deleted IS NULL;

UPDATE raw_apis SET description = '' WHERE description IS NULL;
UPDATE raw_apis SET domain_type = 'ADM' WHERE domain_type IS NULL OR domain_type = '';
UPDATE raw_apis SET selected_endpoints = '[]'::json WHERE selected_endpoints IS NULL;
UPDATE raw_apis SET openapi_path = '' WHERE openapi_path IS NULL;
UPDATE raw_apis SET include_unreachable_tools = 0 WHERE include_unreachable_tools IS NULL;
UPDATE raw_apis SET sync_mode = 'manual' WHERE sync_mode IS NULL OR sync_mode = '';
UPDATE raw_apis SET registry_state = 'active' WHERE registry_state IS NULL OR registry_state = '';
UPDATE raw_apis SET last_sync_status = 'never' WHERE last_sync_status IS NULL OR last_sync_status = '';
UPDATE raw_apis SET is_enabled = TRUE WHERE is_enabled IS NULL;
UPDATE raw_apis SET is_deleted = FALSE WHERE is_deleted IS NULL;

UPDATE mcp_servers SET description = '' WHERE description IS NULL;
UPDATE mcp_servers SET domain_type = 'ADM' WHERE domain_type IS NULL OR domain_type = '';
UPDATE mcp_servers SET selected_tools = '[]'::json WHERE selected_tools IS NULL;
UPDATE mcp_servers SET sync_mode = 'manual' WHERE sync_mode IS NULL OR sync_mode = '';
UPDATE mcp_servers SET last_sync_status = 'never' WHERE last_sync_status IS NULL OR last_sync_status = '';
UPDATE mcp_servers SET is_enabled = TRUE WHERE is_enabled IS NULL;
UPDATE mcp_servers SET is_deleted = FALSE WHERE is_deleted IS NULL;

UPDATE api_endpoints SET is_enabled = TRUE WHERE is_enabled IS NULL;
UPDATE api_endpoints SET exposed_to_mcp = FALSE WHERE exposed_to_mcp IS NULL;
UPDATE api_endpoints SET exposure_approved = FALSE WHERE exposure_approved IS NULL;
UPDATE api_endpoints SET is_deleted = FALSE WHERE is_deleted IS NULL;

-- 3) Indexes for hot filters
CREATE INDEX IF NOT EXISTS idx_mcp_tools_owner ON mcp_tools(owner_id);
CREATE INDEX IF NOT EXISTS idx_mcp_tools_active ON mcp_tools(is_enabled, is_deleted, registration_state, exposure_state);
CREATE INDEX IF NOT EXISTS idx_exposed_policies_owner ON exposed_mcp_tools(owner_id);
CREATE INDEX IF NOT EXISTS idx_raw_apis_active ON raw_apis(is_enabled, is_deleted, registry_state);
CREATE INDEX IF NOT EXISTS idx_servers_active ON mcp_servers(is_enabled, is_deleted);
