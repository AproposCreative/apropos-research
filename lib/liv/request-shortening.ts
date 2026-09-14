import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { readLivShorteningBaseline } from './shortening-baseline';
import { readDeliveryPayload } from './delivery-store';
import { samePresentationBody } from './presentation-revision';
import { prepareLivShorteningProposal, shorteningProposalInput } from './shortening-proposal';
import type { GeneratedArticle } from './generate-article';

/** Authenticated owner route only. Preview generation is not CMS acceptance. */
export async function requestLivShortening(value: unknown) {
  const input = shorteningProposalInput.parse(value);
  const db = getAdminDb(); if (!db) throw new Error('liv_shortening_store_unavailable');
  const id = cmsFieldHash({ itemId: input.itemId, requestId: input.requestId });
  const saved = (await db.collection('livShorteningProposals').doc(id).get()).data();
  if (saved) {
    if (!saved.input || cmsFieldHash(saved.input) !== cmsFieldHash(input) || !saved.article)
      throw new Error('liv_shortening_request_conflict');
    // Retrieval of already-paid work must survive a later queue/CMS change.
    // It remains only a preview. Accepting it will require fresh hash checks.
    if (saved.proposal || typeof saved.rawResponse === 'string') return prepareLivShorteningProposal(input, saved.article);
    if (saved.status !== 'not_started' || saved.providerAttempted !== false || saved.notStartedReason !== 'cost_denied')
      throw new Error('liv_shortening_requires_reconciliation');
  }
  const baseline = await readLivShorteningBaseline(input.itemId);
  if (baseline.expectedPayloadHash !== input.expectedPayloadHash || baseline.expectedCmsHash !== input.expectedCmsHash)
    throw new Error('liv_shortening_version_changed');
  if (input.targetWords < baseline.minTargetWords || input.targetWords > baseline.maxTargetWords)
    throw new Error('liv_shortening_target_invalid');
  const expected = await readDeliveryPayload(input.itemId);
  if (cmsFieldHash({ ...expected }) !== input.expectedPayloadHash) throw new Error('liv_shortening_payload_changed');
  const docs = await db.collection('livDailyArticles').where('webflowItemId', '==', input.itemId).limit(10).get();
  const rows = docs.docs.map(doc => doc.data());
  if (!rows.length || rows.length >= 10 || rows.some(row => row.status !== 'draft' || !row.articleCheckpoint ||
    row.articleCheckpoint.title !== expected.title ||
    !row.preparationProof || row.preparationProof.editorialPassed !== true || row.preparationProof.structurePassed !== true ||
    row.preparationProof.hash !== input.expectedPayloadHash || !row.preparationProof.expected ||
    cmsFieldHash(row.preparationProof.expected) !== input.expectedPayloadHash ||
    !samePresentationBody(row.articleCheckpoint.content, expected.content))) throw new Error('liv_shortening_checkpoint_changed');
  const article = rows[0].articleCheckpoint as GeneratedArticle;
  if (rows.some(row => cmsFieldHash(row.articleCheckpoint) !== cmsFieldHash(article as unknown as Record<string, unknown>)))
    throw new Error('liv_shortening_checkpoint_conflict');
  if (saved && cmsFieldHash(saved.article) !== cmsFieldHash(article as unknown as Record<string, unknown>))
    throw new Error('liv_shortening_checkpoint_changed');
  return prepareLivShorteningProposal(input, article);
}
