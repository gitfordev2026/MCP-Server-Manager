from typing import Any, Callable
from pydantic import BaseModel

from fastapi import APIRouter, Depends, HTTPException
import httpx

from app.env import ENV


class PlaygroundQueryRequest(BaseModel):
    prompt: str
    app_name: str | None = None
    selected_tools: list[str] | None = None
    model: str | None = None

def create_agent_router(agent, build_agent_with_model: Callable[[str], Any], get_actor_dep) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/agent/query",
        summary="Run Agent Query",
        description="Execute a prompt using configured agent runtime. Source: backend/app/routers/agent.py",
    )
    async def query(
        prompt: str,
        current_user: dict[str, Any] | None = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        _ = current_user
        try:
            result = await agent.run(prompt)
            return {"response": result}
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Agent backend unavailable. Check MCP server URL ({ENV.agent_mcp_server_url}) and ensure it is running. Error: {exc}",
            ) from exc

    @router.get(
        "/agent/models",
        summary="List Ollama Models",
        description="List available Ollama models for playground selection.",
    )
    async def list_models(
        current_user: dict[str, Any] | None = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        _ = current_user
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
        current_user: dict[str, Any] | None = Depends(get_actor_dep),
    ) -> dict[str, Any]:
        _ = current_user
        
        system_instructions = ""
        if request.app_name and request.selected_tools:
            tools_list = ", ".join(request.selected_tools)
            system_instructions = (
                f"You are a strict testing agent for the application '{request.app_name}'. "
                f"You MUST only use the following tools: {tools_list}. "
                "Do NOT attempt to use any tools from other applications, even if they seem relevant. "
                "If the user asks you to do something that cannot be accomplished with these specific tools, "
                "politely explain that you are restricted to testing only the selected tools for this application.\n\n"
            )
            
        full_prompt = system_instructions + "USER PROMPT:\n" + request.prompt
        try:
            if request.model and request.model.strip() and request.model.strip() != ENV.agent_ollama_model:
                model_agent = build_agent_with_model(request.model.strip())
                result = await model_agent.run(full_prompt)
            else:
                result = await agent.run(full_prompt)
            return {"response": result}
        except Exception as exc:
            raise HTTPException(
                status_code=502,
                detail=f"Agent backend unavailable. Check MCP server URL ({ENV.agent_mcp_server_url}) and ensure it is running. Error: {exc}",
            ) from exc

    return router
