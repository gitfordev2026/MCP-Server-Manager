# MCP Use Agent - Working Memory

Last updated: 2026-02-19

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
  - `backend/app/core/rbac.py` (added)
- Routers:
  - Existing: `health.py`, `servers.py`, `base_urls.py`, `catalog.py`, `access_policies.py`, `agent.py`
  - Added: `dashboard.py`, `audit.py`, `tools.py`, `endpoints.py`
- Services:
  - `policy_utils.py`
  - `audit.py` (added)
- Models:
  - `backend/app/models/db_models.py` (expanded heavily)

## 3) Current frontend structure
- Main app: `frontend/mcp-dashboard/app/*`
- Shared nav: `frontend/mcp-dashboard/components/Navigation.tsx`
- Shared http client: `frontend/mcp-dashboard/services/http.ts`
- Env store: `frontend/mcp-dashboard/lib/env.ts`
- Added admin page:
  - `frontend/mcp-dashboard/app/admin/page.tsx`

## 4) Environment loading (done)
- Backend centralized env:
  - `backend/env.py` loads + validates env file and exports typed `ENV`.
  - `auth.py`, `db.py`, `main.py` now use `ENV`.
- Frontend centralized env:
  - `frontend/mcp-dashboard/lib/env.ts` (`publicEnv`) with static `process.env.X` access.
  - App/layout imports env at startup.
  - Pages/services moved off direct `process.env`.

## 5) Access policy model behavior (done)
- Default policy moved to **deny**.
- Auto materialization of tool policies:
  - New discovered tools/endpoints get explicit deny policy rows.
- Combined MCP behavior:
  - Denied tools filtered from `list_tools`.
  - `call_tool` deny fallback if no policy.

## 6) Phase 1 delivered (control plane foundation)
- Added DB models for:
  - RBAC: roles, permissions, user_roles, role_permissions
  - Audit: audit_logs
  - Versioning: tool_versions, endpoint_versions
  - Health: health_checks, health_status_history
- Added endpoints:
  - `GET /dashboard/stats`
  - `GET /audit-logs`
- Added audit logging service and initial hooks in mutation routes.

## 7) Phase 2 delivered (backend governance APIs)
- RBAC dependency:
  - `backend/app/core/rbac.py`
  - Actor from headers: `x-user`, `x-roles`
  - Permission guard via `require_permission(...)`
- Tool CRUD:
  - `GET /tools`
  - `POST /tools`
  - `PATCH /tools/{tool_id}`
  - `DELETE /tools/{tool_id}?hard=...`
  - Description required; version rows written.
- Endpoint CRUD:
  - `GET /endpoints`
  - `POST /endpoints`
  - `PATCH /endpoints/{endpoint_id}`
  - `DELETE /endpoints/{endpoint_id}?hard=...`
  - Description required; version rows written.
  - MCP exposure safety: cannot expose unless `exposure_approved=true`.
- RBAC baseline seed done in `sync_rbac_baseline()` including role-permission links.

## 8) Phase 3 delivered (frontend admin + expanded CRUD)
- Added `/admin` page with:
  - Stats cards
  - Applications section
  - MCP servers section
  - Tools section
  - Endpoints section
  - Audit table
  - Actor + role controls persisted in localStorage
- Added/expanded backend APIs for full app/server management:
  - Applications (`base_urls.py`):
    - `PATCH /base-urls/{name}`
    - `DELETE /base-urls/{name}?hard=...`
  - MCP Servers (`servers.py`):
    - `PATCH /servers/{server_name}`
    - `DELETE /servers/{server_name}?hard=...`
  - Registration models now support `description`.
  - App/server models include `description`, `is_enabled`, `is_deleted`.

## 9) Navigation/UI changes done
- Navigation:
  - Added Admin button.
  - Kept buttons on single line (`flex-nowrap`, horizontal scroll fallback).
  - Added fixed-nav spacer so content starts below navbar.
  - Added extra left margin before first nav button.
  - Prevented brand/title wrapping.

## 10) Known implementation decisions
- Soft delete is default for app/server/tool/endpoint where applicable.
- Hard delete intended for super admin usage.
- Role header simulation currently via frontend localStorage + http headers.
- Combined MCP still served from existing mount:
  - `/mcp/apps`

## 11) Important files changed significantly
- `backend/main.py`
- `backend/app/models/db_models.py`
- `backend/app/routers/access_policies.py`
- `backend/app/routers/base_urls.py`
- `backend/app/routers/servers.py`
- `backend/app/routers/catalog.py`
- `backend/app/core/db.py`
- `backend/app/core/rbac.py` (new)
- `backend/app/routers/dashboard.py` (new)
- `backend/app/routers/audit.py` (new)
- `backend/app/routers/tools.py` (new)
- `backend/app/routers/endpoints.py` (new)
- `backend/app/services/audit.py` (new)
- `frontend/mcp-dashboard/app/admin/page.tsx` (new)
- `frontend/mcp-dashboard/components/Navigation.tsx`
- `frontend/mcp-dashboard/services/http.ts`
- `frontend/mcp-dashboard/lib/env.ts`

## 12) How to continue from here
- Next recommended increment:
  - Add dedicated frontend pages/components for tools/endpoints/apps/servers beyond single admin page.
  - Add stricter backend role checks for hard-delete (currently UI-gated).
  - Add migration tooling (Alembic) instead of startup ALTER patterns.
  - Add tests for RBAC + audit + exposure constraints.

## 13) Update policy (for future work)
- On every notable change, append/update:
  - What changed
  - Which files
  - API contracts added/changed
  - Behavior decisions and defaults
  - Validation done / remaining risks

## 14) Session memory contract
- This file is the canonical running memory for this repository.
- From now onward, every phase/feature/fix should update this file in the same commit/edit batch.
- If a task is exploratory only (no code changes), add a short note under a dated "Notes" line with decisions taken.

## 15) Notes
- 2026-02-19: Navigation overlap fix in `frontend/mcp-dashboard/components/Navigation.tsx`.
  - Enforced left/right separation with `justify-between` and explicit `ml-6` on button rail.
  - Made brand link non-shrinking (`shrink-0`) to prevent title/button collision.
  - Removed extra left margin from first button and kept horizontal overflow behavior for narrow screens.
- 2026-02-24: Swagger grouping improved via router tags in `backend/main.py`.
  - Added explicit `tags=[...]` on all `app.include_router(...)` registrations.
  - Current tag groups: Health, Applications, Catalog, MCP Servers, Agent, Access Policies, Dashboard, Audit Logs, Tools, API Endpoints.
- 2026-02-24: Request body schemas hardened to remove free-form extra properties in Swagger and runtime.
  - Added `model_config = ConfigDict(extra=\"forbid\")` to request models in:
    - `backend/app/routers/tools.py`
    - `backend/app/routers/endpoints.py`
    - `backend/app/routers/access_policies.py`
    - `backend/app/routers/base_urls.py`
    - `backend/app/routers/servers.py`
    - `backend/app/schemas/registration.py`
- 2026-02-24: Added Swagger operation metadata on all router endpoints.
  - Added `summary` + `description` to each route decorator.
  - Each description includes `Source: backend/app/routers/<file>.py` for quick implementation traceability.
