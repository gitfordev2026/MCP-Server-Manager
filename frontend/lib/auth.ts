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
  client_secret?: string;
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
    .then(async (res) => {
      if (!res.ok) {
        const errorText = await res.text().catch(() => "No text");
        console.error("Proxy returned error:", errorText);
        throw new Error(`Failed to fetch auth config: ${res.status} - ${errorText}`);
      }
      const config = await res.json();
      if (config.token_endpoint) {
        config.token_endpoint = `${apiBase}/auth/token`;
      }
      if (config.logout_endpoint) {
        config.logout_endpoint = `${apiBase}/auth/logout`;
      }
      return config as AuthConfig;
    })
    .catch((err) => {
      authConfigCache.delete(apiBase);
      throw err;
    });

  authConfigCache.set(apiBase, { promise: request, fetchedAt: Date.now() });
  return request;
}

// ---------- Token storage ----------

// We now use secure HttpOnly cookies set by the backend.
// The frontend only tracks a non-sensitive boolean flag for UI state.
const AUTH_FLAG_KEY = "mcp_is_authenticated";

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(AUTH_FLAG_KEY) === "true" ? "[SECURE_COOKIE]" : null;
}

export function storeTokens(response: any): void {
  try {
    localStorage.setItem(AUTH_FLAG_KEY, "true");
  } catch (_) {}
}

export function clearTokens(): void {
  try {
    localStorage.removeItem(AUTH_FLAG_KEY);
    LEGACY_KEYS.forEach((k) => localStorage.removeItem(k));
  } catch (_) {}
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
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.getRandomValues) {
    globalThis.crypto.getRandomValues(array);
  } else {
    for (let i = 0; i < length; i++) {
      array[i] = Math.floor(Math.random() * 256);
    }
  }
  return Array.from(array, (b) => b.toString(16).padStart(2, "0")).join("");
}

function rightRotate(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

function sha256PureJS(ascii: string): Uint8Array {
  const mathPow = Math.pow;
  const maxWord = mathPow(2, 32);
  const K: number[] = [];
  const isPrime = (n: number) => {
    for (let f = 2; f * f <= n; f++) if (n % f === 0) return false;
    return true;
  };
  let candidate = 2;
  while (K.length < 64) {
    if (isPrime(candidate)) K.push((mathPow(candidate, 1 / 3) * maxWord) | 0);
    candidate++;
  }
  const H: number[] = [];
  candidate = 2;
  while (H.length < 8) {
    if (isPrime(candidate)) H.push((mathPow(candidate, 1 / 2) * maxWord) | 0);
    candidate++;
  }
  const words: number[] = [];
  const asciiLength = ascii.length * 8;
  for (let i = 0; i < ascii.length; i++) {
    words[i >> 2] |= ascii.charCodeAt(i) << (24 - (i % 4) * 8);
  }
  words[asciiLength >> 5] |= 0x80 << (24 - (asciiLength % 32));
  words[(((asciiLength + 64) >> 9) << 4) + 15] = asciiLength;
  const w = new Array(64);
  for (let i = 0; i < words.length; i += 16) {
    const wSub = words.slice(i, i + 16);
    let a = H[0], b = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
    for (let j = 0; j < 64; j++) {
      if (j < 16) {
        w[j] = wSub[j] | 0;
      } else {
        const s0 = rightRotate(w[j - 15], 7) ^ rightRotate(w[j - 15], 18) ^ (w[j - 15] >>> 3);
        const s1 = rightRotate(w[j - 2], 17) ^ rightRotate(w[j - 2], 19) ^ (w[j - 2] >>> 10);
        w[j] = (w[j - 16] + s0 + w[j - 7] + s1) | 0;
      }
      const ch = (e & f) ^ (~e & g);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const s0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const s1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const temp1 = (h + s1 + ch + K[j] + w[j]) | 0;
      const temp2 = (s0 + maj) | 0;
      h = g; g = f; f = e; e = (d + temp1) | 0; d = c; c = b; b = a; a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0; H[1] = (H[1] + b) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
  }
  const result = new Uint8Array(32);
  for (let i = 0; i < 8; i++) {
    result[i * 4] = (H[i] >> 24) & 0xff;
    result[i * 4 + 1] = (H[i] >> 16) & 0xff;
    result[i * 4 + 2] = (H[i] >> 8) & 0xff;
    result[i * 4 + 3] = H[i] & 0xff;
  }
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  if (typeof globalThis.crypto !== "undefined" && globalThis.crypto.subtle && typeof globalThis.crypto.subtle.digest === "function") {
    try {
      const encoder = new TextEncoder();
      return await globalThis.crypto.subtle.digest("SHA-256", encoder.encode(plain));
    } catch {
      // Fallback to pure JS sha256 if crypto.subtle fails
    }
  }
  const uint8 = sha256PureJS(plain);
  return uint8.buffer as ArrayBuffer;
}

function base64UrlEncode(buffer: ArrayBuffer | ArrayBufferLike): string {
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

export async function redirectToLogin(config: AuthConfig, force: boolean = false): Promise<void> {
  const now = Date.now();
  const lastRedirect = sessionStorage.getItem(LOGIN_REDIRECT_AT_KEY);
  if (!force && lastRedirect && now - Number(lastRedirect) < 2000) {
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
    throw new Error("PKCE verifier missing — session reset required");
  }

  const redirectUri = `${window.location.origin}/auth/callback`;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: config.client_id,
    code,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  });
  if (config.client_secret) {
    body.append("client_secret", config.client_secret);
  }

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
  // With HttpOnly cookies, silent refresh requires a dedicated backend endpoint.
  // For now, we return null to force a re-login when the cookie expires.
  return null;
}

// ---------- Logout ----------

export function buildLogoutUrl(config: AuthConfig): string {
  const redirectUri = `${window.location.origin}/`;
  const params = new URLSearchParams({
    client_id: config.client_id,
    post_logout_redirect_uri: redirectUri,
  });
  return `${config.logout_endpoint}?${params.toString()}`;
}
