'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { describeTools, type ToolCatalogue } from './tool-availability';

export function useWebApps() {
  const { user, capabilities } = useAuth();
  const query = useQuery<ToolCatalogue>({
    queryKey: ['editorial-tools', user?.uid, capabilities.owner],
    enabled: Boolean(user), staleTime: 60_000, retry: false,
    queryFn: async ({ signal }) => {
      const r = await fetch('/api/editorial/tools', { signal, cache: 'no-store',
        headers: { Authorization: `Bearer ${await user!.getIdToken()}` } });
      if (!r.ok) throw new Error('tools_unavailable');
      const result = await r.json();
      if (!Array.isArray(result.tools)) throw new Error('tools_invalid');
      return result;
    },
  });
  return { ...query, tools: query.data?.tools ?? describeTools({ paidAiBlocked: null,
    accreditationPaused: null, inboxAutoRespond: null }, capabilities) };
}
