 
import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv


def _parse_env_keys(env_path: Path) -> list[str]:
    keys: list[str] = []
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key = line.split("=", 1)[0].strip()
        if key:
            keys.append(key)
    return keys


def _resolve_env_file() -> Path:
    current_dir = Path(__file__).resolve().parent
    candidates = [
        current_dir / ".env",
        current_dir.parent / ".env",
    ]
    for candidate in candidates:
        if candidate.exists():
            return candidate
    raise RuntimeError("No backend env file found. Expected backend/.env or project .env")


@dataclass(frozen=True)
class BackendEnv:
    env_file: Path
    mcp_manager_name: str
    auth_enabled: bool
    keycloak_server_url: str
    keycloak_frontend_url: str
    keycloak_realm: str
    keycloak_client_id: str
    keycloak_client_secret: str
    keycloak_verify_aud: bool
    keycloak_verify_ssl: bool
    database_url: str
    db_fallback_sqlite: bool
    openapi_mcp_cache_ttl_sec: int
    openapi_mcp_fetch_retries: int
    redis_enabled: bool
    redis_url: str
    redis_status_ttl_sec: int
    redis_list_ttl_sec: int
    agent_mcp_server_name: str
    agent_mcp_server_url: str
    agent_ollama_model: str
    agent_ollama_base_url: str
    agent_ollama_temperature: float
    agent_debug_callbacks: bool
    health_monitor_interval_sec: int
    health_monitor_failure_threshold: int
    health_monitor_timeout_sec: float
    log_level: str
    enable_multi_keycloak: bool
    adm_keycloak_server_url: str
    adm_keycloak_realm: str
    adm_keycloak_client_id: str
    adm_keycloak_client_secret: str
    ops_keycloak_server_url: str
    ops_keycloak_realm: str
    ops_keycloak_client_id: str
    ops_keycloak_client_secret: str
    inference_engine_openapi_url: str
    inference_engine_api_key: str


def load_backend_env() -> BackendEnv:
    env_file = _resolve_env_file()
    env_keys = _parse_env_keys(env_file)

    load_dotenv(env_file, override=False)

    missing = [key for key in env_keys if os.getenv(key) is None]
    if missing:
        raise RuntimeError(
            "Failed to load all backend env vars. Missing keys after dotenv load: "
            + ", ".join(sorted(missing))
        )

    return BackendEnv(
        env_file=env_file,
        mcp_manager_name=os.getenv("MCP_MANAGER_NAME", "COMBINED MCP MANAGER").strip(),
        auth_enabled=os.getenv("AUTH_ENABLED", "true").strip().lower() == "true",
        keycloak_server_url=os.getenv("KEYCLOAK_SERVER_URL", "http://10.196.167.176:8080").strip().rstrip("/"),
        keycloak_frontend_url=os.getenv("KEYCLOAK_FRONTEND_URL", "").strip().rstrip("/") or os.getenv("KEYCLOAK_SERVER_URL", "").strip().rstrip("/").replace("host.docker.internal", "10.196.167.176").replace("localhost", "10.196.167.176"),
        keycloak_realm=os.getenv("KEYCLOAK_REALM", "mcp-realm").strip(),
        keycloak_client_id=os.getenv("KEYCLOAK_CLIENT_ID", "mcp_secure1").strip(),
        keycloak_client_secret=os.getenv("KEYCLOAK_CLIENT_SECRET", "MXPDo5pOcCA0wOrPKV8vz2jzxJIadvZY8LdexNR2yWEqmsuF0TjF25YxMZGjAgNUNyWGHjC2tbizEaHlXbHC7T").strip(),
        keycloak_verify_aud=os.getenv("KEYCLOAK_VERIFY_AUD", "true").strip().lower() == "true",
        keycloak_verify_ssl=os.getenv("KEYCLOAK_VERIFY_SSL", "true").strip().lower() == "true",
        database_url=os.getenv("DATABASE_URL", "").strip(),
        db_fallback_sqlite=os.getenv("DB_FALLBACK_SQLITE", "true").strip().lower() == "true",
        openapi_mcp_cache_ttl_sec=int(os.getenv("OPENAPI_MCP_CACHE_TTL_SEC", "30").strip()),
        openapi_mcp_fetch_retries=int(os.getenv("OPENAPI_MCP_FETCH_RETRIES", "1").strip()),
        redis_enabled=os.getenv("REDIS_ENABLED", "true").strip().lower() == "true",
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/0").strip(),
        redis_status_ttl_sec=int(os.getenv("REDIS_STATUS_TTL_SEC", "5").strip()),
        redis_list_ttl_sec=int(os.getenv("REDIS_LIST_TTL_SEC", "5").strip()),
        agent_mcp_server_name=os.getenv("AGENT_MCP_SERVER_NAME", "http_server").strip() or "http_server",
        agent_mcp_server_url=(
            os.getenv("AGENT_MCP_SERVER_URL", "http://10.196.167.176:8000/mcp/apps/").strip().rstrip("/") + "/"
        ),
        agent_ollama_model=os.getenv("AGENT_OLLAMA_MODEL", "").strip(),
        agent_ollama_base_url=os.getenv("AGENT_OLLAMA_BASE_URL", "http://10.196.167.176:11434").strip(),
        agent_ollama_temperature=float(os.getenv("AGENT_OLLAMA_TEMPERATURE", "0.7").strip()),
        agent_debug_callbacks=os.getenv("AGENT_DEBUG_CALLBACKS", "true").strip().lower() == "true",
        health_monitor_interval_sec=int(os.getenv("HEALTH_MONITOR_INTERVAL_SEC", "30").strip()),
        health_monitor_failure_threshold=int(os.getenv("HEALTH_MONITOR_FAILURE_THRESHOLD", "3").strip()),
        health_monitor_timeout_sec=float(os.getenv("HEALTH_MONITOR_TIMEOUT_SEC", "8").strip()),
        log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper(),
        enable_multi_keycloak=os.getenv("ENABLE_MULTI_KEYCLOAK", os.getenv("ENABLE_TWO_KEYCLOAK", "false")).strip().lower() == "true",
        adm_keycloak_server_url=os.getenv("ADM_KEYCLOAK_SERVER_URL", "").strip().rstrip("/"),
        adm_keycloak_realm=os.getenv("ADM_KEYCLOAK_REALM", "").strip(),
        adm_keycloak_client_id=os.getenv("ADM_KEYCLOAK_CLIENT_ID", "").strip(),
        adm_keycloak_client_secret=os.getenv("ADM_KEYCLOAK_CLIENT_SECRET", "").strip(),
        ops_keycloak_server_url=os.getenv("OPS_KEYCLOAK_SERVER_URL", "").strip().rstrip("/"),
        ops_keycloak_realm=os.getenv("OPS_KEYCLOAK_REALM", "").strip(),
        ops_keycloak_client_id=os.getenv("OPS_KEYCLOAK_CLIENT_ID", "").strip(),
        ops_keycloak_client_secret=os.getenv("OPS_KEYCLOAK_CLIENT_SECRET", "").strip(),
        inference_engine_openapi_url=os.getenv("INFERENCE_ENGINE_OPENAPI_URL", os.getenv("AGENT_OLLAMA_BASE_URL", "http://10.196.167.176:11434")).strip(),
        inference_engine_api_key=os.getenv("INFERENCE_ENGINE_API_KEY", "dummy_api_key_12345").strip(),
    )


ENV = load_backend_env()
