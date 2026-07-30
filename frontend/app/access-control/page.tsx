'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import ApplicationCard from '@/components/access-control/ApplicationCard';
import AccessControlModal from '@/components/access-control/AccessControlModal';
import Button from '@/components/ui/Button';
import Card from '@/components/ui/Card';
import { Badge } from '@/components/ui/Badge';
import { Input } from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import { usePolicies } from '@/hooks/useAccessPolicies';
import { OwnerPolicy, OwnerType } from '@/types/accessPolicies';
import { publicEnv } from '@/lib/env';
import { authenticatedFetch } from '@/services/http';
import { Shield, ShieldAlert, RefreshCw, Search, Lock, Server, AppWindow } from 'lucide-react';
import { toast } from 'sonner';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL;
const ACCESS_CONTROL_ENABLED = true;

export default function AccessPolicyPage() {
  const { data, isLoading, isError, refetch } = usePolicies();
  const policies = useMemo(() => data?.policies ?? {}, [data]);

  const [detailsModalOwnerId, setDetailsModalOwnerId] = useState<string | null>(null);
  const [ownerEndpointIds, setOwnerEndpointIds] = useState<Record<string, string[]>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');

  const loadOwnerEndpointIds = useCallback(async (): Promise<void> => {
    if (!NEXT_PUBLIC_BE_API_URL) {
      setDiscoveryError('Backend API URL is not configured (NEXT_PUBLIC_BE_API_URL)');
      return;
    }

    const nextMap: Record<string, string[]> = {};
    const add = (ownerId: string, endpointId: string) => {
      if (!ownerId || !endpointId) return;
      if (!nextMap[ownerId]) nextMap[ownerId] = [];
      if (!nextMap[ownerId].includes(endpointId)) nextMap[ownerId].push(endpointId);
    };

    let hadFailure = false;

    try {
      const catalogRes = await authenticatedFetch(
        `${NEXT_PUBLIC_BE_API_URL}/mcp/openapi/catalog?force_refresh=false&registry_only=true`
      );
      if (catalogRes.ok) {
        const catalog = await catalogRes.json();
        const tools = Array.isArray(catalog?.tools) ? catalog.tools : [];
        for (const tool of tools) {
          if (tool?.source !== 'openapi') continue;
          const appName = typeof tool?.app === 'string' ? tool.app : '';
          const toolName = typeof tool?.name === 'string' ? tool.name : '';
          if (appName && toolName) add(`app:${appName}`, toolName);
        }
      } else {
        hadFailure = true;
      }
    } catch {
      hadFailure = true;
    }

    try {
      const serversRes = await authenticatedFetch(`${NEXT_PUBLIC_BE_API_URL}/servers`);
      if (serversRes.ok) {
        const serversPayload = await serversRes.json();
        const servers = Array.isArray(serversPayload?.servers) ? serversPayload.servers : [];
        await Promise.all(
          servers.map(async (server: { name?: string }) => {
            const serverName = typeof server?.name === 'string' ? server.name : '';
            if (!serverName) return;
            try {
              const toolsRes = await authenticatedFetch(
                `${NEXT_PUBLIC_BE_API_URL}/servers/${encodeURIComponent(serverName)}/tools?registry_only=true`
              );
              if (!toolsRes.ok) {
                hadFailure = true;
                return;
              }
              const toolsPayload = await toolsRes.json();
              const tools = Array.isArray(toolsPayload?.tools) ? toolsPayload.tools : [];
              for (const tool of tools) {
                const toolName = typeof tool?.name === 'string' ? tool.name : '';
                if (toolName) add(`mcp:${serverName}`, toolName);
              }
            } catch {
              hadFailure = true;
            }
          })
        );
      } else {
        hadFailure = true;
      }
    } catch {
      hadFailure = true;
    }

    Object.keys(nextMap).forEach((ownerId) => nextMap[ownerId].sort());
    setOwnerEndpointIds(nextMap);
    setDiscoveryError(hadFailure ? 'Some tools/endpoints could not be discovered. Showing partial results.' : null);
  }, []);

  useEffect(() => {
    void loadOwnerEndpointIds();
  }, [data, loadOwnerEndpointIds]);

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await Promise.all([refetch(), loadOwnerEndpointIds()]);
      toast.success('Access policies refreshed');
    } catch {
      toast.error('Failed to refresh policies');
    } finally {
      setIsRefreshing(false);
    }
  }, [loadOwnerEndpointIds, refetch]);

  const owners = useMemo(() => {
    return Object.keys(policies)
      .filter((ownerId) => ownerId.toLowerCase().includes(searchQuery.toLowerCase()))
      .map((ownerId) => ({
        id: ownerId,
        type: (ownerId.startsWith('mcp:') ? 'mcp' : 'app') as OwnerType,
        name: ownerId,
        url: ownerId,
        endpointCount: (ownerEndpointIds[ownerId]?.length ?? 0) || Object.keys(policies[ownerId]?.endpointPolicies || {}).length,
      }));
  }, [policies, ownerEndpointIds, searchQuery]);

  const selectedPolicy: OwnerPolicy | null = detailsModalOwnerId
    ? policies[detailsModalOwnerId]
    : null;
  const selectedEndpointIds: string[] = detailsModalOwnerId
    ? (ownerEndpointIds[detailsModalOwnerId] ?? [])
    : [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ── Page Header ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[var(--border-default)]">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Access Control Policies</h1>
            <Badge variant="purple">RBAC Enforcer</Badge>
          </div>
          <p className="text-xs text-[var(--text-secondary)] mt-1">
            Manage global default policies and fine-grained tool authorization overrides across all registered MCP servers and APIs.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => void handleRefresh()}
            loading={isRefreshing}
            size="sm"
            variant="outline"
            leftIcon={<RefreshCw className="w-3.5 h-3.5" />}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* ── Metric Summary ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-purple-500/10 text-purple-500">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">Protected Entities</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">{Object.keys(policies).length}</div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-blue-500/10 text-blue-500">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">MCP Server Overrides</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {Object.keys(policies).filter(k => k.startsWith('mcp:')).length}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3">
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-500">
            <AppWindow className="w-5 h-5" />
          </div>
          <div>
            <div className="text-xs font-medium text-[var(--text-secondary)]">App Policy Overrides</div>
            <div className="text-xl font-bold text-[var(--text-primary)]">
              {Object.keys(policies).filter(k => k.startsWith('app:')).length}
            </div>
          </div>
        </Card>
      </div>

      {/* ── Search Bar ── */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--text-muted)]" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Filter policies by owner ID or server name..."
            className="pl-9"
          />
        </div>
      </div>

      {/* ── Alerts ── */}
      {(isError || discoveryError) && (
        <Card className="p-4 border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-300 space-y-1">
          <div className="flex items-center gap-2 font-bold text-xs">
            <ShieldAlert className="w-4 h-4" />
            <span>Policy Synchronization Notice</span>
          </div>
          {isError && <p className="text-xs">Failed to load current access policies from backend.</p>}
          {discoveryError && <p className="text-xs">{discoveryError}</p>}
        </Card>
      )}

      {/* ── Content Grid ── */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i} className="p-6 space-y-3">
              <Skeleton width="60%" height="20px" />
              <Skeleton width="40%" height="16px" />
              <Skeleton width="100%" height="40px" />
            </Card>
          ))}
        </div>
      ) : owners.length === 0 ? (
        <Card className="p-12 text-center space-y-3">
          <Lock className="w-12 h-12 mx-auto text-[var(--text-muted)]" />
          <h3 className="text-base font-bold text-[var(--text-primary)]">No Access Policies Configured</h3>
          <p className="text-xs text-[var(--text-secondary)] max-w-md mx-auto">
            {searchQuery ? 'No policies match your search filter.' : 'Register an MCP server or API application to configure RBAC access rules.'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {owners.map((owner) => (
            <ApplicationCard
              key={owner.id}
              owner={owner}
              onClick={() => setDetailsModalOwnerId(owner.id)}
            />
          ))}
        </div>
      )}

      {/* ── Edit Modal ── */}
      {selectedPolicy && detailsModalOwnerId && (
        <AccessControlModal
          isOpen={!!detailsModalOwnerId}
          onClose={() => setDetailsModalOwnerId(null)}
          ownerId={detailsModalOwnerId}
          policy={selectedPolicy}
          availableEndpointIds={selectedEndpointIds}
        />
      )}
    </div>
  );
}
