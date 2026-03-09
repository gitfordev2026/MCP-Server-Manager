# MCP Use Agent - Project Memory

Last refreshed: 2026-02-18

## What This Project Is
A full-stack MCP management platform with:
- Backend (FastAPI): registers MCP servers and raw API base URLs, discovers tools, exposes a combined MCP endpoint, applies access policies, and proxies agent queries.
- Frontend (Next.js App Router): dashboard, server/app registration, API explorer, chat, and access-control UI.

## Repository Layout
- `backend/main.py`: main app bootstrap, lifespan, router wiring, combined MCP mount, OpenAPI tool generation/invocation.
- `backend/app/core/*`: DB and auth config.
- `backend/app/models/db_models.py`: SQLAlchemy models.
- `backend/app/routers/*`: feature routers (`health`, `servers`, `base_urls`, `catalog`, `agent`, `access_policies`).
- `backend/app/services/*`: agent runtime + access policy helpers.
- `frontend/mcp-dashboard`: Next.js app.

## Backend Architecture
- Framework: FastAPI + SQLAlchemy.
- DB strategy:
  - Primary: PostgreSQL via `DATABASE_URL`.
  - Fallback: SQLite `servers.db` when `DB_FALLBACK_SQLITE=true`.
  - Auto-creates PostgreSQL database if needed and verifies all tables on startup.
- CORS: currently wide-open (`*`) in `backend/main.py`.
- Auth config exists (Keycloak settings), but route-level auth is currently permissive (`current_user` optional across routers).

## Data Model (Current Tables)
From `backend/app/models/db_models.py`:
- `mcp_servers`: MCP server registrations.
- `raw_apis`: external app/base URL registrations (+ `openapi_path`, `include_unreachable_tools`).
- `exposed_mcp_tools`: access policy rows (`owner_id`, `tool_id`, `mode`, allowlists).
- `users`, `groups`: ownership/group scaffolding.
- `apis_server`: links raw APIs to MCP servers by matching host:port.
- `mcp_tools`: registry of discovered tools from both sources (`source_type` = `mcp|openapi`).

## Core Runtime Behavior
- Startup (`init_db`):
  - creates tables,
  - ensures default owner policies,
  - syncs owner FK links,
  - syncs raw-api <-> server links by host.
- Combined MCP endpoint mounted at:
  - `/mcp/apps` (streamable HTTP transport)
- Combined MCP merges:
  - OpenAPI-derived tools from registered `raw_apis`, and
  - Native tools from registered MCP servers (prefixed `mcp__{server}__{tool}`).
- Tool invocation path in combined MCP:
  - checks access policy (`deny` blocks; `approval` currently treated as allow),
  - dispatches to either native MCP tool call or proxied HTTP OpenAPI call.

## Backend API Surface (Current)
- Health:
  - `GET /health`
- Raw API app registration:
  - `POST /register-base-url`
  - `GET /base-urls`
  - `GET /openapi-spec?url=...&openapi_path=...&retries=...`
- MCP server registration/monitoring:
  - `POST /register-server` (strict URL validation + live MCP compatibility probe)
  - `GET /servers`
  - `GET /servers/{server_name}/tools`
  - `GET /servers/status`
  - `GET /servers/{server_name}/status`
- Combined catalog/diagnostics:
  - `GET /mcp/openapi/catalog`
  - `GET /mcp/openapi/diagnostics`
- Agent:
  - `GET /agent/query?prompt=...`
- Access policy management:
  - `GET /access-policies`
  - `PUT /access-policies/{owner_id}`
  - `PUT /access-policies/{owner_id}/{tool_id}`
  - `DELETE /access-policies/{owner_id}/{tool_id}`
  - `POST /access-policies/{owner_id}/apply-all`

## Validation Rules Worth Remembering
- `ServerRegistration.url` requires:
  - `http` or `https`,
  - valid host (IP / `localhost` / FQDN),
  - explicit numeric port.
- `POST /register-server` rejects servers that cannot create MCP session + list tools.

## Agent Runtime (Current Default)
- Defined in `backend/app/services/agent_runtime.py`.
- Default MCP target and LLM backend are hardcoded (`http_server`, Ollama endpoint/model).
- Agent route `/agent/query` delegates to this runtime.

## Frontend Architecture
- Framework: Next.js (App Router), React 19, Tailwind 4, React Query.
- API base URL: `NEXT_PUBLIC_BE_API_URL`.
- Shared HTTP helper: `frontend/mcp-dashboard/services/http.ts`.

## Frontend Routes (Current)
- `app/page.tsx`: main dashboard (servers + apps live monitoring).
- `app/register-server/page.tsx`: MCP server registration.
- `app/servers/[name]/page.tsx`: server detail/tools.
- `app/register-app/page.tsx`: raw API base URL registration.
- `app/register-app/[name]/page.tsx`: registered app details.
- `app/api-explorer/page.tsx`: OpenAPI endpoint exploration via backend proxy.
- `app/chat/page.tsx`: prompt to `/agent/query`.
- `app/access-control/page.tsx`: owner policy management UI.
- `app/mcp-endpoints/page.tsx`: MCP endpoints UI.
- `app/dashboard/page.tsx` and `app/dashboard/[id]/page.tsx`: dashboard/legacy path.
- `app/login/page.tsx`, `app/auth/register/page.tsx`: auth placeholder flows.

## Access Control Notes (Updated)
- Policies are now backend-persisted in DB (`exposed_mcp_tools`).
- Frontend uses React Query hooks in `frontend/mcp-dashboard/hooks/useAccessPolicies.ts`.
- API service lives in `frontend/mcp-dashboard/services/accessPolicies.api.ts`.
- This supersedes older localStorage-only policy behavior.

## Operational Notes
- Backend default run: `uvicorn.run("main:app", host="0.0.0.0", port=8090, reload=True)` from `backend/main.py`.
- Frontend uses standard Next scripts (`dev`, `build`, `start`, `lint`).
- There is historical/legacy logic in top-level `backend/main.py`; modular routers under `backend/app/routers` are source-of-truth for route behavior.

## How To Keep This Memory Fresh
When significant changes land, update this file first:
1. Routes added/removed or payload changes.
2. DB schema/table renames.
3. Access policy behavior changes.
4. Combined MCP generation/invocation behavior changes.
5. Frontend pages/hooks service-path changes.
