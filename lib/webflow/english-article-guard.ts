import { isDanishArticleCopy } from '@/lib/articles/english-language';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { fetchArticleItemByLocale, resolveWebflowLocaleIds, unpublishEnglishArticle, WebflowLocaleFetchError } from './locale-items';

export async function readArticleLocale(itemId: string, cmsLocaleId: string, live: boolean) {
  try {
    const item = await fetchArticleItemByLocale(itemId, cmsLocaleId, { live, exact: true });
    return item.isArchived ? null : item;
  } catch (error) {
    if (error instanceof WebflowLocaleFetchError && error.status === 404) return null;
    throw error;
  }
}

/** Webflow can publish both locales through the editor, outside our publish API. */
export async function protectEnglishArticleLocale(itemId: string): Promise<boolean> {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw new Error('Ugyldigt artikel-id.');
  const { dk, en } = resolveWebflowLocaleIds();
  if (dk === en) throw new Error('Dansk og engelsk Webflow-locale skal være forskellige.');
  const target = await readArticleLocale(itemId, en, true);
  if (!target) return false;
  const original = await readArticleLocale(itemId, dk, true);
  if (!original || !isDanishArticleCopy(original.fieldData, target.fieldData)) return false;

  const lease = await acquireCmsWriteLease(itemId, 'en');
  try {
    const [current, staged] = await Promise.all([
      readArticleLocale(itemId, en, true),
      readArticleLocale(itemId, en, false),
    ]);
    const targetHash = cmsFieldHash(target.fieldData);
    if (!current || !staged || current.lastPublished !== target.lastPublished ||
        cmsFieldHash(current.fieldData) !== targetHash || cmsFieldHash(staged.fieldData) !== targetHash) {
      return false;
    }
    await lease.assertOwned();
    try {
      await unpublishEnglishArticle(itemId);
    } catch (error) {
      // Read back an ambiguous result before reporting failure. Never repeat the write here.
      if (await readArticleLocale(itemId, en, true)) throw error;
    }
    if (await readArticleLocale(itemId, en, true)) throw new Error('Den danske kopi er stadig publiceret under EN.');
    const danish = await readArticleLocale(itemId, dk, true);
    if (!danish) throw new Error('Den danske artikel kunne ikke bekræftes efter EN-kontrollen.');
    return true;
  } finally {
    await lease.release();
  }
}
