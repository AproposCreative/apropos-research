/** Chat replies (including errors/instructions) are never CMS article content. */
export function writerArticleBody(article: Record<string, unknown>): string {
  if (typeof article.content === 'string') return article.content;
  return typeof article['post-body'] === 'string' ? article['post-body'] : '';
}
