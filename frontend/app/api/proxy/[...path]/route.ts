import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Timeout for MCP-related paths (SSE/streaming) */
const MCP_TIMEOUT_MS = 120_000; // 120 seconds
/** Timeout for all other proxy requests */
const DEFAULT_TIMEOUT_MS = 30_000; // 30 seconds

/**
 * Headers that are important for MCP protocol and should be forwarded
 * if present on the incoming request.
 */
const MCP_FORWARD_HEADERS = [
  'mcp-session-id',
  'last-event-id',
  'mcp-protocol-version',
  'accept',
];

/**
 * Headers that must never be forwarded to the backend.
 */
const STRIP_HEADERS = new Set(['host', 'connection']);

/**
 * Check whether a path is an MCP path.
 */
function isMcpPath(path: string): boolean {
  return path.startsWith('/mcp/') || path === '/mcp';
}

/**
 * Extract a bearer token from the request cookies.
 * Prefers `access_token`, falls back to `mcp_access_token`.
 */
function extractTokenFromCookies(req: NextRequest): string | null {
  const token =
    req.cookies.get('access_token')?.value ??
    req.cookies.get('mcp_access_token')?.value ??
    null;
  return token || null;
}

async function handleProxy(
  req: NextRequest,
  { params }: { params: Promise<{ path: string[] }> },
) {
  try {
    const resolvedParams = await params;
    const pathParts = resolvedParams.path || [];
    const path = `/${pathParts.join('/')}`;

    const searchParams = req.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const urlSuffix = queryString ? `${path}?${queryString}` : path;
    const method = req.method;

    const hmacSecret = process.env.HMAC_SECRET_KEY;
    const backendUrl = process.env.NEXT_PUBLIC_BE_API_URL;

    if (!backendUrl) {
      return NextResponse.json(
        { error: 'Backend URL not configured' },
        { status: 500 },
      );
    }

    // ── Read body (if applicable) ──────────────────────────────────────
    let bodyText = '';
    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      bodyText = await req.text();
    }

    // ── Build forwarded headers ────────────────────────────────────────
    const headers = new Headers();

    req.headers.forEach((value, key) => {
      if (!STRIP_HEADERS.has(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    // Ensure MCP-critical headers are forwarded (they may already be set
    // by the loop above, but we explicitly ensure they aren't lost).
    for (const hdr of MCP_FORWARD_HEADERS) {
      const value = req.headers.get(hdr);
      if (value && !headers.has(hdr)) {
        headers.set(hdr, value);
      }
    }

    // ── Cookie-based auth injection ────────────────────────────────────
    if (!headers.has('authorization')) {
      const token = extractTokenFromCookies(req);
      if (token) {
        headers.set('Authorization', `Bearer ${token}`);
      }
    }

    // ── X-Forwarded-* headers ──────────────────────────────────────────
    const forwardedFor =
      req.headers.get('x-forwarded-for') ?? req.headers.get('x-real-ip') ?? '127.0.0.1';
    headers.set('X-Forwarded-For', forwardedFor);
    headers.set(
      'X-Forwarded-Proto',
      req.headers.get('x-forwarded-proto') ?? req.nextUrl.protocol.replace(':', ''),
    );
    headers.set('X-Forwarded-Host', req.headers.get('host') ?? req.nextUrl.host);

    // ── HMAC signing (unchanged logic) ─────────────────────────────────
    const timestamp = (Date.now() / 1000).toString();

    if (hmacSecret) {
      const payload = `${method}:${path}:${timestamp}:${bodyText}`;
      const signature = crypto
        .createHmac('sha256', hmacSecret)
        .update(payload, 'utf8')
        .digest('hex');

      headers.set('X-Timestamp', timestamp);
      headers.set('X-Signature', signature);
    }

    // ── Candidate origins (unchanged fallback logic) ───────────────────
    const backendUrlParsed = new URL(backendUrl);
    const candidateOrigins: string[] = [backendUrlParsed.origin];

    for (const fallbackHost of [
      'http://127.0.0.1:8000',
      'http://localhost:8000',
    ]) {
      if (!candidateOrigins.includes(fallbackHost)) {
        candidateOrigins.push(fallbackHost);
      }
    }

    // ── Determine timeout based on path ────────────────────────────────
    const timeoutMs = isMcpPath(path) ? MCP_TIMEOUT_MS : DEFAULT_TIMEOUT_MS;

    // ── Attempt fetch against each candidate origin ────────────────────
    let response: Response | null = null;
    let lastError: any = null;

    for (const origin of candidateOrigins) {
      const targetUrl = `${origin}${urlSuffix}`;
      try {
        const fetchHeaders = new Headers(headers);
        // `host` was already stripped above, but ensure it's gone for the
        // outgoing fetch so Node doesn't inject the wrong value.
        fetchHeaders.delete('host');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

        const res = await fetch(targetUrl, {
          method,
          headers: fetchHeaders,
          body:
            method !== 'GET' && method !== 'HEAD' && bodyText
              ? bodyText
              : undefined,
          // For MCP paths, follow redirects (handles 307s gracefully).
          // For non-MCP paths, keep manual redirect behaviour.
          redirect: isMcpPath(path) ? 'follow' : 'manual',
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        response = res;
        break;
      } catch (err: any) {
        lastError = err;
      }
    }

    if (!response) {
      return NextResponse.json(
        {
          error: 'Backend service unreachable',
          detail:
            lastError?.message || 'Failed to connect to backend service',
        },
        { status: 503 },
      );
    }

    // ── Build response headers ─────────────────────────────────────────
    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');

    // Detect SSE / streaming responses
    const contentType = response.headers.get('content-type') ?? '';
    const isStreaming =
      contentType.includes('text/event-stream') || isMcpPath(path);

    if (isStreaming) {
      responseHeaders.set('X-Accel-Buffering', 'no');
      responseHeaders.set('Cache-Control', 'no-cache, no-transform');
    }

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error('Proxy error:', error);
    try {
      require('fs').appendFileSync('/app/proxy-error.log', error.stack + '\n');
    } catch (_e) {
      // Logging best-effort; ignore write failures.
    }
    return NextResponse.json(
      { error: error.message || 'Unknown proxy error', stack: error.stack },
      { status: 500 },
    );
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
