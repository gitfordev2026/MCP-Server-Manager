from typing import Any

from app.env import ENV


def _get_redis():
    if not ENV.redis_url:
        return None
    try:
        import redis  # type: ignore
        return redis.Redis.from_url(ENV.redis_url, encoding="utf-8", decode_responses=True)
    except Exception:
        return None


async def _get_redis_async():
    if not ENV.redis_url:
        return None
    try:
        import redis.asyncio as redis  # type: ignore
        return redis.from_url(ENV.redis_url, encoding="utf-8", decode_responses=True)
    except Exception:
        return None


def cache_get(key: str) -> str | None:
    client = _get_redis()
    if client is None:
        return None
    try:
        return client.get(key)
    except Exception:
        return None


def cache_set(key: str, value: str, ttl_sec: int = 30) -> None:
    client = _get_redis()
    if client is None:
        return
    try:
        client.setex(key, ttl_sec, value)
    except Exception:
        return


def cache_delete(key: str) -> None:
    client = _get_redis()
    if client is None:
        return
    try:
        client.delete(key)
    except Exception:
        return


async def cache_get_async(key: str) -> str | None:
    client = await _get_redis_async()
    if client is None:
        return None
    try:
        return await client.get(key)
    except Exception:
        return None
    finally:
        try:
            await client.close()
        except Exception:
            pass


async def cache_set_async(key: str, value: str, ttl_sec: int = 30) -> None:
    client = await _get_redis_async()
    if client is None:
        return
    try:
        await client.setex(key, ttl_sec, value)
    except Exception:
        return
    finally:
        try:
            await client.close()
        except Exception:
            pass
