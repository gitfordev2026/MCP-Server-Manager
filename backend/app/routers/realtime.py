import asyncio
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from app.env import ENV


HEALTH_CHANNEL = "mcp_tool_health"


def create_realtime_router() -> APIRouter:
    router = APIRouter()

    @router.websocket("/ws/health")
    async def health_socket(ws: WebSocket) -> None:
        await ws.accept()
        redis = None
        pubsub = None
        try:
            if ENV.redis_url:
                import redis.asyncio as redis  # type: ignore
                redis = redis.from_url(ENV.redis_url, encoding="utf-8", decode_responses=True)
                pubsub = redis.pubsub()
                await pubsub.subscribe(HEALTH_CHANNEL)

            while True:
                if pubsub is None:
                    await asyncio.sleep(1)
                    continue
                message = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
                if message and message.get("data"):
                    await ws.send_text(str(message["data"]))
                await asyncio.sleep(0.1)
        except WebSocketDisconnect:
            return
        finally:
            if pubsub is not None:
                try:
                    await pubsub.unsubscribe(HEALTH_CHANNEL)
                except Exception:
                    pass
            if redis is not None:
                try:
                    await redis.close()
                except Exception:
                    pass

    return router
