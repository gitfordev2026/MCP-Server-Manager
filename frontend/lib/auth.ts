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

// ---------- Cookie Storage Helpers ----------

export function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(new RegExp("(?:^|; )" + name.replace(/([\.$?*|{}\(\)\[\]\\\/\+^])/g, "\\$1") + "=([^;]*)"));
  return match ? decodeURIComponent(match[1]) : null;
}

export function setCookie(name: string, value: string, maxAgeSec: number): void {
  if (typeof document === "undefined") return;
  const secureFlag = typeof window !== "undefined" && window.location.protocol === "https:" ? "Secure;" : "";
  document.cookie = `${name}=${encodeURIComponent(value)}; Path=/; Max-Age=${maxAgeSec}; SameSite=Lax; ${secureFlag}`;
}

export function deleteCookie(name: string): void {
  if (typeof document === "undefined") return;
  document.cookie = `${name}=; Path=/; Max-Age=0; SameSite=Lax;`;
}

export function getStoredToken(): string | null {
  if (typeof window === "undefined") return null;

  // 1. Try Cookie first
  let token = getCookie(TOKEN_KEY);
  let expiryStr = getCookie(EXPIRY_KEY);

  // 2. Fallback to localStorage
  if (!token) {
    token = localStorage.getItem(TOKEN_KEY);
    expiryStr = localStorage.getItem(EXPIRY_KEY);
  }

  if (!token) return null;

  if (expiryStr) {
    const expiry = parseInt(expiryStr, 10);
    // Consider expired 30 s early to avoid edge-case failures.
    if (Date.now() >= expiry - 30_000) return null;
  }

  return token;
}

export function storeTokens(response: TokenResponse): void {
  const maxAge = response.expires_in || 3600;
  setCookie(TOKEN_KEY, response.access_token, maxAge);
  if (response.refresh_token) {
    setCookie(REFRESH_KEY, response.refresh_token, 30 * 24 * 3600);
  }
  const expiryMs = Date.now() + maxAge * 1000;
  setCookie(EXPIRY_KEY, expiryMs.toString(), maxAge);

  try {
    localStorage.setItem(TOKEN_KEY, response.access_token);
    if (response.refresh_token) {
      localStorage.setItem(REFRESH_KEY, response.refresh_token);
    }
    localStorage.setItem(EXPIRY_KEY, expiryMs.toString());
  } catch (_) {}
}

export function clearTokens(): void {
  deleteCookie(TOKEN_KEY);
  deleteCookie(REFRESH_KEY);
  deleteCookie(EXPIRY_KEY);

  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(REFRESH_KEY);
    localStorage.removeItem(EXPIRY_KEY);
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

// Pure JS SHA-256 implementation (works on HTTP IP addresses without crypto.subtle security restrictions)
function sha256PureJs(ascii: string): Uint8Array {
  function rightRotate(value: number, amount: number): number {
    return (value >>> amount) | (value << (32 - amount));
  }

  let i: number;
  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];

  const k = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];

  const buffer = new Uint8Array(ascii.length);
  for (i = 0; i < ascii.length; i++) buffer[i] = ascii.charCodeAt(i);

  const bitLen = buffer.length * 8;
  const paddedLen = Math.ceil((buffer.length + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLen);
  padded.set(buffer);
  padded[buffer.length] = 0x80;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLen - 4, bitLen, false);

  const w = new Uint32Array(64);
  for (let offset = 0; offset < paddedLen; offset += 64) {
    for (i = 0; i < 16; i++) {
      w[i] = view.getUint32(offset + i * 4, false);
    }
    for (i = 16; i < 64; i++) {
      const s0 = rightRotate(w[i - 15], 7) ^ rightRotate(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rightRotate(w[i - 2], 17) ^ rightRotate(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;

    for (i = 0; i < 64; i++) {
      const S1 = rightRotate(e, 6) ^ rightRotate(e, 11) ^ rightRotate(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + k[i] + w[i]) | 0;
      const S0 = rightRotate(a, 2) ^ rightRotate(a, 13) ^ rightRotate(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }

    hash[0] = (hash[0] + a) | 0;
    hash[1] = (hash[1] + b) | 0;
    hash[2] = (hash[2] + c) | 0;
    hash[3] = (hash[3] + d) | 0;
    hash[4] = (hash[4] + e) | 0;
    hash[5] = (hash[5] + f) | 0;
    hash[6] = (hash[6] + g) | 0;
    hash[7] = (hash[7] + h) | 0;
  }

  const resultBuffer = new Uint8Array(32);
  const resView = new DataView(resultBuffer.buffer);
  for (i = 0; i < 8; i++) {
    resView.setUint32(i * 4, hash[i], false);
  }
  return resultBuffer;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const u8 = sha256PureJs(plain);
  return u8.buffer.slice(u8.byteOffset, u8.byteOffset + u8.byteLength) as ArrayBuffer;
}

function base64UrlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  bytes.forEach((b) => (binary += String.fromCharCode(b)));
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function generateRandomString(length: number): string {
  let result = "";
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
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
  const refreshToken = localStorage.getItem(REFRESH_KEY);
  if (!refreshToken) return null;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    client_id: config.client_id,
    refresh_token: refreshToken,
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
  const redirectUri = `${window.location.origin}/`;
  const params = new URLSearchParams({
    client_id: config.client_id,
    post_logout_redirect_uri: redirectUri,
  });
  return `${config.logout_endpoint}?${params.toString()}`;
}
