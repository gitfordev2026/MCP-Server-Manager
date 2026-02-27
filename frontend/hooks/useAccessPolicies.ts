import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import * as api from '@/services/accessPolicies.api';
import { AccessMode, OwnerPolicy } from '@/types/accessPolicies';
import { toast } from '@/lib/toast';

const POLICIES_KEY = ['access-policies'];

export function usePolicies() {
  return useQuery({
    queryKey: POLICIES_KEY,
    queryFn: api.fetchPolicies,
  });
}

/**
 * Update SINGLE endpoint with full optimistic rollback
 */
export function useUpdateEndpointPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ownerId,
      endpointId,
      mode,
      allowed_users,
      allowed_groups,
    }: {
      ownerId: string;
      endpointId: string;
      mode: AccessMode;
      allowed_users?: string[];
      allowed_groups?: string[];
    }) => api.updateEndpointPolicy(ownerId, endpointId, mode, allowed_users, allowed_groups),

    onMutate: async ({ ownerId, endpointId, mode, allowed_users, allowed_groups }) => {
      await queryClient.cancelQueries({ queryKey: POLICIES_KEY });

      const previous = queryClient.getQueryData<any>(POLICIES_KEY);

      queryClient.setQueryData(POLICIES_KEY, (old: any) => {
        const next = structuredClone(old);
        // Ensure structure exists
        if (!next.policies[ownerId]) {
          next.policies[ownerId] = {
            defaultMode: 'deny',
            endpointModes: {},
            defaultPolicy: { mode: 'deny', allowed_users: [], allowed_groups: [] },
            endpointPolicies: {},
          };
        }
        const owner: OwnerPolicy = next.policies[ownerId];

        // Update legacy field
        owner.endpointModes[endpointId] = mode;

        // Update new field
        owner.endpointPolicies[endpointId] = {
          mode,
          allowed_users: allowed_users ?? owner.endpointPolicies[endpointId]?.allowed_users ?? [],
          allowed_groups: allowed_groups ?? owner.endpointPolicies[endpointId]?.allowed_groups ?? [],
        };

        next.policies[ownerId] = owner;
        return next;
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(POLICIES_KEY, context?.previous);
      toast.error('Failed to update endpoint policy');
    },

    onSuccess: () => {
      toast.success('Endpoint policy updated');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
    },
  });
}

export function useUpdateOwnerDefaultPolicy() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({
      ownerId,
      mode,
      allowed_users,
      allowed_groups,
    }: {
      ownerId: string;
      mode: AccessMode;
      allowed_users?: string[];
      allowed_groups?: string[];
    }) => api.updateOwnerDefaultPolicy(ownerId, mode, allowed_users, allowed_groups),

    onMutate: async ({ ownerId, mode, allowed_users, allowed_groups }) => {
      await queryClient.cancelQueries({ queryKey: POLICIES_KEY });
      const previous = queryClient.getQueryData<any>(POLICIES_KEY);

      queryClient.setQueryData(POLICIES_KEY, (old: any) => {
        const next = structuredClone(old);
        // Ensure structure exists
        if (!next.policies[ownerId]) {
          next.policies[ownerId] = {
            defaultMode: 'deny',
            endpointModes: {},
            defaultPolicy: { mode: 'deny', allowed_users: [], allowed_groups: [] },
            endpointPolicies: {},
          };
        }

        const owner: OwnerPolicy = next.policies[ownerId];

        // Update legacy field
        owner.defaultMode = mode;

        // Update new field
        owner.defaultPolicy = {
          mode,
          allowed_users: allowed_users ?? owner.defaultPolicy?.allowed_users ?? [],
          allowed_groups: allowed_groups ?? owner.defaultPolicy?.allowed_groups ?? [],
        };

        next.policies[ownerId] = owner;
        return next;
      });

      return { previous };
    },

    onError: (_err, _vars, context) => {
      queryClient.setQueryData(POLICIES_KEY, context?.previous);
      toast.error('Failed to update owner policy');
    },

    onSuccess: () => {
      toast.success('Owner policy updated');
    },

    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: POLICIES_KEY });
    },
  });
}
