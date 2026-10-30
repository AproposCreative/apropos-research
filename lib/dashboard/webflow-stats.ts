import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { getWebflowAuthors } from '@/lib/webflow-service';

export type CmsArticleMeta = {
  id: string;
  slug: string;
  title: string;
  authorId?: string;
  authorName?: string;
  isDraft: boolean;
  isPublished: boolean;
};

export async function fetchCmsArticles(live = false): Promise<CmsArticleMeta[]> {
  const config = getWebflowConfig();
  const token = config.apiToken || env.WEBFLOW_API_TOKEN, siteId = config.siteId || env.WEBFLOW_SITE_ID, articlesCollectionId = config.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!token || !siteId || !articlesCollectionId) throw Error('dashboard_cms_unavailable');

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' };
  const pageSize = 100;
  let offset = 0;
  const items: CmsArticleMeta[] = [];

  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/collections/${articlesCollectionId}/items${live ? "/live" : ""}?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers, next: { revalidate: 300 }, signal: AbortSignal.timeout(20000) });
    if (!res.ok) throw Error('dashboard_cms_read_failed');
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
        isPublished: live || !it.isDraft && !it.isArchived && typeof it.lastPublished === 'string' && Number.isFinite(Date.parse(it.lastPublished)),
      });
    }
    if (batch.length < pageSize) break;
    offset += pageSize;
  }

  return items;
}

export async function fetchArticleCounts() {
  const config = getWebflowConfig();
  const token = config.apiToken || env.WEBFLOW_API_TOKEN, collectionId = config.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!token || !collectionId) throw Error('dashboard_cms_unavailable');
  const [articles, response] = await Promise.all([fetchCmsArticles(), fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/live?limit=1`, {
    headers: { Authorization: `Bearer ${token}` }, next: { revalidate: 300 }, signal: AbortSignal.timeout(20000),
  })]);
  if (!response.ok) throw Error('dashboard_live_cms_unavailable');
  const data = await response.json();
  if (!Number.isSafeInteger(data.pagination?.total) || data.pagination.total < 0) throw Error('dashboard_live_count_unknown');
  return { total: articles.length, published: data.pagination.total as number, drafts: articles.filter(article => article.isDraft).length };
}

export async function buildAuthorLeaderboard(
  viewsBySlug: Map<string, number>, publishedOnly = false
): Promise<
  Array<{
    authorId: string;
    name: string;
    avatar?: string;
    views: number;
    articleCount: number;
  }>
> {
  const [authors, cmsArticles] = await Promise.all([getWebflowAuthors(), fetchCmsArticles(publishedOnly)]);
  const authorById = new Map(authors.map((a) => [a.id, a]));

  const stats = new Map<
    string,
    { authorId: string; name: string; avatar?: string; views: number; articleCount: number }
  >();

  for (const article of cmsArticles) {
    if (publishedOnly && !article.isPublished) continue;
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
