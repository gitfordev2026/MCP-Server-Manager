# 🔑 Keycloak Configuration & Realm Export Directory

This folder contains the complete, production-ready Keycloak export files for **MCP Server Manager**.

---

## 📁 Exported Configuration Files

| File | Description |
| :--- | :--- |
| [`IAF-realm-export.json`](file:///media/vip/New%20Volume4/Practice/MCP%20Server%20Manager/MCP-Server-Manager/keycloak-config/IAF-realm-export.json) | Complete import-ready realm export for **`IAF`** realm (11 clients, roles, users, scopes, authentication flows). |
| [`master-realm-export.json`](file:///media/vip/New%20Volume4/Practice/MCP%20Server%20Manager/MCP-Server-Manager/keycloak-config/master-realm-export.json) | Complete realm export for Keycloak **`master`** administration realm. |
| [`clients.json`](file:///media/vip/New%20Volume4/Practice/MCP%20Server%20Manager/MCP-Server-Manager/keycloak-config/clients.json) | Consolidated reference list of all registered OIDC clients and client secrets across all realms. |
| [`users.json`](file:///media/vip/New%20Volume4/Practice/MCP%20Server%20Manager/MCP-Server-Manager/keycloak-config/users.json) | Consolidated reference list of exported users and assigned realm roles (`admin`, `developer`, etc.). |

---

## 🛡️ Configured Clients Summary (`IAF` Realm)

* **Primary OIDC Client:** `mcp-client-secure`
* **Flows Supported:** Standard Authorization Code + PKCE, Direct Access Grants, Client Credentials
* **Admin & Domain Clients:** Registered for multi-domain keycloak RBAC enforcement.

---

## 🚀 How to Import into Keycloak

### Method 1: Automatic Import on Container Startup (Docker / Docker Compose)
Mount the realm file into `/opt/keycloak/data/import/` and pass `--import-realm` flag to Keycloak:

```yaml
services:
  keycloak:
    image: keycloak/keycloak:nightly
    command: start-dev --import-realm
    volumes:
      - ./keycloak-config/IAF-realm-export.json:/opt/keycloak/data/import/IAF-realm-export.json:ro
```

### Method 2: Manual Import via Keycloak Admin Console
1. Log into Keycloak Admin Console (`http://<your-ip>:8080`).
2. Select **Master** realm dropdown → click **Create Realm** (or Import).
3. Click **Browse...** and select `IAF-realm-export.json`.
4. Click **Create** / **Save**.
