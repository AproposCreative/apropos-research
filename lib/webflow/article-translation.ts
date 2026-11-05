import { FieldValue } from 'firebase-admin/firestore';
import { readManualWriterBudget } from '@/lib/ai/manual-writer-budget';
import { articleVisibleText, assertEnglishProse, isDanishArticleCopy, richTextStructure } from '@/lib/articles/english-language';
import { computeTranslationSourceHash } from '@/lib/articles/translation-source-hash';
import { buildEnglishFieldData, translateArticleToEnglish } from '@/lib/articles/translate-to-english';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { logger } from '@/lib/logger';
import { getOpenAIClient } from '@/lib/openai';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { readArticleLocale } from './english-article-guard';
import { createEnglishArticleVariant, patchArticleFieldDataForLocale, publishArticleItemForLocale, resolveWebflowLocaleIds, type WebflowLocaleItem } from './locale-items';

export type ArticleTranslationResult = {
  itemId: string;
  skipped: boolean;
  reason?: string;
  sourceHash?: string;
  enName?: string;
  durationMs?: number;
};

const ENGLISH_FIELDS = ['name', 'slug', 'subtitle', 'intro', 'content', 'seo-title', 'meta-description', 'foto-credit', 'location', 'minutes-to-read'];

function snapshot(item: WebflowLocaleItem | null) {
  return item && cmsFieldHash({ fields: item.fieldData, draft: item.isDraft ?? null, published: item.lastPublished ?? null });
}

function matchesTranslation(actual: WebflowLocaleItem | null, expected: Record<string, unknown>) {
  if (!actual) return false;
  return ENGLISH_FIELDS.filter(key => Object.hasOwn(expected, key)).every(key => {
    const value = expected[key];
    const observed = actual.fieldData[key];
    if (value === observed) return true;
    return key === 'content' && typeof value === 'string' && typeof observed === 'string' &&
      articleVisibleText(value) === articleVisibleText(observed) && richTextStructure(value) === richTextStructure(observed);
  });
}

function uneditedFields(item: WebflowLocaleItem, patch: Record<string, unknown>) {
  return cmsFieldHash(Object.fromEntries(Object.entries(item.fieldData).filter(([key]) => !Object.hasOwn(patch, key))));
}

export async function runArticleTranslation(
  itemId: string,
  options: { source?: string; force?: boolean } = {},
): Promise<ArticleTranslationResult> {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw new Error('Ugyldigt artikel-id.');
  const { dk, en } = resolveWebflowLocaleIds();
  if (dk === en) throw new Error('Dansk og engelsk Webflow-locale skal være forskellige.');
  const db = getAdminDb();
  if (!db) throw new Error('Oversættelse kræver adgang til joblageret.');
  const started = Date.now();
  const source = options.source || 'unknown';
  const ref = db.collection('articleTranslationState').doc(itemId);
  const jobs = db.collection('articleTranslationJobs');
  const record = (fields: Record<string, unknown>) => jobs.add({ itemId, source, ...fields, createdAt: FieldValue.serverTimestamp() }).catch(() => {});
  const state = (fields: Record<string, unknown>) => ref.set({ ...fields, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  const skip = async (reason: string, sourceHash?: string) => {
    await record({ status: 'skipped', reason, ...(sourceHash ? { sourceHash } : {}) });
    return { itemId, skipped: true, reason, ...(sourceHash ? { sourceHash } : {}) };
  };

  const lease = await acquireCmsWriteLease(itemId, 'en').catch(error => {
    if (error?.code === 'write_busy') return null;
    throw error;
  });
  if (!lease) return { itemId, skipped: true, reason: 'Den engelske version behandles allerede.' };

  let running = false;
  try {
    const [original, target, live, previous] = await Promise.all([
      readArticleLocale(itemId, dk, true), readArticleLocale(itemId, en, false),
      readArticleLocale(itemId, en, true), ref.get().then(snap => snap.data()),
    ]);
    if (!original) return await skip('Den danske artikel er ikke publiceret.');
    const fields = original.fieldData;
    const sourceHash = computeTranslationSourceHash(fields);
    const lastUpdate = previous?.updatedAt?.toMillis?.();
    if (previous?.inProgress && Number.isFinite(lastUpdate) && Date.now() - lastUpdate < 300_000) {
      return await skip('Oversættelse allerede i gang.', sourceHash);
    }
    if (live && snapshot(target) !== snapshot(live)) return await skip('Der ligger en separat engelsk kladde.', sourceHash);
    if (!options.force) {
      const targetHash = live ? computeTranslationSourceHash(live.fieldData) : null;
      if (targetHash && targetHash === previous?.targetHash && previous?.sourceHash === sourceHash) {
        return await skip('Den verificerede engelske version er allerede aktuel.', sourceHash);
      }
      if (target && articleVisibleText(target.fieldData.content) && !isDanishArticleCopy(fields, target.fieldData) &&
          (!targetHash || targetHash !== previous?.targetHash)) {
        return await skip('Den eksisterende engelske redigering bevares.', sourceHash);
      }
      if (previous?.attemptedSourceHash === sourceHash && previous?.sourceHash !== sourceHash) {
        return await skip('Et tidligere forsøg på samme version kræver kontrol.', sourceHash);
      }
    }
    if (await readManualWriterBudget()) return await skip('Betalt automatisk oversættelse er ikke aktiveret under Writer-politikken.', sourceHash);
    const openai = getOpenAIClient();
    if (!openai) throw new Error('Oversættelsestjenesten er ikke konfigureret.');
    await state({ inProgress: true, attemptedSourceHash: sourceHash });
    running = true;

    const translated = await translateArticleToEnglish(openai, fields);
    const complete = buildEnglishFieldData(fields, translated);
    const patch = target ? Object.fromEntries(ENGLISH_FIELDS.filter(key => key !== 'slug' && Object.hasOwn(complete, key))
      .map(key => [key, complete[key]])) : complete;
    assertEnglishProse(fields, patch);
    const [sourceNow, targetNow] = await Promise.all([readArticleLocale(itemId, dk, true), readArticleLocale(itemId, en, false)]);
    if (!sourceNow || computeTranslationSourceHash(sourceNow.fieldData) !== sourceHash || snapshot(targetNow) !== snapshot(target)) {
      throw new Error('Artiklen blev ændret under oversættelsen.');
    }
    await lease.assertOwned();
    if (target) await patchArticleFieldDataForLocale(itemId, patch, en);
    else await createEnglishArticleVariant(itemId, patch);

    const [sourceBeforePublish, staged] = await Promise.all([readArticleLocale(itemId, dk, true), readArticleLocale(itemId, en, false)]);
    if (!sourceBeforePublish || computeTranslationSourceHash(sourceBeforePublish.fieldData) !== sourceHash ||
        !staged || !matchesTranslation(staged, patch) ||
        (target && uneditedFields(staged, patch) !== uneditedFields(target, patch))) {
      throw new Error('Den engelske kladde matchede ikke den kontrollerede oversættelse.');
    }
    await lease.assertOwned();
    await publishArticleItemForLocale(itemId, en);
    const published = await readArticleLocale(itemId, en, true);
    if (!published || !matchesTranslation(published, patch)) throw new Error('Den engelske publicering kunne ikke bekræftes.');
    assertEnglishProse(fields, published.fieldData);

    const durationMs = Date.now() - started;
    await state({ sourceHash, targetHash: computeTranslationSourceHash(published.fieldData), lastTranslatedAt: FieldValue.serverTimestamp(),
      enName: translated.name, enSlug: published.fieldData.slug, lastError: null });
    await record({ status: 'ok', sourceHash, enName: translated.name, durationMs });
    return { itemId, skipped: false, sourceHash, enName: translated.name, durationMs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await state({ lastError: message });
    await record({ status: 'error', error: message });
    logger.error('[article-translation] failed', error instanceof Error ? error : new Error(message));
    throw error;
  } finally {
    try {
      if (running) await state({ inProgress: false });
    } finally {
      await lease.release();
    }
  }
}
