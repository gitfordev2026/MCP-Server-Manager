"""WebSocket Single-Use Ticket API Router.

Endpoints:
- POST /api/ws-ticket: Authenticated ticket generation
- WS /ws: Secure WebSocket connection requiring valid ticket and authorized Origin header
"""

from __future__ import annotations

import os
from typing import Any
from fastapi import APIRouter, Depends, WebSocket, WebSocketDisconnect, status
from starlette.responses import JSONResponse

from app.core.rbac import get_request_actor
from app.core.ws_ticket import create_ws_ticket, consume_ws_ticket, is_valid_origin
from app.core.logger import get_logger

logger = get_logger(__name__)

# Default allowed origins for CSWSH protection
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000,http://10.139.10.176:3000").split(",")
    if origin.strip()
]


def create_ws_ticket_router(get_actor_dep: Any = get_request_actor) -> APIRouter:
    router = APIRouter()

    @router.post(
        "/api/ws-ticket",
        summary="Generate Short-Lived Single-Use WS Ticket",
        description="Generates a 30-second single-use ticket for authenticating WebSocket connection.",
    )
    async def generate_ws_ticket(actor: dict[str, Any] = Depends(get_actor_dep)) -> dict[str, str]:
        ticket = create_ws_ticket(actor)
        logger.info(f"[WSTicket] Created ticket for user {actor.get('username')}")
        return {"ticket": ticket}

    @router.websocket("/ws")
    async def secure_ws(websocket: WebSocket) -> None:
        origin = websocket.headers.get("origin")
        ticket = websocket.query_params.get("ticket")

        # 1. Origin Check (CSWSH Defense)
        if not is_valid_origin(origin, ALLOWED_ORIGINS):
            logger.warning(f"[WSS] Connection rejected - unauthorized Origin: '{origin}'")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Unauthorized origin")
            return

        # 2. Ticket Validation & Single-Use Enforcement (Atomic Consume & Burn)
        if not ticket:
            logger.warning("[WSS] Connection rejected - missing ticket query parameter")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Missing ticket")
            return

        payload = consume_ws_ticket(ticket)
        if not payload:
            logger.warning(f"[WSS] Connection rejected - invalid, expired, or already-used ticket: {ticket}")
            await websocket.close(code=status.WS_1008_POLICY_VIOLATION, reason="Invalid or expired ticket")
            return

        # 3. Accept connection and bind user_id context
        user_id = payload.get("user_id", "unknown")
        await websocket.accept()
        logger.info(f"[WSS] Connection accepted and bound to user_id: {user_id}")

        try:
            await websocket.send_json({
                "type": "connection_established",
                "message": f"Connected securely as {user_id}",
                "user_id": user_id,
            })
            while True:
                msg = await websocket.receive_text()
                await websocket.send_json({"echo": msg, "user_id": user_id})
        except WebSocketDisconnect:
            logger.info(f"[WSS] Client disconnected: {user_id}")
        except Exception as err:
            logger.warning(f"[WSS] Socket exception for user {user_id}: {err}")

    return router
