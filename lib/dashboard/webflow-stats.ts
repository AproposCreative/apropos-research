import { getWebflowConfig } from '@/lib/webflow-config';
import { getWebflowAuthors } from '@/lib/webflow-service';

export type CmsArticleMeta = {
  id: string;
  slug: string;
  title: string;
  authorId?: string;
  authorName?: string;
  isDraft: boolean;
};

export async function fetchCmsArticles(): Promise<CmsArticleMeta[]> {
  const { apiToken: token, siteId, articlesCollectionId } = getWebflowConfig();
  if (!token || !siteId || !articlesCollectionId) return [];

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' };
  const pageSize = 100;
  let offset = 0;
  const items: CmsArticleMeta[] = [];

  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers, next: { revalidate: 300 } });
    if (!res.ok) break;
    const data = (await res.json()) as { items?: Array<Record<string, unknown>> };
    const batch = data.items || [];
    for (const it of batch) {
      const fd = (it.fieldData || {}) as Record<string, unknown>;
      const slug = String(fd.slug || '').trim();
      items.push({
        id: String(it.id || ''),
        slug,
        title: String(fd.name || fd.title || slug || 'Uden titel'),
        authorId: typeof fd.author === 'string' ? fd.author : undefined,
        authorName: typeof fd['author-name'] === 'string' ? fd['author-name'] : undefined,
        isDraft: Boolean(it.isDraft),
      });
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return items;
}

export async function fetchArticleCounts() {
  const articles = await fetchCmsArticles();
  const published = articles.filter((a) => !a.isDraft).length;
  return {
    total: articles.length,
    published,
    drafts: articles.length - published,
  };
}

export async function buildAuthorLeaderboard(
  viewsBySlug: Map<string, number>
): Promise<
  Array<{
    authorId: string;
    name: string;
    avatar?: string;
    views: number;
    articleCount: number;
  }>
> {
  const [authors, cmsArticles] = await Promise.all([getWebflowAuthors(), fetchCmsArticles()]);
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const stats = new Map<
    string,
    { authorId: string; name: string; avatar?: string; views: number; articleCount: number }
  >();

  for (const article of cmsArticles) {
    const views = viewsBySlug.get(article.slug) || 0;
    if (!views && !article.authorId) continue;

    const authorId = article.authorId || 'unknown';
    const author = authorById.get(authorId);
    const name = author?.name || article.authorName || 'Ukendt forfatter';
    const existing = stats.get(authorId) || {
      authorId,
      name,
      avatar: author?.avatar,
      views: 0,
      articleCount: 0,
    };
    existing.views += views;
    existing.articleCount += 1;
    if (author?.avatar) existing.avatar = author.avatar;
    stats.set(authorId, existing);
  }

  return [...stats.values()]
    .filter((s) => s.views > 0 || s.articleCount > 0)
    .sort((a, b) => b.views - a.views)
    .slice(0, 12);
}
