import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { shorteningProposalInput } from './shortening-proposal';
import { buildLivShorteningCandidate } from './shortening-candidate';
import { readLivShorteningBaseline } from './shortening-baseline';

export const shorteningReviewInput = shorteningProposalInput.extend({
  candidateHash: z.string().regex(/^[a-f0-9]{64}$/),
  reviewedFactsAndMeaning: z.literal(true),
}).strict();

/** Records an explicit human review of one exact preview. Not CMS acceptance,
 * not an automatic model verdict and not authorization for a later changed body.
 * Only a verified owner route may supply actorUid, never request JSON. */
export async function recordLivShorteningReview(value: unknown, actorUid: string) {
  const parsed = shorteningReviewInput.safeParse(value);
  if (!parsed.success || !actorUid || actorUid.length > 128) throw new Error('liv_shortening_review_invalid');
  const input = parsed.data;
  const proposalInput = shorteningProposalInput.parse({ itemId: input.itemId, requestId: input.requestId,
    expectedPayloadHash: input.expectedPayloadHash, expectedCmsHash: input.expectedCmsHash, targetWords: input.targetWords });
  const db = getAdminDb(); if (!db) throw new Error('liv_shortening_store_unavailable');
  const id = cmsFieldHash({ itemId: input.itemId, requestId: input.requestId });
  const proposalRef = db.collection('livShorteningProposals').doc(id);
  const reviewRef = db.collection('livShorteningReviews').doc(id);
  const identityHash = cmsFieldHash({ input, actorUid });
  const prior = (await reviewRef.get()).data();
  if (prior) {
    if (prior.identityHash !== identityHash) throw new Error('liv_shortening_review_conflict');
    return prior.receipt;
  }
  const baseline = await readLivShorteningBaseline(input.itemId);
  if (baseline.expectedCmsHash !== input.expectedCmsHash || baseline.expectedPayloadHash !== input.expectedPayloadHash)
    throw new Error('liv_shortening_version_changed');
  return db.runTransaction(async tx => {
    const saved = (await tx.get(proposalRef)).data();
    const existing = (await tx.get(reviewRef)).data();
    if (existing) {
      if (existing.identityHash !== identityHash) throw new Error('liv_shortening_review_conflict');
      return existing.receipt;
    }
    if (!saved?.article || !saved.proposal || saved.status !== 'preview' ||
      cmsFieldHash(saved.input || {}) !== cmsFieldHash(proposalInput) ||
      saved.inputHash !== cmsFieldHash({ input: proposalInput, article: saved.article }) ||
      saved.finishReason !== 'stop' || saved.refusal !== false || typeof saved.rawResponse !== 'string')
      throw new Error('liv_shortening_review_not_ready');
    let patches: unknown;
    try { patches = JSON.parse(saved.rawResponse); } catch { throw new Error('liv_shortening_candidate_invalid'); }
    const rebuilt = buildLivShorteningCandidate(saved.article, input.targetWords, patches);
    if (rebuilt.content !== saved.proposal.content || input.candidateHash !== cmsFieldHash({ content: rebuilt.content }) ||
      saved.proposal.candidateHash !== input.candidateHash) throw new Error('liv_shortening_candidate_changed');
    const reviewedAt = new Date().toISOString();
    const receipt = { status: 'shortening_review_recorded' as const, itemId: input.itemId,
      proposalId: id, candidateHash: input.candidateHash, reviewedAt, publicationReady: false as const,
      cmsChanged: false as const };
    tx.create(reviewRef, { identityHash, input, actorUid, reviewedAt,
      kind: 'explicit-human-review', scope: 'facts-and-meaning-of-exact-shortened-preview',
      originalInputHash: saved.inputHash, originalChecksPreserved: true,
      modelVerified: false, receipt });
    return receipt;
  });
}
