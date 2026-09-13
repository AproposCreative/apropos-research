import type { ArticlePayload } from './article-payload';
import { sameCmsBody } from './cms-body-equivalence';
import { readLivWebflowJson } from '@/lib/liv/cms-readback';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';

/** Bounded GET-only reconciliation. Never infer absence from a partial listing. */
export async function stagedSaveCandidates(expected: ArticlePayload, dependencies?: {
  collectionId: string; localeId: string; read: typeof readLivWebflowJson;
}, baseline = false) {
  const config = dependencies ? undefined : getWebflowConfig();
  const collectionId = dependencies?.collectionId ?? config?.articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const localeId = dependencies?.localeId ?? env.WEBFLOW_CMS_LOCALE_DK;
  if (![collectionId, localeId].every(value => typeof value === 'string' && /^[a-f0-9]{24}$/i.test(value))) throw new Error('cms_configuration');
  const read = dependencies?.read ?? readLivWebflowJson;
  const matches = new Set<string>();
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await read(`collections/${collectionId}/items?cmsLocaleId=${localeId}&offset=${offset}&limit=100`);
    if (!Array.isArray(page.items)) throw new Error('cms_listing_invalid');
    for (const item of page.items) {
      const f = item?.fieldData;
      // Exclude every pre-existing identity, including an old article whose
      // fields another editor might change to match during this operation.
      if (baseline && typeof item?.id === 'string' && /^[a-f0-9]{24}$/i.test(item.id)) {
        matches.add(item.id); continue;
      }
      if (item?.cmsLocaleId === localeId && item?.isDraft === true && item?.isArchived !== true &&
          typeof item?.id === 'string' && /^[a-f0-9]{24}$/i.test(item.id) &&
          f?.name === expected.title && f?.slug === expected.slug && typeof f?.content === 'string' &&
          sameCmsBody(expected.content, f.content)) matches.add(item.id);
    }
    if (page.items.length < 100) return [...matches];
  }
  throw new Error('cms_listing_incomplete');
}
