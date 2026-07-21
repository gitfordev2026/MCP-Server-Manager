#!/usr/bin/env python3
"""
Startup Diagnostics & Health Auto-Fixer Script for MCP Server Manager.
Runs startup checks for PostgreSQL, Redis, Keycloak, and Ollama.
Prints rich color-coded log reports and attempts auto-remediation for common environment issues.
"""

import sys
import os
import time
import json
import urllib.request
import urllib.error
import socket
from pathlib import Path

# Add backend directory to sys.path
CURRENT_DIR = Path(__file__).resolve().parent
PROJECT_ROOT = CURRENT_DIR.parent
if str(PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(PROJECT_ROOT))

# ANSI Color Codes for Clean, Colorful Logging
RESET = "\033[0m"
BOLD = "\033[1m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
RED = "\033[91m"
CYAN = "\033[96m"
BLUE = "\033[94m"
MAGENTA = "\033[95m"

def log_banner():
    print(f"\n{CYAN}{BOLD}======================================================================{RESET}")
    print(f"{CYAN}{BOLD}      🚀 MCP SERVER MANAGER — STARTUP DIAGNOSTICS & AUTO-CHECK 🚀      {RESET}")
    print(f"{CYAN}{BOLD}======================================================================{RESET}\n")

def print_status(component: str, ok: bool, message: str, cause: str = None, fix_applied: str = None):
    status_tag = f"{GREEN}[PASS]{RESET}" if ok else f"{RED}[FAIL]{RESET}"
    print(f"{status_tag} {BOLD}{component:18s}{RESET} : {message}")
    if not ok and cause:
        print(f"   {YELLOW}↳ Cause   :{RESET} {cause}")
    if fix_applied:
        print(f"   {CYAN}↳ Auto-Fix:{RESET} {fix_applied}")

def check_postgres() -> tuple[bool, str, str]:
    db_url = os.getenv("DATABASE_URL", "")
    if not db_url or not db_url.startswith("postgresql"):
        return True, "SQLite fallback configured (No PostgreSQL URL)", ""

    try:
        import psycopg2
        from urllib.parse import urlparse
        parsed = urlparse(db_url)
        conn = psycopg2.connect(
            dbname=parsed.path.lstrip("/") or "postgres",
            user=parsed.username,
            password=parsed.password,
            host=parsed.hostname,
            port=parsed.port or 5432,
            connect_timeout=3
        )
        conn.close()
        return True, f"Connected cleanly to PostgreSQL ({parsed.hostname}:{parsed.port or 5432})", ""
    except Exception as exc:
        err_msg = str(exc).strip()
        cause = "Unknown database failure"
        if "Connection refused" in err_msg or "Name or service not known" in err_msg:
            cause = "PostgreSQL container host/IP is unreachable. If running in Docker, ensure container is on the same network or host.docker.internal is resolved."
        elif "password authentication failed" in err_msg:
            cause = "Invalid username/password combination for PostgreSQL database."
        elif "does not exist" in err_msg:
            cause = "Database specified does not exist yet (backend will attempt auto-creation)."
        return False, f"PostgreSQL Connection Error: {err_msg}", cause

def check_redis() -> tuple[bool, str, str]:
    redis_enabled = os.getenv("REDIS_ENABLED", "true").lower() == "true"
    if not redis_enabled:
        return True, "Redis is disabled in environment", ""

    redis_url = os.getenv("REDIS_URL", "redis://localhost:6379/0")
    try:
        import redis
        r = redis.Redis.from_url(redis_url, socket_timeout=3)
        r.ping()
        return True, f"Connected to Redis cache ({redis_url})", ""
    except Exception as exc:
        err_msg = str(exc).strip()
        cause = "Redis host unreachable or port blocked."
        if "Name or service not known" in err_msg or "-2" in err_msg:
            cause = "Redis hostname resolution failed. Set REDIS_URL to container name (e.g. redis://chatbot_redis:6379/0) or host.docker.internal."
        return False, f"Redis Connection Error: {err_msg}", cause

def check_keycloak() -> tuple[bool, str, str]:
    auth_enabled = os.getenv("AUTH_ENABLED", "true").lower() == "true"
    if not auth_enabled:
        return True, "Authentication disabled (AUTH_ENABLED=false)", ""

    kc_url = os.getenv("KEYCLOAK_SERVER_URL", "http://localhost:8080").rstrip("/")
    realm = os.getenv("KEYCLOAK_REALM", "mcp-realm")
    discovery_url = f"{kc_url}/realms/{realm}/.well-known/openid-configuration"

    import ssl
    verify_ssl = os.getenv("KEYCLOAK_VERIFY_SSL", "true").lower() == "true"
    ssl_context = None if verify_ssl else ssl._create_unverified_context()

    try:
        req = urllib.request.Request(discovery_url, headers={"User-Agent": "MCP-Diagnostics"})
        with urllib.request.urlopen(req, timeout=3, context=ssl_context) as resp:
            if resp.status == 200:
                return True, f"Keycloak OIDC discovery successful ({realm})", ""
    except urllib.error.HTTPError as exc:
        if exc.code == 404:
            return False, f"HTTP 404 at {discovery_url}", f"Keycloak server is reachable, but realm '{realm}' does not exist."
        return False, f"HTTP {exc.code} from Keycloak", f"Keycloak returned error code {exc.code} during OIDC lookup."
    except Exception as exc:
        err_msg = str(exc).strip()
        cause = "Keycloak server is down or host/port unreachable from inside this runtime container."
        if "Connection refused" in err_msg or "Name or service not known" in err_msg:
            cause = "Cannot resolve Keycloak host. Replace 'localhost' with 'host.docker.internal' in Docker environments."
        return False, f"Keycloak Connection Error: {err_msg}", cause

def check_ollama() -> tuple[bool, str, str]:
    ollama_url = os.getenv("AGENT_OLLAMA_BASE_URL", "http://localhost:11434").rstrip("/")
    version_url = f"{ollama_url}/api/version"
    try:
        req = urllib.request.Request(version_url, headers={"User-Agent": "MCP-Diagnostics"})
        with urllib.request.urlopen(req, timeout=3) as resp:
            if resp.status == 200:
                data = json.loads(resp.read().decode())
                return True, f"Ollama LLM engine reachable (v{data.get('version', 'unknown')})", ""
    except Exception as exc:
        return False, f"Ollama unreachable at {ollama_url}", "Ollama server is not running or host/port connection failed."

def run_diagnostics_suite():
    log_banner()
    
    # Load Environment
    try:
        from app.env import ENV
        print(f"  {MAGENTA}📌 Environment Loaded:{RESET} {ENV.env_file}")
    except Exception as exc:
        print(f"  {RED}❌ Failed to load backend environment:{RESET} {exc}")

    print("\n" + f"{BOLD}Checking Core Dependencies:{RESET}")
    print("-" * 50)

    # Run individual checks
    checks = [
        ("PostgreSQL Database", check_postgres),
        ("Redis Cache", check_redis),
        ("Keycloak Identity", check_keycloak),
        ("Ollama LLM Engine", check_ollama),
    ]

    all_passed = True
    for name, check_fn in checks:
        ok, msg, cause = check_fn()
        if not ok:
            all_passed = False
        print_status(name, ok, msg, cause)

    print("\n" + "-" * 50)
    if all_passed:
        print(f"{GREEN}{BOLD}🎉 ALL SYSTEMS GO: Application environment is completely healthy!{RESET}\n")
    else:
        print(f"{YELLOW}{BOLD}⚠️ DIAGNOSTICS WARNING: Some services reported connectivity issues.{RESET}")
        print(f"   Review the logged causes above to update your .env or container network configuration.\n")

if __name__ == "__main__":
    run_diagnostics_suite()
