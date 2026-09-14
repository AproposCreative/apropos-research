import { randomUUID } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { shorteningReviewInput } from './shortening-review';
import { shorteningProposalInput } from './shortening-proposal';
import { buildLivShorteningCmsPatch } from './shortening-cms-patch';
import { livImageArticleHash } from './article-image-hash';
import { readLivWebflowJson, inspectLivCmsDraft } from './cms-readback';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { patchArticleFieldDataForLocale } from '@/lib/webflow/locale-items';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import type { DeliveryState } from './delivery-policy';
import type { GeneratedArticle } from './generate-article';
import type { PreparationProof } from './prepared-admission';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const hash = (value: object) => cmsFieldHash(value as Record<string, unknown>);
const fail = (reason: string): never => { throw new Error(`liv_shortening_${reason}`); };
type Row = Record<string, unknown> & { articleCheckpoint: GeneratedArticle; preparationProof: PreparationProof };

/** Accept only an already recorded review by this owner. Never publishes, calls
 * a model, invents a review, or repeats an ambiguous external write. */
export async function acceptLivShortening(value: unknown, actorUid: string) {
  const parsed = shorteningReviewInput.safeParse(value);
  if (!parsed.success || !actorUid || actorUid.length > 128) return fail('invalid');
  const input = parsed.data, db = getAdminDb();
  if (!db) return fail('store_unavailable');
  const proposalInput = shorteningProposalInput.parse({ itemId: input.itemId, requestId: input.requestId,
    expectedPayloadHash: input.expectedPayloadHash, expectedCmsHash: input.expectedCmsHash, targetWords: input.targetWords });
  const id = hash({ itemId: input.itemId, requestId: input.requestId });
  const identityHash = hash({ input, actorUid }), owner = randomUUID();
  const ref = db.collection('livShorteningAcceptances').doc(id);
  const auditRef = db.collection('livShorteningAudits').doc(id);
  const manifestRef = db.collection('livDelivery').doc('manifest');
  const payloadRef = db.collection('livDelivery').doc(`item-${input.itemId}`);
  const locale = cmsLocaleIdFor('da'), collection = getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!locale || !collection) return fail('configuration');
  const path = `collections/${collection}/items/${input.itemId}?cmsLocaleId=${locale}`;
  const draft = (cms: Record<string, unknown>) => cms.id === input.itemId && cms.cmsLocaleId === locale &&
    cms.isDraft === true && !cms.isArchived && cms.lastPublished == null;
  const lease = await acquireCmsWriteLease(input.itemId, 'da');
  try {
    const prior = (await ref.get()).data();
    if (prior && prior.identityHash !== identityHash) return fail('request_conflict');
    if (prior?.receipt) return prior.receipt;
    const cms = await readLivWebflowJson(path);
    if (!draft(cms)) return fail('not_unpublished_draft');
    const schema = await readLivWebflowJson(`collections/${collection}`);
    const schemaSlugs = Array.isArray(schema.fields) ? schema.fields.map((f: { slug: string }) => f.slug) : [];
    const baseline = await db.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      const audit = (await tx.get(auditRef)).data();
      const proposal = (await tx.get(db.collection('livShorteningProposals').doc(id))).data();
      const review = (await tx.get(db.collection('livShorteningReviews').doc(id))).data();
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      const payload = (await tx.get(payloadRef)).data() as { expected: WebflowArticleFields; payloadHash: string };
      const docs = await tx.get(db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10));
      const rows = docs.docs.map(doc => ({ id: doc.id, row: doc.data() as Row }));
      if (latest && latest.identityHash !== identityHash) return fail('request_conflict');
      if (latest?.receipt) return { completed: latest.receipt };
      if (latest?.leaseUntil > Date.now()) return fail('busy');
      const entry = state?.entries.find(e => e.itemId === input.itemId);
      if (!entry || entry.state !== 'ready' || entry.decision === 'rejected' ||
        state.slots[entry.scheduledDay] || Object.values(state.slots).some(s => s.itemId === input.itemId) ||
        (state.preparation && state.preparation.leaseUntil > Date.now()) ||
        (state.coverRevision && state.coverRevision.id !== id)) return fail('not_ready');
      if (!review || review.identityHash !== identityHash || review.kind !== 'explicit-human-review' ||
        review.modelVerified !== false || review.actorUid !== actorUid || hash(review.input || {}) !== hash(input) ||
        review.receipt?.candidateHash !== input.candidateHash) return fail('review_required');
      if (!payload?.expected || payload.payloadHash !== input.expectedPayloadHash ||
        hash(payload.expected) !== input.expectedPayloadHash || entry.payloadHash !== input.expectedPayloadHash) return fail('payload_changed');
      let pinned = audit;
      if (!latest) {
        if (hash(cms.fieldData as object) !== input.expectedCmsHash || !proposal?.article ||
          proposal.status !== 'preview' || proposal.finishReason !== 'stop' || proposal.refusal !== false ||
          proposal.inputHash !== hash({ input: proposalInput, article: proposal.article }) ||
          hash(proposal.input || {}) !== hash(proposalInput) || review.originalInputHash !== proposal.inputHash ||
          proposal.proposal?.candidateHash !== input.candidateHash ||
          !rows.length || rows.length >= 10 || rows.some(({ row }) => row.status !== 'draft' ||
            !row.articleCheckpoint || hash(row.articleCheckpoint) !== hash(proposal.article) ||
            row.preparationProof?.hash !== input.expectedPayloadHash ||
            hash(row.preparationProof.expected) !== input.expectedPayloadHash ||
            row.preparationProof.editorialPassed !== true || row.preparationProof.structurePassed !== true)) return fail('checkpoint_changed');
        let edits: unknown;
        try { edits = JSON.parse(proposal.rawResponse); } catch { return fail('candidate_invalid'); }
        const change = buildLivShorteningCmsPatch({ article: proposal.article, expected: payload.expected,
          cmsFields: cms.fieldData as Record<string, unknown>, targetWords: input.targetWords, edits,
          reviewedCandidateHash: input.candidateHash, schemaSlugs });
        pinned = { identityHash, input, review, proposal, cms, payload, rows, entry, change, createdAt: new Date().toISOString() };
        tx.create(auditRef, pinned);
      } else if (!audit || audit.identityHash !== identityHash || state.coverRevision?.id !== id) return fail('audit_invalid');
      state.coverRevision = { id, itemId: input.itemId, day: entry.scheduledDay };
      tx.set(manifestRef, state);
      tx.set(ref, { ...latest, identityHash, owner, leaseUntil: Date.now() + 330000, status: 'processing' });
      return { audit: pinned!, patchStarted: !!latest?.patchStarted };
    });
    if (baseline.completed) return baseline.completed;
    const audit = baseline.audit!, change = audit.change;
    const expectedFields = { ...audit.cms.fieldData, ...change.patch };
    const save = async (patch: Record<string, unknown>) => db.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      if (latest?.owner !== owner || latest.leaseUntil <= Date.now() || state?.coverRevision?.id !== id) return fail('hold_lost');
      tx.set(ref, { ...latest, ...patch });
    });
    if (!baseline.patchStarted) {
      const fresh = await readLivWebflowJson(path);
      if (!draft(fresh) || hash(fresh.fieldData as object) !== input.expectedCmsHash) return fail('cms_changed');
      await lease.assertOwned();
      await save({ patchStarted: true });
      await patchArticleFieldDataForLocale(input.itemId, change.patch, locale);
    }
    const after = await readLivWebflowJson(path);
    if (!draft(after) || hash(after.fieldData as object) !== hash(expectedFields)) return fail('readback_pending');
    const inspection = await inspectLivCmsDraft({ itemId: input.itemId, expected: change.expected });
    await save({ inspection });
    if (!inspection.draftConfirmed || !inspection.publicationReady || !inspection.checks.length ||
      inspection.checks.some(c => !c.ok) || inspection.fieldDataHash !== hash(expectedFields)) return fail('inspection_failed');
    await lease.assertOwned();
    const final = await readLivWebflowJson(path);
    if (!draft(final) || hash(final.fieldData as object) !== hash(expectedFields)) return fail('cms_changed');
    const receipt = { status: 'shortening_staged', itemId: input.itemId, revisionId: id,
      candidateHash: input.candidateHash, wordCount: change.expected.wordCount, payloadHash: hash(change.expected),
      fieldDataHash: inspection.fieldDataHash, publicationVerified: false, checkedAt: new Date().toISOString() };
    await db.runTransaction(async tx => {
      const latest = (await tx.get(ref)).data();
      const state = (await tx.get(manifestRef)).data() as DeliveryState;
      const payload = (await tx.get(payloadRef)).data();
      const docs = await tx.get(db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10));
      const rows = docs.docs.map(doc => ({ id: doc.id, row: doc.data() }));
      const entry = state?.entries.find(e => e.itemId === input.itemId);
      if (latest?.owner !== owner || latest.leaseUntil <= Date.now() || state?.coverRevision?.id !== id ||
        !entry || hash(entry) !== hash(audit.entry) || hash(payload || {}) !== hash(audit.payload) ||
        hash({ rows }) !== hash({ rows: audit.rows }) || state.slots[entry.scheduledDay] ||
        Object.values(state.slots).some(s => s.itemId === input.itemId)) return fail('conflict');
      for (const { id: runId, row } of audit.rows as { id: string; row: Row }[]) {
        const article = { ...row.articleCheckpoint, content: change.checkpointContent };
        if (article.selectedImage) article.selectedImage = { ...article.selectedImage, articleHash: livImageArticleHash(article) };
        tx.set(db.collection('livDailyArticles').doc(runId), { ...row, articleCheckpoint: article,
          articleCheckpointHash: livImageArticleHash(article), shorteningRevisionId: id,
          preparationProof: { ...row.preparationProof, expected: change.expected, hash: receipt.payloadHash,
            editorialRevision: { kind: 'explicit-human-review', reviewId: id, candidateHash: input.candidateHash,
              originalProofAuditId: id, modelVerified: false } } });
      }
      tx.set(payloadRef, { ...audit.payload, expected: change.expected, payloadHash: receipt.payloadHash, shorteningRevisionId: id });
      entry.payloadHash = receipt.payloadHash; entry.publicationBlockers = [];
      delete state.coverRevision;
      tx.set(manifestRef, state);
      tx.set(ref, { ...latest, receipt, status: 'staged', leaseUntil: 0 });
    });
    return receipt;
  } finally {
    await db.runTransaction(async tx => { const latest = (await tx.get(ref)).data();
      if (latest?.owner === owner && !latest.receipt) tx.set(ref, { ...latest, leaseUntil: 0 });
    }).catch(() => {});
    await lease.release();
  }
}
