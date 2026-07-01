/**
 * Orkestrering: DK-artikel → EN oversættelse → Webflow PATCH + publish.
 */

import { FieldValue } from 'firebase-admin/firestore';
import { getOpenAIClient } from '@/lib/openai';
import { getAdminDb } from '@/lib/firebase-admin';
import { logger } from '@/lib/logger';
import { computeTranslationSourceHash } from '@/lib/articles/translation-source-hash';
import {
  buildEnglishFieldData,
  translateArticleToEnglish,
} from '@/lib/articles/translate-to-english';
import {
  articleLocaleExists,
  fetchArticleItemByLocale,
  patchArticleFieldDataForLocale,
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';

export type ArticleTranslationResult = {
  itemId: string;
  skipped: boolean;
  reason?: string;
  sourceHash?: string;
  enName?: string;
  durationMs?: number;
};

const STATE_COLLECTION = 'articleTranslationState';
const JOBS_COLLECTION = 'articleTranslationJobs';

async function getTranslationState(itemId: string): Promise<{
  sourceHash?: string;
  inProgress?: boolean;
} | null> {
  const db = getAdminDb();
  if (!db) return null;
  const snap = await db.collection(STATE_COLLECTION).doc(itemId).get();
  if (!snap.exists) return null;
  return snap.data() as { sourceHash?: string; inProgress?: boolean };
}

async function setTranslationState(
  itemId: string,
  data: Record<string, unknown>
): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db
    .collection(STATE_COLLECTION)
    .doc(itemId)
    .set({ ...data, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
}

async function logTranslationJob(data: Record<string, unknown>): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection(JOBS_COLLECTION).add({
    ...data,
    createdAt: FieldValue.serverTimestamp(),
  }).catch(() => {});
}

/**
 * Oversæt og publicér EN-version af en artikel.
 * Spring over hvis dansk kildeindhold er uændret (hash).
 */
export async function runArticleTranslation(
  itemId: string,
  options: { source?: string; force?: boolean } = {}
): Promise<ArticleTranslationResult> {
  const started = Date.now();
  const locales = resolveWebflowLocaleIds();
  const source = options.source || 'unknown';

  const existing = await getTranslationState(itemId);
  if (existing?.inProgress && !options.force) {
    return { itemId, skipped: true, reason: 'Oversættelse allerede i gang' };
  }

  await setTranslationState(itemId, { inProgress: true });

  try {
    const hasEnLocale = await articleLocaleExists(itemId, locales.en);
    if (!hasEnLocale) {
      const reason =
        'Artiklen har ingen engelsk locale-variant i Webflow — tilføj EN i CMS (Designer) eller opret artiklen med begge locales.';
      await setTranslationState(itemId, { inProgress: false, lastSkipReason: reason });
      await logTranslationJob({ itemId, source, status: 'skipped', reason: 'en_locale_missing' });
      logger.warn('[article-translation] skipped — no EN locale', { itemId, source });
      return { itemId, skipped: true, reason };
    }

    const { fieldData: dk } = await fetchArticleItemByLocale(itemId, locales.dk);
    const sourceHash = computeTranslationSourceHash(dk);

    if (!options.force && existing?.sourceHash === sourceHash) {
      await setTranslationState(itemId, { inProgress: false, sourceHash });
      await logTranslationJob({ itemId, source, status: 'skipped', reason: 'hash_unchanged', sourceHash });
      return { itemId, skipped: true, reason: 'Indhold uændret siden sidste oversættelse', sourceHash };
    }

    const openai = getOpenAIClient();
    if (!openai) throw new Error('OPENAI_API_KEY mangler — kan ikke oversætte.');

    logger.info('[article-translation] translating', { itemId, source, sourceHash: sourceHash.slice(0, 12) });

    const en = await translateArticleToEnglish(openai, dk);
    const enFieldData = buildEnglishFieldData(dk, en);

    await patchArticleFieldDataForLocale(itemId, enFieldData, locales.en);
    await publishArticleItemForLocale(itemId, locales.en);

    const durationMs = Date.now() - started;
    await setTranslationState(itemId, {
      inProgress: false,
      sourceHash,
      lastTranslatedAt: FieldValue.serverTimestamp(),
      enName: en.name,
      enSlug: en.slug,
    });
    await logTranslationJob({
      itemId,
      source,
      status: 'ok',
      sourceHash,
      enName: en.name,
      durationMs,
    });

    logger.info('[article-translation] complete', { itemId, enName: en.name, durationMs });

    return {
      itemId,
      skipped: false,
      sourceHash,
      enName: en.name,
      durationMs,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await setTranslationState(itemId, { inProgress: false, lastError: message });
    await logTranslationJob({ itemId, source, status: 'error', error: message });
    logger.error('[article-translation] failed', err instanceof Error ? err : new Error(message));
    throw err;
  }
}
