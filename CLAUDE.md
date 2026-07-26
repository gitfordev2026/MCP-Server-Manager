# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**MCP Server Manager** — a centralized gateway that converts legacy REST APIs into MCP-compatible tools, registers native MCP servers, and enforces Keycloak JWT authentication + per-tool access policies on a unified MCP endpoint (`/mcp/`). It also provides an AI chat interface (Ollama + LangChain `MCPAgent`) that can call the registered tools.

Three services (all under one repo):
- `backend/` — FastAPI Python gateway (port 8000/8099/8090)
- `frontend/` — Next.js 16 App Router dashboard (port 3000)
- `mock-mcp-server/` — Dev-only dual-protocol (REST + MCP) sandbox
- `landing/` — Static marketing page (vanilla HTML/CSS/JS, served at `/` and `/new`)

See `APPLICATION_ANALYSIS.md` for the comprehensive architecture reference. See `docs/SESSION_COOKIE_AUTH_ARCHITECTURE.md` for the HttpOnly cookie auth design.

## Common Commands

### Full stack (Docker)
```bash
docker compose up -d                        # build + run (live mounts, hot reload)
docker compose -f docker-compose-airgapped-dev.yml up -d   # airgapped
# Scripts: prepare_offline_airgap.sh, run_airgapped_dev.sh, run_airgapped_offline.sh
```

### Backend (FastAPI)
```bash
cd backend
pip install -r requirements.txt
# Local dev runs Uvicorn from inside app/; main.py inserts backend/ into sys.path.
# Two equivalent entry points:
uvicorn main:app --host 0.0.0.0 --port 8000 --reload    # from backend/ (CWD must be backend/)
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload  # from repo root
# Or use backend/start.sh / backend/run_backend.ps1
# Health: http://localhost:8000/health   ·  Docs: http://localhost:8000/docs
```

### Frontend (Next.js 16 + React 19)
```bash
cd frontend
npm install
npm run dev          # http://localhost:3000
npm run build
npm run start
npm run lint         # ESLint (config in eslint.config.mjs)
# Jest is configured (jest.setup.ts) but no test runner script is wired in package.json
# — add `jest --config` or `vitest` to run frontend tests.
```

### Mock MCP server (dev sandbox)
```bash
cd mock-mcp-server
pip install -r requirements.txt
uvicorn server:app --reload --port 8001     # REST + MCP at /mcp/
# docker-compose.yml also wires mock-inventory (:8002), mock-portal (:8003), mock-analytics (:8004)
```

## Architecture (Big Picture)

```
Browser ──► Next.js (:3000) ──► /api/proxy/* (HMAC-signed) ──► FastAPI (:8000) ──► Combined MCP /mcp/
                                                                                       │
                                                                                  Postgres/SQLite
                                                                                  Redis (optional)
                                                                                  Keycloak (IdP)
                                                                                  Ollama (LLM)
```

### Backend — `backend/app/`
- **`main.py`** (~2,150 lines, monolithic): builds the FastAPI app, runs `init_db()` (RBAC seeding, schema migrations, `sync_api_server_links_by_host`, `sync_tool_policies_from_registry`), wires the `lifespan` that starts the health monitor, and mounts the **Combined MCP ASGI sub-app** at `/mcp/`.
- **`core/`** — `db.py` (Postgres w/ SQLite fallback, `SessionLocal`), `auth.py` (Keycloak URL builder), `jwt_validator.py` (PyJWKClient RS256 → `TokenClaims`), `rbac.py` (`get_request_actor` + `build_require_permission` decorator factory), `mcp_runtime.py` (fastmcp v2 vs `mcp.server.fastmcp` adapter), `cache.py` (Redis, graceful no-op), `logger.py` (colorlog), `hmac_middleware.py` (validates `X-Signature`/`X-Timestamp` if `HMAC_SECRET_KEY` set).
- **`models/db_models.py`** — all SQLAlchemy models in one file: `mcp_servers`, `raw_apis`, `mcp_tools` (unified registry, `source_type` ∈ `mcp|openapi`), `api_endpoints`, `exposed_mcp_tools` (per-tool access policy), `roles`/`permissions`/`user_roles`/`role_permissions`, `domain_auth_profiles`, `audit_logs`, `tool_versions`/`endpoint_versions`, `health_checks`/`health_status_history`.
- **`routers/`** — feature routers built via factory functions: `servers`, `base_urls`, `tools`, `endpoints`, `access_policies`, `agent`, `catalog`, `dashboard`, `health`, `health_events` (WS), `audit`, `old_agent` (legacy). All factories take `session_local_factory` + models + helper fns as DI (see `main.py` wiring).
- **`services/`** — `agent_runtime.py` (`MCPAgent` + tool-selection keyword filter, 12 tools max), `mcp_client_runtime.py` (probe/list/call external MCP), `health_monitor.py` (asyncio loop, `consecutive_failures` → healthy/degraded/down, emits WS events), `keycloak_auth.py` (client-credentials grant), `policy_utils.py` (`ensure_default_access_policy_for_owner` / `ensure_tool_access_policy_for_owner` / `resolve_owner_fk_ids`), `audit.py` (`write_audit_log`).
- **`services/registry/`** — `registry_sync_service.py` (OpenAPI tool upsert + soft-delete), `exposure_service.py` (resolve exposable tools against policy + parent health).
- **`schemas/registration.py`** — Pydantic validators for `ServerRegistration` / `BaseURLRegistration` (URL must be http/https with explicit numeric port; `/register-server` probes MCP compatibility live).
- **`env.py`** — `BackendEnv` dataclass loaded from `app/.env` or `../.env`. Vars: `AUTH_ENABLED`, `KEYCLOAK_*`, `DATABASE_URL`, `DB_FALLBACK_SQLITE`, `REDIS_*`, `OLLAMA_*`, `HMAC_SECRET_KEY`, `HEALTH_MONITOR_*`, `ENABLE_MULTI_KEYCLOAK` + `ADM_*`/`OPS_*` for per-domain Keycloak.

### Frontend — `frontend/`
- Next.js 16 App Router, React 19, Tailwind 4, React Query (`@tanstack/react-query`), `sonner` toasts.
- `app/layout.tsx` wraps everything in `<Providers>` then `<AuthGuard>`. Public paths: `/`, `/new`, `/login`, `/auth/*`. Unauthenticated visits trigger Keycloak PKCE redirect.
- `app/page.tsx` and `app/new/page.tsx` are the two landing variants.
- `app/api/proxy/[...path]/route.ts` — **all API calls go through this catch-all** which HMAC-signs and forwards to the backend (`HMAC_SECRET_KEY` from `process.env.HMAC_SECRET_KEY`). `services/http.ts` points `API_BASE` to `/api/proxy`. When `HMAC_SECRET_KEY` is unset the backend middleware no-ops.
- `lib/auth.ts` — PKCE flow (`generatePKCE`, `redirectToLogin`, `exchangeCodeForToken`, `refreshAccessToken`, `buildLogoutUrl`). Token storage: HttpOnly cookies set by backend; frontend only tracks a boolean `mcp_is_authenticated` localStorage flag.
- `components/AuthGuard.tsx` — auth gate with `bypassAuth` dev escape and `Continue Without Auth` button.
- `services/http.ts` — `authenticatedFetch()` (drops JWT injection when cookie present) + `http<T>()` (handles 401 → redirect to `/login`).
- Per-page folders under `app/`: `dashboard`, `admin`, `register-server`, `register-app`, `servers`, `mcp-endpoints`, `chat`, `playground`, `api-explorer`, `access-control`, `login`, `auth/callback`, `auth/register`.
- Access control feature: `services/accessPolicies.api.ts` + `hooks/useAccessPolicies.ts` + `hooks/useDebouncedPolicyUpdate.ts` + `types/accessPolicies.ts` + `components/access-control/`.
- `mocks/handlers.ts` + `mocks/server.ts` (MSW) and `jest.setup.ts` are present for tests, but no `test` script in `package.json` — add one before running.
- `landing.css` next to `app/page.tsx` for the inline landing styles.

### Mock MCP server — `mock-mcp-server/`
FastAPI + `fastmcp` v2 dual-protocol app. `server.py` (root), plus `inventory_app.py` / `portal_app.py` / `analytics_app.py` for the multi-app variant. Keycloak client-credentials auth via `KEYCLOAK_*` env. See `mock-mcp-server/KEYCLOAK_MAPPING_CONFIG.md` for realm/client mapping and `readme.md` for endpoints.

### Landing — `landing/`
Vanilla HTML/CSS/JS marketing page (`index.html`, `styles.css`, `script.js`) with canvas particle network, SVG flow diagram, scroll reveals. Served as static asset; not part of the Next.js bundle.

## Key Behaviors Worth Remembering

- **Combined MCP endpoint** at `/mcp/` (and `/mcp/apps`): merges OpenAPI-derived tools (from `raw_apis`) and native MCP tools (prefixed `mcp__{server}__{tool}`). Tool calls check `exposed_mcp_tools` policy (`deny` blocks; `approval` currently treated as allow).
- **Auth is HttpOnly cookies**: `access_token` / `refresh_token` / `mcp_access_token` set by `/auth/keycloak-callback` (`backend/app/routers/health.py`). `rbac._extract_bearer_token` falls back from `Authorization: Bearer` to cookies. `HMACVerificationMiddleware` then re-validates outbound integrity.
- **`AUTH_ENABLED=false`** is the dev escape hatch — `get_request_actor` trusts `x-user` / `x-roles` headers. Router-level `require_permission` still enforced.
- **Multi-Keycloak** (`ENABLE_MULTI_KEYCLOAK=true`): separate ADM/OPS realms/clients. `DomainAuthProfileModel` rows are seeded from `ADM_KEYCLOAK_*` / `OPS_KEYCLOAK_*` env. `ServerModel.domain_type` and `BaseURLModel.domain_type` are `ADM` (default) or `OPS`.
- **DB fallback**: when `DATABASE_URL` is unreachable, app auto-falls back to SQLite at `servers.db` if `DB_FALLBACK_SQLITE=true`. Both dialects share schema migrations (`ensure_access_policy_schema_columns`, `ensure_phase2_schema_columns`).
- **Health monitor** runs as an `asyncio` task in `lifespan` and updates `ServerModel.health_status` / `BaseURLModel.health_status`. WS broadcasts via `services/health_monitor.HealthEventBroadcaster` on `/ws/health`.
- **Tool lifecycle states** (`mcp_tools`): `registration_state` ∈ `selected|unselected`, `exposure_state` ∈ `active|disabled`. Effective visibility = `admin_enabled AND owner_enabled` → `is_enabled`. Soft-delete via `is_deleted`.
- **Owner policy model**: every server/app gets a `__default__` row in `exposed_mcp_tools` (auto-created via `sync_access_policy_links_and_defaults` and `sync_tool_policies_from_registry`). Per-tool rows override defaults. Modes: `allow` / `approval` / `deny`.
- **CORS** is permissive (`*`) in `main.py` — tighten for prod.
- **Combined MCP path** for combined-app in env: `AGENT_MCP_SERVER_URL` defaults to `http://127.0.0.1:8000/mcp/apps/`. Ollama default model: `gemma4:31b-cloud`.

## Memory files worth updating when behavior changes
- `backend/project.md` — backend project memory (DB, routes, runtime notes). Update on schema/route/policy changes.
- `docs/SESSION_COOKIE_AUTH_ARCHITECTURE.md` — auth design. Update if cookie names / logout flow change.
- `mock-mcp-server/memory.md` / `mock-mcp-server/KEYCLOAK_MAPPING_CONFIG.md` — mock-server specifics.
- `APPLICATION_ANALYSIS.md` — master reference; refresh after architectural changes.
