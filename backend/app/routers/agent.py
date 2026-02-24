from typing import Any

from fastapi import APIRouter


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

    return router
