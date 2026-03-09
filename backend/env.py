 
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
    auth_enabled: bool
    keycloak_server_url: str
    keycloak_realm: str
    keycloak_client_id: str
    keycloak_verify_aud: bool
    database_url: str
    db_fallback_sqlite: bool
    openapi_mcp_cache_ttl_sec: int
    openapi_mcp_fetch_retries: int
    agent_mcp_server_name: str
    agent_mcp_server_url: str
    agent_ollama_model: str
    agent_ollama_base_url: str
    agent_ollama_temperature: float
    agent_debug_callbacks: bool
    log_level: str
    adm_keycloak_server_url: str
    adm_keycloak_realm: str
    adm_keycloak_client_id: str
    ops_keycloak_server_url: str
    ops_keycloak_realm: str
    ops_keycloak_client_id: str


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
        auth_enabled=os.getenv("AUTH_ENABLED", "true").strip().lower() == "true",
        keycloak_server_url=os.getenv("KEYCLOAK_SERVER_URL", "").strip().rstrip("/"),
        keycloak_realm=os.getenv("KEYCLOAK_REALM", "").strip(),
        keycloak_client_id=os.getenv("KEYCLOAK_CLIENT_ID", "").strip(),
        keycloak_verify_aud=os.getenv("KEYCLOAK_VERIFY_AUD", "true").strip().lower() == "true",
        database_url=os.getenv("DATABASE_URL", "").strip(),
        db_fallback_sqlite=os.getenv("DB_FALLBACK_SQLITE", "true").strip().lower() == "true",
        openapi_mcp_cache_ttl_sec=int(os.getenv("OPENAPI_MCP_CACHE_TTL_SEC", "30").strip()),
        openapi_mcp_fetch_retries=int(os.getenv("OPENAPI_MCP_FETCH_RETRIES", "1").strip()),
        agent_mcp_server_name=os.getenv("AGENT_MCP_SERVER_NAME", "http_server").strip() or "http_server",
        agent_mcp_server_url=os.getenv("AGENT_MCP_SERVER_URL", "http://11.0.25.132:8005/mcp").strip(),
        agent_ollama_model=os.getenv("AGENT_OLLAMA_MODEL", "gpt-oss:120b").strip(),
        agent_ollama_base_url=os.getenv("AGENT_OLLAMA_BASE_URL", "http://11.0.25.132:11434").strip(),
        agent_ollama_temperature=float(os.getenv("AGENT_OLLAMA_TEMPERATURE", "0.7").strip()),
        agent_debug_callbacks=os.getenv("AGENT_DEBUG_CALLBACKS", "true").strip().lower() == "true",
        log_level=os.getenv("LOG_LEVEL", "INFO").strip().upper(),
        adm_keycloak_server_url=os.getenv("ADM_KEYCLOAK_SERVER_URL", "").strip().rstrip("/"),
        adm_keycloak_realm=os.getenv("ADM_KEYCLOAK_REALM", "").strip(),
        adm_keycloak_client_id=os.getenv("ADM_KEYCLOAK_CLIENT_ID", "").strip(),
        ops_keycloak_server_url=os.getenv("OPS_KEYCLOAK_SERVER_URL", "").strip().rstrip("/"),
        ops_keycloak_realm=os.getenv("OPS_KEYCLOAK_REALM", "").strip(),
        ops_keycloak_client_id=os.getenv("OPS_KEYCLOAK_CLIENT_ID", "").strip(),
    )


ENV = load_backend_env()
