import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { currentLivCostContext } from '@/lib/liv/cost-context';
import { getLivCostPretransportError } from '@/lib/liv/cost-errors';
import type { ResearchResult } from './types';

/** Saved discovery is not verified evidence. Downstream source retrieval, dates
 * and factual validation still run. No cross-user or cross-story cache. */
export async function savedResearch(identity: unknown, search: () => Promise<ResearchResult>): Promise<ResearchResult> {
  const context = currentLivCostContext();
  if (!context) return search();
  const db = getAdminDb();
  if (!db) throw new Error('research_store_unavailable');
  const id = createHash('sha256').update(JSON.stringify(['research-v1', context.scope ?? 'liv',
    context.storyId ?? context.runId, context.contentVersion ?? null, identity])).digest('hex');
  const ref = db.collection('aiSavedResearch').doc(id);
  const saved = await db.runTransaction(async tx => {
    const row = (await tx.get(ref)).data();
    if (row?.status === 'complete' && row.result && typeof row.result.contextText === 'string' &&
      Array.isArray(row.result.sources) && row.result.sources.every((s: ResearchResult['sources'][number]) => s &&
        typeof s.title === 'string' && (s.url === null || typeof s.url === 'string') &&
        typeof s.source === 'string' && typeof s.snippet === 'string') && row.result.debug &&
      ['openai_responses', 'legacy_web_search'].includes(row.result.debug.provider)) return row.result as ResearchResult;
    if (row && !(row.status === 'not_started' && row.providerAttempted === false && !row.result)) {
      throw new Error('research_requires_reconciliation');
    }
    tx.set(ref, { status: 'started', runId: context.runId, startedAt: new Date().toISOString() });
    return null;
  });
  if (saved) return saved;
  let result: ResearchResult;
  try { result = await search(); }
  catch (error) {
    if (getLivCostPretransportError(error)) await ref.set({ status: 'not_started', providerAttempted: false }, { merge: true });
    // Unknown outcomes remain started: never buy the same search a second time.
    throw error;
  }
  const complete = JSON.parse(JSON.stringify({ status: 'complete', result, completedAt: new Date().toISOString() }));
  // Retry persistence only. No network/model search is repeated.
  for (let attempt = 0; ; attempt++) {
    try { await ref.set(complete, { merge: true }); return result; }
    catch (error) { if (attempt === 2) throw error; }
  }
}
