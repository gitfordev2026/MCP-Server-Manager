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
