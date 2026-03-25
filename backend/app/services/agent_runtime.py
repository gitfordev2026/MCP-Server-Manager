from collections.abc import AsyncIterator
from typing import Any

from langchain_core.callbacks import BaseCallbackHandler
from langchain_core.messages import AIMessage
from langchain_ollama import ChatOllama
from mcp_use.agents.mcpagent import MCPAgent
from mcp_use.client import MCPClient

from app.env import ENV


class LLMDebugCallback(BaseCallbackHandler):
    def on_llm_start(self, serialized, prompts, **kwargs):
        print("\n=================== LLM PROMPT SENT ===================")
        for prompt in prompts:
            print(prompt)
        print("=======================================================\n")

    def on_llm_end(self, response, **kwargs):
        print("\n=================== RAW LLM RESPONSE ===================")
        print(response)
        print("=======================================================\n")


def _normalize_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for item in content:
            if isinstance(item, dict) and item.get("type") == "text":
                parts.append(str(item.get("text") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)
    return str(content)


def build_default_agent(
    disallowed_tools: list[str] | None = None,
    additional_instructions: str | None = None,
    max_steps: int | None = None,
    retry_on_error: bool | None = None,
    memory_enabled: bool | None = None,
) -> MCPAgent:
    config = {
        "mcpServers": {
            ENV.agent_mcp_server_name: {
                "url": ENV.agent_mcp_server_url,
            }
        }
    }

    client = MCPClient(config)
    callbacks = [LLMDebugCallback()] if ENV.agent_debug_callbacks else []

    llm = ChatOllama(
        model=ENV.agent_ollama_model,
        base_url=ENV.agent_ollama_base_url,
        temperature=ENV.agent_ollama_temperature,
        callbacks=callbacks,
    )

    return MCPAgent(
        llm=llm,
        client=client,
        callbacks=callbacks,
        disallowed_tools=disallowed_tools,
        additional_instructions=additional_instructions,
        max_steps=max_steps or 5,
        retry_on_error=True if retry_on_error is None else retry_on_error,
        memory_enabled=True if memory_enabled is None else memory_enabled,
    )


def build_agent_with_model(
    model: str | None = None,
    disallowed_tools: list[str] | None = None,
    additional_instructions: str | None = None,
    max_steps: int | None = None,
    retry_on_error: bool | None = None,
    memory_enabled: bool | None = None,
) -> MCPAgent:
    config = {
        "mcpServers": {
            ENV.agent_mcp_server_name: {
                "url": ENV.agent_mcp_server_url,
            }
        }
    }

    client = MCPClient(config)
    callbacks = [LLMDebugCallback()] if ENV.agent_debug_callbacks else []

    resolved_model = model or ENV.agent_ollama_model
    llm = ChatOllama(
        model=resolved_model,
        base_url=ENV.agent_ollama_base_url,
        temperature=ENV.agent_ollama_temperature,
        callbacks=callbacks,
    )

    return MCPAgent(
        llm=llm,
        client=client,
        callbacks=callbacks,
        disallowed_tools=disallowed_tools,
        additional_instructions=additional_instructions,
        max_steps=max_steps or 5,
        retry_on_error=True if retry_on_error is None else retry_on_error,
        memory_enabled=True if memory_enabled is None else memory_enabled,
    )


async def generate_direct_response(
    prompt: str,
    model: str | None = None,
    additional_instructions: str | None = None,
) -> str:
    callbacks = [LLMDebugCallback()] if ENV.agent_debug_callbacks else []
    resolved_model = model or ENV.agent_ollama_model
    llm = ChatOllama(
        model=resolved_model,
        base_url=ENV.agent_ollama_base_url,
        temperature=ENV.agent_ollama_temperature,
        callbacks=callbacks,
    )

    full_prompt = prompt.strip()
    if additional_instructions:
        full_prompt = f"{additional_instructions.strip()}\n\n{full_prompt}"

    response = await llm.ainvoke(full_prompt)
    if isinstance(response, AIMessage):
        content = response.content
    else:
        content = getattr(response, "content", response)

    return _normalize_content(content).strip()


async def stream_direct_response_chunks(
    prompt: str,
    model: str | None = None,
    additional_instructions: str | None = None,
) -> AsyncIterator[str]:
    callbacks = [LLMDebugCallback()] if ENV.agent_debug_callbacks else []
    resolved_model = model or ENV.agent_ollama_model
    llm = ChatOllama(
        model=resolved_model,
        base_url=ENV.agent_ollama_base_url,
        temperature=ENV.agent_ollama_temperature,
        callbacks=callbacks,
    )

    full_prompt = prompt.strip()
    if additional_instructions:
        full_prompt = f"{additional_instructions.strip()}\n\n{full_prompt}"

    async for chunk in llm.astream(full_prompt):
        content = getattr(chunk, "content", chunk)
        text = _normalize_content(content)
        if text:
            yield text
