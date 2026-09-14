import { readDeliveryState, readDeliveryPayload } from './delivery-store';
import { readLivWebflowJson } from './cms-readback';
import { cmsFieldHash } from './cms-field-hash';
import { getWebflowConfig } from '@/lib/webflow-config';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import { env } from '@/lib/config/env';
import { countLivBodyWords, LIV_DAILY_BODY_LENGTH } from './article-length';
import { livEditableParagraphs } from './paragraph-edits';
import { samePresentationBody } from './presentation-revision';

/** Read-only owner baseline. Hashes are optimistic concurrency tokens, never a
 * lock or permission to publish. The mutation must recheck all state atomically. */
export async function readLivShorteningBaseline(itemId: string) {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw new Error('liv_shortening_invalid');
  const state = await readDeliveryState();
  const entry = state.entries.find(row => row.itemId === itemId);
  if (!entry || entry.state !== 'ready' || entry.decision === 'rejected' || state.coverRevision ||
    state.slots[entry.scheduledDay] || Object.values(state.slots).some(slot => slot.itemId === itemId) ||
    (state.preparation && state.preparation.leaseUntil > Date.now())) throw new Error('liv_shortening_not_ready');
  const expected = await readDeliveryPayload(itemId);
  const expectedPayloadHash = cmsFieldHash({ ...expected });
  if (expectedPayloadHash !== entry.payloadHash) throw new Error('liv_shortening_payload_changed');
  const collection = getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const locale = cmsLocaleIdFor('da');
  if (!collection || !locale) throw new Error('liv_shortening_configuration');
  const cms = await readLivWebflowJson(`collections/${collection}/items/${itemId}?cmsLocaleId=${locale}`);
  if (cms.id !== itemId || cms.cmsLocaleId !== locale || cms.isDraft !== true || cms.isArchived || cms.lastPublished != null)
    throw new Error('liv_shortening_not_unpublished_draft');
  const fields = cms.fieldData as Record<string, unknown>;
  if (!fields || fields.name !== expected.title || fields.slug !== expected.slug ||
    typeof fields.content !== 'string' || !samePresentationBody(fields.content, expected.content))
    throw new Error('liv_shortening_draft_changed');
  const wordCount = countLivBodyWords(fields.content);
  const paragraphs = livEditableParagraphs(fields.content).filter(row => row.before.trim());
  const editable = paragraphs.filter(row => row.editable);
  const maxTargetWords = Math.min(LIV_DAILY_BODY_LENGTH.max, wordCount - 1);
  if (maxTargetWords < LIV_DAILY_BODY_LENGTH.min || !editable.length || paragraphs.length < 3)
    throw new Error('liv_shortening_not_shortenable');
  return { itemId, title: expected.title, dayKey: entry.scheduledDay, expectedPayloadHash,
    expectedCmsHash: cmsFieldHash(fields), wordCount, minTargetWords: LIV_DAILY_BODY_LENGTH.min,
    maxTargetWords, suggestedTargetWords: Math.max(LIV_DAILY_BODY_LENGTH.min, Math.min(500, maxTargetWords)),
    // No source text, raw provider response or stale approval leaves this API.
    publicationReady: false as const };
}
