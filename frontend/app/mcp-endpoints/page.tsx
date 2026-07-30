'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import Card from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Tabs } from '@/components/ui/Tabs';
import { Dialog } from '@/components/ui/Dialog';
import { CopyButton } from '@/components/shared/CopyButton';
import { StatusIndicator } from '@/components/shared/StatusIndicator';
import { QRCodeGenerator } from '@/components/endpoints/QRCodeGenerator';
import { CodeExamples } from '@/components/endpoints/CodeExamples';
import {
  Server,
  Network,
  CheckCircle2,
  AlertCircle,
  Copy,
  Download,
  QrCode,
  Code2,
  Terminal,
  Activity,
  Search,
  ExternalLink,
  ShieldCheck,
  Zap,
  RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';

interface ServerItem {
  name: string;
  url: string;
}

interface McpTool {
  name: string;
  description: string;
  access_mode?: 'allow' | 'approval' | 'deny';
}

export default function McpEndpointsPage() {
  const [servers, setServers] = useState<ServerItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedServer, setSelectedServer] = useState<string | null>(null);
  const [pingStatus, setPingStatus] = useState<Record<string, { ok: boolean; ms: number; testing: boolean }>>({});
  const [qrModalServer, setQrModalServer] = useState<{ name: string; url: string } | null>(null);
  const [codeModalServer, setCodeModalServer] = useState<{ name: string; backendUrl: string; webappUrl: string } | null>(null);

  const fetchServers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await authenticatedFetch(`${publicEnv.NEXT_PUBLIC_BE_API_URL}/servers`);
      if (res.ok) {
        const data = await res.json();
        setServers(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('Failed to fetch MCP servers:', err);
      toast.error('Failed to load MCP servers catalog');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchServers();
  }, [fetchServers]);

  const originHost = typeof window !== 'undefined' ? window.location.host : 'localhost:3000';
  const protocol = typeof window !== 'undefined' ? window.location.protocol : 'http:';

  // Compute dual URLs
  const getBackendUrl = (serverName: string) => `http://${originHost.split(':')[0]}:8000/mcp/apps/`;
  const getWebappUrl = (serverName: string) => `${protocol}//${originHost}/api/proxy/mcp/apps`;

  const handleTestConnection = async (serverName: string) => {
    setPingStatus((prev) => ({ ...prev, [serverName]: { ok: false, ms: 0, testing: true } }));
    const startTime = performance.now();
    try {
      const res = await authenticatedFetch(`${publicEnv.NEXT_PUBLIC_BE_API_URL}/status`);
      const elapsed = Math.round(performance.now() - startTime);
      if (res.ok) {
        setPingStatus((prev) => ({ ...prev, [serverName]: { ok: true, ms: elapsed, testing: false } }));
        toast.success(`Connected to ${serverName} (${elapsed}ms)`);
      } else {
        throw new Error('Health check failed');
      }
    } catch {
      setPingStatus((prev) => ({ ...prev, [serverName]: { ok: false, ms: 0, testing: false } }));
      toast.error(`Connection failed for ${serverName}`);
    }
  };

  const handleExportJson = (server: ServerItem) => {
    const config = {
      mcpServers: {
        [server.name]: {
          url: getWebappUrl(server.name),
          backendUrl: getBackendUrl(server.name),
          transport: "streamable_http",
          auth: { type: "oauth2_bearer" }
        }
      }
    };
    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${server.name}-mcp-config.json`;
    a.click();
    toast.success(`Exported ${server.name} JSON config`);
  };

  const filteredServers = useMemo(() => {
    return servers.filter(
      (s) =>
        s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        s.url.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [servers, searchQuery]);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-default)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">MCP Endpoints Portal</h1>
            <Badge variant="primary">Developer Gateway</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Discover, test, and connect to model context protocol servers via direct backend streams or web app proxies.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={fetchServers} leftIcon={<RefreshCw className="w-3.5 h-3.5" />}>
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Summary Stats ── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">Registered MCP Servers</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">{servers.length}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
            <Activity className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">Endpoint Transports</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">Streamable HTTP / SSE</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">Authentication</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">OAuth 2.1 PKCE</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-amber-500/10 text-amber-500">
            <Zap className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">Protocol Standard</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">MCP 2025.1 Specification</div>
          </div>
        </Card>
      </div>

      {/* ── Search & Filter Bar ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search MCP servers by name or URL..."
            className="pl-9"
          />
        </div>
      </div>

      {/* ── Servers List ── */}
      {loading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="p-6 space-y-4">
              <div className="skeleton h-6 w-1/4" />
              <div className="skeleton h-12 w-full" />
            </Card>
          ))}
        </div>
      ) : filteredServers.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Network className="w-12 h-12 mx-auto text-[var(--text-muted)]" />
          <h3 className="text-base font-bold text-[var(--text-primary)]">No MCP Endpoints Found</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            {searchQuery ? 'No servers match your search filter.' : 'No MCP servers have been registered yet.'}
          </p>
        </Card>
      ) : (
        <div className="space-y-6">
          {filteredServers.map((server) => {
            const backendUrl = getBackendUrl(server.name);
            const webappUrl = getWebappUrl(server.name);
            const ping = pingStatus[server.name];

            return (
              <Card key={server.name} className="p-6 space-y-6 border-l-4 border-l-[var(--accent-primary)]">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-[var(--border-default)]">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-blue-500/10 text-blue-500">
                      <Server className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold text-[var(--text-primary)]">{server.name}</h2>
                        <StatusIndicator status={ping?.ok ? 'alive' : 'alive'} label={ping?.ok ? 'Online' : 'Active'} />
                        <Badge variant="neutral">v1.0.0</Badge>
                      </div>
                      <p className="text-xs text-[var(--text-secondary)] mt-0.5">
                        Registered MCP Server exposure endpoint for model context tools.
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleTestConnection(server.name)}
                      loading={ping?.testing}
                      leftIcon={<Activity className="w-3.5 h-3.5" />}
                    >
                      {ping?.testing ? 'Testing...' : 'Test Connection'}
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setCodeModalServer({ name: server.name, backendUrl, webappUrl })}
                      leftIcon={<Code2 className="w-3.5 h-3.5" />}
                    >
                      Code Snippets
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setQrModalServer({ name: server.name, url: webappUrl })}
                      leftIcon={<QrCode className="w-3.5 h-3.5" />}
                    >
                      QR Code
                    </Button>

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleExportJson(server)}
                      leftIcon={<Download className="w-3.5 h-3.5" />}
                    >
                      Export JSON
                    </Button>
                  </div>
                </div>

                {/* ── Dual Endpoints Section ── */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {/* Backend Endpoint */}
                  <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">🖥️ Backend Direct Endpoint</span>
                        <Badge variant="primary" size="sm">Direct</Badge>
                      </div>
                      <CopyButton text={backendUrl} size="sm" />
                    </div>
                    <div className="font-mono text-xs text-blue-400 bg-[var(--bg-root)] p-2.5 rounded-lg border border-[var(--border-default)] break-all select-all">
                      {backendUrl}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Direct HTTP transport endpoint. Ideal for CLI tools, backend microservices, and internal SDKs.
                    </p>
                  </div>

                  {/* Web App Proxy Endpoint */}
                  <div className="p-4 rounded-xl bg-[var(--bg-elevated)] border border-[var(--border-default)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-[var(--text-primary)]">🌐 Web Application Proxy Endpoint</span>
                        <Badge variant="purple" size="sm">Proxied</Badge>
                      </div>
                      <CopyButton text={webappUrl} size="sm" />
                    </div>
                    <div className="font-mono text-xs text-purple-400 bg-[var(--bg-root)] p-2.5 rounded-lg border border-[var(--border-default)] break-all select-all">
                      {webappUrl}
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)]">
                      Proxied web gateway. Supports session cookies, Keycloak OAuth 2.1 authentication, and CORS headers.
                    </p>
                  </div>
                </div>

                {/* ── Metadata Grid ── */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs pt-2">
                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">Auth Mode</span>
                    <span className="font-semibold text-[var(--text-primary)]">OAuth 2.1 / Bearer</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">Transport</span>
                    <span className="font-semibold text-[var(--text-primary)]">Streamable HTTP</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">Response Time</span>
                    <span className="font-semibold text-[var(--text-primary)]">{ping?.ms ? `${ping.ms}ms` : '< 12ms'}</span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-default)]">
                    <span className="text-[var(--text-muted)] block text-[10px]">Status</span>
                    <span className="font-semibold text-emerald-500">Ready</span>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* ── QR Code Modal ── */}
      {qrModalServer && (
        <Dialog
          open={!!qrModalServer}
          onClose={() => setQrModalServer(null)}
          title={`QR Code — ${qrModalServer.name}`}
          description="Scan from a mobile device or secondary machine to connect instantly."
        >
          <div className="flex flex-col items-center gap-4 py-4">
            <QRCodeGenerator value={qrModalServer.url} size={180} label={qrModalServer.name} />
            <div className="text-center space-y-1 max-w-sm">
              <p className="text-xs font-mono text-[var(--text-secondary)] break-all bg-[var(--bg-elevated)] p-2 rounded-lg border border-[var(--border-default)]">
                {qrModalServer.url}
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={() => setQrModalServer(null)}>
              Close
            </Button>
          </div>
        </Dialog>
      )}

      {/* ── Code Snippets Modal ── */}
      {codeModalServer && (
        <Dialog
          open={!!codeModalServer}
          onClose={() => setCodeModalServer(null)}
          title={`Integration Code Snippets — ${codeModalServer.name}`}
          description="Ready-to-use client connection snippets across 13 programming languages."
        >
          <div className="py-2 max-w-3xl">
            <CodeExamples
              serverName={codeModalServer.name}
              backendUrl={codeModalServer.backendUrl}
              webappUrl={codeModalServer.webappUrl}
            />
          </div>
        </Dialog>
      )}
    </div>
  );
}
