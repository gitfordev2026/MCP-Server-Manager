# MCP Client Setup & Manual Testing Guide

This guide provides step-by-step instructions to configure an external or dummy MCP client, authenticate using Bearer tokens or loopback headers, discover registered tools, and execute tool calls against the **MCP Server Manager**.

---

## 1. Overview of MCP Endpoints & Auth

| Endpoint | Protocol | Purpose | Authentication |
|---|---|---|---|
| `http://localhost:8000/mcp/apps/` | SSE / HTTP | MCP Standard Protocol Endpoint for AI Clients (Claude Desktop, Cursor, Custom Clients) | `Authorization: Bearer <JWT_TOKEN>` or `x-internal-loopback: true` |
| `http://localhost:3000/api/proxy/mcp/apps/` | Next.js API Proxy | Proxied frontend access to MCP endpoint | Bearer Header or Session Cookie (`mcp_access_token`) |
| `http://localhost:8000/agent/query` | REST | Agent tool calling endpoint | `Authorization: Bearer <token>` |

---

## 2. Quick Test using Python Dummy MCP Client

A Python test script using the official `mcp` SDK (`mcp.client.session.ClientSession` and `mcp.client.streamable_http.streamable_http_client`) is included.

### Prerequisites

Inside Python environment with `mcp` and `httpx`:
```bash
pip install mcp httpx
```

### Python Dummy Client Script (`test_mcp_client.py`)

```python
import asyncio
import json
import httpx
from mcp.client.session import ClientSession
from mcp.client.streamable_http import streamable_http_client

BASE_URL = "http://localhost:8000/mcp/apps/"

async def main():
    print(f"Connecting to MCP Server Manager at {BASE_URL}...")
    
    # Pass Bearer token or Loopback Dev Header
    headers = {
        "x-internal-loopback": "true",
        "X-User": "admin"
        # Or: "Authorization": "Bearer <YOUR_KEYCLOAK_JWT_TOKEN>"
    }
    
    async with httpx.AsyncClient(headers=headers, timeout=30.0) as http_client:
        async with streamable_http_client(BASE_URL, http_client=http_client, terminate_on_close=True) as (read_stream, write_stream, _):
            async with ClientSession(read_stream, write_stream) as session:
                # 1. Initialize MCP Handshake
                init_res = await session.initialize()
                print(f"✅ Connected to: {init_res.serverInfo.name} v{init_res.serverInfo.version}")

                # 2. Discover exposed tools
                tools_result = await session.list_tools()
                print(f"\n📋 Discovered {len(tools_result.tools)} tool(s):")
                for i, t in enumerate(tools_result.tools, 1):
                    print(f"   {i}. [{t.name}] - {t.description[:60] if t.description else 'No description'}")

                # 3. Call a tool
                if tools_result.tools:
                    target_tool = "mcp_client_secure__root__get"
                    print(f"\n⚡ Executing tool: {target_tool}...")
                    result = await session.call_tool(target_tool, {})
                    print("📥 Result:")
                    print(json.dumps(getattr(result, "structuredContent", None) or [c.text for c in result.content], indent=2))

if __name__ == "__main__":
    asyncio.run(main())
```

---

## 3. Execution & Verification

### Running the Test Script inside Container:
```bash
docker exec -i mcp-backend python3 - < documents/test_mcp_client.py
```

### Verification Output:
```text
🔍 Connecting dummy MCP client to http://localhost:8000/mcp/apps/...
🤝 Initializing MCP session...
✅ MCP Session initialized successfully!
   Server Name: MCP SERVER MANAGER(Combined)
   Server Version: 3.4.5

📋 1. Listing available tools from MCP server...
   Discovered 30 tool(s)

⚡ Executing tool 'mcp_client_secure__root__get' via dummy MCP client...
   Status Code / Ok: True
   Response Body:
   {
      "app": "mcp-client-secure",
      "tool": "mcp_client_secure__root__get",
      "method": "GET",
      "url": "http://10.139.10.176:8001/",
      "status_code": 200,
      "ok": true,
      "body": {
         "status": "ok",
         "message": "Mock MCP + FastAPI server is running"
      }
   }
```

---

## 4. Manual Testing with curl / HTTP Clients

### A. Fetch Authentication Token (Keycloak OIDC)
```bash
curl -X POST "http://localhost:8080/realms/mcp-realm/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password&client_id=mcp-frontend&username=admin&password=adminpassword"
```

### B. Execute Agent Query (invokes MCP tools automatically)
```bash
curl -X POST "http://localhost:8000/agent/query" \
  -H "Authorization: Bearer <YOUR_ACCESS_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Check the status of root API endpoint",
    "model": "gemma4:cloud"
  }'
```
