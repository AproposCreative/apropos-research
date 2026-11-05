import { after } from 'next/server';
import { logger } from '@/lib/logger';
import { runArticleTranslation } from '@/lib/webflow/article-translation';

/** Vercel keeps the webhook execution alive until this work finishes. */
export function enqueueArticleTranslation(itemId: string, source: string): void {
  after(async () => {
    try {
      await runArticleTranslation(itemId, { source });
    } catch (error) {
      logger.warn('[article-translation] webhook job failed', {
        itemId, message: error instanceof Error ? error.message : String(error),
      });
    }
  });
}
