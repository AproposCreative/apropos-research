import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';

export type LandingArticle = {
  id: string;
  title: string;
  excerpt: string;
  thumbUrl: string | null;
  url: string;
  category: string | null;
};

export type LandingAssets = {
  siteName: string;
  magazineUrl: string;
  logoUrl: string | null;
  logoMarkUrl: string | null;
  articles: LandingArticle[];
  articleCount: number;
  partnerLogos: { name: string; url: string }[];
};

function authHeaders(token: string) {
  return { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
}

function resolveThumb(fieldData: Record<string, unknown>): string | null {
  const t =
    fieldData['mobile-image'] ??
    fieldData.mobileImage ??
    fieldData.thumb ??
    fieldData['featured-image'] ??
    fieldData.thumbnail;
  if (typeof t === 'string' && /^https?:\/\//i.test(t)) return t;
  if (t && typeof t === 'object' && t !== null && 'url' in t) {
    const u = (t as { url?: string }).url;
    if (typeof u === 'string' && /^https?:\/\//i.test(u)) return u;
  }
  return null;
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function categoryFrom(fd: Record<string, unknown>): string | null {
  const sec = fd.section ?? fd.topic;
  if (typeof sec === 'string' && sec.trim() && !/^[0-9a-f]{24}$/i.test(sec.trim())) return sec.trim();
  return null;
}

function articleBaseUrl(): string {
  return (env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com').replace(/\/$/, '');
}

async function fetchSiteMeta(token: string, siteId: string) {
  const res = await fetch(`https://api.webflow.com/v2/sites/${siteId}`, {
    headers: authHeaders(token),
    next: { revalidate: 3600 },
  });
  if (!res.ok) return null;
  return res.json().catch(() => null);
}

async function fetchAssets(token: string, siteId: string) {
  const assets: { id: string; displayName?: string; hostedUrl?: string; originalFileName?: string }[] = [];
  let offset = 0;
  const limit = 100;

  while (offset < 500) {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/assets?limit=${limit}&offset=${offset}`,
      { headers: authHeaders(token), next: { revalidate: 3600 } }
    );
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const page = (data as { assets?: typeof assets }).assets || [];
    assets.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return assets;
}

function pickLogoFromAssets(
  assets: { displayName?: string; hostedUrl?: string; originalFileName?: string }[]
): { logo: string | null; mark: string | null } {
  const scored = assets
    .filter((a) => a.hostedUrl)
    .map((a) => {
      const name = `${a.displayName || ''} ${a.originalFileName || ''}`.toLowerCase();
      let score = 0;
      if (name.includes('logo')) score += 10;
      if (name.includes('apropos')) score += 5;
      if (name.includes('newsletter')) score -= 3;
      if (name.includes('social')) score -= 3;
      if (name.includes('favicon')) score += 2;
      if (/\.svg$/i.test(name)) score += 2;
      return { url: a.hostedUrl!, score };
    })
    .sort((a, b) => b.score - a.score);

  const logo = scored[0]?.score >= 5 ? scored[0].url : null;
  const mark = scored.find((s) => s.url !== logo)?.url ?? logo;
  return { logo, mark };
}

async function fetchArticleItems(token: string, siteId: string, collectionId: string) {
  const items: any[] = [];
  let offset = 0;
  const limit = 100;

  while (offset < 2000) {
    const res = await fetch(
      `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=${limit}&offset=${offset}`,
      { headers: authHeaders(token), next: { revalidate: 600 } }
    );
    if (!res.ok) break;
    const data = await res.json().catch(() => ({}));
    const page = (data as { items?: any[] }).items || [];
    items.push(...page);
    if (page.length < limit) break;
    offset += limit;
  }

  return items;
}

function mapArticle(item: any, base: string): LandingArticle | null {
  const fd = (item.fieldData || {}) as Record<string, unknown>;
  const title = typeof fd.name === 'string' ? fd.name : typeof fd.title === 'string' ? fd.title : '';
  const slug = typeof fd.slug === 'string' ? fd.slug : '';
  if (!title.trim() || !slug.trim()) return null;

  const excerptRaw =
    (typeof fd.excerpt === 'string' && fd.excerpt) ||
    (typeof fd.intro === 'string' && fd.intro) ||
    '';

  return {
    id: String(item.id),
    title: title.trim(),
    excerpt: stripHtml(String(excerptRaw)).slice(0, 160),
    thumbUrl: resolveThumb(fd),
    url: `${base}/articles/${slug}`,
    category: categoryFrom(fd),
  };
}

export async function fetchLandingAssets(): Promise<LandingAssets> {
  const cfg = getWebflowConfig();
  const token = cfg.apiToken || env.WEBFLOW_API_TOKEN;
  const siteId = cfg.siteId || env.WEBFLOW_SITE_ID;
  const collectionId = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const magazineUrl = articleBaseUrl();

  const fallback: LandingAssets = {
    siteName: 'Apropos Magazine',
    magazineUrl,
    logoUrl: '/images/apropos-newsletter-logo.png',
    logoMarkUrl: '/images/apropos-research-white.svg',
    articles: [],
    articleCount: 0,
    partnerLogos: [],
  };

  if (!token || !siteId) return fallback;

  const [siteMeta, assetList] = await Promise.all([
    fetchSiteMeta(token, siteId),
    fetchAssets(token, siteId),
  ]);

  const { logo, mark } = pickLogoFromAssets(assetList);
  const siteName =
    (siteMeta as { displayName?: string } | null)?.displayName || 'Apropos Magazine';

  let articles: LandingArticle[] = [];
  let articleCount = 0;

  if (collectionId) {
    const items = await fetchArticleItems(token, siteId, collectionId);
    articleCount = items.length;
    const base = magazineUrl;
  const mapped = items
    .map((it) => {
      const a = mapArticle(it, base);
      if (!a) return null;
      const fd = it.fieldData || {};
      const sort =
        it.lastPublished || it.lastUpdated || it.createdOn || fd['publish-date'] || '';
      return { ...a, sort: String(sort) };
    })
    .filter((a): a is LandingArticle & { sort: string } => a !== null)
    .sort((a, b) => Date.parse(b.sort) - Date.parse(a.sort))
    .slice(0, 8)
    .map(({ sort: _s, ...rest }) => rest);

    articles = mapped;
  }

  const partnerLogos = assetList
    .filter((a) => {
      const name = `${a.displayName || ''} ${a.originalFileName || ''}`.toLowerCase();
      return a.hostedUrl && (name.includes('partner') || name.includes('sponsor') || name.includes('brand'));
    })
    .slice(0, 6)
    .map((a) => ({
      name: a.displayName || a.originalFileName || 'Partner',
      url: a.hostedUrl!,
    }));

  return {
    siteName,
    magazineUrl,
    logoUrl: logo || fallback.logoUrl,
    logoMarkUrl: mark || fallback.logoMarkUrl,
    articles,
    articleCount,
    partnerLogos,
  };
}
