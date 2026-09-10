import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { runLivDaily } from '@/lib/liv/run-daily';
import { deliverReadyArticle } from '@/lib/liv/deliver-ready';

export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  // Explicit rollout switch: old and new publishers cannot run concurrently.
  if (process.env.LIV_DELIVERY_QUEUE_ENABLED !== 'true') return runLivDaily(req);
  if (['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) {
    return NextResponse.json({ status: 'paused' });
  }
  if (req.nextUrl.searchParams.has('dryRun')) return NextResponse.json({ status: 'dry_run_no_writes' });
  if (process.env.LIV_DAILY_PUBLICATION_MODE?.trim().toLowerCase() !== 'auto_publish') {
    return NextResponse.json({ status: 'auto_publish_disabled' });
  }
  try { return NextResponse.json(await deliverReadyArticle()); }
  catch { return NextResponse.json({ error: 'liv_delivery_failed' }, { status: 503 }); }
}
