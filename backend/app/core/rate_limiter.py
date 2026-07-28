"""SlowAPI Rate Limiting Integration for FastAPI.

Fully configurable via environment variables in backend/.env:
- RATE_LIMIT_ENABLED (true/false)
- RATE_LIMIT_DEFAULT (e.g. "120/minute")
- RATE_LIMIT_AUTH (e.g. "20/minute")
"""

from __future__ import annotations

from fastapi import Request, Response
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from slowapi.util import get_remote_address

from app.env import ENV
from app.core.logger import get_logger

logger = get_logger(__name__)


def get_client_ip(request: Request) -> str:
    """Extract real client IP address from X-Forwarded-For header or remote socket."""
    forwarded_for = request.headers.get("X-Forwarded-For")
    if forwarded_for:
        return forwarded_for.split(",")[0].strip()
    return get_remote_address(request) or "127.0.0.1"


# Initialize SlowAPI Limiter from environment settings
limiter = Limiter(
    key_func=get_client_ip,
    default_limits=[ENV.rate_limit_default] if ENV.rate_limit_enabled else [],
    enabled=ENV.rate_limit_enabled,
    storage_uri=ENV.redis_url if (ENV.redis_enabled and ENV.redis_url) else "memory://",
)


def custom_rate_limit_exceeded_handler(request: Request, exc: RateLimitExceeded) -> Response:
    """Returns clean JSON response with Retry-After header on 429 Too Many Requests."""
    logger.warning(f"[RateLimitExceeded] IP={get_client_ip(request)} Path={request.url.path} Detail={exc.detail}")
    return JSONResponse(
        status_code=429,
        content={
            "error": "Too Many Requests",
            "detail": f"Rate limit exceeded: {exc.detail}",
        },
        headers={
            "Retry-After": "60",
            "X-RateLimit-Limit": str(exc.detail),
        },
    )
