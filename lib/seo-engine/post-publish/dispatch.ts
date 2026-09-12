import { internalApiHeaders } from '@/lib/api/internal-auth';
import { logger } from '@/lib/logger';

/** Best-effort wakeup only; recovery consumes the durable queue independently. */
export function kickQualityJob(jobId: string) {
  const base = process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : 'http://localhost:3000');
  void fetch(`${base.replace(/\/$/, '')}/api/internal/seo-quality`, {
    method: 'POST', headers: internalApiHeaders(), body: JSON.stringify({ jobId }), signal: AbortSignal.timeout(8000),
  }).then(response => {
    if (!response.ok) logger.warn('[seo-quality] wakeup rejected; job remains durable', { jobId, status: response.status });
  }).catch(() => logger.warn('[seo-quality] wakeup unconfirmed; recovery will inspect job', { jobId }));
}
