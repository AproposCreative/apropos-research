'use server';

import {
  normalizeArticlePayload,
  toWebflowArticleFields,
  type ArticlePayload,
  type NormalizeArticlePayloadOptions,
} from '@/lib/articles/article-payload';
import { publishArticleToWebflow } from '@/lib/webflow-service';
import type { WebflowArticleFields } from '@/lib/webflow/types';

export type PublishCanonicalArticleResult = {
  articleId: string;
  payload: ArticlePayload;
};

export async function publishCanonicalArticleToWebflow(
  input: Partial<ArticlePayload> & Pick<WebflowArticleFields, 'title' | 'content'>,
  options: NormalizeArticlePayloadOptions = {}
): Promise<PublishCanonicalArticleResult> {
  const payload = normalizeArticlePayload(input, options);
  const articleId = await publishArticleToWebflow(toWebflowArticleFields(payload));
  return { articleId, payload };
}

export async function publishArticleDraftToWebflow(
  input: Partial<ArticlePayload> & Pick<WebflowArticleFields, 'title' | 'content'>,
  options: Omit<NormalizeArticlePayloadOptions, 'defaultStatus'> = {}
): Promise<PublishCanonicalArticleResult> {
  return publishCanonicalArticleToWebflow(input, {
    ...options,
    defaultStatus: 'draft',
  });
}
