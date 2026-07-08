import { env } from '@/lib/config/env';
import { internalApiHeaders } from '@/lib/api/internal-auth';
import { logger } from '@/lib/logger';

function resolveInternalBaseUrl(): string {
  const explicit = env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}

/** Fire-and-forget: start async DK→EN oversættelse for et CMS-item. */
export function enqueueArticleTranslation(itemId: string, source: string): void {
  const base = resolveInternalBaseUrl();
  const url = `${base}/api/internal/translate-article`;

  void fetch(url, {
    method: 'POST',
    headers: internalApiHeaders(),
    body: JSON.stringify({ itemId, source }),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => {
    logger.warn('[article-translation] enqueue failed', {
      itemId,
      message: e instanceof Error ? e.message : String(e),
    });
  });
}
