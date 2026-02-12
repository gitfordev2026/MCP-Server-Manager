# MCP Use Agent - Project Memory

## Purpose
- Backend: Manage MCP server registrations, app base URLs, server tool discovery, server health checks, and agent chat query forwarding.
- Frontend: Provide a dashboard UI for MCP servers/apps, API explorer for OpenAPI endpoints, and chat UI for `/agent/query`.

## Tech Stack
- Backend: FastAPI + SQLAlchemy + SQLite (`servers.db`) in `main.py`.
- Frontend: Next.js App Router + React + Tailwind in `frontend/mcp-dashboard`.

## Backend Overview
- Entry file: `main.py`
- Database tables:
  - `servers` (`name`, `url`)
  - `base_urls` (`name`, `url`)
- Public endpoints (currently open by design):
  - `GET /health`
  - `POST /register-base-url`
  - `GET /base-urls`
  - `POST /register-server`
  - `GET /servers`
  - `GET /servers/{server_name}/tools`
  - `GET /servers/status`
  - `GET /servers/{server_name}/status`
  - `GET /agent/query?prompt=...`
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
  - `{baseUrl}/openapi.json`
- App card live data:
  - Status badge (`Alive` / `Down`)
  - OpenAPI probe latency (ms)
  - Endpoint count (from OpenAPI `paths`)
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

## Change Log
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
