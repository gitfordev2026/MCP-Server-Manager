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
