import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { executeClaimedScheduledNewsletterJob } from '@/lib/newsletter/execute-scheduled-job';
import { getNewsletterRecipients, type RecipientResult } from '@/lib/newsletter/get-recipients';
import {
  claimNextDueScheduledSend,
  reclaimStaleProcessingScheduledSends,
} from '@/lib/newsletter/scheduled-send-store';

export const maxDuration = 300;

const RECIPIENT_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Behandler planlagte nyhedsbreve (Vercel Cron hvert 15. min, se vercel.json).
 * Kræver `CRON_SECRET` i Production + at Vercel sender `Authorization: Bearer <CRON_SECRET>`.
 * Kører kun på **production**-deployments, ikke preview.
 *
 * Recipients are resolved once per invocation and shared across all jobs
 * within the same cron run (TTL guard for safety in long-running invocations).
 */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  let processed = 0;
  const summaries: string[] = [];

  try {
    const reclaimed = await reclaimStaleProcessingScheduledSends();
    if (reclaimed > 0) summaries.push(`genåbnet ${reclaimed} hængende job(s)`);

    let cachedRecipients: RecipientResult | null = null;
    let recipientsFetchedAt = 0;

    for (let i = 0; i < 20; i++) {
      const job = await claimNextDueScheduledSend();
      if (!job) break;

      if (!cachedRecipients || Date.now() - recipientsFetchedAt > RECIPIENT_CACHE_TTL_MS) {
        cachedRecipients = await getNewsletterRecipients();
        recipientsFetchedAt = Date.now();
      }

      const { summary } = await executeClaimedScheduledNewsletterJob(job, cachedRecipients);
      summaries.push(summary);
      processed++;
    }

    console.info('[cron/newsletter-scheduled]', {
      processed,
      summaries: summaries.slice(0, 12),
      recipientCount: cachedRecipients?.emails.length ?? 0,
      vercelCron: req.headers.get('x-vercel-cron') ?? undefined,
    });

    return NextResponse.json({ ok: true, processed, summaries });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    console.error('[cron/newsletter-scheduled] unhandled error', { processed, error: msg });
    return NextResponse.json(
      { ok: false, error: msg, processed },
      { status: 500 }
    );
  }
}
