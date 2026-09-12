import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { editorialEditDayAllowed, editorialEditInput, editLivEditorialCheckpoint } from '@/lib/liv/editorial-edit';

export const runtime = 'nodejs';
export const maxDuration = 60;
const json = (body: unknown, status = 409) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_PREPARE_ENABLED !== 'true' ||
    ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) return json({ error: 'liv_preparation_disabled' });
  let input: unknown;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 45000) throw new Error('invalid');
    const parsed = editorialEditInput.parse(JSON.parse(raw));
    if (!editorialEditDayAllowed(parsed)) throw new Error('invalid');
    input = parsed;
  } catch { return json({ error: 'liv_edit_invalid' }, 400); }
  let lease: string | null = null;
  try {
    lease = await claimPreparation();
    if (!lease) return json({ status: 'already_preparing' });
    return json(await editLivEditorialCheckpoint(input, lease), 200);
  } catch (error) {
    const code = error instanceof Error && /^liv_edit_(invalid|invalid_patch|store_unavailable|lease_lost|delivery_hold|conflict|blocked_saved_work)$/.test(error.message)
      ? error.message : 'liv_edit_failed';
    return json({ error: code }, code.includes('invalid') ? 400 :
      ['liv_edit_store_unavailable', 'liv_edit_failed'].includes(code) ? 503 : 409);
  } finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
