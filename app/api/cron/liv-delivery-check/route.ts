import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { GET as deliver } from '@/app/api/cron/liv-daily-article/route';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { deliveryHealth } from '@/lib/liv/delivery-policy';
import { logger } from '@/lib/logger';
import { notifyDeliveryHealth } from '@/lib/liv/delivery-alerts';
import { readNextLivPreparationStatus } from '@/lib/liv/preparation-status';

export const maxDuration = 300;
export async function GET(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_QUEUE_ENABLED !== 'true') return NextResponse.json({ status: 'disabled' });
  let response: Response;
  try { response = await deliver(req); }
  catch { response = NextResponse.json({error:'liv_delivery_failed'}, {status:503}); }
  if (req.nextUrl.searchParams.has('dryRun') || ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase()) ||
      process.env.LIV_DAILY_PUBLICATION_MODE?.trim().toLowerCase() !== 'auto_publish') return response;
  try {
    const state = await readDeliveryState();
    const health = deliveryHealth(state);
    const preparation = await readNextLivPreparationStatus(state);
    let alerts = 'checked';
    try { await notifyDeliveryHealth(state, new Date(), preparation); }
    catch { alerts = 'unconfirmed'; }
    if (health.overdue) logger.error('[liv/delivery] daily publication overdue', new Error('liv_daily_overdue'), health);
    return NextResponse.json({ delivery: await response.json(), health, alerts, preparation }, { status: health.overdue || alerts === 'unconfirmed' || preparation.status === 'unavailable' ? 503 : response.status });
  } catch { return NextResponse.json({ error: 'liv_delivery_health_unavailable' }, { status: 503 }); }
}
