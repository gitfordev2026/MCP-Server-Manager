from typing import Any, Callable

from fastapi import APIRouter, HTTPException
import httpx
from mcp_use import MCPClient
from pydantic import BaseModel

from app.core.db import SessionLocal
from app.env import ENV
from app.models.db_models import AccessPolicyModel, BaseURLModel, MCPToolModel, ServerModel
from app.services.registry.exposure_service import resolve_exposable_tools
from app.services.agent_runtime import generate_direct_response


class PlaygroundQueryRequest(BaseModel):
    prompt: str
    app_name: str | None = None
    selected_tools: list[str] | None = None
    model: str | None = None


def _build_mcp_client() -> MCPClient:
    config = {
        "mcpServers": {
            ENV.agent_mcp_server_name: {
                "url": ENV.agent_mcp_server_url,
            }
        }
    }
    return MCPClient(config)


async def _list_combined_tool_names() -> list[str]:
    client = _build_mcp_client()
    await client.create_all_sessions(auto_initialize=True)
    session = client.get_session(ENV.agent_mcp_server_name)
    tools = await session.list_tools()
    return sorted({tool.name for tool in tools})


def _list_exposed_tool_catalog() -> list[dict[str, Any]]:
    with SessionLocal() as db:
        tools_list, _ = resolve_exposable_tools(
            db,
            MCPToolModel,
            AccessPolicyModel,
            ServerModel,
            BaseURLModel,
            public_only=True,
        )
    return tools_list


def _build_tool_only_instructions(selected_tools: list[str]) -> str:
    tools_list = ", ".join(selected_tools)
    return (
        "You are a MCP tool-testing agent. "
        "Use tools for actionable requests when a relevant tool is available. "
        "Do not answer from your own knowledge. "
        "Only use these tools: "
        f"{tools_list}. "
        "If the user asks for the list of tools, respond with the available tools grouped by application. "
        "If no tool applies, respond with: 'No suitable tool available with the current tool set.' "
        "After a tool call, provide a final answer using the tool result and stop. Do not loop."
    )


def _is_recursion_limit_error(exc: Exception) -> bool:
    message = str(exc).lower()
    return "recursion limit" in message and "stop condition" in message


def _fallback_prompt_instructions() -> str:
    return (
        "Answer the user directly without using MCP tools. "
        "Be concise, follow the user's requested format exactly, and do not mention tools or internal execution details."
    )


def _should_bypass_mcp_agent(prompt: str) -> bool:
    normalized = " ".join((prompt or "").strip().lower().split())
    if not normalized:
        return False

    strong_signals = [
        "document an api",
        "api documentation",
        "tool description",
        "endpoint description",
        "generate a precise description",
        "generate a concise description",
        "return 1-2 sentences only",
        "return 1-2 sentence only",
        "1-2 sentences only",
        "help an llm choose and call the tool correctly",
    ]
    if any(signal in normalized for signal in strong_signals):
        return True

    weaker_signals = [
        "app name:",
        "app description:",
        "endpoint:",
        "summary:",
        "current description:",
        "generate",
        "description",
        "document",
        "tool",
        "endpoint",
        "api",
    ]
    matched = sum(1 for signal in weaker_signals if signal in normalized)
    return matched >= 5


def create_agent_router(build_agent_with_model: Callable[..., Any]) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/agent/query",
        summary="Run Agent Query",
        description="Execute a prompt using configured agent runtime. Source: backend/app/routers/agent.py",
    )
    async def query(
        prompt: str,
        model: str
    ) -> dict[str, Any]:
        try:
            if _should_bypass_mcp_agent(prompt):
                result = await generate_direct_response(
                    prompt,
                    model=model,
                    additional_instructions=_fallback_prompt_instructions(),
                )
                return {"response": result, "mode": "direct_llm"}

            all_tools = await _list_combined_tool_names()
            if not all_tools:
                raise HTTPException(status_code=502, detail="No tools available from combined MCP endpoint")
            instructions = _build_tool_only_instructions(all_tools)
            model_agent = build_agent_with_model(
                model,
                disallowed_tools=[],
                additional_instructions=instructions,
                max_steps=8,
                retry_on_error=False,
                memory_enabled=False,
            )
            model_agent.tools_used_names = []
            try:
                result = await model_agent.run(prompt)
            except Exception as exc:
                if not _is_recursion_limit_error(exc):
                    raise
                result = await generate_direct_response(
                    prompt,
                    model=model,
                    additional_instructions=_fallback_prompt_instructions(),
                )
            return {"response": result, "mode": "mcp_agent"}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Agent backend unavailable. Check MCP server URL ({ENV.agent_mcp_server_url}) and ensure it is running. "
                    f"Error: {exc}"
                ),
            ) from exc

    @router.get(
        "/agent/models",
        summary="List Ollama Models",
        description="List available Ollama models for playground selection.",
    )
    async def list_models() -> dict[str, Any]:
        base_url = (ENV.agent_ollama_base_url or "").rstrip("/")
        if not base_url:
            raise HTTPException(status_code=500, detail="Ollama base URL is not configured")
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                res = await client.get(f"{base_url}/api/tags")
            if not res.is_success:
                raise HTTPException(status_code=res.status_code, detail="Failed to fetch Ollama models")
            payload = res.json()
            models = [m.get("name") for m in payload.get("models", []) if m.get("name")]
            return {"models": models, "default_model": ENV.agent_ollama_model}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(status_code=500, detail=f"Failed to reach Ollama server: {exc}") from exc

    @router.post(
        "/agent/playground/query",
        summary="Run Agent Playground Query",
        description="Execute a prompt with forced instructions to only use the specified tools for a given app. Source: backend/app/routers/agent.py",
    )
    async def playground_query(
        request: PlaygroundQueryRequest,
    ) -> dict[str, Any]:
        try:
            if _should_bypass_mcp_agent(request.prompt):
                result = await generate_direct_response(
                    request.prompt,
                    model=request.model.strip() if request.model and request.model.strip() else None,
                    additional_instructions=_fallback_prompt_instructions(),
                )
                return {"response": result, "mode": "direct_llm"}

            all_tools = await _list_combined_tool_names()
            if not all_tools:
                raise HTTPException(status_code=502, detail="No tools available from combined MCP endpoint")

            normalized_prompt = " ".join((request.prompt or "").strip().lower().split())
            if request.selected_tools is not None and len(request.selected_tools) == 0:
                raise HTTPException(status_code=400, detail="No tools selected for playground request")

            if request.selected_tools:
                unknown = [tool for tool in request.selected_tools if tool not in all_tools]
                if unknown:
                    raise HTTPException(
                        status_code=400,
                        detail=f"Unknown tools requested: {', '.join(sorted(unknown))}",
                    )
                selected_tools = request.selected_tools
            else:
                selected_tools = all_tools

            # Fast-path: tool inventory request should return the allowed tool list directly.
            if (
                normalized_prompt in {
                    "list tools",
                    "list all tools",
                    "show tools",
                    "show all tools",
                    "available tools",
                    "what tools are available",
                    "tools",
                }
                or ("tool" in normalized_prompt and ("list" in normalized_prompt or "show" in normalized_prompt))
            ):
                catalog = _list_exposed_tool_catalog()
                allowed_set = set(selected_tools)
                combined_set = set(all_tools)
                grouped: dict[str, list[dict[str, Any]]] = {}
                for item in catalog:
                    name = str(item.get("name", ""))
                    app = str(item.get("app", "unknown"))
                    if name not in allowed_set or name not in combined_set:
                        continue
                    grouped.setdefault(app, []).append(item)

                response_lines: list[str] = []
                for app in sorted(grouped.keys()):
                    response_lines.append(f"{app}:")
                    for tool in sorted(grouped[app], key=lambda t: str(t.get("name", ""))):
                        desc = (tool.get("description") or "").strip()
                        if desc:
                            response_lines.append(f"- {tool.get('name')}: {desc}")
                        else:
                            response_lines.append(f"- {tool.get('name')}")
                    response_lines.append("")

                if not response_lines:
                    response_lines = ["No tools available for the current selection."]

                return {
                    "response": "\n".join(response_lines).strip(),
                    "tools_by_app": grouped,
                    "mode": "tool_inventory",
                }

            disallowed_tools = [tool for tool in all_tools if tool not in selected_tools]
            instructions = _build_tool_only_instructions(selected_tools)

            model_agent = build_agent_with_model(
                request.model.strip() if request.model and request.model.strip() else None,
                disallowed_tools=disallowed_tools,
                additional_instructions=instructions,
                max_steps=8,
                retry_on_error=False,
                memory_enabled=False,
            )
            model_agent.tools_used_names = []
            try:
                result = await model_agent.run(request.prompt)
            except Exception as exc:
                if not _is_recursion_limit_error(exc):
                    raise
                result = await generate_direct_response(
                    request.prompt,
                    model=request.model.strip() if request.model and request.model.strip() else None,
                    additional_instructions=_fallback_prompt_instructions(),
                )
            return {"response": result, "mode": "mcp_agent"}
        except HTTPException:
            raise
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=(
                    f"Agent backend unavailable. Check MCP server URL ({ENV.agent_mcp_server_url}) and ensure it is running. "
                    f"Error: {exc}"
                ),
            ) from exc

    return router
