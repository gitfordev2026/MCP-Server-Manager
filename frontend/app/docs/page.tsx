'use client';

import { useEffect, useState } from 'react';
import Navigation from '@/components/Navigation';
import { toast } from '@/lib/toast';
import AnimatedSystemFlowchart from '@/components/AnimatedSystemFlowchart';

interface DocSection {
  id: string;
  title: string;
}

export default function DocumentationPage() {
  const [activeSection, setActiveSection] = useState('intro');
  const [copiedSnippet, setCopiedSnippet] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const sections: DocSection[] = [
    { id: 'intro', title: '1. Introduction & Architecture' },
    { id: 'quickstart', title: '2. 5-Minute Quick Start' },
    { id: 'installation', title: '3. Comprehensive Installation' },
    { id: 'auth-security', title: '4. Auth & Security (Keycloak)' },
    { id: 'env-vars', title: '5. Environment Variables' },
    { id: 'app-guides', title: '6. Application Integration' },
    { id: 'mcp-protocol', title: '7. MCP Protocol & API Reference' },
    { id: 'troubleshooting', title: '8. Troubleshooting & FAQs' },
  ];

  useEffect(() => {
    const handleScroll = () => {
      const scrollPos = window.scrollY + 200;
      for (const section of sections) {
        const el = document.getElementById(section.id);
        if (el) {
          const top = el.offsetTop;
          const height = el.offsetHeight;
          if (scrollPos >= top && scrollPos < top + height) {
            setActiveSection(section.id);
            break;
          }
        }
      }
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const handleCopy = (text: string, id: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedSnippet(id);
    toast.success('Copied to clipboard');
    setTimeout(() => setCopiedSnippet((cur) => (cur === id ? null : cur)), 1500);
  };

  const scrollTo = (id: string) => {
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth' });
      setActiveSection(id);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 transition-colors">
      <Navigation pageTitle="Developer Documentation" />

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-slide-up">
        {/* Docs Hero Header */}
        <div className="bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm backdrop-blur-xl mb-8 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20 mb-2">
                Developer Docs & Spec Reference
              </span>
              <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white tracking-tight">
                MCP Server Manager Platform
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 max-w-3xl">
                Complete integration guide for FastMCP servers, Keycloak OIDC authentication, HMAC proxy signing, and AI client connections.
              </p>
            </div>

            <div className="relative w-full md:w-72">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search documentation..."
                className="w-full px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/80 text-xs text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500/40"
              />
            </div>
          </div>
        </div>

        {/* Documentation Content Layout with Sticky TOC */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
          {/* Sticky Table of Contents (Left) */}
          <div className="hidden lg:block lg:col-span-1">
            <div className="sticky top-24 space-y-2 bg-white/80 dark:bg-slate-900/80 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-4 shadow-sm backdrop-blur-xl">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 px-3 pb-2 border-b border-slate-100 dark:border-slate-800">
                On This Page
              </h3>
              <nav className="space-y-1 text-xs">
                {sections.map((sec) => (
                  <button
                    key={sec.id}
                    onClick={() => scrollTo(sec.id)}
                    className={`w-full text-left px-3 py-2 rounded-xl transition-all font-medium cursor-pointer ${
                      activeSection === sec.id
                        ? 'bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400 font-bold border-l-2 border-indigo-600'
                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                    }`}
                  >
                    {sec.title}
                  </button>
                ))}
              </nav>
            </div>
          </div>

          {/* Main Docs Content Body (Right 3 Cols) */}
          <div className="lg:col-span-3 space-y-12">
            {/* Section 1: Intro */}
            <section id="intro" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                1. Introduction & Architecture
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                The <strong>MCP Server Manager</strong> is an enterprise control plane that centralizes microservice OpenAPI registrations and native Model Context Protocol (MCP) servers into a unified, security-hardened gateway (<code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono">/mcp/apps/</code>).
              </p>

              <div className="p-4 rounded-xl bg-slate-950 text-slate-200 font-mono text-xs overflow-x-auto space-y-1 border border-slate-800">
                <p className="text-emerald-400">// High-Level Architecture Sequence</p>
                <p>Browser / AI Assistant ──► Next.js API Proxy (:3000) ──► Keycloak OIDC ──► HMAC Gateway (:8000) ──► FastMCP 3.4.4 (/mcp/apps/)</p>
              </div>

              {/* Dual Endpoint Options Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs pt-2">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-indigo-500/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">🌐</span>
                    <h4 className="font-bold text-slate-900 dark:text-white">1. Combined MCP Gateway Endpoint</h4>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    Aggregates <strong>all tools</strong> across all registered microservice apps into a single endpoint. Ideal for general-purpose AI assistants (Claude Desktop, Cursor).
                  </p>
                  <div className="p-2 rounded bg-slate-950 text-indigo-400 font-mono text-[11px] overflow-x-auto">
                    http://10.139.10.176:3000/api/proxy/mcp/apps/
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/60 border border-emerald-500/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <span className="text-base">📦</span>
                    <h4 className="font-bold text-slate-900 dark:text-white">2. App-Specific Isolated Endpoints</h4>
                  </div>
                  <p className="text-slate-600 dark:text-slate-300">
                    Exposes <strong>only tools</strong> registered under a specific application (e.g. <code>inventory-service</code>). Ideal for restricted role access & scoped tool execution.
                  </p>
                  <div className="p-2 rounded bg-slate-950 text-emerald-400 font-mono text-[11px] overflow-x-auto">
                    http://10.139.10.176:3000/api/proxy/mcp/app/{'{app_name}'}/
                  </div>
                </div>
              </div>

              {/* Interactive Animated Flowchart Graphic */}
              <AnimatedSystemFlowchart />
            </section>

            {/* Section 2: Quick Start */}
            <section id="quickstart" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                2. 5-Minute Quick Start
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Connect external AI assistants such as Claude Desktop or Cursor to the server manager endpoint in 3 simple steps:
              </p>

              <div className="space-y-3 text-xs text-slate-700 dark:text-slate-300">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-2">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Step 1: Obtain a Keycloak JWT Token</span>
                  <div className="relative bg-slate-950 p-3 rounded-lg font-mono text-slate-200 text-[11px] overflow-x-auto">
                    <code>curl -X POST "http://10.139.10.176:8080/realms/IAF/protocol/openid-connect/token" \
  -d "grant_type=password" -d "client_id=mcp-client-secure" \
  -d "username=admin" -d "password=adminpassword"</code>
                  </div>
                </div>

                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-2">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">Step 2: Add to Claude Desktop Config</span>
                  <div className="relative bg-slate-950 p-3 rounded-lg font-mono text-slate-200 text-[11px] overflow-x-auto">
                    <code>{`{
  "mcpServers": {
    "mcp-manager": {
      "url": "http://10.139.10.176:3000/api/proxy/mcp/apps/?token=YOUR_JWT_TOKEN"
    }
  }
}`}</code>
                  </div>
                </div>
              </div>
            </section>

            {/* Section 3: Installation */}
            <section id="installation" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                3. Comprehensive Installation & Deployment
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Deploy the complete stack via Docker Compose with zero manual schema setup:
              </p>
              <div className="relative bg-slate-950 p-4 rounded-xl font-mono text-slate-200 text-xs overflow-x-auto">
                <code>docker compose up -d --build</code>
              </div>
            </section>

            {/* Section 4: Auth & Security */}
            <section id="auth-security" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                4. Auth & Security Architecture
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                The gateway enforces <strong>Role-Based Access Control (RBAC)</strong> and authenticates incoming tool invocations through Keycloak OIDC Bearer tokens, HttpOnly session cookies, and internal HMAC proxy signatures.
              </p>
            </section>

            {/* Section 5: Environment Variables Reference Table */}
            <section id="env-vars" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                5. Environment Variables Reference
              </h2>

              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold border-b border-slate-200 dark:border-slate-700">
                    <tr>
                      <th className="p-3">Variable Name</th>
                      <th className="p-3">Default Value</th>
                      <th className="p-3">Description</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                    <tr>
                      <td className="p-3 text-indigo-600 dark:text-indigo-400 font-bold">KEYCLOAK_SERVER_URL</td>
                      <td className="p-3">http://10.139.10.176:8080</td>
                      <td className="p-3 font-sans">Keycloak Identity Provider server URL</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-600 dark:text-indigo-400 font-bold">KEYCLOAK_REALM</td>
                      <td className="p-3">IAF</td>
                      <td className="p-3 font-sans">Target Keycloak OIDC Realm name</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-600 dark:text-indigo-400 font-bold">HMAC_SECRET_KEY</td>
                      <td className="p-3">mcp-secret-hmac-key...</td>
                      <td className="p-3 font-sans">Shared secret for Next.js to FastAPI payload verification</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-600 dark:text-indigo-400 font-bold">AGENT_MCP_SERVER_URL</td>
                      <td className="p-3">http://10.139.10.176:8000/mcp/apps/</td>
                      <td className="p-3 font-sans">FastMCP combined ASGI application URL</td>
                    </tr>
                    <tr>
                      <td className="p-3 text-indigo-600 dark:text-indigo-400 font-bold">AUTH_ENABLED</td>
                      <td className="p-3">true</td>
                      <td className="p-3 font-sans">Toggle token authentication enforcement</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            {/* Section 6: App Integration */}
            <section id="app-guides" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                6. Application Integration Guides
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Detailed step-by-step guides for connecting Python SDK, Node.js SDK, Next.js App Router, and FastAPI services. Visit the <a href="/mcp-endpoints" className="text-indigo-600 dark:text-indigo-400 underline font-semibold">MCP Endpoints Portal</a> to copy live multi-language code snippets.
              </p>
            </section>

            {/* Section 7: Protocol Reference */}
            <section id="mcp-protocol" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                7. MCP Protocol & API Reference
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">
                Standard JSON-RPC 2.0 specification endpoints exposed under <code className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-mono">/mcp/apps/</code>:
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">initialize</span>
                  <p className="text-[11px] text-slate-500">Protocol handshake & session creation</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">tools/list</span>
                  <p className="text-[11px] text-slate-500">Discover all authorized tool schemas</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">tools/call</span>
                  <p className="text-[11px] text-slate-500">Invoke an OpenAPI or native tool operation</p>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200/60 dark:border-slate-800 space-y-1">
                  <span className="font-bold text-indigo-600 dark:text-indigo-400">resources/list</span>
                  <p className="text-[11px] text-slate-500">Discover static & dynamic resources</p>
                </div>
              </div>
            </section>

            {/* Section 8: Troubleshooting & FAQs */}
            <section id="troubleshooting" className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl p-6 sm:p-8 shadow-sm space-y-4 scroll-mt-24">
              <h2 className="text-xl font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">
                8. Troubleshooting & FAQs
              </h2>

              <div className="space-y-4 text-xs text-slate-600 dark:text-slate-300">
                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 dark:text-white">Q: Why do I get a "400 Bad Request: Missing session ID" error?</h4>
                  <p>
                    A: FastMCP Streamable HTTP expects a full MCP transport handshake. When connecting via raw HTTP, perform the <code className="font-mono">initialize</code> method request first to obtain the <code className="font-mono">Mcp-Session-Id</code> header, then pass <code className="font-mono">Mcp-Session-Id</code> in subsequent requests.
                  </p>
                </div>

                <div className="space-y-1">
                  <h4 className="font-bold text-slate-900 dark:text-white">Q: How do I handle token expiration when connecting VS Code?</h4>
                  <p>
                    A: You can increase Keycloak's <strong>Access Token Lifespan</strong> in Keycloak Admin Console (Realm Settings → Tokens) or configure VS Code with OAuth PKCE auto-renewal.
                  </p>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
