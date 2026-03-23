from __future__ import annotations

from typing import Any, Callable, Optional, List, Dict, Tuple
from fastapi import APIRouter, HTTPException
import httpx
from mcp_use import MCPClient
from pydantic import BaseModel

from app.core.db import SessionLocal
from app.env import ENV
from app.models.db_models import (
    AccessPolicyModel,
    BaseURLModel,
    MCPToolModel,
    ServerModel,
)
from app.services.registry.exposure_service import resolve_exposable_tools
from app.services.agent_runtime import generate_direct_response


# =========================================================
# Request Models
# =========================================================

class PlaygroundQueryRequest(BaseModel):
    prompt: str
    app_name: Optional[str] = None
    selected_tools: Optional[List[str]] = None
    model: Optional[str] = None


# =========================================================
# MCP Client Utilities
# =========================================================

def _build_mcp_client() -> MCPClient:
    return MCPClient(
        {
            "mcpServers": {
                ENV.agent_mcp_server_name: {
                    "url": ENV.agent_mcp_server_url,
                }
            }
        }
    )


async def _list_combined_tool_names() -> List[str]:
    client = _build_mcp_client()

    try:
        await client.create_all_sessions(auto_initialize=True)

        session = client.get_session(ENV.agent_mcp_server_name)
        if session is None:
            raise RuntimeError("MCP session was not created")

        tools = await session.list_tools()
        return sorted({tool.name for tool in tools})

    finally:
        # safe shutdown across MCP versions
        if hasattr(client, "aclose"):
            await client.aclose()
        elif hasattr(client, "close"):
            close_fn = getattr(client, "close")
            if callable(close_fn):
                close_fn()


# =========================================================
# Database Utilities
# =========================================================

def _list_exposed_tool_catalog() -> List[Dict[str, Any]]:
    """
    Returns tool metadata grouped by application from DB.
    """
    db = SessionLocal()
    try:
        tools_list, _ = resolve_exposable_tools(
            db,
            MCPToolModel,
            AccessPolicyModel,
            ServerModel,
            BaseURLModel,
            public_only=True,
        )
        return tools_list
    finally:
        db.close()


def _group_tools_by_app(catalog: List[Dict[str, Any]]) -> Dict[str, List[str]]:
    grouped: Dict[str, List[str]] = {}
    for tool in catalog:
        app = str(tool.get("app", "unknown"))
        name = str(tool.get("name", ""))
        if name:
            grouped.setdefault(app, []).append(name)
    return grouped


# =========================================================
# Tool Retrieval Layer (context-window safe)
# =========================================================

def _tokenize(text: str) -> List[str]:
    return [t for t in text.lower().replace("-", "_").split() if t]


def _score_tool(prompt_tokens: set[str], tool_name: str) -> int:
    parts = tool_name.lower().split("_")
    return sum(1 for p in parts if p in prompt_tokens)


def _select_relevant_tools(
    prompt: str,
    tools: List[str],
    max_tools: int = 12,
) -> List[str]:
    """
    Lightweight keyword-based tool retrieval.
    Prevents context overflow by limiting tools sent to LLM.
    """
    tokens = set(_tokenize(prompt))
    if not tokens:
        return tools[:max_tools]

    scored: List[Tuple[int, str]] = []
    for tool in tools:
        score = _score_tool(tokens, tool)
        if score > 0:
            scored.append((score, tool))

    scored.sort(reverse=True)

    selected = [tool for _, tool in scored[:max_tools]]

    if not selected:
        # fallback to deterministic subset
        selected = tools[:max_tools]

    return selected


# =========================================================
# Prompt & Model Utilities
# =========================================================

def _normalize_model(model: Optional[str]) -> Optional[str]:
    if model and model.strip():
        return model.strip()
    return None


def _build_tool_only_instructions(selected_tools: List[str]) -> str:
    """
    Bullet list format tokenizes better than comma-separated lists.
    """
    if not selected_tools:
        return (
            "You have no tools available. "
            "Answer directly using your knowledge."
        )

    lines = "\n".join(f"- {tool}" for tool in selected_tools)

    return (
        "You are an MCP tool-using agent.\n"
        "Use tools whenever they are relevant.\n"
        "Only the following tools are available:\n"
        f"{lines}\n"
        "If none of these tools apply, say: "
        "'No suitable tool available with the current tool set.'"
    )


def _should_bypass_mcp_agent(prompt: str) -> bool:
    """
    Detect documentation generation or meta prompts
    that should bypass tool usage.
    """
    normalized = " ".join((prompt or "").lower().split())

    bypass_signals = [
        "api documentation",
        "tool description",
        "generate description",
        "endpoint description",
        "1-2 sentences only",
    ]

    return any(s in normalized for s in bypass_signals)


def _is_recursion_limit_error(exc: Exception) -> bool:
    msg = str(exc).lower()
    return "recursion" in msg and "stop condition" in msg


# =========================================================
# Router Factory
# =========================================================

def create_agent_router(
    build_agent_with_model: Callable[..., Any]
) -> APIRouter:
    router = APIRouter()

    # -----------------------------------------------------
    # Standard Query Endpoint
    # -----------------------------------------------------

    @router.post("/agent/query")
    async def query(request: PlaygroundQueryRequest) -> Dict[str, Any]:
        model = _normalize_model(request.model)

        try:
            # bypass tool agent for documentation-like prompts
            if _should_bypass_mcp_agent(request.prompt):
                result = await generate_direct_response(
                    request.prompt,
                    model=model,
                    additional_instructions="Answer directly without tools.",
                )
                return {"response": result, "mode": "direct_llm"}

            all_tools = await _list_combined_tool_names()

            if not all_tools:
                raise HTTPException(
                    status_code=502,
                    detail="No tools available from MCP server",
                )

            selected_tools = _select_relevant_tools(
                request.prompt,
                all_tools,
                max_tools=12,
            )

            instructions = _build_tool_only_instructions(selected_tools)

            agent = build_agent_with_model(
                model,
                disallowed_tools=[
                    t for t in all_tools if t not in selected_tools
                ],
                additional_instructions=instructions,
                max_steps=8,
                retry_on_error=False,
                memory_enabled=False,
            )

            if hasattr(agent, "tools_used_names"):
                agent.tools_used_names.clear()

            try:
                result = await agent.run(request.prompt)
            except Exception as exc:
                if not _is_recursion_limit_error(exc):
                    raise

                result = await generate_direct_response(
                    request.prompt,
                    model=model,
                    additional_instructions="Answer directly.",
                )

            return {"response": result, "mode": "mcp_agent"}

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Agent execution failed: {exc}",
            ) from exc

    # -----------------------------------------------------
    # Models Endpoint
    # -----------------------------------------------------

    @router.get("/agent/models")
    async def list_models() -> Dict[str, Any]:
        base_url = (ENV.agent_ollama_base_url or "").rstrip("/")

        if not base_url:
            raise HTTPException(
                status_code=500,
                detail="Ollama base URL not configured",
            )

        try:
            async with httpx.AsyncClient(
                base_url=base_url,
                timeout=httpx.Timeout(5.0),
            ) as client:
                res = await client.get("/api/tags")

            if not res.is_success:
                raise HTTPException(
                    status_code=res.status_code,
                    detail="Failed to fetch Ollama models",
                )

            payload = res.json()
            models = [
                m.get("name")
                for m in payload.get("models", [])
                if m.get("name")
            ]

            return {
                "models": models,
                "default_model": ENV.agent_ollama_model,
            }

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=500,
                detail=f"Failed to reach Ollama server: {exc}",
            ) from exc

    # -----------------------------------------------------
    # Playground Query Endpoint
    # -----------------------------------------------------

    @router.post("/agent/playground/query")
    async def playground_query(
        request: PlaygroundQueryRequest,
    ) -> Dict[str, Any]:
        model = _normalize_model(request.model)

        try:
            if _should_bypass_mcp_agent(request.prompt):
                result = await generate_direct_response(
                    request.prompt,
                    model=model,
                    additional_instructions="Answer directly.",
                )
                return {"response": result, "mode": "direct_llm"}

            all_tools = await _list_combined_tool_names()

            if not all_tools:
                raise HTTPException(
                    status_code=502,
                    detail="No tools available from MCP server",
                )

            # validate user tool selection
            if request.selected_tools:
                unknown = [
                    t for t in request.selected_tools
                    if t not in all_tools
                ]
                if unknown:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown tools requested: {unknown}",
                    )
                selected_tools = request.selected_tools
            else:
                selected_tools = _select_relevant_tools(
                    request.prompt,
                    all_tools,
                    max_tools=12,
                )

            instructions = _build_tool_only_instructions(selected_tools)

            agent = build_agent_with_model(
                model,
                disallowed_tools=[
                    t for t in all_tools if t not in selected_tools
                ],
                additional_instructions=instructions,
                max_steps=8,
                retry_on_error=False,
                memory_enabled=False,
            )

            try:
                result = await agent.run(request.prompt)
            except Exception as exc:
                if not _is_recursion_limit_error(exc):
                    raise
                result = await generate_direct_response(
                    request.prompt,
                    model=model,
                    additional_instructions="Answer directly.",
                )

            return {"response": result, "mode": "mcp_agent"}

        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Playground agent failed: {exc}",
            ) from exc

    return router