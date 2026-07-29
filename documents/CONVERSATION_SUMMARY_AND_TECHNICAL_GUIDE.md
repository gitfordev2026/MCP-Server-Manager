# MCP Server Manager: Conversation Log & Technical Reference Guide

This document captures the complete chronological record, technical findings, architecture decisions, code modifications, and operational guides discussed throughout this conversation session.

---

## 1. Overview of Tasks & Achievements

| Task / Query | Status | Key Outcome / Solution |
|---|---|---|
| **MCP Client Verification** | ✅ Verified | Built and executed Python test script `documents/test_mcp_client.py`. Discovered signature bug in `invoke_openapi_tool()` and fixed it. Verified discovery of 30 tools and execution. |
| **MCP Production Audit** | ✅ Fixed & Pushed | Fixed DNS rebinding protection in FastMCP v3.4.5, implemented 3 missing `/.well-known/` OAuth endpoints, updated `JWTAuthASGIMiddleware` challenges, and fixed CORS wildcard issues. |
| **Streaming & Proxy Optimization** | ✅ Fixed | Rewrote Next.js frontend proxy (`route.ts`) to stream SSE without buffering (120s timeout, anti-buffering headers, cookie-to-bearer token injection). |
| **MCP Inspector Setup Guide** | ✅ Documented | Created `documents/MCP_INSPECTOR_KEYCLOAK_GUIDE.md` for both online and air-gapped / offline enterprise networks. |
| **VS Code OAuth Registration Issue** | ✅ Resolved & Explained | Diagnosed why VS Code prompts for manual Client ID (Keycloak default blocks RFC 7591 dynamic registration). Provided 3 resolution solutions. |
| **Token Refresh & Lifecycle** | ✅ Documented | Explained OAuth 2.1 silent background refresh using `refresh_token` without user re-login. |
| **Direct vs. Proxy URLs** | ✅ Clarified | Defined recommendation matrix for when to use Direct Backend (`:8000`) vs. Frontend Proxy (`:3000`). |
| **LLM vs. MCP Tool Execution Architecture** | ✅ Clarified | Clarified that Ollama/LLMs only output tool call JSON reasoning, while MCP Server Manager executes real downstream HTTP REST requests. |
| **Eliminated UI Flashing (FOUC)** | ✅ Fixed | Created `UserContext` and updated `AuthGuard` to verify user identity & role BEFORE mounting protected pages. Prevents unauthorized content flashes even for milliseconds. |
| **Role-Based Component Rendering** | ✅ Fixed | Removed hard `/access-denied` redirect for non-admins on `/admin`. Non-admin users (e.g. `developer`, `operator`, `read_only`) can access `/admin`, which dynamically displays only allowable components, tabs, and actions unique to their role. |
| **Light Theme User Message Color** | ✅ Fixed | Added `isUser` prop to `MessageContent` component and updated user message bubbles in Playground and Chat pages to render headers, bold text, italics, lists, tables, and paragraphs in high-contrast white/light-blue in Light Theme. |
| **Ollama Tool Name Resolution & Execution** | ✅ Fixed | Resolved `MCPAgent` execution timeout (increased from 4.0s to 45.0s) and implemented `_resolve_tool_name` with direct in-process `combined_apps_mcp` tool execution, forwarding user auth tokens to execute downstream API tools reliably. |

---

## 2. Architecture & Design Decisions

```
                                  ┌───────────────────────────────┐
                                  │      Keycloak IdP Server      │
                                  │   (Port 8080 / OIDC Realm)    │
                                  └──────────────▲────────────────┘
                                                 │
                             1. OIDC OAuth Flow  │ 2. Token Issuance
                             (PKCE / Client Cred)│    / JWKS Public Keys
                                                 │
┌──────────────────────────────┐                 │
│         MCP Clients          ├─────────────────┼────────────────────────────────────────┐
│  • MCP Inspector             │                 │                                        │
│  • Claude Desktop            │                 │                                        │
│  • Cursor / VS Code          │                 │                                        │
│  • Custom AI Agents          │                 │                                        │
└──────────────┬───────────────┘                 │                                        │
               │                                 │                                        │
               │ 3. Direct MCP Request           │                                        │
               │    Authorization: Bearer <jwt>  │                                        │
               │    (or ?token=<jwt>)            │                                        │
               ▼                                 ▼                                        │
┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│                               NEXT.JS FRONTEND PROXY                                 │  │
│                              (Port 3000 / /api/proxy)                                │  │
│                                                                                      │  │
│  • Extracts `access_token` cookie & injects `Authorization: Bearer <token>`          │  │
│  • Disables response buffering (`X-Accel-Buffering: no`, `Cache-Control: no-cache`)  │  │
│  • Forwards MCP headers (`Mcp-Session-Id`, `Last-Event-ID`, `Accept`, etc.)          │  │
└──────────────────────────────────────┬───────────────────────────────────────────────┘  │
                                       │                                                  │
                                       │ 4. Proxied / Direct Streamable HTTP Request      │
                                       ▼                                                  │
┌──────────────────────────────────────────────────────────────────────────────────────┐  │
│                             FASTAPI BACKEND GATEWAY                                  │  │
│                                   (Port 8000)                                        │  │
├──────────────────────────────────────────────────────────────────────────────────────┤  │
│  1. HostOriginProtection Guard (FastMCP v3.x) - Prevents DNS Rebinding                │  │
│  2. Explicit CORS Allowed Origins                                                    │  │
│  3. Unauthenticated OAuth Discovery Endpoints (`/.well-known/`)                      │  │
│  4. JWTAuthASGIMiddleware (Validates Keycloak Tokens & Returns Challenges)           │  │
│  5. FastMCP Streamable HTTP Engine (/mcp/apps/)                                      │  │
└──────────────────────────────────────────────────────────────────────────────────────┘  │
                                                                                          │
                                5. Real Downstream HTTP REST API Call                     │
                               ───────────────────────────────────────────────────────────┘
```

---

## 3. Code Modifications & Audited Files

### Summary of Changed Files
1. `backend/app/env.py`: Added `mcp_allowed_origins` and `mcp_allowed_hosts` to `BackendEnv`.
2. `backend/app/core/mcp_runtime.py`: Rewrote `build_fastmcp_asgi_app` to pass host/origin protection settings directly to `FastMCP.http_app()`.
3. `backend/app/core/hmac_middleware.py`: Exempted `/mcp/` and `/.well-known/` paths from HMAC signature verification.
4. `backend/app/main.py`: Registered `.well-known` endpoints in `PUBLIC_PATHS`, added 3 discovery routes, fixed CORS configuration, updated `JWTAuthASGIMiddleware` challenge headers.
5. `frontend/app/api/proxy/[...path]/route.ts`: Extended timeout to 120s for MCP, added cookie token extraction to `Authorization: Bearer`, added anti-buffering response headers, enabled redirect following for MCP routes.

---

## 4. Key Technical Concepts & FAQ

### Q1: Why did VS Code report "Dynamic Client Registration not supported"?
- **Cause**: VS Code attempts RFC 7591 Dynamic Client Registration against Keycloak when connecting without a token. Keycloak blocks unauthenticated dynamic registration by default.
- **Fix**: Provide Keycloak Client ID `mcp-client-secure` (or create a public client `vscode-mcp-client`) and add redirect URIs `http://127.0.0.1:*` and `https://vscode.dev/redirect` in Keycloak. Alternatively, pass `?token=<JWT>` in the connection URL.

### Q2: How do tokens refresh without repeated logins?
- When a user logs in via PKCE, Keycloak issues a short-lived `access_token` (e.g. 5 minutes) and a long-lived `refresh_token` (e.g. 30 days).
- When the access token expires, VS Code sends a silent background POST request using `grant_type=refresh_token`. Keycloak issues a new access token without opening a browser window.

### Q3: Direct vs. Proxy URLs — Which should I use?
- **Direct Backend URL (`http://10.139.10.176:8000/mcp/apps/`)**: Use for IDEs (VS Code, Cursor), Claude Desktop, MCP Inspector, and machine-to-machine integrations.
- **Frontend Proxy URL (`http://10.139.10.176:3000/api/proxy/mcp/apps`)**: Use for Web Browser Chat UIs logged into the Next.js dashboard (automatically extracts HttpOnly cookies).

### Q4: Who executes the tool — Ollama or the MCP Server Manager?
- **Ollama / LLM**: Reasoning Engine (decides *which* tool to call based on text prompt).
- **MCP Server Manager**: Execution Engine & Security Gateway (verifies Keycloak JWT -> checks RBAC -> converts tool request -> executes real downstream REST HTTP API call -> returns data).

---

## 5. Verification & Git Commit Log

- **Git Branch**: `issue/mcp-auth`
- **Commits**:
  - `1d6b4147`: `fix(mcp): Add missing user_token arg to invoke_openapi_tool and add MCP client setup & testing guide`
  - `0c606aaf`: `docs(mcp): Add MCP Inspector & Keycloak auth offline setup guide`
  - `de96a228`: `fix(mcp): Production-grade MCP audit fixes for spec compliance, OAuth 2.1 discovery, DNS rebinding, and SSE streaming`
  - `b1601e45`: `docs(mcp): Add comprehensive MCP Production Audit and Specification Compliance Report`
