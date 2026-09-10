import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { GET as deliver } from '@/app/api/cron/liv-daily-article/route';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { deliveryHealth } from '@/lib/liv/delivery-policy';
import { logger } from '@/lib/logger';

export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_QUEUE_ENABLED !== 'true') return NextResponse.json({ status: 'disabled' });
  const response = await deliver(req);
  if (req.nextUrl.searchParams.has('dryRun') || ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase()) ||
      process.env.LIV_DAILY_PUBLICATION_MODE?.trim().toLowerCase() !== 'auto_publish') return response;
  try {
    const health = deliveryHealth(await readDeliveryState());
    // Non-2xx makes a missed deadline visible to platform monitoring. No email,
    // social post or new external destination is silently configured here.
    if (health.overdue) logger.error('[liv/delivery] daily publication overdue', new Error('liv_daily_overdue'), health);
    return NextResponse.json({ delivery: await response.json(), health }, { status: health.overdue ? 503 : response.status });
  } catch { return NextResponse.json({ error: 'liv_delivery_health_unavailable' }, { status: 503 }); }
}
