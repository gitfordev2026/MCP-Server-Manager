from langchain_core.callbacks import BaseCallbackHandler
from langchain_ollama import ChatOllama
from mcp_use import MCPAgent, MCPClient

from backend.env import ENV


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


def build_default_agent() -> MCPAgent:
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

    return MCPAgent(llm=llm, client=client, callbacks=callbacks)
