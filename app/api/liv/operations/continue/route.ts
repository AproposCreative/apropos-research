import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { claimPreparation, releasePreparation } from '@/lib/liv/delivery-store';
import { addDays, copenhagenClock, validDay } from '@/lib/liv/delivery-policy';
import { getLivDailyPlan, type LivDailyPlan } from '@/lib/liv/daily-plan-store';
import { LIV_DAILY_COLLECTION, livDailyDocId } from '@/lib/liv/daily-history-store';
import { canResumeLivPreparationCheckpoint } from '@/lib/liv/preparation-status';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
import { editorialPlanHash } from '@/lib/liv/rolling-plan';
import { runLivDaily } from '@/lib/liv/run-daily';

export const runtime = 'nodejs';
export const maxDuration = 300;
const inputSchema = z.object({ dayKey: z.string().refine(validDay), kind: z.literal('scheduled') }).strict();
const json = (body: unknown, status = 409) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Continue one yielded stage of an existing scheduled run. Never a start,
 * replan or retry grant; the shared runner consumes continuationReady. */
export async function POST(req: NextRequest) {
  const denied = requireCronBearer(req);
  if (denied) return denied;
  if (process.env.LIV_DELIVERY_PREPARE_ENABLED !== 'true' ||
    ['1', 'true'].includes((process.env.LIV_DAILY_PAUSED || '').toLowerCase())) return json({ error: 'liv_preparation_disabled' });
  let input: z.infer<typeof inputSchema>;
  try {
    if (req.nextUrl.search) throw new Error('invalid');
    const raw = await req.text();
    if (raw.length > 1000) throw new Error('invalid');
    input = inputSchema.parse(JSON.parse(raw));
    const today = copenhagenClock().day;
    if (input.dayKey < today || input.dayKey > addDays(today, 7)) throw new Error('invalid');
  } catch { return json({ error: 'liv_continue_invalid' }, 400); }
  let lease: string | null = null;
  try {
    lease = await claimPreparation();
    if (!lease) return json({ status: 'already_preparing' });
    const db = getAdminDb();
    if (!db) throw new Error('liv_continue_unavailable');
    const plan = await getLivDailyPlan(input.dayKey);
    if (!plan || plan.dayKey !== input.dayKey || !['pending', 'failed'].includes(plan.status)) throw new Error('liv_continue_conflict');
    await db.runTransaction(async tx => {
      const state = (await tx.get(db.collection('livDelivery').doc('manifest'))).data();
      const row = (await tx.get(db.collection(LIV_DAILY_COLLECTION).doc(livDailyDocId(input.dayKey, 'prepare')))).data();
      const currentPlan = (await tx.get(db.collection('livDailyPlan').doc(`plan-${input.dayKey}`))).data();
      if (!state?.preparation || state.preparation.token !== lease || !Number.isFinite(state.preparation.leaseUntil) ||
        state.preparation.leaseUntil <= Date.now()) throw new Error('liv_continue_conflict');
      if (state.coverRevision || state.slots?.[input.dayKey] || Object.values(state.slots || {}).some(slot =>
        (slot as { state?: unknown })?.state === 'attempted')) throw new Error('liv_continue_hold');
      if (!currentPlan || currentPlan.dayKey !== input.dayKey || currentPlan.status !== plan.status ||
        editorialPlanHash(currentPlan as LivDailyPlan) !== editorialPlanHash(plan)) throw new Error('liv_continue_conflict');
      const article = row?.articleCheckpoint;
      if (!row || row.dayKey !== input.dayKey || row.status !== 'processing' || row.continuationReady !== true ||
        !canResumeLivPreparationCheckpoint(row) || row.retryAuthorization || row.webflowItemId || row.preparationProof ||
        row.cmsSaveStarted || !article || !['title', 'slug', 'intro', 'content'].every(key => typeof article[key] === 'string') ||
        !article.title.trim() || !article.content.trim() || row.articleCheckpointHash !== livImageArticleHash(article)) {
        throw new Error('liv_continue_conflict');
      }
    });
    const result = await runLivDaily(req, { dayKey: input.dayKey, kind: 'scheduled', defaultPlan: plan });
    const body = await result.json();
    const stages = ['text_prepared', 'facts_revised', 'research_supplemented', 'media_prepared'];
    // Do not forward provider errors, article text, source bodies or gate internals.
    const status = result.ok && body.queued === true ? 'ready' : result.ok && stages.includes(body.status)
      ? body.status : 'blocked_saved_work';
    return json({ status, dayKey: input.dayKey }, status === 'blocked_saved_work' ? (result.ok ? 409 : 503) : 200);
  } catch (error) {
    const code = error instanceof Error && ['liv_continue_conflict', 'liv_continue_hold', 'liv_continue_unavailable'].includes(error.message)
      ? error.message : 'liv_continue_failed';
    return json({ error: code }, ['liv_continue_unavailable', 'liv_continue_failed'].includes(code) ? 503 : 409);
  } finally { if (lease) await releasePreparation(lease).catch(() => {}); }
}
