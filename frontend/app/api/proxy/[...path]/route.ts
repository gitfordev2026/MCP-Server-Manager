import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

async function handleProxy(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
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
      return NextResponse.json({ error: "Backend URL not configured" }, { status: 500 });
    }
    
    let bodyText = "";
    if (method !== 'GET' && method !== 'HEAD' && req.body) {
      bodyText = await req.text();
    }

    const timestamp = (Date.now() / 1000).toString();
    
    const headers = new Headers();
    req.headers.forEach((value, key) => {
      if (!['host', 'connection'].includes(key.toLowerCase())) {
        headers.set(key, value);
      }
    });

    if (hmacSecret) {
      const payload = `${method}:${path}:${timestamp}:${bodyText}`;
      const signature = crypto.createHmac('sha256', hmacSecret)
        .update(payload, 'utf8')
        .digest('hex');
        
      headers.set('X-Timestamp', timestamp);
      headers.set('X-Signature', signature);
    }
    
    const backendUrlParsed = new URL(backendUrl);
    const candidateOrigins: string[] = [backendUrlParsed.origin];
    
    // Add common fallback hosts for host network, bridge docker, and host.docker.internal
    for (const fallbackHost of ['http://127.0.0.1:8000', 'http://localhost:8000', 'http://backend:8000', 'http://mcp-backend:8000', 'http://host.docker.internal:8000']) {
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
        console.log(`[Proxy] Successfully fetched: ${targetUrl}`);
        break;
      } catch (err: any) {
        lastError = err;
        console.warn(`[Proxy] Connection to ${targetUrl} failed (${err.message}). Trying next candidate origin...`);
      }
    }

    if (!response) {
      throw lastError || new Error("Failed to connect to backend service");
    }

    const responseHeaders = new Headers(response.headers);
    responseHeaders.delete('content-encoding');

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error: any) {
    console.error("Proxy error:", error);
    try {
      require('fs').appendFileSync('/app/proxy-error.log', error.stack + '\n');
    } catch (e) {}
    return NextResponse.json({ error: error.message || "Unknown proxy error", stack: error.stack }, { status: 500 });
  }
}

export const GET = handleProxy;
export const POST = handleProxy;
export const PUT = handleProxy;
export const PATCH = handleProxy;
export const DELETE = handleProxy;
export const OPTIONS = handleProxy;
