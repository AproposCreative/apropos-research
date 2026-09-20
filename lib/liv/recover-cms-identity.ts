import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { readLivWebflowJson, inspectLivCmsDraft } from './cms-readback';
import type { PreparationProof } from './prepared-admission';
import { cmsFieldHash } from './cms-field-hash';

/** A timed-out CMS create can be recovered by exact staged readback, never by creating again. */
export async function findPreparedCmsIdentity(proof: PreparationProof, dependencies?: {
  collectionId: string; localeId: string; read: typeof readLivWebflowJson; inspect: typeof inspectLivCmsDraft;
}): Promise<string | null> {
  if (!proof || proof.hash !== cmsFieldHash(proof.expected as unknown as Record<string, unknown>) ||
    !proof.editorialPassed || !proof.structurePassed) throw new Error('liv_preparation_proof_invalid');
  const collectionId = dependencies?.collectionId ?? getWebflowConfig().articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const localeId = dependencies?.localeId ?? env.WEBFLOW_CMS_LOCALE_DK;
  if (![collectionId, localeId].every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id))) throw new Error('liv_cms_readback_missing_configuration');
  const read = dependencies?.read ?? readLivWebflowJson;
  const matches: string[] = [];
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await read(`collections/${collectionId}/items?cmsLocaleId=${localeId}&offset=${offset}&limit=100`);
    if (!Array.isArray(page.items)) throw new Error('liv_cms_readback_invalid_object');
    for (const item of page.items as Array<Record<string, any>>) {
      if (item.cmsLocaleId === localeId && item.fieldData?.slug === proof.expected.slug &&
          typeof item.id === 'string' && /^[a-f0-9]{24}$/i.test(item.id)) matches.push(item.id);
    }
    if (matches.length > 1) throw new Error('liv_cms_identity_ambiguous');
    if (page.items.length < 100) {
      if (!matches.length) return null;
      const checked = await (dependencies?.inspect ?? inspectLivCmsDraft)({ itemId: matches[0], expected: proof.expected });
      if (!checked.draftConfirmed || !checked.publicationReady || !checked.checks.length || checked.checks.some(c => !c.ok)) {
        throw new Error('liv_preparation_cms_not_ready');
      }
      return matches[0];
    }
  }
  throw new Error('liv_cms_identity_scan_incomplete');
}
