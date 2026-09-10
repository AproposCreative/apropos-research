import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { readDeliveryState, readDeliveryPayload, decideDelivery, DeliveryDecisionConflict } from '@/lib/liv/delivery-store';
import { copenhagenClock } from '@/lib/liv/delivery-policy';
import { approvalEntries, approvalStory, APPROVAL_PAGE_SIZE } from '@/lib/liv/approval-feed';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

const headers = { 'Cache-Control': 'private, no-store' };
const reply = (body: object, status = 200) => NextResponse.json(body, { status, headers });
export async function GET(req: NextRequest) {
  if (!await getNewsletterUserIdFromRequest(req)) return reply({ error: 'Log ind for at se Livs historier.' }, 401);
  const offset = Number(req.nextUrl.searchParams.get('offset') || 0);
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100) return reply({ error: 'Ugyldig side.' }, 400);
  const queueEnabled = process.env.LIV_DELIVERY_QUEUE_ENABLED === 'true';
  const preparationEnabled = process.env.LIV_DELIVERY_PREPARE_ENABLED === 'true';
  if (!queueEnabled && !preparationEnabled) return reply({ stories: [], total: 0, nextOffset: null, queueEnabled, preparationEnabled });
  try {
    const entries = approvalEntries(await readDeliveryState(), copenhagenClock().day);
    const stories = await Promise.all(entries.slice(offset, offset + APPROVAL_PAGE_SIZE).map(async entry => {
      const payload = await readDeliveryPayload(entry.itemId);
      if (cmsFieldHash(payload as unknown as Record<string, unknown>) !== entry.payloadHash) throw new Error('changed');
      return approvalStory(entry, payload);
    }));
    return reply({ stories, total: entries.length, nextOffset: offset + APPROVAL_PAGE_SIZE < entries.length ? offset + APPROVAL_PAGE_SIZE : null,
      queueEnabled, preparationEnabled });
  } catch { return reply({ error: 'Historierne kunne ikke hentes. Prøv igen; dine gemte valg er ikke ændret.' }, 503); }
}
export async function POST(req: NextRequest) {
  const userId = await getNewsletterUserIdFromRequest(req);
  if (!userId) return reply({ error: 'Log ind for at vælge historier.' }, 401);
  let body;
  try {
    const raw = await req.text();
    if (raw.length > 2000) return reply({ error: 'Ugyldigt valg.' }, 400);
    body = JSON.parse(raw);
  } catch { return reply({ error: 'Ugyldigt valg.' }, 400); }
  if (!body || !/^[a-f0-9]{24}$/i.test(body.itemId || '') || !/^[a-f0-9]{64}$/i.test(body.payloadHash || '') ||
    !Number.isSafeInteger(body.revision) || body.revision < 0 || !['approved', 'rejected'].includes(body.decision)) {
    return reply({ error: 'Ugyldigt valg.' }, 400);
  }
  try {
    return reply(await decideDelivery({ itemId: body.itemId, payloadHash: body.payloadHash,
      revision: body.revision, decision: body.decision }, userId));
  } catch (error) {
    return error instanceof DeliveryDecisionConflict ? reply({ error: error.message }, 409) :
      reply({ error: 'Valget kunne ikke bekræftes. Opdater listen, før du prøver igen.' }, 503);
  }
}
