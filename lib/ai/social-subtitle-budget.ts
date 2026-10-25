import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
import { providerHoldRef } from '@/lib/ai/provider-hold';

/** Owner-approved, one-time SoMe allowance. Separate from the manual Writer budget. */
export const SOCIAL_SUBTITLE_LIMIT_DKK_MICROS = 10_000_000;
export const SOCIAL_SUBTITLE_MODEL = 'gpt-6-luna';
const VERSION = 'social-subtitle-ai-v1';
const BUDGET_ID = 'social-subtitle-10dkk-2026-10-25-v1';
const MAX_OUTPUT_TOKENS = 512;

export type SocialSubtitleInput = { articleId: string; title: string; subtitle: string; size: 'square' | 'story' };
export type SocialSubtitleClaim =
  | { state: 'ready'; candidates: string[] }
  | { state: 'pending' }
  | { state: 'failed'; reason: string }
  | { state: 'ambiguous' }
  | { state: 'reserved'; key: string };

function database() {
  const db = getAdminDb();
  if (!db) throw new Error('social_subtitle_store_unavailable');
  return db;
}

export function socialSubtitleKey(input: SocialSubtitleInput) {
  return createHash('sha256').update(JSON.stringify([VERSION, input.articleId, input.title, input.subtitle, input.size])).digest('hex');
}

/** Byte count plus protocol overhead bounds input tokens; double current Standard
 * Luna list prices, then use a 12 DKK/USD ceiling. These are reservations, not
 * provider invoices. Source: developers.openai.com/api/docs/models/gpt-6-luna,
 * checked 2026-10-25 ($0.10/$0.50 per million input/output tokens).
 */
export function socialSubtitleQuoteDkkMicros(prompt: string) {
  const inputTokens = Buffer.byteLength(prompt, 'utf8') + 2048;
  const usdMicros = Math.ceil(inputTokens * 0.10 + MAX_OUTPUT_TOKENS * 0.50);
  return Math.ceil(usdMicros * 12 * 2);
}

export async function claimSocialSubtitle(input: SocialSubtitleInput, uid: string, prompt: string): Promise<SocialSubtitleClaim> {
  assertPaidAiAllowed();
  const db = database(), key = socialSubtitleKey(input);
  const cacheRef = db.collection('socialSubtitleAI').doc(key);
  const budgetRef = db.collection('aiExecutionPolicies').doc(BUDGET_ID);
  const holdRef = providerHoldRef(db);
  const amount = socialSubtitleQuoteDkkMicros(prompt);
  if (!Number.isSafeInteger(amount) || amount <= 0 || amount > SOCIAL_SUBTITLE_LIMIT_DKK_MICROS) throw new Error('social_subtitle_quote_invalid');
  return db.runTransaction(async tx => {
    const [cacheSnap, budgetSnap, holdSnap] = await Promise.all([tx.get(cacheRef), tx.get(budgetRef), tx.get(holdRef)]);
    const cache = cacheSnap.data();
    if (cache?.status === 'ready' && Array.isArray(cache.candidates) && cache.candidates.every((x: unknown) => typeof x === 'string')) {
      return { state: 'ready', candidates: cache.candidates };
    }
    // A crashed function cannot silently purchase another call. The original
    // upper-bound reservation remains in the lifetime budget for reconciliation.
    if (cache?.status === 'pending') {
      const created = typeof cache.createdAt === 'string' ? Date.parse(cache.createdAt) : NaN;
      return { state: Number.isFinite(created) && created >= Date.now() - 120_000 ? 'pending' : 'ambiguous' };
    }
    if (cache) return { state: 'failed', reason: typeof cache.failure === 'string' ? cache.failure : 'unknown' };
    if (holdSnap.data()?.blocked === true) throw new Error('social_subtitle_provider_hold');
    const old = budgetSnap.data();
    const used = old?.usedUpperDkkMicros ?? 0;
    if (old && (old.id !== BUDGET_ID || old.mode !== VERSION || old.limitDkkMicros !== SOCIAL_SUBTITLE_LIMIT_DKK_MICROS ||
      !Number.isSafeInteger(used) || used < 0 || used > SOCIAL_SUBTITLE_LIMIT_DKK_MICROS || !Number.isSafeInteger(old.calls) || old.calls < 0)) {
      throw new Error('social_subtitle_budget_invalid');
    }
    if (old?.blocked === true) throw new Error('social_subtitle_provider_unavailable');
    if (used + amount > SOCIAL_SUBTITLE_LIMIT_DKK_MICROS) throw new Error('social_subtitle_budget_exceeded');
    const now = new Date().toISOString();
    tx.set(budgetRef, { id: BUDGET_ID, mode: VERSION, limitDkkMicros: SOCIAL_SUBTITLE_LIMIT_DKK_MICROS,
      usedUpperDkkMicros: used + amount, calls: (old?.calls ?? 0) + 1,
      blocked: old?.blocked ?? false, activatedAt: old?.activatedAt ?? now,
      activatedBy: old?.activatedBy ?? uid, pricingSource: 'https://developers.openai.com/api/docs/models/gpt-6-luna',
      priceCheckedAt: '2026-10-25', usdToDkkCeiling: 12, priceMultiplier: 2, updatedAt: now });
    tx.create(cacheRef, { status: 'pending', articleId: input.articleId, size: input.size,
      model: SOCIAL_SUBTITLE_MODEL, reservedUpperDkkMicros: amount, createdAt: now, createdBy: uid });
    return { state: 'reserved', key };
  });
}

/** A timed-out/ambiguous call remains charged at its full upper bound and is not
 * automatically replayed. A provider response may still complete this key. */
export async function finishSocialSubtitle(key: string, candidates: string[] | null,
  usage?: { prompt_tokens?: number; completion_tokens?: number } | null, failure?: string) {
  const db = database(), ref = db.collection('socialSubtitleAI').doc(key);
  await db.runTransaction(async tx => {
    const snap = await tx.get(ref);
    if (snap.data()?.status !== 'pending') return;
    tx.update(ref, { status: candidates?.length ? 'ready' : 'failed',
      ...(candidates?.length ? { candidates } : {}),
      ...(!candidates?.length ? { failure: failure ?? 'unknown' } : {}),
      ...(usage && Number.isSafeInteger(usage.prompt_tokens) && Number.isSafeInteger(usage.completion_tokens)
        ? { usage: { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } } : {}),
      completedAt: new Date().toISOString() });
  });
}

export const SOCIAL_SUBTITLE_MAX_OUTPUT_TOKENS = MAX_OUTPUT_TOKENS;
