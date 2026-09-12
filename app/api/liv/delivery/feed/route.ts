import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { readDeliveryState, readDeliveryPayload, decideDelivery, DeliveryDecisionConflict } from '@/lib/liv/delivery-store';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import { approvalEntries, approvalStory, APPROVAL_PAGE_SIZE } from '@/lib/liv/approval-feed';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { parseEditorialFeedback } from '@/lib/liv/editorial-feedback';
import { readLivCostSummary } from '@/lib/liv/cost-ledger';
import { readNextLivPreparationStatus } from '@/lib/liv/preparation-status';

const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: NextRequest) {
  const userId = await getNewsletterUserIdFromRequest(req);
  if (!userId) return reply({ error: 'Log ind for at se Livs historier.' }, 401);
  const offset = Number(req.nextUrl.searchParams.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100) return reply({ error: 'Ugyldig side.' }, 400);
  const queueConfigured = process.env.LIV_DELIVERY_QUEUE_ENABLED === 'true';
  const preparationConfigured = process.env.LIV_DELIVERY_PREPARE_ENABLED === 'true';
  const paused = ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase());
  const queueEnabled = queueConfigured && !paused && process.env.LIV_DAILY_PUBLICATION_MODE === 'auto_publish';
  const preparationEnabled = preparationConfigured && !paused;
  // Keep saved previews available when paused; effective flags must not imply publication is active.
  if (!queueConfigured && !preparationConfigured) return reply({ stories: [], total: 0, nextOffset: null, queueEnabled, preparationEnabled });
  try {
    const [state, cost] = await Promise.all([readDeliveryState(), readLivCostSummary()]);
    const preparation = await readNextLivPreparationStatus(state);
    const entries = approvalEntries(state, copenhagenClock().day);
    const stories = await Promise.all(entries.slice(offset, offset + APPROVAL_PAGE_SIZE).map(async entry => {
      const payload = await readDeliveryPayload(entry.itemId);
      if (cmsFieldHash(payload as unknown as Record<string, unknown>) !== entry.payloadHash) throw new Error('changed');
      return approvalStory(entry, payload, userId);
    }));
    return reply({ stories, total: entries.length, nextOffset: offset + APPROVAL_PAGE_SIZE < entries.length ? offset + APPROVAL_PAGE_SIZE : null,
      queueEnabled, preparationEnabled, cost, preparation });
  } catch { return reply({ error: 'Historierne kunne ikke hentes. Prøv igen; dine gemte valg er ikke ændret.' }, 503); }
}
export async function POST(req: NextRequest) {
  const userId = await getNewsletterUserIdFromRequest(req);
  if (!userId) return reply({ error: 'Log ind for at vælge historier.' }, 401);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 5000) return reply({ error: 'Ugyldigt valg.' }, 400);
    body = JSON.parse(raw);
  } catch { return reply({ error: 'Ugyldigt valg.' }, 400); }
  if (!body || !/^[a-f0-9]{24}$/i.test(body.itemId || '') || !/^[a-f0-9]{64}$/i.test(body.payloadHash || '') ||
    !Number.isSafeInteger(body.revision) || body.revision < 0 || !['approved', 'rejected'].includes(body.decision)) {
    return reply({ error: 'Ugyldigt valg.' }, 400);
  }
  let feedback: string | undefined;
  try { feedback = body.feedback === undefined ? undefined : parseEditorialFeedback(body.feedback); }
  catch { return reply({ error: 'Kommentaren skal være tekst på højst 500 tegn.' }, 400); }
  try {
    return reply(await decideDelivery({ itemId: body.itemId, payloadHash: body.payloadHash,
      revision: body.revision, decision: body.decision, ...(feedback === undefined ? {} : { feedback }) }, userId));
  } catch (error) {
    return error instanceof DeliveryDecisionConflict ? reply({ error: error.message }, 409) :
      reply({ error: 'Valget kunne ikke bekræftes. Opdater listen, før du prøver igen.' }, 503);
  }
}
