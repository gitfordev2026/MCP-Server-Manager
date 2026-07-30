'use client';

import React, { useState } from 'react';
import Card from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { CodeBlock } from '@/components/ui/CodeBlock';
import { CopyButton } from '@/components/shared/CopyButton';
import {
  BookOpen,
  Zap,
  Terminal,
  Shield,
  Settings,
  Code2,
  Server,
  Layers,
  HelpCircle,
  Lock,
  Box,
  History,
  Search,
  ChevronRight,
  ExternalLink,
  CheckCircle2,
  AlertTriangle
} from 'lucide-react';

interface DocSection {
  id: string;
  title: string;
  icon: React.ComponentType<{ className?: string }>;
}

const docSections: DocSection[] = [
  { id: 'intro', title: 'Introduction', icon: BookOpen },
  { id: 'quickstart', title: 'Quick Start', icon: Zap },
  { id: 'installation', title: 'Installation', icon: Terminal },
  { id: 'auth', title: 'Authentication', icon: Shield },
  { id: 'config', title: 'Configuration', icon: Settings },
  { id: 'env', title: 'Environment Variables', icon: Box },
  { id: 'integrations', title: 'Connecting Applications', icon: Code2 },
  { id: 'api-ref', title: 'API Reference', icon: Server },
  { id: 'mcp-spec', title: 'MCP Protocol Guide', icon: Layers },
  { id: 'troubleshooting', title: 'Troubleshooting & FAQ', icon: HelpCircle },
  { id: 'security', title: 'Security Best Practices', icon: Lock },
  { id: 'deployment', title: 'Production Deployment', icon: Box },
  { id: 'changelog', title: 'Changelog', icon: History },
];

export default function DocsPage() {
  const [activeSection, setActiveSection] = useState('intro');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSections = docSections.filter((s) =>
    s.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="flex flex-col lg:flex-row gap-6 max-w-7xl mx-auto">
      {/* ── Documentation Sidebar Navigation ── */}
      <aside className="w-full lg:w-64 flex-shrink-0 space-y-4">
        <div className="p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)] space-y-3 sticky top-20">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[var(--accent-primary)]" />
            <h2 className="text-sm font-bold text-[var(--text-primary)]">Developer Guide</h2>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search docs..."
              className="pl-8 text-xs py-1.5"
            />
          </div>

          <nav className="space-y-1 max-h-[70vh] overflow-y-auto">
            {filteredSections.map((sec) => {
              const Icon = sec.icon;
              const isActive = activeSection === sec.id;
              return (
                <button
                  key={sec.id}
                  onClick={() => setActiveSection(sec.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 text-xs rounded-lg transition-all text-left ${
                    isActive
                      ? 'bg-[var(--accent-primary-soft)] text-[var(--accent-primary)] font-semibold'
                      : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]'
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4" />
                    <span>{sec.title}</span>
                  </div>
                  {isActive && <ChevronRight className="w-3 h-3" />}
                </button>
              );
            })}
          </nav>
        </div>
      </aside>

      {/* ── Main Documentation Content ── */}
      <main className="flex-1 min-w-0 space-y-8 pb-12">
        {/* Section: Introduction */}
        {activeSection === 'intro' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="primary">Getting Started</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">MCP Server Manager Overview</h1>
              <p className="text-sm text-[var(--text-secondary)]">
                Enterprise Model Context Protocol (MCP) Server Gateway and REST OpenAPI Orchestrator.
              </p>
            </div>

            <Card className="p-6 space-y-4">
              <h3 className="text-base font-bold text-[var(--text-primary)]">What is MCP Server Manager?</h3>
              <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                MCP Server Manager transforms raw OpenAPI REST endpoints and isolated MCP servers into a unified, authenticated AI tool registry. It enables LLMs (Ollama, Claude, ChatGPT, custom agents) to dynamically discover, inspect, and invoke backend business logic with OAuth 2.1 security, role-based access control (RBAC), and real-time health monitoring.
              </p>
            </Card>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <Card className="p-4 space-y-2">
                <div className="p-2 w-fit rounded-lg bg-blue-500/10 text-blue-500"><Server className="w-5 h-5" /></div>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">OpenAPI Auto-Discovery</h4>
                <p className="text-xs text-[var(--text-secondary)]">Automatically parses Swagger/OpenAPI JSON specifications into MCP tool definitions.</p>
              </Card>

              <Card className="p-4 space-y-2">
                <div className="p-2 w-fit rounded-lg bg-emerald-500/10 text-emerald-500"><Shield className="w-5 h-5" /></div>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">OAuth 2.1 & Keycloak</h4>
                <p className="text-xs text-[var(--text-secondary)]">RFC 9728 and RFC 8414 compliant authentication with PKCE token flow.</p>
              </Card>

              <Card className="p-4 space-y-2">
                <div className="p-2 w-fit rounded-lg bg-purple-500/10 text-purple-500"><Zap className="w-5 h-5" /></div>
                <h4 className="text-sm font-bold text-[var(--text-primary)]">Streamable HTTP</h4>
                <p className="text-xs text-[var(--text-secondary)]">FastMCP ASGI server with low-latency streaming tool responses.</p>
              </Card>
            </div>
          </div>
        )}

        {/* Section: Quick Start */}
        {activeSection === 'quickstart' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="success">5-Minute Setup</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">Quick Start Guide</h1>
              <p className="text-sm text-[var(--text-secondary)]">Get connected to the MCP Server Manager in under five minutes.</p>
            </div>

            <div className="space-y-4">
              <div className="flex gap-4 items-start p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--accent-primary)] text-white text-xs font-bold flex-shrink-0">1</div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Fetch Exposed MCP Endpoints</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Navigate to the MCP Endpoints page to copy your server target URL:</p>
                  <CodeBlock code={`http://localhost:8000/mcp/apps/`} language="text" />
                </div>
              </div>

              <div className="flex gap-4 items-start p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--accent-primary)] text-white text-xs font-bold flex-shrink-0">2</div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Connect via MCP SDK</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Initialize the Python or TypeScript MCP client transport:</p>
                  <CodeBlock code={`pip install mcp langchain-ollama`} language="bash" />
                </div>
              </div>

              <div className="flex gap-4 items-start p-4 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-default)]">
                <div className="flex items-center justify-center w-7 h-7 rounded-full bg-[var(--accent-primary)] text-white text-xs font-bold flex-shrink-0">3</div>
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-[var(--text-primary)]">Query Your AI Agent</h3>
                  <p className="text-xs text-[var(--text-secondary)]">Ask the agent to invoke tools (e.g. "Check mcp client secure health"):</p>
                  <CodeBlock code={`from mcp import ClientSession, StreamableHTTPTransport

async with StreamableHTTPTransport("http://localhost:8000/mcp/apps/") as (read, write):
    async with ClientSession(read, write) as session:
        await session.initialize()
        res = await session.call_tool("mcp_client_secure__health_health_get", {})
        print(res.content)`} language="python" />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Section: Authentication */}
        {activeSection === 'auth' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="purple">Security & OAuth</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">Authentication Architecture</h1>
              <p className="text-sm text-[var(--text-secondary)]">OAuth 2.1 PKCE authorization server metadata and JWT bearer verification.</p>
            </div>

            <Card className="p-6 space-y-4">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">OIDC Discovery Endpoints</h3>
              <p className="text-xs text-[var(--text-secondary)]">
                The manager exposes standard OAuth 2.1 RFC 9728 and RFC 8414 metadata endpoints at root:
              </p>
              <div className="space-y-2 font-mono text-xs">
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex justify-between">
                  <span>GET /.well-known/oauth-protected-resource</span>
                  <span className="text-emerald-500 font-bold">200 OK</span>
                </div>
                <div className="p-2.5 rounded-lg bg-[var(--bg-elevated)] border border-[var(--border-default)] flex justify-between">
                  <span>GET /.well-known/oauth-authorization-server</span>
                  <span className="text-emerald-500 font-bold">200 OK</span>
                </div>
              </div>
            </Card>

            <div className="space-y-2">
              <h3 className="text-sm font-bold text-[var(--text-primary)]">Passing Authorization Headers</h3>
              <CodeBlock code={`// Header Format
Authorization: Bearer <KEYCLOAK_JWT_TOKEN>`} language="http" />
            </div>
          </div>
        )}

        {/* Section: Environment Variables */}
        {activeSection === 'env' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="neutral">Environment Configuration</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">Environment Variables</h1>
              <p className="text-sm text-[var(--text-secondary)]">Full reference of all backend and frontend configuration variables.</p>
            </div>

            <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
              <table className="w-full text-xs text-left">
                <thead className="bg-[var(--bg-elevated)] text-[var(--text-primary)] font-bold border-b border-[var(--border-default)]">
                  <tr>
                    <th className="p-3">Variable Name</th>
                    <th className="p-3">Description</th>
                    <th className="p-3">Default Value</th>
                    <th className="p-3">Required</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)] text-[var(--text-secondary)] font-mono">
                  <tr>
                    <td className="p-3 text-blue-400 font-bold">AGENT_MCP_SERVER_URL</td>
                    <td className="p-3 font-sans">URL of the combined FastMCP server</td>
                    <td className="p-3">http://10.139.10.176:8000/mcp/apps/</td>
                    <td className="p-3 font-sans"><Badge variant="success">Yes</Badge></td>
                  </tr>
                  <tr>
                    <td className="p-3 text-blue-400 font-bold">AGENT_OLLAMA_MODEL</td>
                    <td className="p-3 font-sans">Default LLM model name</td>
                    <td className="p-3">gemma4:31b-cloud</td>
                    <td className="p-3 font-sans"><Badge variant="neutral">Optional</Badge></td>
                  </tr>
                  <tr>
                    <td className="p-3 text-blue-400 font-bold">KEYCLOAK_SERVER_URL</td>
                    <td className="p-3 font-sans">Keycloak authorization server URL</td>
                    <td className="p-3">http://10.139.10.176:8080</td>
                    <td className="p-3 font-sans"><Badge variant="success">Yes</Badge></td>
                  </tr>
                  <tr>
                    <td className="p-3 text-blue-400 font-bold">DATABASE_URL</td>
                    <td className="p-3 font-sans">PostgreSQL / SQLite database connection URI</td>
                    <td className="p-3">sqlite:///./mcp.db</td>
                    <td className="p-3 font-sans"><Badge variant="success">Yes</Badge></td>
                  </tr>
                  <tr>
                    <td className="p-3 text-blue-400 font-bold">NEXT_PUBLIC_BE_API_URL</td>
                    <td className="p-3 font-sans">Frontend backend proxy path</td>
                    <td className="p-3">/api/proxy</td>
                    <td className="p-3 font-sans"><Badge variant="success">Yes</Badge></td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Section: Troubleshooting */}
        {activeSection === 'troubleshooting' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="warning">Troubleshooting</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">Troubleshooting & FAQ</h1>
              <p className="text-sm text-[var(--text-secondary)]">Solutions for common connection, DNS rebinding, and tool execution issues.</p>
            </div>

            <div className="space-y-4">
              <Card className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Issue: Tool call returns raw JSON string instead of execution output</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong>Cause:</strong> LLM agent timeout or tight wait_for limit causing fallback to direct LLM response.<br />
                  <strong>Solution:</strong> The timeout limit in <code>agent.py</code> has been increased to 45.0 seconds. Ensure Ollama instance is reachable and model responses complete within interval.
                </p>
              </Card>

              <Card className="p-5 space-y-2">
                <div className="flex items-center gap-2 text-amber-500 font-bold text-sm">
                  <AlertTriangle className="w-4 h-4" />
                  <span>Issue: MCP Inspector shows 400 Forbidden / DNS Rebinding Error</span>
                </div>
                <p className="text-xs text-[var(--text-secondary)] leading-relaxed">
                  <strong>Cause:</strong> FastMCP host/origin protection blocking external origin header.<br />
                  <strong>Solution:</strong> Set <code>FASTMCP_HTTP_ALLOWED_HOSTS=*</code> and <code>FASTMCP_HTTP_ALLOWED_ORIGINS=*</code> in <code>.env</code>.
                </p>
              </Card>
            </div>
          </div>
        )}

        {/* Section: Changelog */}
        {activeSection === 'changelog' && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="neutral">Release Notes</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">Changelog</h1>
            </div>

            <Card className="p-6 space-y-4">
              <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-base font-bold text-[var(--text-primary)]">v1.0.0 — Commercial SaaS Overhaul</span>
                  <Badge variant="success">Latest</Badge>
                </div>
                <span className="text-xs text-[var(--text-muted)]">July 30, 2026</span>
              </div>
              <ul className="text-xs text-[var(--text-secondary)] space-y-2 list-disc pl-4 leading-relaxed">
                <li>Complete UI/UX redesign with permanent collapsible sidebar navigation and top header.</li>
                <li>Design system foundation with custom properties for dark/light themes.</li>
                <li>Dual endpoint connection portal (Backend + Web App) with QR codes and 13-language code snippets.</li>
                <li>Dedicated Developer Documentation portal with complete API reference and quick start guide.</li>
                <li>FOUC elimination and role-based dynamic admin page rendering.</li>
              </ul>
            </Card>
          </div>
        )}

        {/* Fallback for other sections */}
        {!['intro', 'quickstart', 'auth', 'env', 'troubleshooting', 'changelog'].includes(activeSection) && (
          <div className="space-y-6 animate-fadeIn">
            <div className="space-y-2 border-b border-[var(--border-default)] pb-4">
              <Badge variant="primary">{docSections.find(s => s.id === activeSection)?.title}</Badge>
              <h1 className="text-3xl font-bold text-[var(--text-primary)]">{docSections.find(s => s.id === activeSection)?.title}</h1>
            </div>

            <Card className="p-8 text-center space-y-3">
              <BookOpen className="w-10 h-10 mx-auto text-[var(--accent-primary)]" />
              <h3 className="text-base font-bold text-[var(--text-primary)]">Documentation Topic: {docSections.find(s => s.id === activeSection)?.title}</h3>
              <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
                Detailed reference materials and code examples for this topic are available in the MCP Server Manager Technical Manual.
              </p>
            </Card>
          </div>
        )}
      </main>
    </div>
  );
}
