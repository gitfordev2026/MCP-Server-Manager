# MCP Use Agent - Working Memory

Last updated: 2026-03-11

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
