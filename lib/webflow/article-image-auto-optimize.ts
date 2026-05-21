import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import {
  fetchArticleItemById,
  maybeOptimizeContentImagesForFieldData,
  patchArticleFieldData,
} from '@/lib/webflow/content-image-optimizer';
import { maybeOptimizeMobileImageForFieldData } from '@/lib/webflow/mobile-image-optimizer';

export type ArticleImageAutoOptimizeResult = {
  itemId: string;
  mobileOptimized: boolean;
  contentImagesOptimized: number;
  contentImagesFailed: number;
  patched: boolean;
  skipped: boolean;
  reason?: string;
};

const ARTICLE_WEBHOOK_EVENTS = new Set([
  'collection_item_published',
  'collection_item_created',
  'collection_item_changed',
]);

export function isArticleImageAutoOptimizeEnabled(): boolean {
  return (
    process.env.WEBFLOW_AUTO_IMAGE_OPTIMIZE !== '0' && process.env.WEBFLOW_AUTO_IMAGE_OPTIMIZE !== 'false'
  );
}

export function isArticleWebhookOptimizeEnabled(): boolean {
  return env.WEBFLOW_ARTICLE_WEBHOOK_OPTIMIZE === 'true';
}

export function resolveArticlesCollectionId(): string | undefined {
  const file = getWebflowConfig();
  return (
    (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) ||
    undefined
  );
}

export function isArticleCollectionWebhookEvent(triggerType: string, collectionId?: string): boolean {
  if (!ARTICLE_WEBHOOK_EVENTS.has(triggerType)) return false;
  const articlesId = resolveArticlesCollectionId();
  if (!articlesId || !collectionId) return true;
  return collectionId === articlesId;
}

/**
 * Kør mobil + brødtekst-optimering på fieldData (bruges før publish fra app).
 */
export async function autoOptimizeArticleFieldData(args: {
  fieldData: Record<string, unknown>;
  articleTitle?: string;
  articleSlug?: string;
  force?: boolean;
}): Promise<Pick<ArticleImageAutoOptimizeResult, 'mobileOptimized' | 'contentImagesOptimized' | 'contentImagesFailed'>> {
  if (!isArticleImageAutoOptimizeEnabled()) {
    return { mobileOptimized: false, contentImagesOptimized: 0, contentImagesFailed: 0 };
  }

  const mobileBefore = JSON.stringify(args.fieldData);
  await maybeOptimizeMobileImageForFieldData({
    fieldData: args.fieldData,
    articleTitle: args.articleTitle,
    articleSlug: args.articleSlug,
  });
  const mobileOptimized = JSON.stringify(args.fieldData) !== mobileBefore;

  const content = await maybeOptimizeContentImagesForFieldData({
    fieldData: args.fieldData,
    articleTitle: args.articleTitle,
    articleSlug: args.articleSlug,
    force: args.force,
  });

  return {
    mobileOptimized,
    contentImagesOptimized: content.imagesOptimized,
    contentImagesFailed: content.imagesFailed,
  };
}

/**
 * Hent CMS-item, optimer billeder, PATCH tilbage til Webflow (webhook / manuelt kald).
 */
export async function autoOptimizeArticleByItemId(
  itemId: string,
  options: { force?: boolean; source?: string } = {}
): Promise<ArticleImageAutoOptimizeResult> {
  if (!isArticleImageAutoOptimizeEnabled()) {
    return {
      itemId,
      mobileOptimized: false,
      contentImagesOptimized: 0,
      contentImagesFailed: 0,
      patched: false,
      skipped: true,
      reason: 'Auto-optimering er slået fra (WEBFLOW_AUTO_IMAGE_OPTIMIZE)',
    };
  }

  const { fieldData } = await fetchArticleItemById(itemId);
  const title =
    typeof fieldData.name === 'string' && fieldData.name.trim() ? fieldData.name.trim() : undefined;
  const slug =
    typeof fieldData.slug === 'string' && fieldData.slug.trim() ? fieldData.slug.trim() : title;

  const before = JSON.stringify(fieldData);
  const result = await autoOptimizeArticleFieldData({
    fieldData,
    articleTitle: title,
    articleSlug: slug,
    force: options.force,
  });
  const after = JSON.stringify(fieldData);
  const changed = before !== after;

  if (changed) {
    await patchArticleFieldData(itemId, fieldData);
  }

  const logResult: ArticleImageAutoOptimizeResult = {
    itemId,
    ...result,
    patched: changed,
    skipped: !changed && result.contentImagesOptimized === 0 && !result.mobileOptimized,
    reason: !changed ? 'Ingen felter ændret (allerede optimeret eller intet at gøre)' : undefined,
  };

  const db = getAdminDb();
  if (db) {
    await db.collection('webflowArticleImageAutoOptimize').add({
      itemId,
      source: options.source || 'unknown',
      mobileOptimized: result.mobileOptimized,
      contentImagesOptimized: result.contentImagesOptimized,
      contentImagesFailed: result.contentImagesFailed,
      patched: changed,
      createdAt: FieldValue.serverTimestamp(),
    }).catch((e) => {
      logger.warn('[webflow/article-auto] log failed', {
        message: e instanceof Error ? e.message : String(e),
      });
    });
  }

  logger.info('[webflow/article-auto] optimize complete', {
    itemId,
    source: options.source,
    patched: changed,
    mobile: result.mobileOptimized,
    contentImages: result.contentImagesOptimized,
  });

  return logResult;
}
