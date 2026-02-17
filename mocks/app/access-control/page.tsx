'use client';

import { useEffect, useMemo, useState } from 'react';
import Navigation from '@/components/Navigation';
import Button from '@/components/ui/Button';
import { toast } from 'sonner';

import { AccessMode, OwnerPolicy, Policies } from '@/types/accessPolicies';
import { usePolicies } from '@/hooks/useAccessPolicies';
import { useDebouncedEndpointPolicyUpdate } from '@/hooks/useDebouncedPolicyUpdate';
import {
  updateOwnerDefaultPolicy,
  resetEndpointPolicy,
} from '@/services/accessPolicies.api';

/* -------------------------------------------------------------------------- */
/*                                   CONFIG                                   */
/* -------------------------------------------------------------------------- */

const ACCESS_MODES: { value: AccessMode; label: string }[] = [
  { value: 'allow', label: 'Allow' },
  { value: 'approval', label: 'Require Approval' },
  { value: 'deny', label: 'Deny' },
];

/* -------------------------------------------------------------------------- */
/*                                   PAGE                                     */
/* -------------------------------------------------------------------------- */

export default function AccessPolicyPage() {
  /* ----------------------------- DATA (RQ) ----------------------------- */

  const { data, isLoading, isError } = usePolicies();
  const policies: Policies = data?.policies ?? {};

  const debouncedUpdateEndpoint = useDebouncedEndpointPolicyUpdate();

  /* ----------------------------- UI STATE ------------------------------ */

  const [selectedOwnerId, setSelectedOwnerId] = useState<string | null>(null);

  /* ---------------------------- DERIVED STATE --------------------------- */

  const owners = useMemo(() => {
    return Object.keys(policies).map((ownerId) => ({
      id: ownerId,
      name: ownerId,
    }));
  }, [policies]);

  const selectedPolicy: OwnerPolicy | null = selectedOwnerId
    ? policies[selectedOwnerId] ?? {
        defaultMode: 'approval',
        endpointModes: {},
      }
    : null;

  /* -------------------------- AUTO SELECT OWNER -------------------------- */

  useEffect(() => {
    if (!selectedOwnerId && owners.length > 0) {
      setSelectedOwnerId(owners[0].id);
    }
  }, [owners, selectedOwnerId]);

  /* -------------------------------------------------------------------------- */
  /*                                   RENDER                                   */
  /* -------------------------------------------------------------------------- */

  return (
    <div className="min-h-screen bg-slate-50">
      {/* ✅ NAVIGATION IS ALWAYS RENDERED */}
      <Navigation pageTitle="Access Control" />

      {/* Push content below fixed nav */}
      <main className="max-w-7xl mx-auto px-6 pt-24 pb-12 space-y-6">
        {/* ---------------------------- STATES ---------------------------- */}

        {isLoading && (
          <div className="text-sm text-slate-500">Loading policies…</div>
        )}

        {isError && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-sm">
            Failed to load access policies.
          </div>
        )}

        {!isLoading && owners.length === 0 && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm">
            No owners found. Policies are empty.
          </div>
        )}

        {/* -------------------------- OWNER SELECT -------------------------- */}

        {owners.length > 0 && (
          <div className="bg-white border rounded-xl p-4">
            <label className="text-xs font-semibold text-slate-600">
              Select Owner
            </label>
            <select
              value={selectedOwnerId ?? ''}
              onChange={(e) => setSelectedOwnerId(e.target.value)}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {owners.map((owner) => (
                <option key={owner.id} value={owner.id}>
                  {owner.name}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ---------------------- DEFAULT POLICY ---------------------- */}

        {selectedPolicy && selectedOwnerId && (
          <div className="bg-white border rounded-xl p-4">
            <label className="text-xs font-semibold text-slate-600">
              Default Policy
            </label>

            <select
              value={selectedPolicy.defaultMode}
              onChange={async (e) => {
                try {
                  await updateOwnerDefaultPolicy(
                    selectedOwnerId,
                    e.target.value as AccessMode
                  );
                  toast.success('Default policy updated');
                } catch {
                  toast.error('Failed to update default policy');
                }
              }}
              className="mt-1 w-full border rounded-lg px-3 py-2"
            >
              {ACCESS_MODES.map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* ---------------------- EMPTY ENDPOINT STATE ---------------------- */}

        {selectedPolicy &&
          Object.keys(selectedPolicy.endpointModes).length === 0 && (
            <div className="bg-slate-100 border rounded-lg p-4 text-sm text-slate-600">
              No endpoint-specific overrides.
              <br />
              Default policy applies to all endpoints.
            </div>
          )}

        {/* ---------------------- ENDPOINT OVERRIDES ---------------------- */}

        {selectedPolicy &&
          Object.entries(selectedPolicy.endpointModes).map(
            ([endpointId, mode]) => (
              <div
                key={endpointId}
                className="flex items-center justify-between bg-white border rounded-lg p-3"
              >
                <span className="text-sm font-medium">{endpointId}</span>

                <div className="flex items-center gap-2">
                  <select
                    value={mode}
                    onChange={(e) =>
                      debouncedUpdateEndpoint({
                        ownerId: selectedOwnerId!,
                        endpointId,
                        mode: e.target.value as AccessMode,
                      })
                    }
                    className="border rounded px-2 py-1 text-sm"
                  >
                    {ACCESS_MODES.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>

                  <Button
                    onClick={async () => {
                      try {
                        await resetEndpointPolicy(
                          selectedOwnerId!,
                          endpointId
                        );
                        toast.success('Endpoint reset');
                      } catch {
                        toast.error('Failed to reset endpoint');
                      }
                    }}
                    className="text-xs"
                  >
                    Reset
                  </Button>
                </div>
              </div>
            )
          )}
      </main>
    </div>
  );
}
