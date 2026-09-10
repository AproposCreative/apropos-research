import type { ArticlePayload } from './article-payload';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { readLivWebflowJson } from '@/lib/liv/cms-readback';

/** Safe shared error; do not expose upstream response bodies or credentials. */
export class ArticleSaveError extends Error {
  constructor(readonly articleId?: string) {
    super('webflow_save_unverified');
    this.name = 'ArticleSaveError';
  }
}

/** Saving staged fields is not evidence that the same revision is live. */
export async function inspectArticleSave(
  input: { articleId: string; expected: ArticlePayload },
  dependencies?: { collectionId: string; localeId: string; read: typeof readLivWebflowJson },
): Promise<{ saveState: 'draft' | 'staged'; saveVerified: true; cmsLocaleId: string }> {
  const config = dependencies ? undefined : getWebflowConfig();
  const collectionId = dependencies?.collectionId ??
    (config?.articlesCollectionId !== undefined ? config.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID);
  const localeId = dependencies?.localeId ?? env.WEBFLOW_CMS_LOCALE_DK;
  if (![input.articleId, collectionId, localeId].every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id))) {
    throw new Error('webflow_save_invalid_identity');
  }
  const item = await (dependencies?.read ?? readLivWebflowJson)(
    `collections/${collectionId}/items/${input.articleId}?cmsLocaleId=${localeId}`,
  );
  const fields = item.fieldData as Record<string, unknown> | undefined;
  if (item.id !== input.articleId || item.cmsLocaleId !== localeId || item.isArchived === true ||
      typeof item.isDraft !== 'boolean' || !fields ||
      fields.name !== input.expected.title || fields.slug !== input.expected.slug ||
      typeof fields.content !== 'string' || !fields.content.trim()) {
    throw new Error('webflow_save_readback_mismatch');
  }
  // Full field equivalence, source checks, image proof and live readback belong
  // to publication validation. This receipt verifies identity and staged presence.
  return { saveState: item.isDraft ? 'draft' : 'staged', saveVerified: true, cmsLocaleId: localeId };
}
