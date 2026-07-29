# MCP Inspector & Keycloak Authentication Setup Guide (Air-Gapped / Offline Network)

This guide provides step-by-step instructions to set up **MCP Inspector** (`@modelcontextprotocol/inspector`), authenticate against **Keycloak**, discover all exposed MCP tools, and execute tool calls in both online and air-gapped / offline enterprise networks.

---

## 1. System Overview & Protocol Flow

```
┌────────────────────────────────┐       1. Fetch JWT Token       ┌────────────────────────────────┐
│   MCP Inspector (Client)       ├───────────────────────────────►│    Keycloak Identity Provider  │
│ (@modelcontextprotocol/inspect)│◄───────────────────────────────┤   (Port 8080 / OIDC Realm)     │
└──────────────┬─────────────────┘      2. Access Token Received  └────────────────────────────────┘
               │
               │ 3. Connect via SSE / HTTP Streamable Client
               │    Url: http://<SERVER_IP>:8000/mcp/apps/?token=<KEYCLOAK_TOKEN>
               ▼
┌──────────────────────────────────────────────────────────────────────────────────────────────────┐
│                             MCP Server Manager Gateway (Port 8000)                              │
├──────────────────────────────────────────────────────────────────────────────────────────────────┤
│  • JWTAuthASGIMiddleware validates Keycloak token & permissions                                 │
│  • Exposes ListTools and CallTool over Standard MCP JSON-RPC Protocol                            │
└──────────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Offline / Air-Gapped Network Preparation

If your deployment server is in an isolated or air-gapped network with no public internet access, prepare the MCP Inspector package beforehand.

### Method A: Global Package Tarball (Offline Node.js)
1. On an internet-connected machine, download `@modelcontextprotocol/inspector` and its dependencies:
   ```bash
   mkdir -p mcp-inspector-offline && cd mcp-inspector-offline
   npm pack @modelcontextprotocol/inspector
   ```
2. Transfer the `.tgz` package to your offline network host.
3. Install globally on the offline machine:
   ```bash
   npm install -g modelcontextprotocol-inspector-*.tgz
   ```

### Method B: Pre-bundled Node Environment
If Node/npm is pre-installed in your airgap environment:
```bash
# Global install if npm registry is mirrored locally:
npm install -g @modelcontextprotocol/inspector
```

---

## 3. Step 1: Obtain a Keycloak Access Token

Before connecting MCP Inspector, fetch an OIDC Access Token from Keycloak.

### A. Keycloak Token Request (curl)
Run the following command against your local/airgap Keycloak endpoint:

```bash
curl -X POST "http://<KEYCLOAK_HOST>:8080/realms/IAF/protocol/openid-connect/token" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "grant_type=password" \
  -d "client_id=mcp-frontend" \
  -d "username=admin" \
  -d "password=adminpassword"
```

*Note: Replace `IAF` with your target realm (e.g. `mcp-realm`) and user credentials if different.*

### Response Example:
```json
{
  "access_token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expires_in": 300,
  "refresh_expires_in": 1800,
  "token_type": "Bearer",
  "scope": "openid profile email"
}
```

Copy the value of `access_token`.

---

## 4. Step 2: Connect MCP Inspector with Keycloak Token

### Option A: Launching via CLI with Token URL Parameter

Run MCP Inspector, passing the token via the `?token=` query parameter:

```bash
npx @modelcontextprotocol/inspector "http://localhost:8000/mcp/apps/?token=<YOUR_KEYCLOAK_ACCESS_TOKEN>"
```

### Option B: Using the MCP Inspector Web Interface

1. Open MCP Inspector in your browser (default URL: `http://localhost:5173`).
2. Set the connection configuration parameters:
   - **Transport Type**: Select `SSE` or `HTTP`
   - **URL**: `http://localhost:8000/mcp/apps/?token=<YOUR_KEYCLOAK_ACCESS_TOKEN>`
3. If using custom headers (in Inspector UI or via Proxy):
   - **Header Name**: `Authorization`
   - **Header Value**: `Bearer <YOUR_KEYCLOAK_ACCESS_TOKEN>`
4. Click **Connect**.

---

## 5. Step 3: Discover & List Available Tools

Upon successful handshake:
1. MCP Inspector sends a `tools/list` JSON-RPC request to the MCP Gateway.
2. The Gateway checks user role and tenant permissions for the token claims.
3. The interface displays all exposed tools.

### Sample Discovered Tools List:

| Tool Name | Source | Description |
|---|---|---|
| `mcp_client_secure__root__get` | OpenApi App | Root health & info check endpoint |
| `mcp_client_secure__current_time_time_get` | OpenApi App | Returns current system UTC timestamp |
| `mcp_client_secure__inventory_items_apps_inventory_items_get` | OpenApi App | Returns inventory item catalog |
| `mcp_client_secure__portal_dashboard_apps_portal_dashboard_get` | OpenApi App | Portal system dashboard statistics |
| `mcp_client_secure__analytics_metrics_apps_analytics_metrics_get` | OpenApi App | Analytics performance metrics |

---

## 6. Step 4: Execute / Call Tools from MCP Inspector

1. Select a tool from the left navigation panel (e.g. `mcp_client_secure__root__get`).
2. Provide input argument parameters in the JSON editor:
   ```json
   {}
   ```
3. Click **Run Tool** or **Execute**.
4. Review the response in the Inspector output panel:

### Execution Output Response:
```json
{
  "tool": "mcp_client_secure__root__get",
  "isError": false,
  "content": [
    {
      "type": "text",
      "text": "{\"app\":\"mcp-client-secure\",\"tool\":\"mcp_client_secure__root__get\",\"method\":\"GET\",\"url\":\"http://10.139.10.176:8001/\",\"status_code\":200,\"ok\":true,\"content_type\":\"application/json\",\"body\":{\"status\":\"ok\",\"message\":\"Mock MCP + FastAPI server is running\"}}"
    }
  ],
  "structuredContent": {
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
}
```

---

## 7. Air-Gapped & Offline Troubleshooting

### 1. Token Expiry (401 Unauthorized)
Keycloak tokens expire (typically after 5-15 minutes). If tool calls return `401 Unauthorized`:
- Re-run the token request curl command to get a fresh `access_token`.
- Reconnect MCP Inspector with the updated `?token=<NEW_TOKEN>` parameter.

### 2. Dev / Internal Debugging Bypass (Offline Local Testing)
For local testing without querying Keycloak, you can use the loopback header:
- URL: `http://localhost:8000/mcp/apps/`
- Custom Headers:
  - `x-internal-loopback`: `true`
  - `X-User`: `admin`

### 3. Docker Air-Gap Script
An offline execution helper script is included in `documents/test_mcp_client.py`:
```bash
docker exec -i mcp-backend python3 - < documents/test_mcp_client.py
```
This performs a full client initialization, tools listing, and tool execution without external internet dependencies.
