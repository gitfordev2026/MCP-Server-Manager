import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  try {
    const resolvedParams = await params;
    const pathParts = resolvedParams.path || [];
    let path = `/${pathParts.join('/')}`;

    // Normalize MCP endpoint paths so MCP Inspector can hit:
    //   /api/proxy/mcp/apps      → backend /mcp/apps/
    //   /api/proxy/mcp/apps/     → backend /mcp/apps/
    //   /api/proxy/mcp           → backend /mcp/
    //   /api/proxy/mcp/          → backend /mcp/
    // The MCP Inspector (streamable-http transport) uses POST + SSE and
    // accesses these paths with or without a trailing slash, depending on
    // whether it's the initial `initialize` request or a follow-up
    // notification. Backend mounts the combined MCP app at both /mcp/apps
    // and /mcp/apps/ but the ASGI sub-app expects the trailing slash.
    let targetPath = path;
    const normalized = path.replace(/\/+$/, '') || '/';
    if (normalized === '/mcp/apps') {
      targetPath = '/mcp/apps/';
    } else if (normalized === '/mcp') {
      targetPath = '/mcp/';
    }

    const searchParams = req.nextUrl.searchParams;
    const queryString = searchParams.toString();
    const urlSuffix = queryString ? `${targetPath}?${queryString}` : targetPath;
    const method = req.method;

    const hmacSecret = process.env.HMAC_SECRET_KEY;
    const backendUrl = process.env.NEXT_PUBLIC_BE_API_URL;

    if (!backendUrl) {
      return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    }

    let bodyText = "";
    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      bodyText = await req.text();
    }

    const timestamp = (Date.now() / 1000).toString();

    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (['host', 'connection', 'content-length'].includes(key.toLowerCase())) {
        return;
      }
      headers.set(key, value);
    });

    if (hmacSecret) {
      const payload = `${method}:${targetPath}:${timestamp}:${bodyText}`;
      const signature = crypto.createHmac('sha256', hmacSecret)
        .update(payload, 'utf8')
        .digest('hex');

      headers.set('X-Timestamp', timestamp);
      headers.set('X-Signature', signature);
    }

    const backendUrlParsed = new URL(backendUrl);
    const candidateOrigins: string[] = [backendUrlParsed.origin];

    for (const fallbackHost of ['http://127.0.0.1:8000', 'http://localhost:8000']) {
      if (!candidateOrigins.includes(fallbackHost)) {
        candidateOrigins.push(fallbackHost);
      }
    }

    let response: Response | null = null;
    let lastError: any = null;

    for (const origin of candidateOrigins) {
      const targetUrl = `${origin}${urlSuffix}`;
      try {
        const fetchHeaders = new Headers(headers);
        fetchHeaders.delete('host');

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 3000);

        const res = await fetch(targetUrl, {
          method,
          headers: fetchHeaders,
          body: (method !== 'GET' && method !== 'HEAD' && bodyText) ? bodyText : undefined,
          redirect: 'manual',
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
        { error: "Backend service unreachable", detail: lastError?.message || "Failed to connect to backend service" },
        { status: 503 }
      );
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');
    // Let the browser read the MCP session id header for the Inspector.
    const existingExpose = responseHeaders.get('Access-Control-Expose-Headers') || '';
    const exposeSet = new Set(
      existingExpose
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    );
    ['Mcp-Session-Id', 'mcp-session-id', 'MCP-Session-Id'].forEach((h) => exposeSet.add(h));
    responseHeaders.set('Access-Control-Expose-Headers', Array.from(exposeSet).join(', '));

    const contentType = responseHeaders.get('content-type') || '';
    let responseBody = response.body;

    if (contentType.includes('text/event-stream') && response.body) {
      const reader = response.body.getReader();
      const encoder = new TextEncoder();
      const decoder = new TextDecoder();

      responseBody = new ReadableStream({
        async start(controller) {
          try {
            while (true) {
              const { done, value } = await reader.read();
              if (done) break;

              let chunkText = decoder.decode(value, { stream: true });
              // The MCP server may emit absolute or relative URLs in SSE
              // event data. Rewrite them so the browser can route follow-up
              // POSTs back through this proxy (which performs the HMAC
              // signing) instead of hitting the backend directly.
              chunkText = chunkText
                .replaceAll('/mcp/apps/', '/api/proxy/mcp/apps/')
                .replaceAll('/mcp/', '/api/proxy/mcp/');
              controller.enqueue(encoder.encode(chunkText));
            }
          } catch (e) {
            controller.error(e);
          } finally {
            controller.close();
          }
        }
      }) as any;
    }

    return new NextResponse(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("Proxy error:", error);
    try {
      require('fs').appendFileSync('/app/proxy-error.log', error.stack + '\n');
    } catch (e) { }
    return NextResponse.json({ error: error.message || "Unknown proxy error", stack: error.stack }, { status: 500 });
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;