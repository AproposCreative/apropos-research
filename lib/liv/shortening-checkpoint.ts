import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from './cms-field-hash';
import { readDeliveryPayload } from './delivery-store';
import { samePresentationBody } from './presentation-revision';
import type { GeneratedArticle } from './generate-article';

/** Shared checkpoint validation for existing paid proposals and external ones.
 * Callers must first validate the current ready-entry/CMS baseline. */
export async function readLivShorteningCheckpoint(itemId: string, expectedPayloadHash: string) {
  const db = getAdminDb(); if (!db) throw Error('liv_shortening_store_unavailable');
  const expected = await readDeliveryPayload(itemId);
  if (cmsFieldHash({ ...expected }) !== expectedPayloadHash) throw Error('liv_shortening_payload_changed');
  const docs = await db.collection('livDailyArticles').where('webflowItemId', '==', itemId).limit(10).get();
  const rows = docs.docs.map(doc => doc.data());
  if (!rows.length || rows.length >= 10 || rows.some(row => row.status !== 'draft' || !row.articleCheckpoint ||
    row.articleCheckpoint.title !== expected.title || !row.preparationProof ||
    row.preparationProof.editorialPassed !== true || row.preparationProof.structurePassed !== true ||
    row.preparationProof.hash !== expectedPayloadHash || !row.preparationProof.expected ||
    cmsFieldHash(row.preparationProof.expected) !== expectedPayloadHash ||
    !samePresentationBody(row.articleCheckpoint.content, expected.content))) throw Error('liv_shortening_checkpoint_changed');
  const article = rows[0].articleCheckpoint as GeneratedArticle;
  if (rows.some(row => cmsFieldHash(row.articleCheckpoint) !== cmsFieldHash({ ...article })))
    throw Error('liv_shortening_checkpoint_conflict');
  return article;
}
