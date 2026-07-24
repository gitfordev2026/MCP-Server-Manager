import hmac
import hashlib
import time
import logging
from fastapi.responses import JSONResponse
from app.env import ENV

logger = logging.getLogger(__name__)

class HMACVerificationMiddleware:
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        path = scope.get("path", "")
        
        # Skip HMAC verification for auth endpoints, docs, and health
        if path.startswith("/auth") or path in ["/", "/health", "/docs", "/openapi.json"]:
            await self.app(scope, receive, send)
            return

        secret_key = ENV.hmac_secret_key
        if not secret_key:
            await self.app(scope, receive, send)
            return

        # Extract headers from scope["headers"]
        headers = dict(scope.get("headers", []))
        timestamp_bytes = headers.get(b"x-timestamp")
        signature_bytes = headers.get(b"x-signature")

        if not timestamp_bytes or not signature_bytes:
            response = JSONResponse(status_code=401, content={"detail": "Missing HMAC headers"})
            await response(scope, receive, send)
            return

        timestamp_str = timestamp_bytes.decode("utf-8", errors="ignore")
        signature = signature_bytes.decode("utf-8", errors="ignore")

        try:
            timestamp = float(timestamp_str)
        except ValueError:
            response = JSONResponse(status_code=401, content={"detail": "Invalid timestamp format"})
            await response(scope, receive, send)
            return

        # Check for replay attack (5 minutes max age)
        if time.time() - timestamp > 300:
            response = JSONResponse(status_code=401, content={"detail": "Request expired (timestamp too old)"})
            await response(scope, receive, send)
            return

        # Read full body from ASGI receive stream
        body_chunks = []
        while True:
            message = await receive()
            if message["type"] == "http.request":
                body_chunks.append(message.get("body", b""))
                if not message.get("more_body", False):
                    break
            elif message["type"] == "http.disconnect":
                return

        body = b"".join(body_chunks)
        body_str = body.decode("utf-8", errors="ignore")

        # Reconstruct payload: Method:Path:Timestamp:Body
        method = scope.get("method", "GET")
        payload = f"{method}:{path}:{timestamp_str}:{body_str}"

        # Compute expected HMAC
        expected_sig = hmac.new(
            secret_key.encode("utf-8"),
            payload.encode("utf-8"),
            hashlib.sha256
        ).hexdigest()

        if not hmac.compare_digest(expected_sig, signature):
            logger.warning(f"HMAC mismatch for {method} {path}")
            response = JSONResponse(status_code=401, content={"detail": "Invalid HMAC signature"})
            await response(scope, receive, send)
            return

        # Create custom receive function to replay body to downstream ASGI app
        sent_body = False

        async def custom_receive():
            nonlocal sent_body
            if not sent_body:
                sent_body = True
                return {"type": "http.request", "body": body, "more_body": False}
            return await receive()

        await self.app(scope, custom_receive, send)
