from typing import Any

from fastapi import APIRouter


def create_agent_router(agent) -> APIRouter:
    router = APIRouter()

    @router.get("/agent/query")
    async def query(
        prompt: str,
        current_user: dict[str, Any] | None = None,
    ) -> dict[str, Any]:
        _ = current_user
        result = await agent.run(prompt)
        return {"response": result}

    return router
