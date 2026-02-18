import { http } from './http';
import { AccessMode, PolicyPayload, OwnerPolicy } from '@/types/accessPolicies';

// =========================
// FETCH all policies
// GET /access-policies
// =========================
export async function fetchPolicies(): Promise<{ policies: Record<string, OwnerPolicy> }> {
  return http('/access-policies');
}

// =========================
// Update DEFAULT owner policy
// PUT /access-policies/{ownerId}
// =========================
// =========================
// Update DEFAULT owner policy
// PUT /access-policies/{ownerId}
// =========================
export async function updateOwnerDefaultPolicy(
  ownerId: string,
  mode: AccessMode,
  allowed_users?: string[],
  allowed_groups?: string[]
): Promise<void> {
  const payload: PolicyPayload = {
    mode,
    allowed_users,
    allowed_groups,
  };

  await http(`/access-policies/${encodeURIComponent(ownerId)}`, {
    method: 'PUT',
    body: JSON.stringify(payload),
  });
}

// =========================
// Update SINGLE endpoint policy
// PUT /access-policies/{ownerId}/{endpointId}
// =========================
export async function updateEndpointPolicy(
  ownerId: string,
  endpointId: string,
  mode: AccessMode,
  allowed_users?: string[],
  allowed_groups?: string[]
): Promise<void> {
  if (typeof ownerId !== 'string' || typeof endpointId !== 'string') {
    throw new Error('ownerId and endpointId must be strings');
  }

  const payload: PolicyPayload = {
    mode,
    allowed_users,
    allowed_groups,
  };

  await http(
    `/access-policies/${encodeURIComponent(ownerId)}/${encodeURIComponent(endpointId)}`,
    {
      method: 'PUT',
      body: JSON.stringify(payload),
    }
  );
}


// =========================
// RESET endpoint override
// DELETE /access-policies/{ownerId}/{endpointId}
// =========================
export async function resetEndpointPolicy(
  ownerId: string,
  endpointId: string
): Promise<void> {
  await http(
    `/access-policies/${encodeURIComponent(ownerId)}/${encodeURIComponent(endpointId)}`,
    {
      method: 'DELETE',
    }
  );
}

// =========================
// APPLY policy to ALL endpoints (bulk)
// POST /access-policies/{ownerId}/apply-all
// =========================
export async function applyPolicyToAllEndpoints(
  ownerId: string,
  mode: AccessMode,
  endpointIds: string[],
  allowed_users?: string[],
  allowed_groups?: string[]
): Promise<void> {
  const payload: PolicyPayload = {
    mode,
    tool_ids: endpointIds,
    allowed_users,
    allowed_groups,
  };

  await http(`/access-policies/${encodeURIComponent(ownerId)}/apply-all`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}
