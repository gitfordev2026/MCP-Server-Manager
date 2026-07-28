"""Short-Lived Single-Use Ticket System for Secure WebSockets.

Prevents unauthenticated access, forged tokens, replay attacks,
and Cross-Site WebSocket Hijacking (CSWSH).
"""

from __future__ import annotations

import json
import time
import uuid
import threading
from typing import Any
from urllib.parse import urlparse

from app.core.cache import _get_client
from app.core.logger import get_logger

logger = get_logger(__name__)

TICKET_TTL_SEC = 30
TICKET_PREFIX = "ws_ticket:"

# In-memory fallback ticket store with expiration handling
_memory_tickets: dict[str, tuple[dict[str, Any], float]] = {}
_memory_lock = threading.Lock()


def create_ws_ticket(user_data: dict[str, Any], ttl_sec: int = TICKET_TTL_SEC) -> str:
    """Generate a cryptographically secure random UUIDv4 ticket valid for 30s."""
    ticket_id = str(uuid.uuid4())
    key = f"{TICKET_PREFIX}{ticket_id}"
    
    # Store user identity and expiration timestamp
    payload = {
        "user_id": user_data.get("username") or user_data.get("subject") or user_data.get("user_id") or "anonymous",
        "user_data": user_data,
        "created_at": time.time(),
        "expires_at": time.time() + ttl_sec,
    }

    client = _get_client()
    if client:
        try:
            client.set(key, json.dumps(payload), ex=max(int(ttl_sec), 1))
            return ticket_id
        except Exception as err:
            logger.warning(f"[WSTicket] Redis store failed ({err}), falling back to memory")

    # In-memory fallback
    with _memory_lock:
        # Purge stale memory tickets
        now = time.time()
        stale_keys = [k for k, (_, exp) in _memory_tickets.items() if exp < now]
        for k in stale_keys:
            del _memory_tickets[k]

        _memory_tickets[key] = (payload, now + ttl_sec)

    return ticket_id


def consume_ws_ticket(ticket_id: str) -> dict[str, Any] | None:
    """Retrieve and immediately delete (burn) the ticket from storage (Single-Use Enforcement).

    Returns the ticket payload if valid and not expired, else None.
    """
    if not ticket_id:
        return None

    key = f"{TICKET_PREFIX}{ticket_id}"
    now = time.time()

    client = _get_client()
    if client:
        try:
            # Fetch and delete atomically via pipeline
            pipeline = client.pipeline()
            pipeline.get(key)
            pipeline.delete(key)
            results = pipeline.execute()
            raw_data = results[0]

            if not raw_data:
                return None

            payload = json.loads(raw_data)
            if payload.get("expires_at", 0) < now:
                logger.warning(f"[WSTicket] Ticket {ticket_id} has expired")
                return None

            return payload
        except Exception as err:
            logger.warning(f"[WSTicket] Redis consume failed ({err}), trying memory store")

    # In-memory fallback
    with _memory_lock:
        if key not in _memory_tickets:
            return None

        payload, exp = _memory_tickets.pop(key)
        if exp < now or payload.get("expires_at", 0) < now:
            logger.warning(f"[WSTicket] Memory ticket {ticket_id} has expired")
            return None

        return payload


def is_valid_origin(origin: str | None, allowed_origins: list[str]) -> bool:
    """Validate Origin header against allowed list to prevent CSWSH attacks."""
    if not origin:
        return False

    if "*" in allowed_origins:
        return True

    normalized_origin = origin.strip().rstrip("/")
    for allowed in allowed_origins:
        norm_allowed = allowed.strip().rstrip("/")
        if norm_allowed == "*" or normalized_origin == norm_allowed:
            return True
        parsed_origin = urlparse(normalized_origin)
        parsed_allowed = urlparse(norm_allowed)
        if parsed_origin.netloc and parsed_origin.netloc == parsed_allowed.netloc and parsed_origin.scheme == parsed_allowed.scheme:
            return True

    return False
