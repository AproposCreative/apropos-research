import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { explicitPreparationInput, reserveExplicitLivPreparation } from '@/lib/liv/explicit-preparation';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import { runLivDaily } from '@/lib/liv/run-daily';

export const runtime = 'nodejs';
export const maxDuration = 300;
const json = (body: unknown, status = 409) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_PREPARE_ENABLED !== 'true' ||
    ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) return json({ error: 'liv_preparation_disabled' });
  let input: unknown;
  try {
    // No dry-run or scope query can change the semantics of this explicit POST.
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 8000) throw new Error('invalid');
    input = explicitPreparationInput.parse(JSON.parse(raw));
    if ((input as { dayKey: string }).dayKey !== copenhagenClock().day) throw new Error('invalid');
  } catch { return json({ error: 'liv_prepare_invalid' }, 400); }
  let lease: string | null = null;
  try {
    lease = await claimPreparation();
    if (!lease) return json({ status: 'already_preparing' });
    const preparation = await reserveExplicitLivPreparation(input, lease);
    const response = await runLivDaily(req, preparation);
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (error) {
    const code = error instanceof Error && /^liv_prepare_(invalid|store_unavailable|lease_lost|delivery_hold|conflict|blocked_saved_work)$/.test(error.message)
      ? error.message : 'liv_prepare_failed';
    return json({ error: code, ...(code === 'liv_prepare_blocked_saved_work' ? { status: 'blocked_saved_work' } : {}) }, code.endsWith('invalid') ? 400 :
      ['liv_prepare_store_unavailable', 'liv_prepare_failed'].includes(code) ? 503 : 409);
  } finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
