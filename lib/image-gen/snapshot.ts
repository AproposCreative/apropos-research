import { imageGenArticle, imageGenHash } from './article';
import { readImageGenArticle } from './webflow';
import { getAdminDb } from '@/lib/firebase-admin';

/** Private immutable-at-version adapter. No placeholder CMS item is created to buy an image. */
export async function readImageGenSnapshot(uid: string, articleId: string) {
  if (!articleId.startsWith('submission-')) return readImageGenArticle(articleId);
  const id = articleId.slice('submission-'.length);
  if (!/^[a-f0-9]{64}$/.test(id)) throw Error('image_gen_article_invalid');
  const db = getAdminDb(); if (!db) throw Error('image_gen_store_unavailable');
  const row = (await db.collection('editorialSubmissions').doc(id).get()).data();
  if (!row || row.uid !== uid || row.id !== id) throw Error('image_gen_article_unavailable');
  const content = /<\w+/.test(row.article.content) ? row.article.content : row.article.content.split(/\n\s*\n/)
    .map((text: string) => `<p>${text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</p>`).join('\n');
  const article = imageGenArticle(articleId, row.article.title, content, row.article.featuredImage);
  // Unchanged paragraphs retain their anchors when unrelated paragraphs move.
  const occurrences = new Map<string, number>();
  article.sections = article.sections.map(section => {
    const ordinal = occurrences.get(section.text) ?? 0; occurrences.set(section.text, ordinal + 1);
    return { ...section, id: imageGenHash(`${section.text}\n${ordinal}`) };
  });
  return { article, cover: row.article.featuredImage ?? null };
}
