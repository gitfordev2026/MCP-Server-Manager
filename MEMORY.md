# MCP Use Agent - Working Memory

Last updated: 2026-03-13

## 1) What this app is
- Existing app (not greenfield) with:
  - Backend: FastAPI + SQLAlchemy (entrypoint `backend/app/main.py`)
  - Frontend: Next.js App Router + React 19 + TS (`frontend/`)
  - DB: PostgreSQL primary, SQLite fallback (`backend/app/core/db.py`)
- Purpose: register apps/MCP servers, discover tools/endpoints, manage access policies, expose a combined MCP server.

## 2) Current backend structure
- Main entry:
  - `backend/app/main.py` (composition root)
- Core:
  - `backend/app/core/db.py`
  - `backend/app/core/auth.py`
  - `backend/app/core/rbac.py`
  - `backend/app/core/logger.py`
  - `backend/app/core/mcp_runtime.py`
- Routers:
  - `health.py`, `servers.py`, `base_urls.py`, `catalog.py`, `access_policies.py`, `agent.py`, `dashboard.py`, `audit.py`, `tools.py`, `endpoints.py`
- Services:
  - `policy_utils.py`
  - `audit.py`
  - `agent_runtime.py`
  - `keycloak_auth.py` (client-credentials token fetch for OpenAPI calls)
  - `registry/` (new):
    - `discovery_service.py`
    - `registry_sync_service.py`
    - `exposure_service.py`
- Models:
  - `backend/app/models/db_models.py`

## 3) Current frontend structure
- Main app: `frontend/app/*` (Next 16 App Router)
- Shared nav: `frontend/components/Navigation.tsx`
- Shared http client: `frontend/services/http.ts`
- Env store: `frontend/lib/env.ts` (requires `NEXT_PUBLIC_BE_API_URL`, `NEXT_PUBLIC_GOOGLE_API_KEY`, `NEXT_PUBLIC_ANALYTICS_ID`)
- Auth: `frontend/lib/auth.ts` implements Keycloak OIDC PKCE, tokens stored in localStorage; `AuthGuard` wraps the app.
- React Query providers in `frontend/app/providers.tsx`.

## 4) Environment loading
- Backend centralized env:
  - `backend/app/env.py` loads + validates env file and exports typed `ENV`.
- Frontend centralized env:
  - `frontend/lib/env.ts` (`publicEnv`).

## 5) Access policy model behavior
- Default policy is **allow**.
- Policies stored in `exposed_mcp_tools` with `owner_id` + `tool_id` (default `__default__`).
- Auto materialization of tool policies on discovery/registry sync.
- Combined MCP behavior (`/mcp/apps`):
  - `list_tools` filters denied tools.
  - `call_tool` enforces policy and returns 403 when denied.

## 6) Database / Registry Architecture
- Single source of truth is the DB registry (Postgres or SQLite fallback).
- Routers read from registry tables; live fetch only on explicit `/sync` or catalog refresh.
- `catalog.py` returns registry-only view and uses `exposure_service.py` to compute exposable tools.
- MCP server sync: `/servers/{name}/sync` uses `registry_sync_service.sync_tools_from_discovery`.
- OpenAPI sync: `/base-urls/{name}/sync` triggers catalog refresh; `build_openapi_tool_catalog` updates registry.

## 7) Important implementation details and history
- Soft delete is default for app/server/tool/endpoint where applicable.
- Hard delete intended for super admin usage.
- `backend/app/main.py` mounts combined FastMCP server at `/mcp/apps` and provides `JWTAuthASGIMiddleware` when auth enabled.
- OpenAPI tool invocation supports `path/query/headers/cookies/body/timeout_sec` and uses Keycloak token injection per domain.
- Agent runtime: MCPAgent + ChatOllama configured via `ENV` in `backend/app/services/agent_runtime.py`.
- 2026-02-27: Decoupled routers from live-fetches.
  - Extracted logic to `backend/app/services/registry/`
    - `discovery_service.py`
    - `registry_sync_service.py`
    - `exposure_service.py`
  - Modified `catalog.py` and `servers.py` to solely read from SQLite backend to improve UI/admin speed and reliability.
  - Added manual `/sync` trigger endpoints to `servers.py` and `base_urls.py`.
- 2026-02-26: Database Phase 2 completed.
  - `migrate_phase_2.py` run to add sync lifecycle tracking columns (`sync_mode`, `last_sync_status`, etc.) directly into SQLite core tables.

## 8) How to continue from here
- Next recommended increment:
  - Background worker loop/scheduler to periodically trigger `/sync` logic without user intervention.
  - Hardened constraints (DB level) ensuring invariants on the registry models.

## 9) Session memory contract
- This file is the canonical running memory for this repository.
- From now onward, every phase/feature/fix should update this file in the same commit/edit batch.
- 2026-02-27: Added production Docker setup with host-mounted source for continuous development/testing.
  - Added `backend/Dockerfile`:
    - Python 3.12 slim image
    - installs backend dependencies from `backend/requirements.txt`
    - runs backend via `uvicorn backend.main:app` on port `8091`
  - Added `frontend/Dockerfile`:
    - Node 20 slim image
    - pre-installs deps from `frontend/package*.json`
    - runtime command copies image deps into mounted workspace if needed, then runs `npm run build` and `npm run start -p 3010`
  - Added `docker-compose.prod.yml`:
    - services: `postgres`, `backend`, `frontend`
    - bind mounts code from host (`./:/workspace`, `./frontend:/workspace/frontend`)
    - named volumes for Postgres data and frontend `node_modules`
    - backend points DB to compose Postgres by default.
  - Added ignore files:
    - `backend/.dockerignore`
    - `frontend/.dockerignore`
- 2026-02-27: Backend structure refactor toward `backend/app` as runtime source.
  - Moved effective runtime modules into app package:
    - active entrypoint now `backend/app/main.py`
    - active env loader now `backend/app/env.py`
  - Kept compatibility wrappers at root:
    - `backend/main.py` now re-exports `app.main:app` and runs `uvicorn app.main:app` when executed directly.
    - `backend/env.py` now re-exports from `app.env`.
  - Updated imports from `backend.app.*` / `backend.env` to `app.*` / `app.env` across backend runtime modules.
  - Updated execution wiring:
    - `backend/run_backend.ps1` now runs `uvicorn app.main:app` from `backend/` directory.
    - `backend/Dockerfile` CMD changed to `uvicorn app.main:app`.
    - `docker-compose.yaml` backend command changed to `uvicorn app.main:app`.
    - `README.md` backend run command updated to `uvicorn app.main:app --reload --port 8090`.
  - Validation:
    - AST syntax check passed for all backend `.py` files (`syntax-ok 40`).
 - 2026-03-11: Ported combined MCP endpoint stability fixes from prior repo.
   - Added FastMCP ASGI lifespan handling (`run_mcp_asgi_lifespan`) to avoid “Task group is not initialized”.
   - Combined MCP now uses registry-first exposure with FastMCP `Tool` + `ToolResult` compatibility.
   - Added MCP client runtime (`mcp_client_runtime.py`) using official streamable HTTP client for server probe/list/call.
   - Server & dashboard routers now use injected MCP runtime helpers instead of `mcp_use.MCPClient`.
   - CORS exposes MCP session headers and mounts `/mcp/apps` and `/mcp/apps/` (auth preserved via JWT ASGI middleware).
- 2026-03-12: Frontend cleanup, auth UX stabilization, and UI changes.
   - Removed duplicated nested frontend folders (e.g., `frontend/app/app`, `frontend/components/components`, etc.) and fixed lint.
   - Auth flow stabilized: cached `/auth/config`, throttled login redirects, improved `AuthGuard` and callback handling.
   - Navigation responsive with mobile menu, single-line buttons, logout pinned on desktop.
   - Admin tab bar now wraps instead of horizontal scroll.
   - Access Control hidden from navbar and route disabled via `notFound()` in `frontend/app/access-control/page.tsx`.
   - Admin actions now emit toast notifications for create/update/delete/toggle/description saves.
   - Admin page now has a role dropdown (writes `mcp_admin_roles` to localStorage for quick role switching).
   - Fixed re-enable flow after soft-delete: server/app PATCH now allows re-enabling and clears `is_deleted`.
   - Added optional `restore_dependents` flag on server/app PATCH to re-enable soft-deleted tools/endpoints.
   - Admin UI now shows tooltips for enabled/disabled/deleted and adds Restore button for soft-deleted apps/servers.
   - Tools/endpoints list endpoints now support `include_inactive=true` to return disabled/deleted rows.
   - Restore now only clears `is_deleted` on dependents; preserves prior `is_enabled` state.
   - Tool/endpoint soft delete now preserves `is_enabled` (only sets `is_deleted` + clears exposure for endpoints).
   - Exposure resolution now filters out tools from disabled/deleted servers/apps to keep MCP endpoints accurate.
   - Tool toggle now allows restoring deleted tools (backend clears `is_deleted` when `is_enabled=true`); admin shows deleted badge/restore.
   - Endpoint restore now supported (backend clears `is_deleted` when `is_enabled=true`); admin shows deleted badge/restore.
   - Tools/endpoints now include parent active flags and backend blocks modifications when parent is disabled/deleted; admin disables actions and shows "parent inactive".
- 2026-03-13: Dual-control enablement for tools/endpoints.
  - Added `admin_enabled` and `owner_enabled` columns on `mcp_tools` and `api_endpoints` (model + schema migration/backfill).
  - `is_enabled` now represents effective state (`admin_enabled && owner_enabled`) and is recomputed on updates/sync.
  - Tool/endpoint list and exposure filters now require both admin/owner enabled.
  - Registry sync now toggles `owner_enabled` based on selection while preserving admin decisions.
  - Admin UI now shows badges for "admin disabled" vs "owner disabled" and toggles admin-enabled state.
- 2026-03-13: Redis cache layer for status-heavy endpoints.
  - Added `app/core/cache.py` Redis helper (get/set JSON + prefix invalidation).
  - Added env config: `REDIS_ENABLED`, `REDIS_URL`, `REDIS_STATUS_TTL_SEC`, `REDIS_LIST_TTL_SEC`.
  - Cached list endpoints (`/servers`, `/base-urls`, `/tools`, `/endpoints`) and status endpoints (`/servers/status`, `/servers/{name}/status`, `/dashboard/*`).
  - Mutations now invalidate `status:` cache prefix to keep UI fresh.
- 2026-03-17: Auth guard now blocks when backend/auth config is unreachable.
  - On `/auth/config` failure, the UI shows an "Authentication Unavailable" screen with retry instead of rendering protected pages.
  - Auth config cache now has a short TTL so toggling `AUTH_ENABLED` in backend `.env` takes effect without a hard refresh.
- 2026-03-17: Playground fixes + Ollama model selection.
  - Fixed `/agent/playground/query` body handling by using auth dependency (no embedded `request` field).
  - Added `/agent/models` to list Ollama models from `ENV.agent_ollama_base_url`.
  - Playground now lets users choose the Ollama model and sends it with the query.
  - Agent endpoints now return 502 with a clear message when the MCP backend is unreachable (instead of 500 stack traces).
