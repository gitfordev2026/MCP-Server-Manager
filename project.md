# MCP Use Agent - Project Memory

## Purpose
- Backend: Manage MCP server registrations, app base URLs, server tool discovery, server health checks, and agent chat query forwarding.
- Frontend: Provide a dashboard UI for MCP servers/apps, API explorer for OpenAPI endpoints, and chat UI for `/agent/query`.

## Tech Stack
- Backend: FastAPI + SQLAlchemy + PostgreSQL (primary) / SQLite fallback (`servers.db`) in `main.py`.
- Frontend: Next.js App Router + React + Tailwind in `frontend/mcp-dashboard`.

## Backend Overview
- Entry file: `main.py`
- Database tables:
  - `servers` (`name`, `url`)
  - `base_urls` (`name`, `url`, `openapi_path`, `include_unreachable_tools`)
- Public endpoints (currently open by design):
  - `GET /health`
  - `POST /register-base-url`
  - `GET /base-urls`
  - `GET /openapi-spec?url=...&openapi_path=...&retries=...`
  - `GET /mcp/openapi/catalog`
  - `GET /mcp/openapi/diagnostics`
  - `POST /register-server`
  - `GET /servers`
  - `GET /servers/{server_name}/tools`
  - `GET /servers/status`
  - `GET /servers/{server_name}/status`
  - `GET /agent/query?prompt=...`
- MCP transport endpoint:
  - Combined app OpenAPI MCP server mounted at `POST/GET /mcp/apps` (Streamable HTTP)
  - Exposes registered app OpenAPI operations as MCP tools for MCP clients.
- Input validation:
  - `POST /register-server` now enforces strict URL format:
    - Must use `http` or `https`
    - Must include hostname/IP
    - Must include explicit numeric port (example: `http://10.0.0.5:8005/mcp`)
    - Host must be one of:
      - valid IP address
      - `localhost`
      - fully qualified domain (contains dot), e.g. `api.example.com`
  - `POST /register-server` performs a live endpoint probe before saving:
    - Attempts MCP session creation and tool listing
    - Registration is rejected if endpoint is down/unreachable/not MCP-compatible

## Register Server UX Validation
- `frontend/mcp-dashboard/app/register-server/page.tsx` now performs client-side pre-validation before submit:
  - requires `http/https`
  - requires explicit port
  - requires host to be IP/localhost/FQDN
- Backend remains source of truth for strict validation and MCP-compatibility probe.
- Error messaging now prefixes failed submit responses with `Registration failed:` for clearer user feedback.
- Auth note:
  - Keycloak config scaffolding exists.
  - Token validation route dependency is intentionally disabled/commented for now.

## Frontend Overview
- Main routes:
  - `/` and `/dashboard` dashboards
  - `/register-server`
  - `/servers/[name]` server tools
  - `/register-app`
  - `/register-app/[name]`
  - `/access-control`
  - `/api-explorer`
  - `/chat`
  - `/login` (placeholder page to satisfy existing auth/register redirect)
  - `/auth/register`
- Internal API route:
  - `app/api/register/route.ts` (mock in-memory registration only)

## Live Server Monitoring
- Implemented on `frontend/mcp-dashboard/app/page.tsx`.
- Dashboard now polls backend every 10 seconds using:
  - `GET /servers`
  - `GET /base-urls`
  - `GET /servers/status`
- Live data shown:
  - Per-server status badge (`Alive` / `Down`)
  - Per-server latency (ms)
  - Per-server tool count
  - Summary cards based on live status:
    - Alive count
    - Down/total counts
    - Average live latency
  - Last refresh timestamp and in-progress refresh indicator.

## Live App Monitoring
- Implemented on `frontend/mcp-dashboard/app/page.tsx`.
- On each dashboard refresh cycle, every registered app base URL is probed via:
  - `GET /openapi-spec?url={baseUrl}` (backend proxy)
- App card live data:
  - Status badge (`Alive` / `Down`)
  - OpenAPI probe latency (ms)
  - Endpoint count (from total OpenAPI operations across all paths/methods)
- App section summary now shows:
  - Alive count
  - Down count
  - Total monitored apps

## Runtime Configuration
- Frontend backend URL env:
  - `NEXT_PUBLIC_BE_API_URL`
- Example value:
  - `http://127.0.0.1:8090`

## Known Conventions
- Keep backend endpoints open until auth phase starts.
- Frontend should consume backend base URL from env (do not hardcode per-page URLs).
- Keep this file updated whenever code changes are made.

## Database Configuration
- Primary: PostgreSQL via `DATABASE_URL` env var (e.g. `postgresql://postgres:postgres@localhost:5432/mcp_manager`).
- Fallback: SQLite (`servers.db`) when PostgreSQL is unavailable and `DB_FALLBACK_SQLITE=true`.
- On startup, the backend auto-creates the PostgreSQL database and all tables if they don't exist.
- The `/health` endpoint reports `db_backend` (`"postgresql"` or `"sqlite"`).
- Migration logic in `migrate_base_urls_schema()` is cross-DB compatible (uses `information_schema` for PostgreSQL, `PRAGMA` for SQLite).

## Access Control Module
- New page: `frontend/mcp-dashboard/app/access-control/page.tsx`
- Purpose:
  - Lists all app servers and MCP servers.
  - On owner selection, lists MCP-exposed endpoints/tools:
    - App owners use combined catalog from `GET /mcp/openapi/catalog`
    - MCP servers load tools from `GET /servers/{server_name}/tools`
  - Provides endpoint-level access control with:
    - Owner-level default policy (`Allow`, `Require Approval`, `Deny`)
    - `Apply Selected Mode To All Endpoints`
    - Per-endpoint override controls and reset
- Current persistence:
  - Policies are stored in browser local storage key `mcp_access_control_policies_v1` (frontend-only for now).

## Change Log
- 2026-02-13
  - Added custom app OpenAPI sync controls and diagnostics:
    - `base_urls` schema now stores per-app `openapi_path` and `include_unreachable_tools`.
    - `POST /register-base-url` and `GET /base-urls` now accept/return those fields.
    - OpenAPI candidate resolution now supports custom paths (relative path, absolute path, or full URL).
    - Added retry-aware diagnostics endpoint `GET /mcp/openapi/diagnostics?retries=...`.
    - Enhanced `GET /mcp/openapi/catalog` to return app-level diagnostics for all apps (healthy, unreachable, zero-endpoints) including attempts, latency, candidate URLs, and placeholder status.
    - Added placeholder tool policy: if enabled per app and sync is unreachable/zero-endpoints, combined MCP exposes a placeholder tool instead of dropping visibility.
  - Updated frontend register-app page:
    - Added inputs for custom OpenAPI path and include-unreachable-placeholder policy.
    - Registered app cards now show configured OpenAPI path and placeholder policy status.
  - Updated frontend access-control page:
    - Added combined MCP diagnostics panel for all app servers, including unreachable and zero-endpoint apps.
    - Added retry selector that refreshes catalog diagnostics with configurable retry count.
    - Placeholder tools are labeled in endpoint lists with placeholder reason.
  - Updated dashboard and API explorer OpenAPI fetch flow:
    - Dashboard app health probes now forward `openapi_path` to backend `/openapi-spec`.
    - API Explorer now accepts `openapi_path` query param and uses it when loading OpenAPI specs.
    - App-to-Explorer links now include `openapi_path` when configured.
  - Added frontend access-control page (`/access-control`):
    - Lists all app servers and MCP servers.
    - Shows MCP-exposed endpoints/tools for selected owner.
    - Supports apply-all and per-endpoint access policy controls.
    - Persists policies locally in browser storage for now.
  - Updated top navigation to include `Access Control` route and active-state highlighting.
  - Added combined OpenAPI-to-MCP backend server in `main.py`:
    - New dynamic MCP endpoint at `/mcp/apps` (Streamable HTTP transport).
    - Auto-discovers tools from all registered app `base_urls` OpenAPI specs.
    - Converts each API operation into an MCP tool with request schema for `path`, `query`, `headers`, `cookies`, `body`, and optional `timeout_sec`.
    - Tool invocation executes the upstream HTTP API call and returns structured response payload (`status_code`, `url`, `ok`, `body`).
    - Added catalog debug endpoint `GET /mcp/openapi/catalog` to inspect generated tools and sync errors.
    - Added cache+refresh behavior (`OPENAPI_MCP_CACHE_TTL_SEC`, cache invalidation on app registration).
    - Fixed mounted MCP lifecycle integration by running `combined_apps_mcp.session_manager.run()` inside FastAPI lifespan.
  - Fixed dashboard rendering regression in `app/page.tsx` where `normalizeOpenApiUrl` was referenced after refactor but not defined, which could break dashboard card rendering and hide server/app lists.
  - Improved dashboard fetch resilience in `app/page.tsx`:
    - Switched primary data calls (`/servers`, `/base-urls`, `/servers/status`) to `Promise.allSettled`.
    - Prevented single status fetch failure from blocking all dashboard data.
    - Render server/app lists immediately after list fetches while status/app health probes continue in background.
    - Added explicit frontend error when `NEXT_PUBLIC_BE_API_URL` is missing.
    - Preserved last-known server/app status and counts during refresh checks; dashboard no longer clears to waiting/empty while probes are in-flight.
    - Added overlap-safe live polling with in-flight guard to prevent concurrent refresh races.
    - Added failure smoothing for status transitions:
      - Alive -> Down now requires consecutive failed probes (`DOWN_AFTER_FAILURES=2`) before UI flips down.
      - Last-known tool/endpoint counts remain visible during transient probe failures.
  - Corrected endpoint counting logic on frontend:
    - Dashboard app cards now count OpenAPI operations (HTTP methods across paths), not only path keys.
    - API Explorer "Total Endpoints" now shows total operations for consistency with dashboard.
  - Improved server/app card metric messaging:
    - Tool count and endpoint count now show "unavailable" when status is down instead of misleading zero values.
  - Fixed app endpoint discovery in API Explorer by routing OpenAPI fetch through backend:
    - Added `GET /openapi-spec?url=...` in `main.py`.
    - Backend now resolves OpenAPI candidates (registered path + root fallback) and returns first valid JSON spec.
  - Updated frontend API Explorer (`app/api-explorer/page.tsx`) to use backend `/openapi-spec` instead of direct browser fetch to `{baseUrl}/openapi.json`.
  - Updated main dashboard app monitoring (`app/page.tsx`) to probe OpenAPI via backend `/openapi-spec`, improving app health/endpoint count reliability for CORS-restricted APIs.
- 2026-02-12
  - Added `project.md` as persistent project memory.
  - Fixed navigation route recognition for server details:
    - `Navigation` now treats `/servers/[name]` as server details and active server section.
  - Fixed chat page JSX className typos (removed stray trailing backslashes that break markup).
  - Replaced obsolete `/dashboard/[id]` implementation that referenced missing `/api/urls/*` endpoints with a safe legacy notice page.
  - Added `/login` placeholder route to resolve broken redirect/link from `/auth/register`.
  - Updated frontend env example to include `NEXT_PUBLIC_BE_API_URL` used by current pages.
  - Added live server monitoring on the main dashboard (`app/page.tsx`) with 10s polling of `/servers/status` and real-time server health details.
  - Added live registered-app monitoring on the main dashboard (`app/page.tsx`) by probing each app OpenAPI URL and rendering status/latency/endpoint count.
  - Fixed `register-server` runtime error where backend validation objects were rendered directly in JSX:
    - Added robust `toErrorMessage` normalization in `app/register-server/page.tsx`.
    - All error paths now render as strings, avoiding `Objects are not valid as a React child`.
  - Fixed backend validation regression causing `"Field required"` on register POST requests:
    - Removed unused `current_user` parameters from `POST /register-server` and `POST /register-base-url` in `main.py`.
    - These endpoints now correctly accept plain JSON bodies (`{name, url}`) from frontend forms.
  - Added strict backend server URL validation in `main.py` for `ServerRegistration.url`:
    - Rejects incomplete URLs like `http://10`
    - Requires explicit port and valid scheme/host.
  - Tightened URL host validation to reject shorthand hosts like `http://12:80` unless host is valid IP/localhost/FQDN.
  - Updated `POST /register-server` to verify live MCP connectivity before insert/update; non-live endpoints now return HTTP 400 and are not stored.
  - Added frontend register-server pre-validation and clearer user-facing error strings to surface URL/compatibility issues earlier.
