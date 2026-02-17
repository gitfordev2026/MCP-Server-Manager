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
    mutationFn: api.updateEndpointPolicy,

    onMutate: async ({ ownerId, endpointId, mode }) => {
      await queryClient.cancelQueries({ queryKey: POLICIES_KEY });

      const previous = queryClient.getQueryData<any>(POLICIES_KEY);

      queryClient.setQueryData(POLICIES_KEY, (old: any) => {
        const next = structuredClone(old);
        const owner: OwnerPolicy =
          next.policies[ownerId] ?? { defaultMode: 'approval', endpointModes: {} };

        owner.endpointModes[endpointId] = mode;
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
