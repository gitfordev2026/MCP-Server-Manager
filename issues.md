Based on **all the logs, code, and tests** we've gone through, here's a consolidated plan to get your MCP tool-calling architecture working reliably.

---

# Current Architecture

```text
Frontend (React/Svelte/Angular)
        │
        │ Bearer JWT
        ▼
FastAPI Backend
        │
        │ build_agent_with_model()
        ▼
MCP Client (mcp-use)
        │
        ▼
MCP Server
        │
        ▼
Raw APIs (Inventory, User, Documents...)
```

The problem is that the **JWT is not propagated through the entire chain**.

---

# Root Cause 1 - JWT is lost after backend authentication ⭐⭐⭐⭐⭐

## Current

```
Frontend
    │
Bearer Token
    │
    ▼
Backend

validate JWT

↓

actor only

↓

MCPClient()

↓

401
```

## Fix

```
Frontend
    │
Bearer Token
    │
    ▼
Backend

validate JWT

↓

extract original JWT

↓

pass JWT to MCPClient

↓

Authorization: Bearer xxx
```

---

# Root Cause 2 - MCPClient has no authentication ⭐⭐⭐⭐⭐

Current

```python
client = MCPClient(config)
```

Config only contains

```
url
```

It must also receive authentication information appropriate for your installed `mcp-use` version so every request to the MCP server includes:

```
Authorization: Bearer <JWT>
```

---

# Root Cause 3 - Raw APIs never receive the JWT ⭐⭐⭐⭐⭐

Current

```
Frontend

↓

Backend

↓

MCP

↓

Inventory API
```

Expected

```
Frontend

↓

Backend

↓

MCP

↓

Authorization: Bearer <same JWT>

↓

Inventory API
```

Every downstream API should receive the **same user JWT**.

---

# Root Cause 4 - Tool timeout too small ⭐⭐⭐⭐☆

Current

```
timeout = 4
```

Increase to

```
30–60 seconds
```

because a tool call includes:

```
LLM

↓

MCP initialize

↓

Authentication

↓

Tool

↓

Response
```

---

# Root Cause 5 - Authentication errors are hidden ⭐⭐⭐⭐☆

Current

```
try

↓

401

↓

except

↓

fallback to LLM
```

Instead

```
401

↓

return authentication error
```

Only fall back to the LLM when you intentionally want a degraded experience.

---

# Root Cause 6 - New MCPClient every request ⭐⭐⭐⭐☆

Current

```
Every query

↓

new MCPClient

↓

new session
```

Better

```
JWT

↓

cached MCP client/session

↓

reuse
```

---

# Root Cause 7 - OAuth discovery fails ⭐⭐⭐⭐☆

Your logs show:

```
GET /.well-known/openid-configuration

404
```

You have two options:

### Option A (Recommended)

Configure `mcp-use` explicitly with authentication instead of relying on discovery.

### Option B

Implement the OAuth discovery endpoints on the MCP server.

---

# Root Cause 8 - MCP Server should forward JWT ⭐⭐⭐⭐⭐

Current

```
MCP Server

↓

Raw API
```

Expected

```
MCP Server

↓

Authorization: Bearer <same JWT>

↓

Raw API
```

Do not generate another token.

Do not impersonate the user.

---

# Root Cause 9 - Raw APIs validate JWT ⭐⭐⭐⭐⭐

Every API should independently validate the JWT.

```
Inventory

↓

Keycloak

↓

OK

↓

execute
```

The gateway should not be the only enforcement point.

---

# Root Cause 10 - Better logging ⭐⭐⭐⭐☆

Add logs for:

```
JWT received

↓

MCP request started

↓

Session created

↓

Tool called

↓

Tool returned

↓

Forwarded JWT

↓

Raw API status
```

Never log the JWT value itself.

---

# Root Cause 11 - Session reuse

Instead of

```
Session 1

↓

destroy
```

Keep

```
User

↓

JWT

↓

MCP Session

↓

reuse
```

until the token expires.

---

# Root Cause 12 - Separate authentication and tool failures

Current

```
Everything

↓

fallback
```

Better

```
Authentication failure

↓

401


Timeout

↓

504


Tool failure

↓

500


LLM failure

↓

fallback (optional)
```

---

# Files to modify

## Backend

* `agent_runtime.py`

  * Add support for authenticated `MCPClient`
  * Accept the access token when building the agent

* FastAPI route

  * Read the `Authorization` header
  * Validate JWT
  * Pass the original token into the agent

* `_run_agent_query()`

  * Accept the access token
  * Increase timeout
  * Improve exception handling

---

## MCP Server

* Read the incoming `Authorization` header
* Associate it with the MCP session
* Reuse it for every tool call
* Forward it to downstream APIs

---

## Raw APIs

* Continue validating the JWT with Keycloak
* Use the authenticated user's roles/scopes for authorization

---

## Frontend

Continue sending:

```
Authorization: Bearer <JWT>
```

No major changes should be needed if it already does this.

---

# Recommended End-to-End Flow

```text
Frontend
        │
        │ Authorization: Bearer <JWT>
        ▼
FastAPI Gateway
        │
        ├── Validate JWT (Keycloak)
        ├── Extract original JWT
        └── Pass JWT to MCPClient
                │
                ▼
         MCP Server
                │
                ├── Validate JWT
                ├── Create/reuse session
                └── Store Authorization header
                         │
                         ▼
                  Tool Execution
                         │
                         │ Authorization: Bearer <same JWT>
                         ▼
             Inventory / User / Document APIs
                         │
                Validate JWT (Keycloak)
                         │
                         ▼
                   Execute business logic
                         │
                         ▼
                    Return tool result
                         │
                         ▼
                     LLM response
```

## Implementation checklist

* ☐ Frontend sends `Authorization: Bearer <JWT>`.
* ☐ Backend validates the JWT and extracts the original token.
* ☐ `build_agent_with_model()` accepts the access token.
* ☐ `MCPClient` is configured to authenticate every request to the MCP server.
* ☐ Increase MCP tool timeout from 4 seconds to 30–60 seconds.
* ☐ Remove unconditional fallback to direct LLM on authentication failures.
* ☐ MCP server stores the user's authorization information with the session.
* ☐ MCP server forwards the same JWT to every downstream raw API.
* ☐ Raw APIs validate the JWT independently with Keycloak.
* ☐ Add structured logging for authentication, session creation, tool execution, and downstream API calls (without logging token values).
* ☐ Reuse MCP sessions where appropriate instead of creating a new client for every request.

Following this plan will give you end-to-end user identity propagation, authenticated MCP tool execution, and a much more reliable debugging experience.
