import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { addDays, copenhagenClock, validDay } from './delivery-policy';
import { cmsFieldHash } from './cms-field-hash';
import { loadRecoverableWritingBrief } from './source-archive';
import { parseLivArticleOutput } from './article-output';

const hash = (text: string) => createHash('sha256').update(text).digest('hex');
export const savedWritingEditInput = z.object({
  target: z.literal('saved-writing'), requestId: z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  dayKey: z.string().refine(validDay), scope: z.enum(['reserve', 'prepare', 'prepare-alternative']),
  writingRunId: z.uuid(), expectedRawHash: z.string().regex(/^[a-f0-9]{64}$/),
  reason: z.string().trim().min(10).max(500),
  replacement: z.object({ title: z.string().trim().min(1).max(120), subtitle: z.string().trim().min(1).max(300),
    intro: z.string().trim().min(1).max(3000), content: z.string().trim().min(100).max(20000) }).strict(),
}).strict();

/** One explicit operator copyedit of retained pre-checkpoint writing. No model,
 * CMS, ready admission, human approval or retry grant. The ordinary retry API
 * must re-fetch sources and run all checks on the edited text afterwards. */
export async function editSavedLivWriting(value: unknown, lease: string, now = Date.now()) {
  const input = savedWritingEditInput.parse(value);
  const today = copenhagenClock(new Date(now)).day;
  if (input.scope === 'reserve' ? input.dayKey !== today : input.dayKey < today || input.dayKey > addDays(today, 7)) {
    throw Error('liv_edit_invalid');
  }
  const db = getAdminDb(); if (!db) throw Error('liv_edit_store_unavailable');
  const runId = `${input.scope}-${input.dayKey}`, run = db.collection('livDailyArticles').doc(runId);
  const receipt = run.collection('savedWritingEdits').doc(input.requestId), inputHash = cmsFieldHash(input);
  const previous = (await receipt.get()).data();
  if (previous) {
    if (previous.inputHash !== inputHash) throw Error('liv_edit_conflict');
    return { status: 'already_edited', runId, writingRunId: previous.writingRunId };
  }
  const initial = (await run.get()).data();
  if (!initial?.topic) throw Error('liv_edit_conflict');
  const brief = await loadRecoverableWritingBrief('liv-daily', initial.topic, input.writingRunId);
  if (brief.finishReason !== 'stop' || brief.refusal || hash(brief.rawResponse) !== input.expectedRawHash) throw Error('liv_edit_conflict');
  const original = parseLivArticleOutput(brief.rawResponse, brief.articleFormat || 'article');
  const rawResponse = JSON.stringify({ ...original, ...input.replacement });
  parseLivArticleOutput(rawResponse, brief.articleFormat || 'article');
  if (cmsFieldHash(input.replacement) === cmsFieldHash(Object.fromEntries(Object.keys(input.replacement).map(k => [k, original[k as keyof typeof original]])))) {
    throw Error('liv_edit_invalid');
  }
  const desk = db.collection('livSourceArchives').doc(hash('liv-daily'));
  const parent = desk.collection('runs').doc(input.writingRunId);
  const pointer = desk.collection('topics').doc(hash(initial.topic.toLocaleLowerCase('da').replace(/[^\p{L}\p{N}]+/gu, ' ').trim()));
  const writingRunId = randomUUID(), child = desk.collection('runs').doc(writingRunId);
  return db.runTransaction(async tx => {
    const manifest = (await tx.get(db.collection('livDelivery').doc('manifest'))).data();
    const row = (await tx.get(run)).data(), old = (await tx.get(receipt)).data();
    if (old) {
      if (old.inputHash !== inputHash) throw Error('liv_edit_conflict');
      return { status: 'already_edited', runId, writingRunId: old.writingRunId };
    }
    const saved = (await tx.get(parent)).data(), topic = (await tx.get(pointer)).data();
    if (manifest?.preparation?.token !== lease || !Number.isFinite(manifest.preparation.leaseUntil) ||
      manifest.preparation.leaseUntil <= now) throw Error('liv_edit_lease_lost');
    if (manifest.coverRevision || Object.values(manifest.slots || {}).some((s: any) => s.state === 'attempted')) throw Error('liv_edit_delivery_hold');
    if (!row || row.status !== 'failed' || row.topic !== initial.topic || row.operatorWritingEdit || row.retryAuthorization || row.continuationReady ||
      row.articleCheckpoint || row.articleCheckpointHash || row.webflowItemId || row.preparationProof || row.cmsSaveStarted ||
      !/^source_similarity_(unapproved|incomplete):/.test(row.reason || '') ||
      topic?.latestBrief?.runId !== input.writingRunId || !saved || saved.rawResponse !== brief.rawResponse ||
      saved.writerText !== brief.writerText || saved.model !== brief.model || saved.voiceVersion !== brief.voiceVersion ||
      saved.articleFormat !== brief.articleFormat || saved.finishReason !== brief.finishReason ||
      saved.refusal !== brief.refusal || saved.parentRunId !== brief.parentRunId ||
      cmsFieldHash({ sources: saved.sources }) !== cmsFieldHash({ sources: brief.sources })) throw Error('liv_edit_conflict');
    const editedAt = new Date(now).toISOString();
    const edited: Record<string, unknown> = { ...saved, runId: writingRunId, parentRunId: input.writingRunId, rawResponse,
      status: 'not_verified', missingEvidence: [], createdAt: editedAt, recordedAt: editedAt,
      textHash: hash(saved.writerText),
      operatorEdit: { requestId: input.requestId, authority: 'cron-authenticated-operator', inputHash, reason: input.reason,
        originalRawHash: input.expectedRawHash, editedRawHash: hash(rawResponse), publicationApproval: false } };
    // Token usage belongs to the preserved parent provider response, not this free edit.
    delete edited.tokenUsage;
    tx.create(child, edited);
    tx.set(pointer, { latestBrief: edited }, { merge: true });
    tx.create(receipt, { input, inputHash, runId, writingRunId, previousWritingRunId: input.writingRunId,
      previousRun: row, editedAt, publicationApproval: false });
    tx.set(run, { operatorWritingEdit: { requestId: input.requestId, writingRunId, editedAt } }, { merge: true });
    return { status: 'edited', runId, writingRunId };
  });
}
