'use client';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from './auth-context';
import { describeTools, type ToolCatalogue } from './tool-availability';
import { toolCatalogueQuery } from './tool-catalogue-client';

export function useWebApps() {
  const { user, capabilities } = useAuth();
  const query = useQuery<ToolCatalogue>({
    ...toolCatalogueQuery(user ?? { uid: 'signed-out', getIdToken: async () => { throw new Error('auth_required'); } }, capabilities.owner),
    enabled: Boolean(user),
  });
  return { ...query, tools: query.data?.tools ?? describeTools({ paidAiBlocked: null,
    accreditationPaused: null, inboxAutoRespond: null }, capabilities) };
}
