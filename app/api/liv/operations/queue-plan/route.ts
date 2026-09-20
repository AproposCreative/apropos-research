import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { queuePlanInput, scheduleLivQueue } from '@/lib/liv/queue-plan';

export const runtime = 'nodejs';
export const maxDuration = 30;
const json = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_PREPARE_ENABLED !== 'true' ||
    ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) return json({ error: 'liv_preparation_disabled' }, 409);
  let input;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 16000) throw new Error('invalid');
    input = queuePlanInput.parse(JSON.parse(raw));
  } catch { return json({ error: 'liv_queue_invalid' }, 400); }
  let lease: string | null = null;
  try {
    lease = await claimPreparation();
    if (!lease) return json({ status: 'already_preparing' }, 409);
    return json(await scheduleLivQueue(input, lease));
  } catch (error) {
    const code = error instanceof Error && /^liv_queue_(invalid|store_unavailable|lease_lost|delivery_hold|conflict|occupied|limit)$/.test(error.message)
      ? error.message : 'liv_queue_failed';
    return json({ error: code }, code === 'liv_queue_invalid' ? 400 :
      ['liv_queue_store_unavailable', 'liv_queue_failed'].includes(code) ? 503 : 409);
  } finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
