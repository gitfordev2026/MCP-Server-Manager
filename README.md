# MCP Server Manager

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Build Status](https://img.shields.io/badge/build-passing-brightgreen.svg)
![Python Version](https://img.shields.io/badge/python-3.11%2B-blue.svg)
![Node Version](https://img.shields.io/badge/node-20.x-green.svg)
![FastAPI](https://img.shields.io/badge/FastAPI-0.100%2B-009688.svg)
![Next.js](https://img.shields.io/badge/Next.js-15.x-000000.svg)

> An enterprise-grade, high-performance platform for managing Model Context Protocol (MCP) servers, OpenAPI tool registrations, real-time health telemetry, and LLM agent routing. Designed for both single-node Docker Compose deployments and distributed multi-VM production environments with strict zero-trust security controls.

---

## 🎯 Key Features

- **MCP & OpenAPI Server Orchestration:** Connect, register, monitor, and manage external Model Context Protocol (MCP) servers and OpenAPI specification endpoints dynamically.
- **LLM Agent & Inference Integration:** Built-in multi-model AI agent routing supporting Ollama engines (e.g. `gemma4:31b-cloud`), tool execution, structured function calling, and streaming queries.
- **Real-Time Telemetry & Monitoring:** Async background health checker broadcasting real-time server health and system telemetry across WebSockets (`/ws`, `/ws/health`).
- **Short-Lived Single-Use WebSocket Ticket Pattern:** Eliminates credential leakage over WS query strings. Exchanges HTTP Bearer tokens for cryptographically secure 30-second single-use UUIDv4 tickets.
- **Cross-Site WebSocket Hijacking (CSWSH) Defense:** Enforces strict `Origin` header validation against `ALLOWED_ORIGINS` during WebSocket handshakes.
- **Rate Limiting & DoS Defense:** Integrated **SlowAPI** rate limiter backed by Redis with sliding-window sliding limits (e.g., 20 req/min for auth endpoints, 120 req/min for general API).
- **Keycloak OIDC & RBAC:** Multi-realm Keycloak integration with JWT verification, role-based access control, and HMAC request signing.
- **Multi-VM & Airgapped Support:** Network-agnostic architecture compatible with distributed host setups, local dev bridge networks, and 100% airgapped offline installations.

---

## 🏗️ Architecture & Technical Stack

- **Backend:** FastAPI (Python 3.11+), Uvicorn, SQLAlchemy ORM, Pydantic v2, SlowAPI, PyJWT.
- **Frontend:** Next.js 15 (React 19, TypeScript), Tailwind CSS, Framer Motion.
- **Identity & Access Management:** Keycloak 25+ (OAuth2 / OpenID Connect).
- **Database & State:** PostgreSQL 17 (relational store), Redis (ephemeral ticket store & cache).
- **LLM Engine:** Ollama Inference Server (`http://<OLLAMA_IP>:11434`).

```mermaid
graph TD
    User["User Browser / Client"] -->|HTTPS / REST| NextJS["Next.js Frontend (Port 3000)"]
    NextJS -->|Server Proxy / REST| FastAPI["FastAPI Backend (Port 8000)"]
    User -->|WS /ws?ticket=UUID| FastAPI
    FastAPI -->|OIDC Token Verify| Keycloak["Keycloak Auth (Port 8080)"]
    FastAPI -->|Relational Data| Postgres["PostgreSQL DB (Port 5432)"]
    FastAPI -->|Cache & WS Tickets| Redis["Redis Cache (Port 6379)"]
    FastAPI -->|Tool Calling & Stream| Ollama["Ollama Engine (Port 11434)"]
```

---

## 📋 Prerequisites

Before running the application, ensure the following tools are installed:

- **Python:** `v3.11` or higher
- **Node.js:** `v20.x` or higher (with `npm` or `pnpm`)
- **Keycloak:** `v22.0.0+` (Nightly or standard distribution)
- **PostgreSQL:** `v17.0+`
- **Redis:** `v7.0+`
- **Docker & Docker Compose:** Docker Engine `v24.0+`, Docker Compose `v2.20+`

---

## ⚙️ Configuration & Environment Variables

Configure application parameters using environment files (`backend/.env` and `frontend/.env`).

### Backend Environment Variables (`backend/.env`)

| Variable | Description | Default Value | Required? |
|---|---|---|---|
| `AUTH_ENABLED` | Enables Keycloak OAuth2 JWT verification | `true` | Yes |
| `KEYCLOAK_SERVER_URL` | Internal URL of Keycloak server | `http://10.139.10.176:8080` | Yes |
| `KEYCLOAK_FRONTEND_URL` | Public browser URL of Keycloak server | `http://10.139.10.176:8080` | Yes |
| `KEYCLOAK_REALM` | Keycloak target realm | `IAF` | Yes |
| `KEYCLOAK_CLIENT_ID` | OAuth2 Client ID | `mcp-client-secure` | Yes |
| `KEYCLOAK_CLIENT_SECRET` | OIDC Client Secret | *(configured secret)* | Yes |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://langfuse:langfuse@10.139.10.176:5432/mcp_manager_8` | Yes |
| `REDIS_ENABLED` | Toggles Redis caching | `true` | Yes |
| `REDIS_URL` | Redis connection URI | `redis://10.139.10.176:6379/0` | Yes |
| `ALLOWED_ORIGINS` | Comma-separated allowed CSWSH origins | `http://localhost:3000,http://127.0.0.1:3000` | Yes |
| `RATE_LIMIT_ENABLED` | Toggles SlowAPI rate limiting | `true` | No |
| `RATE_LIMIT_DEFAULT` | Global API rate limit threshold | `120/minute` | No |
| `RATE_LIMIT_AUTH` | Auth endpoint rate limit threshold | `20/minute` | No |
| `AGENT_OLLAMA_BASE_URL` | Ollama LLM endpoint URL | `http://10.139.10.176:11434` | Yes |

### Frontend Environment Variables (`frontend/.env`)

| Variable | Description | Default Value | Required? |
|---|---|---|---|
| `NODE_ENV` | Environment mode (`development`/`production`) | `development` | Yes |
| `NEXT_PUBLIC_BE_API_URL` | Backend API URL for server-side proxying | `http://10.139.10.176:8000` | Yes |
| `NEXT_PUBLIC_WS_URL` | WebSocket endpoint URL for client browsers | `ws://10.139.10.176:8000/ws/health` | Yes |
| `HMAC_SECRET_KEY` | Secret key for frontend HMAC headers | `4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d` | Yes |

---

## 🚀 Local Setup & Installation

### Option 1: Docker Compose Setup (Recommended)

Run all microservices using Docker Compose:

```bash
# 1. Clone the repository
git clone <repository_url>
cd new-docker-img-mcp-07-04-26

# 2. Start all services in detached mode
docker compose up -d

# 3. Verify health status
curl -i http://localhost:8000/health
```

### Option 2: Native Local Development

#### 1. Backend Setup
```bash
cd backend
python3 -m venv venv
source venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

#### 2. Frontend Setup
```bash
cd frontend
npm install
cp .env.example .env
npm run dev
```

---

## 🔒 Authentication & WebSocket Workflow

The application uses the **Short-Lived Single-Use Ticket Pattern** for WebSockets:

```
[Client] ---> POST /api/ws-ticket (Auth: Bearer <JWT>) ---> [Backend] (Generates 30s UUID Ticket)
[Client] <--- Returns {"ticket": "<UUID>"} <------------------ [Backend]
[Client] ---> WS /ws?ticket=<UUID> (Origin: allowed) -------> [Backend] (Validates Origin & Burns Ticket)
[Client] <=== WebSocket Connection Established =============> [Backend]
```

### Client Connection Code Example (JavaScript)

```javascript
// Step 1: Exchange Bearer Token for Short-Lived Ticket
const response = await fetch("http://localhost:8000/api/ws-ticket", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${accessToken}`,
  },
});
const { ticket } = await response.json();

// Step 2: Establish WebSocket using Single-Use Ticket
const ws = new WebSocket(`ws://localhost:8000/ws?ticket=${ticket}`);

ws.onopen = () => {
  console.log("WebSocket connected securely!");
};

ws.onmessage = (event) => {
  console.log("Received:", JSON.parse(event.data));
};
```

---

## 🧪 Testing & Verification

Run the comprehensive unit and security test suites inside the backend container:

```bash
# Run Security, Rate Limiter & WS Ticket Test Suites
docker exec -w /app mcp-backend python3 -m unittest test_security test_ws_ticket_suite
```

### Covered Test Scenarios
- **Happy Path:** Authenticated ticket generation and successful WebSocket connection.
- **Replay Attack Prevention:** Reusing a burned ticket UUID is immediately rejected during handshake with code `1008`.
- **Expired Ticket Check:** Tickets older than 30 seconds TTL are rejected.
- **CSWSH Defense:** Handshakes from unauthorized `Origin` headers (e.g. `https://malicious-site.com`) are rejected with `1008`.
- **Rate Limit Enforcement:** Exceeding threshold returns `HTTP 429 Too Many Requests`.

---

## 📁 Project Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── core/               # Security, Auth, Cache, Rate Limiter & WS Tickets
│   │   │   ├── auth.py         # Keycloak OIDC issuer & token helpers
│   │   │   ├── cache.py        # Redis client & status checks
│   │   │   ├── jwt_validator.py # JWT validation & signature verification
│   │   │   ├── rate_limiter.py # SlowAPI rate limiter configuration
│   │   │   ├── rbac.py          # Role-based access control & dependencies
│   │   │   └── ws_ticket.py    # Single-use WS ticket generation & burning
│   │   ├── routers/            # REST & WebSocket route handlers
│   │   │   ├── health.py       # Health check & auth token proxy endpoints
│   │   │   ├── health_events.py# Real-time telemetry WebSocket router
│   │   │   ├── servers.py      # MCP server management endpoints
│   │   │   └── ws_ticket_router.py # Ticket generation & secure /ws router
│   │   ├── env.py              # Environment configuration loader
│   │   ├── main.py             # FastAPI entrypoint & middleware stack
│   │   ├── test_security.py    # Rate limit & route security unit tests
│   │   └── test_ws_ticket_suite.py # WS ticket & CSWSH test suite
│   ├── Dockerfile
│   └── requirements.txt
├── frontend/
│   ├── app/                    # Next.js 15 App Router pages & API proxy
│   ├── components/             # React UI components & Auth guards
│   ├── lib/                    # Auth helpers & SHA-256 fallback
│   └── Dockerfile.dev
├── docker-compose.yml          # Production multi-container manifest
├── docker-compose.ubuntu.yml   # Linux host network manifest
└── README.md
```

---

## 📜 License

This project is licensed under the MIT License.
