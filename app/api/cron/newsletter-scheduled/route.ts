import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { executeClaimedScheduledNewsletterJob } from '@/lib/newsletter/execute-scheduled-job';
import {
  claimNextDueScheduledSend,
  reclaimStaleProcessingScheduledSends,
} from '@/lib/newsletter/scheduled-send-store';

export const maxDuration = 300;

/**
 * Behandler planlagte nyhedsbreve. Kræver `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!env.CRON_SECRET || bearer !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

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

    return NextResponse.json({ ok: true, processed, summaries });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : 'Ukendt fejl', processed },
      { status: 500 }
    );
  }
}
