from langchain_core.callbacks import BaseCallbackHandler
from langchain_ollama import ChatOllama
from mcp_use import MCPAgent, MCPClient


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
            "http_server": {
                "url": "http://11.0.25.132:8005/mcp",
            }
        }
    }

    client = MCPClient(config)

    llm = ChatOllama(
        model="gpt-oss:120b",
        base_url="http://11.0.25.132:11434",
        temperature=0.7,
        callbacks=[LLMDebugCallback()],
    )

    return MCPAgent(llm=llm, client=client, callbacks=[LLMDebugCallback()])
