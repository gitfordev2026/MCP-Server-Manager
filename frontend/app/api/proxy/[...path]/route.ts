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
    
    let resolvedBackendIp = "mcp-backend";
    try {
      const dns = require('dns/promises');
      const lookup = await dns.lookup('mcp-backend', { family: 4 });
      resolvedBackendIp = lookup.address;
      console.log(`[Proxy] Resolved mcp-backend to ${resolvedBackendIp}`);
    } catch (e: any) {
      console.error(`[Proxy] DNS lookup failed: ${e.message}`);
    }

    const backendUrlParsed = new URL(backendUrl);
    const targetUrl = `http://${resolvedBackendIp}:${backendUrlParsed.port || 8000}${urlSuffix}`;
    console.log(`[Proxy] Fetching: ${targetUrl}`);
    
    // Ensure Host header is set correctly so the backend doesn't reject it
    headers.set('Host', backendUrlParsed.host);
    
    const response = await fetch(targetUrl, {
      method,
      headers,
      body: (method !== 'GET' && method !== 'HEAD' && bodyText) ? bodyText : undefined,
      redirect: 'manual'
    });

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
