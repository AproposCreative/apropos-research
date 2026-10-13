import { queryOptions } from '@tanstack/react-query';
import type { ToolCatalogue } from './tool-availability';

type CatalogueUser = { uid: string; getIdToken: () => Promise<string> };
export const TOOL_CATALOGUE_TIMEOUT_MS = 6_000;

/** One user-scoped query for startup and every menu. Never persists to disk. */
export function toolCatalogueQuery(user: CatalogueUser, owner: boolean) {
  return queryOptions<ToolCatalogue>({
    queryKey: ['editorial-tools', user.uid, owner],
    staleTime: 60_000,
    retry: false,
    retryOnMount: false,
    queryFn: async ({ signal }) => {
      const controller = new AbortController();
      const cancel = () => controller.abort();
      if (signal.aborted) cancel();
      signal.addEventListener('abort', cancel, { once: true });
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        // Bound token retrieval as well as the HTTP read; a stuck request must
        // not trap someone behind the branded startup screen.
        return await Promise.race([
          (async () => {
            const token = await user.getIdToken();
            if (controller.signal.aborted) throw new Error('tools_timeout');
            const response = await fetch('/api/editorial/tools', {
              signal: controller.signal, cache: 'no-store',
              headers: { Authorization: `Bearer ${token}` },
            });
            if (!response.ok) throw new Error('tools_unavailable');
            const result = await response.json();
            if (!Array.isArray(result.tools)) throw new Error('tools_invalid');
            return result as ToolCatalogue;
          })(),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => { cancel(); reject(new Error('tools_timeout')); }, TOOL_CATALOGUE_TIMEOUT_MS);
          }),
        ]);
      } finally {
        clearTimeout(timer);
        signal.removeEventListener('abort', cancel);
      }
    },
  });
}
