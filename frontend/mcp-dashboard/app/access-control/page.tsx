'use client';

import { useState, useMemo } from 'react';
import Navigation from '@/components/Navigation';
import ApplicationCard from '@/components/access-control/ApplicationCard';
import AccessControlModal from '@/components/access-control/AccessControlModal';
import { usePolicies } from '@/hooks/useAccessPolicies';
import { Policies, OwnerPolicy } from '@/types/accessPolicies';

export default function AccessPolicyPage() {
  /* ----------------------------- DATA (RQ) ----------------------------- */

  const { data, isLoading, isError } = usePolicies();
  const policies: Policies = data?.policies ?? {};

  /* ----------------------------- UI STATE ------------------------------ */

  const [detailsModalOwnerId, setDetailsModalOwnerId] = useState<string | null>(null);

  /* ---------------------------- DERIVED STATE --------------------------- */

  const owners = useMemo(() => {
    return Object.keys(policies).map((ownerId) => ({
      id: ownerId,
      type: (ownerId.startsWith('mcp:') ? 'mcp' : 'app') as any, // Simple inference
      name: ownerId,
      url: ownerId, // We don't have URL in policy map, using ID as placeholder
      endpointCount: Object.keys(policies[ownerId]?.endpointModes || {}).length,
    }));
    // Note: To get real URL and type, we'd need to fetch from /mcp/apps catalog or similar.
    // For now, consistent with previous implementation derived from policies map.
  }, [policies]);

  const selectedPolicy: OwnerPolicy | null = detailsModalOwnerId
    ? policies[detailsModalOwnerId]
    : null;

  /* -------------------------------------------------------------------------- */
  /*                                   RENDER                                   */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-slate-50">
      <Navigation pageTitle="Access Control" />

      <main className="max-w-7xl mx-auto px-6 pt-24 pb-12 space-y-6">
        <div className="flex justify-between items-center">
          <h1 className="text-2xl font-bold text-slate-800">Applications</h1>
          <div className="text-sm text-slate-500">
            Manage access policies for your MCP servers and applications.
          </div>
        </div>

        {/* ---------------------------- STATES ---------------------------- */}

        {isLoading && (
          <div className="text-sm text-slate-500 animate-pulse">Loading policies…</div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm text-red-700">
            Failed to load access policies.
          </div>
        )}

        {!isLoading && owners.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center text-slate-600">
            <h3 className="text-lg font-medium mb-2">No Applications Found</h3>
            <p>Connect an MCP server or register an application to see it here.</p>
          </div>
        )}

        {/* -------------------------- APP GRID -------------------------- */}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {owners.map((owner) => (
            <ApplicationCard
              key={owner.id}
              owner={owner}
              onClick={() => setDetailsModalOwnerId(owner.id)}
            />
          ))}
        </div>
      </main>

      {/* -------------------------- MODAL -------------------------- */}

      {selectedPolicy && detailsModalOwnerId && (
        <AccessControlModal
          isOpen={!!detailsModalOwnerId}
          onClose={() => setDetailsModalOwnerId(null)}
          ownerId={detailsModalOwnerId}
          policy={selectedPolicy}
        />
      )}
    </div>
  );
}
