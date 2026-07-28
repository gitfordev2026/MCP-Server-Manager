import time
import httpx
from typing import List, Dict, Any, Optional
try:
    from app.env import ENV
    from app.core.logger import get_logger
except ModuleNotFoundError:
    from env import ENV
    from core.logger import get_logger

logger = get_logger(__name__)

_MODELS_CACHE: Dict[str, Any] = {
    "models": [],
    "fetched_at": 0.0
}
CACHE_TTL_SEC = 60.0

async def fetch_available_models() -> List[str]:
    """
    Fetches available LLM model names dynamically from the OpenAPI Inference Engine / Ollama.
    Supports optional API Key authentication via INFERENCE_ENGINE_API_KEY.
    Caches model list for 60 seconds.
    """
    now = time.time()
    if _MODELS_CACHE["models"] and (now - _MODELS_CACHE["fetched_at"] < CACHE_TTL_SEC):
        return _MODELS_CACHE["models"]

    raw_base_url = getattr(ENV, "inference_engine_openapi_url", None) or getattr(ENV, "agent_ollama_base_url", "http://localhost:11434")
    base_url = (raw_base_url or "").rstrip("/")
    api_key = getattr(ENV, "inference_engine_api_key", "")

    headers = {"User-Agent": "MCP-Manager-Inference-Client"}
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"
        headers["x-api-key"] = api_key

    discovered_models: List[str] = []

    # 1. Try OpenAI /v1/models format
    endpoints = [
        f"{base_url}/v1/models",
        f"{base_url}/api/tags",
        f"{base_url}/models",
        f"{base_url}/openapi.json",
    ]

    async with httpx.AsyncClient(timeout=5.0, verify=False) as client:
        for endpoint in endpoints:
            try:
                res = await client.get(endpoint, headers=headers)
                if not res.is_success:
                    continue
                data = res.json()

                # Case A: OpenAI /v1/models => {"data": [{"id": "model_name"}, ...]}
                if isinstance(data, dict) and "data" in data and isinstance(data["data"], list):
                    for item in data["data"]:
                        if isinstance(item, dict) and "id" in item:
                            discovered_models.append(str(item["id"]).strip())

                # Case B: Ollama /api/tags => {"models": [{"name": "gemma:latest"}, ...]}
                elif isinstance(data, dict) and "models" in data and isinstance(data["models"], list):
                    for item in data["models"]:
                        if isinstance(item, dict) and "name" in item:
                            discovered_models.append(str(item["name"]).strip())

                # Case C: OpenAPI spec => inspect title or info
                elif isinstance(data, dict) and "openapi" in data:
                    title = data.get("info", {}).get("title", "")
                    if title:
                        discovered_models.append(title.strip())

                if discovered_models:
                    logger.info(f"Discovered {len(discovered_models)} models from inference engine endpoint {endpoint}")
                    break
            except Exception as exc:
                logger.debug(f"Inference engine check failed for {endpoint}: {exc}")

    # Fallback to configured model if any, or default fallback list
    if not discovered_models:
        if ENV.agent_ollama_model:
            discovered_models.append(ENV.agent_ollama_model)
        else:
            discovered_models = ["gemma4:31b-cloud", "llama3.1", "qwen2.5:72b"]

    # Deduplicate preserving order
    unique_models = list(dict.fromkeys(m for m in discovered_models if m))

    _MODELS_CACHE["models"] = unique_models
    _MODELS_CACHE["fetched_at"] = now
    return unique_models

async def get_default_model() -> str:
    """Returns the primary active model from inference engine discovery."""
    models = await fetch_available_models()
    return models[0] if models else "gemma4:31b-cloud"
