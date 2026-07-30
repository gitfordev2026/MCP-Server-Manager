# Commit Summary: MCP Server Manager Fixes

*Latest Commit: `feature/keycloak` branch*

These changes address several critical system failures spanning the database layer, networking stack, Next.js frontend, backend RBAC implementation, and user token security enforcement. Below is a detailed breakdown of all issues resolved.

## 1. Frontend Proxy Timeout (`fetch failed` Error)

**Issue:**
Users experienced a `fetch failed` error in the Playground UI whenever they triggered a tool (e.g., fetching inventory items). General chat messages worked, but tool calls always threw an error in the browser despite succeeding on the backend.
**Root Cause:**
The Next.js API proxy route (`frontend/app/api/proxy/[...path]/route.ts`) contained a hardcoded `AbortController` configured with a **3-second timeout** (`3000ms`). General LLM responses take ~1 second, but full tool-execution loops take 5–7 seconds. The frontend was forcibly killing the stream mid-execution.
**Resolution:**
Increased the timeout value from `3000ms` to `60000ms` (60 seconds) to safely accommodate the latency introduced by LLM thinking and tool invocation.

## 2. Missing Developer Role in RBAC (`Role not recognised` Error)

**Issue:**
When attempting to save descriptions for registered API endpoints, the backend returned a `403 Forbidden` error with the message "Role not recognised".
**Root Cause:**
The system assigns a default `developer` role to authenticated tenants. However, the `developer` role was missing from both the database's `roles` table and the backend's `ROLE_PERMISSION_FALLBACK` hardcoded dictionary in `backend/app/core/rbac.py`. When checking for the `endpoint:manage` permission, the check failed entirely.
**Resolution:**

- Added the `developer` role to the `ROLE_PERMISSION_FALLBACK` dictionary, granting it necessary permissions: `dashboard:view`, `application:manage`, `mcp_server:manage`, `tool:manage`, `endpoint:manage`, and `policy:manage` (explicitly restricting `audit:view` to Admins).
- Injected the missing `developer` role and its permission mappings directly into the PostgreSQL database.

## 3. Tool Discovery & Docker Networking Failures

**Issue:**
Newly registered applications and their API tools were not appearing in the Playground and the LLM agent could not access them, leading to hallucinations where the model tried to guess tool parameters.
**Root Cause:**
The Mock App was registered with the URL `http://0.0.0.0:8002`. Because the backend runs inside a Docker container, `0.0.0.0` points to the container's own internal network rather than the host machine. The backend's health check failed to reach the mock app, flagged it as "offline," and actively stripped its tools from the agent's prompt.
**Resolution:**
Updated the base URLs of registered applications to use `http://host.docker.internal`, allowing the Dockerized backend to properly route traffic out to the host machine processes.

## 4. Volatile Database Fallback (Data Loss)

**Issue:**
Data was not persisting between container restarts. API registrations and settings were disappearing.
**Root Cause:**
The backend's `.env` file contained incorrect PostgreSQL credentials (`testuser` instead of `postgres`) and incorrect port mappings. When the application failed to connect to the Postgres container, it silently fell back to an in-memory SQLite database, causing all changes to be lost on restart.
**Resolution:**
Fixed the `DATABASE_URL` environment variable to use the correct user and port configuration (`postgresql://postgres:password@host.docker.internal:5433/developer_api`), successfully linking the backend back to the persistent data volume.

## 5. Security: Enforce Strict User Token Passthrough

**Issue:**
When an authenticated user or external MCP connector invoked a registered tool, the backend had a fallback mechanism that would silently generate a system-level Machine-to-Machine (M2M) Keycloak token and pass that to the target API if the user's own token was missing or not detected. This created a security hole where unauthenticated callers could bypass authorization on the target API by relying on the system token.
**Root Cause:**
In `backend/app/main.py`, the `invoke_openapi_tool` function contained an `else` branch that called `get_keycloak_token(tool.domain_type, db)` and injected the resulting token when no `user_token` was present. External apps or logged-out browser sessions could exploit this to execute tools without valid credentials.
**Resolution:**

- Removed the M2M token fallback block entirely from `invoke_openapi_tool`.
- Now, only the caller's own token is ever forwarded to the target API endpoint. If no valid user token is present, no `Authorization` header is sent at all, causing the target API to enforce its own `401 Unauthorized` response.
- This ensures the security model is end-to-end: the logged-in user's JWT is used in the Playground, and any external MCP connector's JWT is used when connecting remotely. Unauthorized callers are rejected by the target API directly.
