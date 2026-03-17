from langchain_core.callbacks import BaseCallbackHandler
from langchain_ollama import ChatOllama
from mcp_use import MCPAgent, MCPClient

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
