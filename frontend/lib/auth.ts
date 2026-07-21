/**
 * Keycloak OIDC / PKCE authentication library.
 *
 * Handles the full Authorization Code + PKCE flow:
 *   1. Redirect to Keycloak login
 *   2. Exchange auth code for tokens
 *   3. Silent refresh via refresh_token
 *   4. Token storage & expiry management
 */

// ---------- Types ----------

export interface AuthConfig {
  auth_enabled: boolean;
  keycloak_url: string;
  realm: string;
  client_id: string;
  authorization_endpoint: string;
  token_endpoint: string;
  logout_endpoint: string;
}

interface TokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
}

// ---------- Storage keys ----------

const TOKEN_KEY = "mcp_access_token";
const REFRESH_KEY = "mcp_refresh_token";
const EXPIRY_KEY = "mcp_token_expiry";
const PKCE_VERIFIER_KEY = "mcp_pkce_verifier";
const LOGIN_REDIRECT_AT_KEY = "mcp_login_redirect_at";
const POST_LOGIN_REDIRECT_KEY = "mcp_post_login_redirect";

// Legacy keys to clean up
const LEGACY_KEYS = ["mcp_admin_user", "mcp_admin_roles"];

// ---------- Auth config ----------

const AUTH_CONFIG_TTL_MS = 5000;
const authConfigCache = new Map<string, { promise: Promise<AuthConfig>; fetchedAt: number }>();

export async function fetchAuthConfig(apiBase: string): Promise<AuthConfig> {
  const cached = authConfigCache.get(apiBase);
  if (cached && Date.now() - cached.fetchedAt < AUTH_CONFIG_TTL_MS) {
    return cached.promise;
  }

  const request = fetch(`${apiBase}/auth/config`)
    .then((res) => {
      if (!res.ok) {
        throw new Error(`Failed to fetch auth config: ${res.status}`);
      }
      return res.json() as Promise<AuthConfig>;
    })
    .catch((err) => {
      authConfigCache.delete(apiBase);
      throw err;
    });

  authConfigCache.set(apiBase, { promise: request, fetchedAt: Date.now() });
  return request;
}

// ---------- Token storage ----------

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;

  const token = localStorage.getItem(TOKEN_KEY);
  const expiryStr = localStorage.getItem(EXPIRY_KEY);

  if (!token || !expiryStr) return null;

  const expiry = parseInt(expiryStr, 10);
  // Consider expired 30 s early to avoid edge-case failures.
  if (Date.now() >= expiry - 30_000) return null;

  return token;
}

export function storeTokens(response: TokenResponse): void {
  localStorage.setItem(TOKEN_KEY, response.access_token);
  if (response.refresh_token) {
    localStorage.setItem(REFRESH_KEY, response.refresh_token);
  }
  const expiryMs = Date.now() + response.expires_in * 1000;
  localStorage.setItem(EXPIRY_KEY, expiryMs.toString());
}

export function clearTokens(): void {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(EXPIRY_KEY);
  // Remove legacy header-based auth data.
  LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
}

function normalizeRedirectPath(path: string): string {
  if (!path || !path.startsWith("/")) return "/";
  if (path.startsWith("/login") || path.startsWith("/auth/")) return "/";
  return path;
}

export function storePostLoginRedirect(path: string): void {
  if (typeof window === "undefined") return;
  const normalized = normalizeRedirectPath(path);
  const existing = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  if (existing && normalizeRedirectPath(existing) !== "/") {
    return;
  }
  sessionStorage.setItem(POST_LOGIN_REDIRECT_KEY, normalized);
}

function base64UrlEncodeString(value: string): string {
  return btoa(value).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64UrlDecodeString(value: string): string {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (padded.length % 4)) % 4;
  return atob(padded + "=".repeat(padLength));
}

function parseRedirectFromState(stateParam: string | null): string | null {
  if (!stateParam) return null;
  try {
    const decoded = base64UrlDecodeString(stateParam);
    const payload = JSON.parse(decoded) as { redirect?: string };
    return payload?.redirect ? normalizeRedirectPath(payload.redirect) : null;
  } catch {
    return null;
  }
}

export function consumePostLoginRedirect(stateParam?: string | null): string | null {
  if (typeof window === "undefined") return null;
  const value = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  sessionStorage.removeItem(POST_LOGIN_REDIRECT_KEY);
  if (value) return normalizeRedirectPath(value);
  return parseRedirectFromState(stateParam ?? null);
}

// ---------- PKCE helpers ----------

function generateRandomString(length: number): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  return crypto.subtle.digest("SHA-256", encoder.encode(plain));
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

async function generatePKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(64);
  const hashed = await sha256(verifier);
  const challenge = base64UrlEncode(hashed);
  return { verifier, challenge };
}

// ---------- Keycloak redirect ----------

export async function redirectToLogin(config: AuthConfig): Promise<void> {
  const now = Date.now();
  const lastRedirect = sessionStorage.getItem(LOGIN_REDIRECT_AT_KEY);
  if (lastRedirect && now - Number(lastRedirect) < 5000) {
    return;
  }
  sessionStorage.setItem(LOGIN_REDIRECT_AT_KEY, now.toString());

  const { verifier, challenge } = await generatePKCE();
  sessionStorage.setItem(PKCE_VERIFIER_KEY, verifier);

  const redirectUri = `${window.location.origin}/auth/callback`;
  const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
  const existingRedirect = sessionStorage.getItem(POST_LOGIN_REDIRECT_KEY);
  const redirectTarget = existingRedirect
    ? normalizeRedirectPath(existingRedirect)
    : normalizeRedirectPath(currentPath);
  storePostLoginRedirect(redirectTarget);
  const state = base64UrlEncodeString(
    JSON.stringify({
      redirect: redirectTarget,
      ts: Date.now(),
    })
  );

  const params = new URLSearchParams({
    client_id: config.client_id,
    response_type: "code",
    scope: "openid profile email",
    redirect_uri: redirectUri,
    code_challenge: challenge,
    code_challenge_method: "S256",
    state,
  });

  window.location.href = `${config.authorization_endpoint}?${params.toString()}`;
}

// ---------- Token exchange ----------

export async function exchangeCodeForToken(
  config: AuthConfig,
  code: string
): Promise<TokenResponse> {
  const verifier = sessionStorage.getItem(PKCE_VERIFIER_KEY);
  if (!verifier) {
    // Verifier can be missing if the page was reloaded, opened in another
    // tab, or React Strict Mode re-ran the effect.  Restart the login flow.
    await redirectToLogin(config);
    // redirectToLogin navigates away; throw to stop the caller.
    throw new Error("PKCE verifier missing — restarting login");
  }

  const redirectUri = `${window.location.origin}/auth/callback`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.client_id,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });

  const res = await fetch(config.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Token exchange failed (${res.status}): ${errText}`);
  }

  // Only remove the verifier after a successful exchange.
  sessionStorage.removeItem(PKCE_VERIFIER_KEY);

  return res.json();
}

// ---------- Silent refresh ----------

export async function refreshAccessToken(
  config: AuthConfig
): Promise<TokenResponse | null> {
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.client_id,
    refresh_token: refreshToken,
  });

  const res = await fetch(config.token_endpoint, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!res.ok) {
    // Refresh token expired or revoked — user must re-authenticate.
    clearTokens();
    return null;
  }

  const data: TokenResponse = await res.json();
  storeTokens(data);
  return data;
}

// ---------- Logout ----------

export function buildLogoutUrl(config: AuthConfig): string {
  const redirectUri = `${window.location.origin}/login`;
  const params = new URLSearchParams({
    client_id: config.client_id,
    post_logout_redirect_uri: redirectUri,
  });
  return `${config.logout_endpoint}?${params.toString()}`;
}
