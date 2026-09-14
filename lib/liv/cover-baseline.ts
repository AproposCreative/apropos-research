import { readDeliveryState, readDeliveryPayload } from './delivery-store';
import { readLivWebflowJson } from './cms-readback';
import { cmsFieldHash } from './cms-field-hash';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';

/** Owner route only. No asset download, model, journal or CMS mutation. */
export async function readLivCoverBaseline(itemId: string) {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw new Error('liv_cover_invalid');
  const state = await readDeliveryState();
  const entry = state.entries.find(row => row.itemId === itemId);
  if (!entry || entry.state !== 'ready' || entry.decision === 'rejected' || state.coverRevision ||
    state.slots[entry.scheduledDay] || Object.values(state.slots).some(slot => slot.itemId === itemId) ||
    (state.preparation && state.preparation.leaseUntil > Date.now())) throw new Error('liv_cover_not_ready');
  const expected = await readDeliveryPayload(itemId);
  const expectedPayloadHash = cmsFieldHash({ ...expected });
  if (expectedPayloadHash !== entry.payloadHash) throw new Error('liv_cover_payload_changed');
  const collection = getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const locale = env.WEBFLOW_CMS_LOCALE_DK;
  if (!collection || !locale) throw new Error('liv_cover_configuration');
  const cms = await readLivWebflowJson(`collections/${collection}/items/${itemId}?cmsLocaleId=${locale}`);
  if (cms.id !== itemId || cms.cmsLocaleId !== locale || cms.isDraft !== true || cms.isArchived || cms.lastPublished != null)
    throw new Error('liv_cover_not_unpublished_draft');
  const fields = cms.fieldData as Record<string, unknown>;
  if (!fields || fields.name !== expected.title || fields.slug !== expected.slug) throw new Error('liv_cover_draft_changed');
  // Current cover remains visible on the story card; no unvalidated image URL
  // or provider source data needs to be exposed by this editing endpoint.
  return { itemId, dayKey: entry.scheduledDay, title: expected.title,
    expectedPayloadHash, expectedCmsHash: cmsFieldHash(fields) };
}
