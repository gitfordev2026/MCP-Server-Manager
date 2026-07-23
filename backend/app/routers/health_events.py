from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.health_monitor import health_broadcaster


def create_health_events_router() -> APIRouter:
    router = APIRouter()

    @router.websocket("/ws/health")
    async def health_ws(ws: WebSocket) -> None:
        await health_broadcaster.connect(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            await health_broadcaster.disconnect(ws)
        except Exception:
            await health_broadcaster.disconnect(ws)

    return router

