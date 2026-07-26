import { env } from '@/lib/config/env';
import { internalApiHeaders } from '@/lib/api/internal-auth';
import { logger } from '@/lib/logger';
import { writeQueuedSeoEngineJob } from '@/lib/seo-engine/jobs';

function resolveInternalBaseUrl(): string {
  const explicit = env.NEXT_PUBLIC_BASE_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');
  const vercel = env.VERCEL_PROJECT_PRODUCTION_URL?.trim() || env.VERCEL_URL?.trim();
  if (vercel) return `https://${vercel.replace(/^https?:\/\//, '')}`;
  return 'http://localhost:3000';
}

/**
 * Await durable Firestore job write, then best-effort HTTP kick.
 * Webhook must await this (at least the durable write) before returning 200.
 */
export async function enqueueSeoEngineJob(args: {
  itemId: string;
  cmsLastUpdated: string;
  source: 'webhook' | 'publish_app' | 'manual' | 'recovery';
  locale?: 'da' | 'en';
}): Promise<{ jobId: string; created: boolean }> {
  const written = await writeQueuedSeoEngineJob(args);

  const base = resolveInternalBaseUrl();
  const url = `${base}/api/internal/seo-engine-article`;
  void fetch(url, {
    method: 'POST',
    headers: internalApiHeaders(),
    body: JSON.stringify({ jobId: written.jobId, itemId: args.itemId }),
    signal: AbortSignal.timeout(8000),
  }).catch((e) => {
    logger.warn('[seo-engine] worker kick failed (job remains queued)', {
      jobId: written.jobId,
      itemId: args.itemId,
      message: e instanceof Error ? e.message : String(e),
    });
  });

  return written;
}
