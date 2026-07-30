interface ServerHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  tool_count: number;
  error: string | null;
}

interface AppHealth {
  name: string;
  url: string;
  status: 'alive' | 'down';
  latency_ms: number;
  endpoint_count: number;
  error: string | null;
}

interface HealthGridProps {
  servers: any[];
  apps: any[];
  serverHealth: Record<string, ServerHealth>;
  appHealth: Record<string, AppHealth>;
  loading: boolean;
}

export function HealthGrid({ servers, apps, serverHealth, appHealth, loading }: HealthGridProps) {
  if (loading) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fadeIn">
        <div className="card p-6 min-h-[300px]">
          <h2 className="text-[var(--text-primary)] text-lg font-bold mb-4">MCP Server Health</h2>
          <div className="skeleton w-full h-12 mb-2 rounded-md"></div>
          <div className="skeleton w-full h-12 mb-2 rounded-md"></div>
          <div className="skeleton w-full h-12 rounded-md"></div>
        </div>
        <div className="card p-6 min-h-[300px]">
          <h2 className="text-[var(--text-primary)] text-lg font-bold mb-4">Application Health</h2>
          <div className="skeleton w-full h-12 mb-2 rounded-md"></div>
          <div className="skeleton w-full h-12 mb-2 rounded-md"></div>
          <div className="skeleton w-full h-12 rounded-md"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-8 animate-fadeIn">
      {/* Server Health */}
      <div className="card p-6">
        <h2 className="text-[var(--text-primary)] text-lg font-bold mb-4">MCP Server Health</h2>
        {servers.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">No servers registered.</p>
        ) : (
          <div className="space-y-3">
            {servers.map((server) => {
              const health = serverHealth[server.name];
              const isAlive = health?.status === 'alive';
              return (
                <div key={server.name} className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-inset)] hover:border-[var(--border-strong)] transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isAlive ? 'status-dot-alive' : 'status-dot-down'}`}></span>
                    <div className="truncate">
                      <p className="text-[var(--text-primary)] text-sm font-semibold truncate">{server.name}</p>
                      <p className="text-[var(--text-tertiary)] text-xs truncate">{server.url}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-[var(--text-secondary)] text-sm">{health?.latency_ms ? `${health.latency_ms}ms` : '--'}</p>
                    <p className="text-[var(--text-tertiary)] text-xs">{health?.tool_count ?? 0} tools</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Application Health */}
      <div className="card p-6">
        <h2 className="text-[var(--text-primary)] text-lg font-bold mb-4">Application Health</h2>
        {apps.length === 0 ? (
          <p className="text-[var(--text-secondary)] text-sm">No applications registered.</p>
        ) : (
          <div className="space-y-3">
            {apps.map((app) => {
              const health = appHealth[app.name];
              const isAlive = health?.status === 'alive';
              return (
                <div key={app.name} className="flex items-center justify-between p-3 rounded-lg border border-[var(--border-default)] bg-[var(--bg-inset)] hover:border-[var(--border-strong)] transition-colors">
                  <div className="flex items-center gap-3 overflow-hidden">
                    <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${isAlive ? 'status-dot-alive' : 'status-dot-down'}`}></span>
                    <div className="truncate">
                      <p className="text-[var(--text-primary)] text-sm font-semibold truncate">{app.name}</p>
                      <p className="text-[var(--text-tertiary)] text-xs truncate">{app.url}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0 ml-4">
                    <p className="text-[var(--text-secondary)] text-sm">{health?.latency_ms ? `${health.latency_ms}ms` : '--'}</p>
                    <p className="text-[var(--text-tertiary)] text-xs">{health?.endpoint_count ?? 0} endpoints</p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
