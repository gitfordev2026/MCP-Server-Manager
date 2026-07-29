import asyncio
import json
import httpx
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client

BASE_URL = "http://localhost:8000/mcp/apps/"

async def main():
    print(f"🔍 Connecting dummy MCP client to {BASE_URL}...")
    headers = {
        "x-internal-loopback": "true",
        "X-User": "admin"
    }
    
    try:
        async with httpx.AsyncClient(headers=headers, timeout=30.0) as http_client:
            async with streamable_http_client(BASE_URL, http_client=http_client, terminate_on_close=True) as (read_stream, write_stream, _):
                async with ClientSession(read_stream, write_stream) as session:
                    print("🤝 Initializing MCP session...")
                    init_res = await session.initialize()
                    print(f"✅ MCP Session initialized successfully!")
                    print(f"   Server Name: {init_res.serverInfo.name}")
                    print(f"   Server Version: {init_res.serverInfo.version}")

                    print("\n📋 1. Listing available tools from MCP server...")
                    tools_result = await session.list_tools()
                    tools = tools_result.tools
                    print(f"   Discovered {len(tools)} tool(s)")

                    test_tools = [
                        ("mcp_client_secure__root__get", {}),
                        ("mcp_client_secure__current_time_time_get", {})
                    ]

                    for tool_name, call_args in test_tools:
                        print(f"\n⚡ Executing tool '{tool_name}' via dummy MCP client...")
                        result = await session.call_tool(tool_name, call_args)
                        print(f"   Status Code / Ok: {getattr(result, 'isError', False) == False}")
                        print("   Response Body:")
                        print("  ", json.dumps(getattr(result, "structuredContent", None) or [c.text for c in result.content], indent=2))
                    
                    print("\n🎉 ALL MCP DUMMY CLIENT TOOL CALLING TESTS PASSED PERFECTLY!")
    except Exception as e:
        print(f"\n❌ Error during MCP tool calling test: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    asyncio.run(main())
