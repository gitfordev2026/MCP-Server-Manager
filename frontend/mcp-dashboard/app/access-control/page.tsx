'use client';

import { useState, useMemo, useEffect, useCallback } from 'react';
import Navigation from '@/components/Navigation';
import ApplicationCard from '@/components/access-control/ApplicationCard';
import AccessControlModal from '@/components/access-control/AccessControlModal';
import Button from '@/components/ui/Button';
import { usePolicies } from '@/hooks/useAccessPolicies';
import { OwnerPolicy, OwnerType } from '@/types/accessPolicies';
import { publicEnv } from '@/lib/env';

const NEXT_PUBLIC_BE_API_URL = publicEnv.NEXT_PUBLIC_BE_API_URL

export default function AccessPolicyPage() {
  const { data, isLoading, isError, refetch } = usePolicies();
  const policies = useMemo(() => data?.policies ?? {}, [data]);

  const [detailsModalOwnerId, setDetailsModalOwnerId] = useState<string | null>(null);
  const [ownerEndpointIds, setOwnerEndpointIds] = useState<Record<string, string[]>>({});
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [discoveryError, setDiscoveryError] = useState<string | null>(null);

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
      const catalogRes = await fetch(
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
      const serversRes = await fetch(`${NEXT_PUBLIC_BE_API_URL}/servers`);
      if (serversRes.ok) {
        const serversPayload = await serversRes.json();
        const servers = Array.isArray(serversPayload?.servers) ? serversPayload.servers : [];
        await Promise.all(
          servers.map(async (server: { name?: string }) => {
            const serverName = typeof server?.name === 'string' ? server.name : '';
            if (!serverName) return;
            try {
              const toolsRes = await fetch(
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
    } finally {
      setIsRefreshing(false);
    }
  }, [loadOwnerEndpointIds, refetch]);

  const owners = useMemo(() => {
    return Object.keys(policies).map((ownerId) => ({
      id: ownerId,
      type: (ownerId.startsWith('mcp:') ? 'mcp' : 'app') as OwnerType,
      name: ownerId,
      url: ownerId,
      endpointCount: (ownerEndpointIds[ownerId]?.length ?? 0) || Object.keys(policies[ownerId]?.endpointPolicies || {}).length,
    }));
  }, [policies, ownerEndpointIds]);

  const selectedPolicy: OwnerPolicy | null = detailsModalOwnerId
    ? policies[detailsModalOwnerId]
    : null;
  const selectedEndpointIds: string[] = detailsModalOwnerId
    ? (ownerEndpointIds[detailsModalOwnerId] ?? [])
    : [];

  return (
    <div className="min-h-screen bg-gradient-to-br from-white via-slate-50 to-slate-100 overflow-hidden">
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-20 left-10 w-80 h-80 bg-violet-400/8 rounded-full blur-3xl animate-float"></div>
        <div
          className="absolute bottom-20 right-10 w-80 h-80 bg-cyan-400/8 rounded-full blur-3xl animate-float"
          style={{ animationDelay: '1s' }}
        ></div>
      </div>

      <Navigation pageTitle="Access Control" />

      <main className="pt-24 pb-12 px-4 sm:px-6 lg:px-8 max-w-7xl mx-auto relative z-10">
        <div className="flex items-start justify-between mb-8 gap-4">
          <div>
            <h1 className="text-3xl font-bold bg-gradient-to-r from-violet-600 to-cyan-600 bg-clip-text text-transparent">
              Access Control
            </h1>
            <p className="text-slate-600 text-sm mt-1">
              Manage default and per-tool access policies for your MCP servers and API applications.
            </p>
          </div>
          <Button
            onClick={() => void handleRefresh()}
            disabled={isRefreshing}
            size="md"
            variant="primary"
            className="min-w-[120px]"
          >
            {isRefreshing ? 'Refreshing...' : 'Refresh'}
          </Button>
        </div>

        {(isError || discoveryError) && (
          <div className="mb-6 bg-amber-100 border border-amber-300 rounded-xl p-4 text-amber-700">
            {isError && <p className="font-semibold">Failed to load access policies.</p>}
            {discoveryError && <p className="text-sm">{discoveryError}</p>}
          </div>
        )}

        {isLoading && (
          <div className="flex items-center justify-center py-20">
            <div className="w-8 h-8 border-4 border-violet-400 border-t-transparent rounded-full animate-spin"></div>
            <span className="ml-3 text-slate-600 font-medium">Loading access policies...</span>
          </div>
        )}

        {!isLoading && owners.length === 0 && (
          <div className="bg-white/85 backdrop-blur-sm border border-slate-200 rounded-2xl p-8 text-center text-slate-600 shadow-lg">
            <h3 className="text-lg font-medium mb-2">No Applications Found</h3>
            <p>Connect an MCP server or register an application to see it here.</p>
          </div>
        )}

        {!isLoading && owners.length > 0 && (
          <div className="rounded-2xl border border-slate-200 bg-white/85 backdrop-blur-sm shadow-lg p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {owners.map((owner) => (
                <ApplicationCard
                  key={owner.id}
                  owner={owner}
                  onClick={() => setDetailsModalOwnerId(owner.id)}
                />
              ))}
            </div>
          </div>
        )}
      </main>

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

