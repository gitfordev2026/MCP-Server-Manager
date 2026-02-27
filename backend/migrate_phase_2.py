import sqlite3
import os

def migrate():
    db_path = os.path.join(os.path.dirname(__file__), "servers.db")
    print(f"Migrating sqlite database phase 2 at {db_path}...")
    con = sqlite3.connect(db_path)
    cur = con.cursor()
    
    # helper to add column safely
    def add_column_if_not_exists(table, column_name, column_type):
        cur.execute(f"PRAGMA table_info({table})")
        columns = [row[1] for row in cur.fetchall()]
        if column_name not in columns:
            print(f"Adding column '{column_name}' to '{table}'")
            cur.execute(f"ALTER TABLE {table} ADD COLUMN {column_name} {column_type}")
        else:
            print(f"Column '{column_name}' already exists in '{table}'")

    # mcp_servers
    add_column_if_not_exists("mcp_servers", "sync_mode", "VARCHAR(24) NOT NULL DEFAULT 'manual'")
    add_column_if_not_exists("mcp_servers", "last_sync_status", "VARCHAR(24) NOT NULL DEFAULT 'never'")
    add_column_if_not_exists("mcp_servers", "last_sync_started_on", "DATETIME")
    add_column_if_not_exists("mcp_servers", "last_sync_completed_on", "DATETIME")
    add_column_if_not_exists("mcp_servers", "last_sync_error", "TEXT")
    
    # mcp_tools
    add_column_if_not_exists("mcp_tools", "external_id", "VARCHAR(255)")
    add_column_if_not_exists("mcp_tools", "display_name", "VARCHAR(255)")
    add_column_if_not_exists("mcp_tools", "registration_state", "VARCHAR(24) NOT NULL DEFAULT 'selected'")
    add_column_if_not_exists("mcp_tools", "exposure_state", "VARCHAR(24) NOT NULL DEFAULT 'active'")
    add_column_if_not_exists("mcp_tools", "last_discovered_on", "DATETIME")
    add_column_if_not_exists("mcp_tools", "last_synced_on", "DATETIME")
    add_column_if_not_exists("mcp_tools", "source_updated_on", "DATETIME")
    add_column_if_not_exists("mcp_tools", "discovery_hash", "VARCHAR(128)")
    add_column_if_not_exists("mcp_tools", "sync_error", "TEXT")
    
    # raw_apis
    add_column_if_not_exists("raw_apis", "sync_mode", "VARCHAR(24) NOT NULL DEFAULT 'manual'")
    add_column_if_not_exists("raw_apis", "registry_state", "VARCHAR(24) NOT NULL DEFAULT 'active'")
    
    con.commit()
    con.close()
    print("Migration finished.")

if __name__ == "__main__":
    migrate()
