from typing import Any
from pydantic import BaseModel

from fastapi import APIRouter


class PlaygroundQueryRequest(BaseModel):
    prompt: str
    app_name: str | None = None
    selected_tools: list[str] | None = None

def create_agent_router(agent) -> APIRouter:
    router = APIRouter()

    @router.get(
        "/agent/query",
        summary="Run Agent Query",
        description="Execute a prompt using configured agent runtime. Source: backend/app/routers/agent.py",
    )
    async def query(
        prompt: str,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        result = await agent.run(prompt)
        return {"response": result}

    @router.post(
        "/agent/playground/query",
        summary="Run Agent Playground Query",
        description="Execute a prompt with forced instructions to only use the specified tools for a given app. Source: backend/app/routers/agent.py",
    )
    async def playground_query(
        request: PlaygroundQueryRequest,
        current_user: dict[str, Any] | None = None,
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
        result = await agent.run(full_prompt)
        return {"response": result}

    return router
