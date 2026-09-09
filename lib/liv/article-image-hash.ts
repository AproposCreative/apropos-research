import { createHash } from 'node:crypto';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

export function livImageArticleHash(article: Pick<GeneratedArticle, 'title' | 'slug' | 'intro' | 'content'>) {
  return createHash('sha256').update(JSON.stringify([article.title, article.slug, article.intro, article.content])).digest('hex');
}
