import { readDeliveryPayload, readDeliveryState } from './delivery-store';
import { readLivWebflowJson } from './cms-readback';
import { cmsFieldHash } from './cms-field-hash';
import { cmsLocaleIdFor } from '@/lib/seo-engine/opportunity-engine/locale';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';

/** Read-only editor baseline. The mutation rechecks all hashes and leases. */
export async function readLivPresentationBaseline(itemId: string) {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw new Error('liv_presentation_invalid');
  const state = await readDeliveryState();
  const entry = state.entries.find(row => row.itemId === itemId);
  if (!entry || entry.state !== 'ready' || entry.decision === 'rejected' ||
    Object.values(state.slots).some(slot => slot.itemId === itemId) || state.coverRevision ||
    (state.preparation && state.preparation.leaseUntil > Date.now())) throw new Error('liv_presentation_not_ready');
  const expected = await readDeliveryPayload(itemId);
  const expectedPayloadHash = cmsFieldHash({ ...expected });
  if (entry.payloadHash !== expectedPayloadHash) throw new Error('liv_presentation_payload_changed');
  const locale = cmsLocaleIdFor('da');
  const collection = getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!locale || !collection) throw new Error('liv_presentation_configuration');
  const cms = await readLivWebflowJson(`collections/${collection}/items/${itemId}?cmsLocaleId=${locale}`);
  if (cms.id !== itemId || cms.cmsLocaleId !== locale || cms.isDraft !== true || cms.isArchived || cms.lastPublished != null)
    throw new Error('liv_presentation_not_unpublished_draft');
  const fields = cms.fieldData as Record<string, unknown>;
  if (!fields || fields.slug !== expected.slug ||
    !['name', 'seo-title', 'meta-description'].every(key => typeof fields[key] === 'string'))
    throw new Error('liv_presentation_checkpoint_changed');
  // Do not expose content, credentials, internal provider output or receipts.
  return { itemId, expectedPayloadHash, expectedCmsHash: cmsFieldHash(fields),
    title: fields.name as string, seoTitle: fields['seo-title'] as string,
    seoDescription: fields['meta-description'] as string };
}
