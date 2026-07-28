import time
import re
from typing import Any, Dict, List, Optional
from app.env import ENV
from app.core.logger import get_logger

logger = get_logger(__name__)

# Sensitive pattern redactor
SENSITIVE_KEYS_RE = re.compile(r"(authorization|bearer|token|password|secret|key)", re.IGNORECASE)

def _redact_payload(data: Any) -> Any:
    """Recursively redacts sensitive auth tokens and passwords from tracing metadata."""
    if isinstance(data, dict):
        redacted = {}
        for k, v in data.items():
            if SENSITIVE_KEYS_RE.search(str(k)):
                redacted[k] = "[REDACTED]"
            else:
                redacted[k] = _redact_payload(v)
        return redacted
    elif isinstance(data, list):
        return [_redact_payload(item) for item in data]
    elif isinstance(data, str):
        if data.lower().startswith("bearer ") or len(data) > 120 and "eyJ" in data:
            return "[REDACTED_TOKEN]"
        return data
    return data


class LangfuseService:
    def __init__(self):
        self.client = None
        self._enabled = False
        self._init_client()

    def _init_client(self):
        pk = ENV.langfuse_public_key
        sk = ENV.langfuse_secret_key
        host = ENV.langfuse_host

        if not pk or not sk:
            logger.info("[Langfuse] Tracing disabled: LANGFUSE_PUBLIC_KEY or LANGFUSE_SECRET_KEY missing.")
            return

        try:
            from langfuse import Langfuse
            self.client = Langfuse(
                public_key=pk,
                secret_key=sk,
                host=host,
            )
            self._enabled = True
            logger.info(f"[Langfuse] Observability tracing initialized against host '{host}'")
        except Exception as exc:
            logger.warning(f"[Langfuse] Client initialization failed (tracing running in no-op mode): {exc}")
            self.client = None
            self._enabled = False

    def trace_execution(
        self,
        name: str,
        user_id: Optional[str] = None,
        session_id: Optional[str] = None,
        prompt: Optional[str] = None,
        system_prompt: Optional[str] = None,
        tools_offered: Optional[List[Any]] = None,
        output: Optional[Any] = None,
        error: Optional[str] = None,
        latency_ms: Optional[float] = None,
        metadata: Optional[Dict[str, Any]] = None,
    ) -> None:
        if not self._enabled or not self.client:
            # Fallback no-op mode
            logger.debug(f"[Langfuse Tracing (No-op)] {name} | user_id={user_id} | error={error}")
            return

        try:
            meta = metadata or {}
            if tools_offered is not None:
                meta["tools_offered_count"] = len(tools_offered)
                meta["tools_offered"] = _redact_payload(tools_offered[:12])

            clean_meta = _redact_payload(meta)
            clean_output = _redact_payload(output)
            clean_prompt = _redact_payload(prompt)
            clean_sys_prompt = _redact_payload(system_prompt)

            trace = self.client.trace(
                name=name,
                user_id=user_id or "anonymous",
                session_id=session_id,
                metadata=clean_meta,
                tags=["mcp-manager", "v2.0.0"],
            )

            generation = trace.generation(
                name=f"{name}-generation",
                model=ENV.agent_ollama_model,
                model_parameters={"temperature": 0.0},
                input={
                    "system_prompt": clean_sys_prompt,
                    "user_prompt": clean_prompt,
                },
                output=clean_output,
                metadata={"error": error, "latency_ms": latency_ms},
            )

            if error:
                trace.score(
                    name="tool-rejection-event" if "tool" in error.lower() else "execution-error",
                    value=0.0,
                    comment=str(error),
                )
            else:
                trace.score(name="execution-success", value=1.0)

            generation.end()
            self.client.flush()
        except Exception as exc:
            logger.warning(f"[Langfuse Tracing Warning] Failed to log trace '{name}': {exc}")


langfuse_service = LangfuseService()
