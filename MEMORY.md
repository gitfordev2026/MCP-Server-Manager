# MCP Use Agent - Working Memory

Last updated: 2026-02-27

## 1) What this app is
- Existing app (not greenfield) with:
  - Backend: FastAPI + SQLAlchemy (single `backend/main.py` composition root)
  - Frontend: Next.js + React + TypeScript (`frontend/mcp-dashboard`)
  - DB: PostgreSQL primary, SQLite fallback (`backend/app/core/db.py`)
- Purpose: register apps/MCP servers, discover tools/endpoints, manage access policies, expose MCP combined server.

## 2) Current backend structure
- Main entry:
  - `backend/main.py`
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
  - `registry/` (new):
    - `discovery_service.py`
    - `registry_sync_service.py`
    - `exposure_service.py`
- Models:
  - `backend/app/models/db_models.py`

## 3) Current frontend structure
- Main app: `frontend/mcp-dashboard/app/*`
- Shared nav: `frontend/mcp-dashboard/components/Navigation.tsx`
- Shared http client: `frontend/mcp-dashboard/services/http.ts`
- Env store: `frontend/mcp-dashboard/lib/env.ts`

## 4) Environment loading (done)
- Backend centralized env:
  - `backend/env.py` loads + validates env file and exports typed `ENV`.
- Frontend centralized env:
  - `frontend/mcp-dashboard/lib/env.ts` (`publicEnv`).

## 5) Access policy model behavior (done)
- Default policy moved to **allow** (changed 2026-02-26).
- Auto materialization of tool policies:
  - New discovered tools/endpoints get explicit allow policy rows.
- Combined MCP behavior:
  - Denied tools filtered from `list_tools`.
  - `call_tool` deny fallback if no policy.

## 6) Database / Registry Architecture
- Single source of truth is now the SQLite/DB Registry.
- Models moved away from live fetching on view requests and rely purely on DB state.
- Live fetching only happens during explicitly triggered `/sync` endpoints or via background sweeps.
- Decoupled `catalog.py` reads purely from DB using `exposure_service.py`.

## 7) Important implementation details and history
- Soft delete is default for app/server/tool/endpoint where applicable.
- Hard delete intended for super admin usage.
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
- 2026-03-06: Fixed FastMCP inspector connection failure (`Task group is not initialized`) on combined MCP endpoint.
  - Root cause: mounted FastMCP ASGI app (`/mcp/apps`) lifespan was not entered by parent FastAPI lifespan, so StreamableHTTP task group never initialized.
  - Changes:
    - `backend/app/core/mcp_runtime.py`:
      - added `run_mcp_asgi_lifespan(asgi_app)` helper to enter mounted ASGI app lifespan via `router.lifespan_context` or `lifespan` when available.
    - `backend/app/main.py`:
      - lifespan now uses `AsyncExitStack` and enters both:
        - `run_mcp_asgi_lifespan(combined_mcp_asgi_app)`
        - `run_mcp_server_lifespan(combined_apps_mcp)`
      - cleaned duplicate pre-import env/sys.path block to avoid inconsistent startup state.
  - Validation:
    - In-process test request to `/mcp/apps/` now returns protocol-level 406 (`Accept: text/event-stream` required), proving session manager started correctly instead of crashing with runtime error.
- 2026-03-09: Fixed combined MCP list exposure after app registration (Inspector connected but listed nothing).
  - Root causes identified:
    1) `CombinedAppsOpenAPIMCP.list_tools()` relied on live discovery only, so listing could be empty when upstream discovery failed/transient.
    2) Exposure service filtered too narrowly with `registration_state == "selected"`, excluding legacy/previously synced rows (`active`).
  - Changes:
    - `backend/app/services/registry/exposure_service.py`:
      - broadened registry filter to include `registration_state in (selected, active)`
      - excluded `exposure_state in (disabled, deleted)`
      - included `description` in returned exposure entries
    - `backend/app/main.py` (`CombinedAppsOpenAPIMCP.list_tools`):
      - now resolves exposed registry tools via `resolve_exposable_tools(..., registry_only=True, public_only=True)`
      - uses live discovery only for enrichment (schema/details) when available
      - adds fallback MCPTool entries from registry when live discovery is unavailable
  - Validation:
    - direct async call to `combined_apps_mcp.list_tools()` returned non-zero results (`tool_count 20`) with expected tool names.
- 2026-03-09: Fixed MCP Inspector `tools/list` failures after registry-first exposure changes.
  - Errors observed in streamable MCP response:
    - `'Tool' object has no attribute 'version'`
    - then `'Tool' object has no attribute 'to_mcp_tool'`
  - Root cause:
    - `CombinedAppsOpenAPIMCP.list_tools()` returned `mcp.types.Tool` objects.
    - FastMCP v3 list pipeline expects FastMCP internal Tool components (`fastmcp.tools.tool.Tool`) with component metadata/version and `to_mcp_tool()` conversion method.
  - Changes:
    - `backend/app/main.py`:
      - `list_tools()` now returns `FastMCPTool` objects (`from fastmcp.tools.tool import Tool as FastMCPTool`).
      - tool objects now include `version` sourced from registry row (`row.version` fallback `1.0.0`).
    - `backend/app/services/registry/exposure_service.py`:
      - exposure entries now include `version` (`current_version` fallback `1.0.0`).
  - Validation:
    - End-to-end streamable MCP session test (`initialize` + `tools/list`) now returns successful `result.tools[...]` payload instead of code-0 errors.
- 2026-03-09: Fixed FastMCP v3 tool call signature/return compatibility.
  - Error seen by user: `CombinedAppsOpenAPIMCP.call_tool() got an unexpected keyword argument 'version'`.
  - Root cause:
    - FastMCP v3 passes `version`/task metadata kwargs into `call_tool`.
    - It also expects `call_tool` return to be FastMCP `ToolResult`, not raw dict.
  - Changes in `backend/app/main.py`:
    - `call_tool` signature updated to accept `version` and `**kwargs`.
    - `call_tool` now returns `ToolResult(structured_content=...)` for both MCP-native and OpenAPI tool execution paths.
  - Validation:
    - End-to-end streamable MCP session test (`initialize` -> `tools/list` -> `tools/call` with `version`) now succeeds with protocol `result` payload.

## 2026-03-09 - MCP Inspector second-call session failure fix
- Symptom: First MCP tool call worked, second call failed with `Session not found` and session crash logs from `streamable_http_manager`.
- Root cause: Browser client could not read MCP session header because CORS did not expose `Mcp-Session-Id`.
- Fix: Added `expose_headers=["Mcp-Session-Id", "mcp-session-id", "MCP-Session-Id"]` in `backend/app/main.py` CORS middleware.
- Validation: `app/main.py` parses successfully via AST check.
- Note: Use canonical inspector URL without trailing slash: `/mcp/apps`.
- 2026-03-09: MCP Inspector second-call crash mitigation (session + path stability).
  - Context: first tool call succeeded, second call failed with `Session not found` and `cancel scope` crash; logs also showed `/mcp/apps/` returning 404.
  - Changes in `backend/app/main.py`:
    - removed forced `app.router.redirect_slashes = False`
    - removed custom `_MCPPathCompatASGI` wrapper
    - mounted FastMCP ASGI app on both `/mcp/apps` and `/mcp/apps/`
  - Goal: eliminate trailing-slash 404 and keep inspector session path consistent.
- 2026-03-09: Replaced unstable `mcp_use` runtime path with official MCP client transport.
  - Added `backend/app/services/mcp_client_runtime.py` with shared async helpers:
    - `list_server_tools(...)`
    - `call_server_tool(...)`
    - `probe_server_status(...)`
    using `mcp.client.streamable_http.streamable_http_client` + `mcp.client.session.ClientSession` + explicit `initialize()`.
  - Updated `backend/app/main.py`:
    - removed `mcp_use.MCPClient` usage/import.
    - MCP discovery (`_fetch_all_mcp_server_tools`) now calls `list_server_tools_runtime`.
    - MCP tool proxy (`call_tool` for `mcp__...`) now calls `call_server_tool_runtime`.
    - router wiring now injects `probe_server_status_runtime`/`list_server_tools_runtime`.
  - Updated `backend/app/routers/servers.py`:
    - removed `mcp_client_cls` dependency.
    - discovery/probe/sync now use injected runtime helpers.
  - Updated `backend/app/routers/dashboard.py`:
    - removed `mcp_client_cls` dependency.
    - server health checks now use injected `probe_server_status_fn`.
  - Goal: avoid session/cancel-scope crashes and "Session not found" caused by mixed lifecycle handling.
- 2026-03-09: Register Server/Register App UX + state-sync improvements.
  - `frontend/app/register-server/page.tsx`:
    - Added discovery list pagination (`DISCOVERY_PAGE_SIZE=10`) in selection modal.
    - Added `Select All` / `Unselect All` for discovered tool selection.
    - Added discovery page controls (Prev/Next + page indicator).
    - Added optimistic enable/disable toggle for registered tools plus rollback on failure.
    - Added syncing spinner state (`registeredSyncing`) while backend updates/reload are in progress.
    - Added spinner UI for registered tools loading state.
  - `frontend/app/register-app/page.tsx`:
    - Added discovery list pagination (`DISCOVERY_PAGE_SIZE=10`) in selection modal.
    - Added `Select All` / `Unselect All` for discovered endpoint selection.
    - Added discovery page controls (Prev/Next + page indicator).
    - Added optimistic enable/disable toggle for registered endpoints plus rollback on failure.
    - Added syncing spinner state (`registeredSyncing`) while backend updates/reload are in progress.
    - Added spinner UI for registered endpoints loading state.
  - Validation:
    - `npx eslint app/register-server/page.tsx app/register-app/page.tsx` passed.
- 2026-03-09: Register pages follow-up improvements (color + registered list controls + toggle reliability).
  - `frontend/app/register-server/page.tsx`:
    - fixed toggle refresh race by passing explicit selection override into `loadRegisteredTools(...)` and `buildRegisteredToolRows(...)`.
    - added registered tools pagination (`REGISTERED_PAGE_SIZE=10`, Prev/Next + page indicator).
    - added Select All / Unselect All for registered tools modal with backend sync.
    - improved card/button colors in "Registered MCP Servers" and enable/disable actions.
  - `frontend/app/register-app/page.tsx`:
    - fixed toggle refresh race by passing explicit selection override into `loadRegisteredEndpoints(...)` and `buildRegisteredEndpointRows(...)`.
    - added registered endpoints pagination (`REGISTERED_PAGE_SIZE=10`, Prev/Next + page indicator).
    - added Select All / Unselect All for registered endpoints modal with backend sync.
    - improved card/button colors in "Registered Applications" and enable/disable actions.
  - Validation:
    - `npx eslint app/register-server/page.tsx app/register-app/page.tsx` passed.
- 2026-03-09: Registered resources modal switched to batch checkbox submit flow.
  - `frontend/app/register-server/page.tsx`:
    - "Registered MCP Tools" modal now uses fetch-like two-column layout.
    - left pane: paginated DB-backed tool list with checkbox ticks (enabled selection), Select All/Unselect All.
    - right pane: active tool details + description editor/save.
    - bottom footer: single `Apply Selection` button to persist all enable/disable changes in one request.
    - fixed stale toggle behavior by reloading with explicit `configuredSelectionOverride` set.
  - `frontend/app/register-app/page.tsx`:
    - "Registered API Endpoints" modal now uses fetch-like two-column layout.
    - left pane: paginated DB-backed endpoint list with checkbox ticks (enabled selection), Select All/Unselect All.
    - right pane: active endpoint details + description editor/save.
    - bottom footer: single `Apply Selection` button to persist all enable/disable changes in one request.
    - fixed stale toggle behavior by reloading with explicit `configuredSelectionOverride` set.
  - Cleanup:
    - removed obsolete per-row toggle handlers/states from both files.
  - Validation:
    - `npx eslint app/register-server/page.tsx app/register-app/page.tsx` passed with 0 warnings/errors.
