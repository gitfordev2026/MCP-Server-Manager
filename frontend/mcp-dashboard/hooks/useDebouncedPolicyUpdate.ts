import { useRef } from 'react';
import { AccessMode } from '@/types/accessPolicies';
import { useUpdateEndpointPolicy } from './useAccessPolicies';

type Args = {
  ownerId: string;
  endpointId: string;
  mode: AccessMode;
  allowed_users?: string[];
  allowed_groups?: string[];
};

export function useDebouncedEndpointPolicyUpdate(delay = 400) {
  const timer = useRef<NodeJS.Timeout | null>(null);
  const mutation = useUpdateEndpointPolicy();

  return (args: Args) => {
    if (timer.current) clearTimeout(timer.current);

    timer.current = setTimeout(() => {
      mutation.mutate(args);
    }, delay);
  };
}
