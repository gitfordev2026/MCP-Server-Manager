-- Tool health tracking columns for Postgres
-- Date: 2026-03-11

ALTER TABLE mcp_tools
  ADD COLUMN IF NOT EXISTS health_status VARCHAR(24) NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS last_health_checked_on TIMESTAMP,
  ADD COLUMN IF NOT EXISTS health_latency_ms INTEGER,
  ADD COLUMN IF NOT EXISTS health_error TEXT;

UPDATE mcp_tools
  SET health_status = 'unknown'
  WHERE health_status IS NULL OR health_status = '';
