'use server';

import {
  normalizeArticlePayload,
  toWebflowArticleFields,
  type ArticlePayload,
  type NormalizeArticlePayloadOptions,
} from '@/lib/articles/article-payload';
import { publishArticleToWebflow } from '@/lib/webflow-service';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { ArticleSaveError, inspectArticleSave } from '@/lib/articles/save-receipt';

export type PublishCanonicalArticleResult = {
  articleId: string;
  payload: ArticlePayload;
  receipt: Awaited<ReturnType<typeof inspectArticleSave>>;
  publicationVerified: false;
};

type SaveOptions = NormalizeArticlePayloadOptions & {
  /** Exact locally normalized save expectation, before any CMS create/update. */
  onBeforeSave?: (expected: WebflowArticleFields) => Promise<void>;
  /** Server-owned checkpoint, awaited before readback or optional follow-up work. */
  onSaved?: (articleId: string) => Promise<void>;
};

export async function publishCanonicalArticleToWebflow(
  input: Partial<ArticlePayload> & Pick<WebflowArticleFields, 'title' | 'content'>,
  options: SaveOptions = {}
): Promise<PublishCanonicalArticleResult> {
  // Legacy function name, shared staged-save contract. Only a verified live
  // publication operation may promote the workflow beyond this boundary.
  const payload = normalizeArticlePayload({ ...input, status: 'draft', workflowState: 'webflow_draft' }, {
    ...options, defaultStatus: 'draft',
  });
  let articleId: string | undefined;
  let receipt: PublishCanonicalArticleResult['receipt'];
  try {
    const savedId = await publishArticleToWebflow(toWebflowArticleFields(payload), {
      onBeforeSave: async expected => {
        Object.assign(payload, expected);
        await options.onBeforeSave?.(structuredClone(expected));
      },
    });
    if (typeof savedId !== 'string' || !/^[a-f0-9]{24}$/i.test(savedId)) {
      throw new Error('webflow_save_missing_item_id');
    }
    if (input.webflowId && savedId !== input.webflowId) throw new Error('webflow_save_changed_item_id');
    articleId = savedId;
    await options.onSaved?.(articleId);
    receipt = await inspectArticleSave({ articleId, expected: payload });
  } catch {
    // No automatic retries: a failed response may still have created an item.
    const existingId = typeof input.webflowId === 'string' && /^[a-f0-9]{24}$/i.test(input.webflowId)
      ? input.webflowId : undefined;
    throw new ArticleSaveError(articleId || existingId);
  }
  // Best-effort SEO enqueue after checked staging. This is not a live event.
  try {
    const { maybeEnqueueSeoEngineAfterPublish } = await import('@/lib/seo-engine/after-publish');
    await maybeEnqueueSeoEngineAfterPublish({ itemId: articleId, source: 'publish_app' });
  } catch {
    /* ignore */
  }
  return { articleId, payload, receipt, publicationVerified: false };
}

export async function publishArticleDraftToWebflow(
  input: Partial<ArticlePayload> & Pick<WebflowArticleFields, 'title' | 'content'>,
  options: Omit<SaveOptions, 'defaultStatus'> = {}
): Promise<PublishCanonicalArticleResult> {
  return publishCanonicalArticleToWebflow({ ...input, status: 'draft', workflowState: 'webflow_draft' }, {
    ...options,
    defaultStatus: 'draft',
  });
}
