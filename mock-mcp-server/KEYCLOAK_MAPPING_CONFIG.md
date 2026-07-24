# Keycloak Token Mapping & Cross-App Configuration Guide

## 1. Architecture & Overview
This document provides complete instructions for configuring Keycloak (`mcp-realm`, `ADM`, `OPS` network domains) so that calling clients (Public or Confidential) generate Keycloak Bearer Access Tokens (`Authorization: Bearer <token>`) that are accepted across all target applications (Resource Servers) connected to the **MCP Server Manager**.

```
┌─────────────────────────────┐        ┌─────────────────────────────┐
│  Calling Client / Frontend  │───────►│ Keycloak Auth Server (8080) │
│  (mcp-client / adm-client)  │        │ Realm: mcp-realm            │
└──────────────┬──────────────┘        └──────────────┬──────────────┘
               │                                      │
               │ Bearer Token                         │ JWKS / Userinfo
               ▼                                      ▼
┌─────────────────────────────┐        ┌─────────────────────────────┐
│    MCP Server Manager       │───────►│  Target Apps (8002/8003/4)  │
│  (Zero-Knowledge Gateway)   │        │  Resource Servers           │
└─────────────────────────────┘        └─────────────────────────────┘
```

---

## 2. Step-by-Step Keycloak Configuration Instructions

### Step 1: Realm & Client Setup
1. Log into Keycloak Admin Console (`http://localhost:8080/admin`).
2. Select or create Realm: **`mcp-realm`**.
3. Create the Client Applications under **Clients** ➔ **Create Client**:

| Client ID | Client Type | Client Authentication | Authentication Flow Enabled |
| :--- | :--- | :--- | :--- |
| **`mcp-client`** | Public Client | **OFF** | Standard Flow (PKCE), Direct Access Grants |
| **`adm-client`** | Confidential Client | **ON** | Direct Access Grants, Service Accounts Roles |
| **`ops-client`** | Confidential Client | **ON** | Direct Access Grants, Service Accounts Roles |
| **`mock-server-client`**| Confidential Client | **ON** | Direct Access Grants, Service Accounts Roles |

---

### Step 2: Configure Cross-App Audience (`aud`) Mappers
When target applications enforce OAuth 2.0 Audience (`aud`) validation, Keycloak must populate the target application's audience in the access token.

1. In Keycloak Admin Console: Go to **Clients** ➔ Select calling client (e.g., `mcp-client`).
2. Click **Client Scopes** ➔ Select **`mcp-client-dedicated`** (or **Dedicated Scopes**).
3. Click **Add mapper** ➔ Select **By configuration** ➔ **Audience**.
4. Fill in Mapper Configuration:
   - **Name**: `Cross-App Target Audience Mapper`
   - **Included Client Audience**: Select Target Client (e.g., `adm-client` or `ops-client`).
   - **Add to ID Token**: `OFF`
   - **Add to access token**: **`ON`**
5. Save the mapper.

*Note: If target applications perform Realm-level verification (verifying `iss` issuer matching `http://localhost:8080/realms/mcp-realm`), any token issued by `mcp-realm` will be accepted across all target applications.*

---

### Step 3: Configure Roles & Access Policies (RBAC)
1. Go to **Realm Roles** ➔ Click **Create Role**:
   - `inventory-admin`
   - `analytics-viewer`
   - `portal-user`
2. Assign Roles to Users or Service Accounts:
   - **Human Users**: Go to **Users** ➔ Select User ➔ **Role mapping** ➔ Click **Assign role** ➔ Select `inventory-admin`, `portal-user`.
   - **Service Accounts (M2M)**: Go to **Clients** ➔ Select `adm-client` ➔ **Service accounts roles** ➔ Click **Assign role**.

---

### Step 4: Token Validation in Target Applications (Resource Servers)

Target applications accept incoming Bearer tokens via standard HTTP header:
`Authorization: Bearer <access_token>`

Target applications validate the token using one of two methods:

#### Method A: Online Userinfo Introspection (Verification via Keycloak)
Target app calls Keycloak endpoint:
`GET http://keycloak:8080/realms/mcp-realm/protocol/openid-connect/userinfo`
- **Header**: `Authorization: Bearer <access_token>`
- **Validation**: If Keycloak returns `HTTP 200 OK`, token is active and valid.

#### Method B: Offline Local JWKS Verification (Stateless & High Performance)
Target app fetches public key set once from:
`GET http://keycloak:8080/realms/mcp-realm/protocol/openid-connect/certs`
- **Validation**:
  1. Verify RS256 signature against Keycloak public key (`jwks_uri`).
  2. Verify token is not expired (`exp > now`).
  3. Verify issuer matches realm (`iss == "http://localhost:8080/realms/mcp-realm"`).

---

## 3. Summary Checklist for Target Applications

- [x] **Realm Consistency**: All target apps & calling clients belong to `mcp-realm`.
- [x] **Zero Secret Storage**: MCP Server Manager stores 0 client secrets or client IDs.
- [x] **Bearer Passing**: Frontend/client passes `Authorization: Bearer <token>` on every request.
- [x] **Target App Middleware**: Target apps validate Bearer token with Keycloak before executing business logic.
