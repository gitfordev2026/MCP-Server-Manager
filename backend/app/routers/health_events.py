from fastapi import APIRouter, WebSocket, WebSocketDisconnect, status
from app.services.health_monitor import health_broadcaster
from app.core.jwt_validator import validate_token, TokenValidationError
from app.core.auth import AUTH_ENABLED
from app.core.logger import get_logger

logger = get_logger(__name__)


def create_health_events_router() -> APIRouter:
    router = APIRouter()

    @router.websocket("/ws/health")
    async def health_ws(ws: WebSocket) -> None:
        if AUTH_ENABLED:
            token = ws.cookies.get("access_token") or ws.query_params.get("token")
            if not token:
                logger.warning("[WSS] Unauthorized connection attempt - missing token cookie or param")
                await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized: Missing token")
                return

            try:
                validate_token(token)
            except TokenValidationError as err:
                logger.warning(f"[WSS] Connection rejected - invalid/fake token: {err}")
                await ws.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized: Invalid token")
                return

        await health_broadcaster.connect(ws)
        try:
            while True:
                await ws.receive_text()
        except WebSocketDisconnect:
            await health_broadcaster.disconnect(ws)
        except Exception:
            await health_broadcaster.disconnect(ws)

    return router

