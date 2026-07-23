import json
from typing import Any

from redis import Redis

from app.core.logger import get_logger
from app.env import ENV


logger = get_logger(__name__)
_client: Redis | None = None


def _get_client() -> Redis | None:
    global _client
    if not ENV.redis_enabled:
        return None
    if _client is not None:
        return _client
    try:
        _client = Redis.from_url(ENV.redis_url, decode_responses=True)
        _client.ping()
        logger.info("[Cache] Redis connected")
    except Exception as exc:
        logger.warning(f"[Cache] Redis unavailable: {exc}")
        _client = None
    return _client


def cache_get_json(key: str) -> Any | None:
    client = _get_client()
    if not client:
        return None
    try:
        raw = client.get(key)
        if raw is None:
            return None
        return json.loads(raw)
    except Exception as exc:
        logger.warning(f"[Cache] get failed for {key}: {exc}")
        return None


def cache_set_json(key: str, value: Any, ttl_sec: int) -> None:
    client = _get_client()
    if not client:
        return
    try:
        client.set(key, json.dumps(value, default=str), ex=max(ttl_sec, 1))
    except Exception as exc:
        logger.warning(f"[Cache] set failed for {key}: {exc}")


def cache_delete_prefix(prefix: str) -> None:
    client = _get_client()
    if not client:
        return
    try:
        pattern = f"{prefix}*"
        for key in client.scan_iter(match=pattern):
            client.delete(key)
    except Exception as exc:
        logger.warning(f"[Cache] delete failed for {prefix}: {exc}")


def cache_health_status() -> dict[str, Any]:
    if not ENV.redis_enabled:
        return {
            "name": "Redis",
            "status": "disabled",
            "ok": False,
            "detail": "Redis is disabled by configuration",
        }

    try:
        client = _get_client()
        if client is None:
            return {
                "name": "Redis",
                "status": "down",
                "ok": False,
                "detail": f"Redis unavailable at {ENV.redis_url}",
            }

        client.ping()
        return {
            "name": "Redis",
            "status": "up",
            "ok": True,
            "detail": f"Connected to {ENV.redis_url}",
        }
    except Exception as exc:
        return {
            "name": "Redis",
            "status": "down",
            "ok": False,
            "detail": str(exc),
        }
