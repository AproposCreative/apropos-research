import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { authorizePreparationRetry, type PreparationRetry } from '@/lib/liv/retry-preparation';
import { claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { runLivDaily } from '@/lib/liv/run-daily';
import { defaultEditorialPlan } from '@/lib/liv/rolling-plan';

export const maxDuration = 300;
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_PREPARE_ENABLED !== 'true' ||
    ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) {
    return NextResponse.json({ error: 'liv_preparation_disabled' }, { status: 409 });
  }
  let input: PreparationRetry;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 10000) throw new Error('invalid');
    input = JSON.parse(raw);
  } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }); }
  if (!input || typeof input.reason !== 'string' || typeof input.requestId !== 'string' ||
    typeof input.dayKey !== 'string') return NextResponse.json({ error: 'liv_retry_invalid' }, { status: 400 });
  let lease: string | null = null;
  try {
    lease = await claimPreparation();
    if (!lease) return NextResponse.json({ status: 'already_preparing' }, { status: 409 });
    const receipt = input.scope === 'reserve-editorial' ? await authorizePreparationRetry(input, lease) : await authorizePreparationRetry(input);
    if (receipt.status === 'already_requested') return NextResponse.json(receipt);
    if (input.scope === 'reserve-editorial' && !receipt.defaultPlan) throw new Error('liv_retry_conflict');
    return await runLivDaily(req, { dayKey: input.dayKey, kind: input.kind,
      ...(input.scope ? { scope: input.scope } : {}),
      defaultPlan: receipt.defaultPlan || defaultEditorialPlan(input.dayKey, input.kind === 'reserve') });
  } catch (error) {
    const code = error instanceof Error && /^liv_retry_(invalid|conflict|processing|store_unavailable)$/.test(error.message)
      ? error.message : 'liv_retry_failed';
    return NextResponse.json({ error: code }, { status: code.endsWith('invalid') ? 400 : code.endsWith('unavailable') ? 503 : 409 });
  } finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
