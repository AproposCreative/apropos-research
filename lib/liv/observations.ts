import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { livImageArticleHash } from './article-image-hash';
import { addDays, copenhagenClock, validDay } from './delivery-policy';
import { observationInput, observationRunId, type ObservationReceipt, type ObservationBaseline } from './observation-contract';
import type { GeneratedArticle } from './generate-article';

export const observationFail = (reason: string): never => { throw Error(`liv_observation_${reason}`); };
export const observationKey = (runId: string, checkpointHash: string) => cmsFieldHash({ runId, checkpointHash });
export function observationCheckpoint(row: Record<string, any> | undefined) {
  const article = row?.articleCheckpoint as GeneratedArticle | undefined;
  if (!article || typeof article.title !== 'string' || typeof article.content !== 'string' ||
    !article.content.trim() || row?.articleCheckpointHash !== livImageArticleHash(article)) return observationFail('not_available');
  return { article, hash: cmsFieldHash(article as unknown as Record<string, unknown>) };
}
const editable = (row: Record<string, any>) => !row.webflowItemId && !row.cmsSaveStarted && !row.preparationProof &&
  ['processing', 'failed', 'skipped_factcheck', 'skipped_tov'].includes(row.status);

/** Bounded list of current saved work only. No research, credentials or raw model responses. */
export async function listObservationStories() {
  const db = getAdminDb(); if (!db) return observationFail('unavailable');
  const today = copenhagenClock().day;
  const ids = [-1, 0, 1].flatMap(offset => ['prepare','prepare-alternative','reserve','reserve-editorial']
    .map(scope => `${scope}-${addDays(today, offset)}`));
  const snapshots = await db.getAll(...ids.map(id => db.collection('livDailyArticles').doc(id)));
  return snapshots.flatMap(snapshot => {
    const row = snapshot.data();
    if (!row || !editable(row)) return [];
    try { const { article } = observationCheckpoint(row); return [{ runId: snapshot.id, title: article.title }]; }
    catch { return []; }
  });
}

export async function readObservationBaseline(runId: string, userId: string, witness: string): Promise<ObservationBaseline> {
  observationRunId.parse(runId);
  const db = getAdminDb(); if (!db) return observationFail('unavailable');
  return db.runTransaction(async tx => {
    const row = (await tx.get(db.collection('livDailyArticles').doc(runId))).data();
    const { article, hash } = observationCheckpoint(row);
    if (!row || !editable(row)) return observationFail('closed');
    const saved = (await tx.get(db.collection('livObservations').doc(observationKey(runId, hash)))).data();
    return { runId, checkpointHash: hash, title: article.title, content: article.content, intro: article.intro || '', witness,
      confirmed: (saved?.records as ObservationReceipt[] | undefined)?.find(record => record.userId === userId) || null };
  });
}

/** One immutable self-attestation per colleague/version. Neither a rewrite nor publication approval. */
export async function confirmObservation(value: unknown, userId: string, witness: string) {
  const input = observationInput.parse(value);
  if (!validDay(input.experiencedOn) || input.experiencedOn > copenhagenClock().day) return observationFail('invalid');
  const db = getAdminDb(); if (!db) return observationFail('unavailable');
  const key = observationKey(input.runId, input.expectedCheckpointHash);
  const ref = db.collection('livObservations').doc(key);
  return db.runTransaction(async tx => {
    const row = (await tx.get(db.collection('livDailyArticles').doc(input.runId))).data();
    const saved = (await tx.get(ref)).data();
    const records = (saved?.records || []) as ObservationReceipt[];
    const existing = records.find(record => record.userId === userId);
    if (existing) {
      const { userId: _uid, witness: _witness, confirmedAt: _at, ...previous } = existing;
      if (cmsFieldHash(previous) !== cmsFieldHash(input) || existing.witness !== witness) return observationFail('already_confirmed');
      return { status: 'confirmed' as const, receipt: existing }; // Idempotent even after publication.
    }
    const { article, hash } = observationCheckpoint(row);
    if (hash !== input.expectedCheckpointHash) return observationFail('changed');
    if (!row || !editable(row)) return observationFail('closed');
    if (records.length >= 3) return observationFail('limit');
    if (![article.intro || '', article.content].some(text => text.includes(input.articleQuote)) ||
      !input.articleQuote.includes(witness)) return observationFail('quote_mismatch');
    const receipt = { ...input, userId, witness, confirmedAt: new Date().toISOString() };
    const next = [...records, receipt].sort((a, b) => a.userId.localeCompare(b.userId));
    const evidence = { runId: input.runId, checkpointHash: hash, records: next };
    tx.set(ref, { ...evidence, evidenceHash: cmsFieldHash(evidence) });
    return { status: 'confirmed' as const, receipt };
  });
}
