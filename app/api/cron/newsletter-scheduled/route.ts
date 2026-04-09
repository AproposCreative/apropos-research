import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { executeClaimedScheduledNewsletterJob } from '@/lib/newsletter/execute-scheduled-job';
import {
  claimNextDueScheduledSend,
  reclaimStaleProcessingScheduledSends,
} from '@/lib/newsletter/scheduled-send-store';

export const maxDuration = 300;

/**
 * Behandler planlagte nyhedsbreve (Vercel Cron hvert 15. min, se vercel.json).
 * Kræver `CRON_SECRET` i Production + at Vercel sender `Authorization: Bearer <CRON_SECRET>`.
 * Kører kun på **production**-deployments, ikke preview.
 *
 * Fejlfinding: ingen send — tjek Vercel → Cron logs; Firestore-indekser (firebase deploy --only firestore:indexes);
 * job i Firestore `newsletterScheduledSends` med status failed/error; aktive modtagere fra Webflow.
 */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  let processed = 0;
  const summaries: string[] = [];

  try {
    const reclaimed = await reclaimStaleProcessingScheduledSends();
    if (reclaimed > 0) summaries.push(`genåbnet ${reclaimed} hængende job(s)`);

    for (let i = 0; i < 20; i++) {
      const job = await claimNextDueScheduledSend();
      if (!job) break;

      const { summary } = await executeClaimedScheduledNewsletterJob(job);
      summaries.push(summary);
      processed++;
    }

    console.info('[cron/newsletter-scheduled]', {
      processed,
      summaries: summaries.slice(0, 12),
      vercelCron: req.headers.get('x-vercel-cron') ?? undefined,
    });

    return NextResponse.json({ ok: true, processed, summaries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Ukendt fejl', processed },
      { status: 500 }
    );
  }
}
