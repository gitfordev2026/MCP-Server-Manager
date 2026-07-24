# Authentication & Session Cookie Security Architecture

## 1. Overview
The **MCP Server Manager** implements an enterprise-grade **HttpOnly Session Cookie Authentication** architecture. 

Rather than storing OAuth 2.0 / Keycloak access tokens in vulnerable client-side storage (`localStorage`, `sessionStorage`, or JavaScript memory), the application uses **secure, HttpOnly cookies** (`access_token`, `refresh_token`, `mcp_access_token`) for browser session management while dynamically forwarding Bearer tokens to downstream target applications.

---

## 2. Security Design Principles

```
┌───────────────────────────────┐
│     Next.js Web Frontend      │
│  (No JS access to tokens!)   │
└──────────────┬────────────────┘
               │  1. Automatic Cookie Inclusion
               │     (credentials: 'include')
               ▼
┌───────────────────────────────┐
│   FastAPI Backend / Gateway   │
│  Extracts Cookie -> Validates │
└──────────────┬────────────────┘
               │  2. Dynamic Bearer Header Injection
               │     Authorization: Bearer <token>
               ▼
┌───────────────────────────────┐
│     Target Resource Apps      │
│   (Inventory, Analytics, etc) │
└───────────────────────────────┘
```

### Key Benefits:
1. **XSS Protection**: `HttpOnly` flag prevents client-side JavaScript (`document.cookie`) from reading access tokens, eliminating token theft via Cross-Site Scripting (XSS) attacks.
2. **CSRF Protection**: Cookies are configured with `SameSite=Lax` / `SameSite=Strict` and CORS restriction.
3. **Seamless Frontend UX**: The browser automatically attaches session cookies on every request (`credentials: 'include'`). No manual `Authorization` header assembly is needed in client components.
4. **Proxy Translation**: The backend seamlessly converts incoming HttpOnly session cookies into standard `Authorization: Bearer <token>` headers when calling downstream protected microservices.

---

## 3. End-to-End Authentication Flow

### Step 1: OIDC Authentication & Cookie Issuance
1. The user authenticates via Keycloak (`mcp-realm`).
2. The Keycloak token callback endpoint (`/auth/keycloak-callback` in `backend/app/routers/health.py`) receives the OAuth2 authorization code and exchanges it for tokens.
3. The backend sets secure `HttpOnly` cookies in the HTTP response:

```python
# backend/app/routers/health.py
cookie_kwargs = {
    "httponly": True,
    "secure": True,      # Sent only over HTTPS in production
    "samesite": "lax",
    "path": "/",
}

response.set_cookie(key="access_token", value=access_token, max_age=300, **cookie_kwargs)
response.set_cookie(key="refresh_token", value=refresh_token, max_age=1800, **cookie_kwargs)
```

---

### Step 2: Frontend Request Handling (`frontend/services/http.ts`)
The frontend client never handles token strings directly. It sends requests with `credentials: 'include'`:

```typescript
// frontend/services/http.ts
export async function apiFetch(url: string, options: RequestInit = {}) {
  const defaultOptions: RequestInit = {
    credentials: 'include', // Automatically attaches HttpOnly cookies
    headers: {
      'Content-Type': 'application/json',
    },
  };
  return fetch(url, { ...defaultOptions, ...options });
}
```

---

### Step 3: Backend Token Extraction (`backend/app/core/rbac.py`)
The backend middleware inspects both HTTP headers (for API/M2M clients) and cookies (for browser sessions):

```python
# backend/app/core/rbac.py
def get_bearer_token(request: Request) -> str | None:
    # 1. Check Authorization: Bearer <token> header first
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        return auth_header.split(" ")[1].strip()

    # 2. Fall back to HttpOnly session cookies for browser clients
    cookie_token = request.cookies.get("mcp_access_token") or request.cookies.get("access_token")
    if cookie_token and cookie_token.strip():
        return cookie_token.strip()

    return None
```

---

### Step 4: Outbound Token Injection to Target Apps (`backend/app/main.py`)
When a user executes an MCP tool or calls a registered target application API (e.g., Inventory API on port 8002):
1. The MCP Gateway extracts the session token from the user's HttpOnly cookie.
2. It injects the token into the outbound request header:
   `Authorization: Bearer <extracted_session_token>`
3. The downstream target application validates the Bearer token with Keycloak and executes the operation.

---

### Step 5: Logout, Token Revocation & Session Invalidation
When the user logs out (`GET /auth/logout`), the application executes a **3-layer Security Invalidation**:

1. **RFC 7009 Token Revocation (`/protocol/openid-connect/revoke`)**:
   The backend sends a POST request to Keycloak's RFC 7009 revocation endpoint for both `access_token` and `refresh_token`. Keycloak explicitly marks the tokens as revoked.

2. **SSO Session Termination (`/protocol/openid-connect/logout`)**:
   The user's browser is redirected to Keycloak's OIDC End Session endpoint with `refresh_token` attached. Keycloak terminates the user's active SSO session in Keycloak database.
   - **Post-Logout Protection**: Because Keycloak terminates the SSO session, any request to Keycloak's `/userinfo` endpoint using a token captured prior to logout returns **`HTTP 401 Unauthorized` / `HTTP 403 Forbidden`**!

3. **Client Cookie Deletion**:
   The backend instructs the browser to clear all HttpOnly session cookies (`access_token`, `refresh_token`, `mcp_access_token`):
   ```python
   response.delete_cookie("access_token", path="/")
   response.delete_cookie("mcp_access_token", path="/")
   response.delete_cookie("refresh_token", path="/")
   ```

---

## 4. Summary Matrix: Headers vs. Cookies

| Feature | Bearer Header (`Authorization`) | HttpOnly Session Cookie (`access_token`) |
| :--- | :--- | :--- |
| **Primary Consumer** | M2M / API Clients / CLI Tools | Web Browsers (Next.js Frontend) |
| **JS Accessibility** | Accessible in JS (`localStorage`) | **Blocked from JS** (`HttpOnly`) |
| **XSS Vulnerability** | High (Tokens vulnerable to XSS theft) | **Zero** (Impervious to script reading) |
| **CSRF Protection** | N/A (Headers not sent automatically) | Protected via `SameSite=Lax` & Origin Check |
| **Outbound Proxy** | Passed through as-is | Converted to `Bearer` header by Gateway |
