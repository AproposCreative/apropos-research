import { imageGenRequestAccess } from '@/lib/image-gen/access';
import { getAdminDb } from '@/lib/firebase-admin';
import { IMAGE_GEN_LEDGER, readImageGenBudget } from '@/lib/image-gen/budget';
import { LIV_PRICE_VERSION, LIV_PRICE_REVIEW_AFTER } from '@/lib/liv/cost-pricing';
export const runtime = 'nodejs';
/** Explicit owner initialization of the approved separate budget. Never resets usage. */
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'private, no-store' };
  const access = await imageGenRequestAccess(request);
  if (!access) return Response.json({ error: 'Kun Frederik kan aktivere billedbudgettet.' }, { status: 403, headers });
  try {
    const body = await request.json();
    if (body.action !== 'initialize-budget' || body.monthlyLimitDkk !== 150) throw new Error('invalid');
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const policy = db.collection(IMAGE_GEN_LEDGER).doc('policy');
    await db.runTransaction(async tx => {
      const row = await tx.get(policy); if (row.exists) return;
      tx.create(policy, { monthlyLimitDkkMicros: 150_000_000, usdToDkkCeiling: 8,
        conversionBasis: 'Operational estimate at 8 DKK/USD including currency/billing margin; not a provider invoice or live FX quote.',
        priceVersion: LIV_PRICE_VERSION, validUntil: LIV_PRICE_REVIEW_AFTER,
        configuredBy: access.uid, configuredAt: new Date().toISOString() });
    });
    return Response.json(await readImageGenBudget(), { headers });
  } catch { return Response.json({ error: 'Billedbudgettet kunne ikke aktiveres. Intet forbrug er nulstillet.' }, { status: 409, headers }); }
}
