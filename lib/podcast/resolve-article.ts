import { getAdminDb } from '@/lib/firebase-admin';
import { getWebflowConfig } from '@/lib/webflow-config';
import { env } from '@/lib/config/env';
import { normalizeArticleUrl } from '@/lib/podcast/slug-from-url';
import type { ResolvedArticle } from '@/lib/podcast/types';

function titleFromFirestore(data: Record<string, unknown>): string | null {
  for (const key of ['name', 'title', 'articleTitle']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

function authorFromFirestore(data: Record<string, unknown>): string | null {
  for (const key of ['author', 'authorName', 'forfatter']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function resolveFromFirestore(slug: string): Promise<ResolvedArticle | null> {
  const db = getAdminDb();
  if (!db) return null;

  const byId = await db.collection('articles').doc(slug).get();
  if (byId.exists) {
    const data = (byId.data() || {}) as Record<string, unknown>;
    const title = titleFromFirestore(data);
    if (title) {
      return {
        found: true,
        slug,
        title,
        authorName: authorFromFirestore(data),
        articleUrl: normalizeArticleUrl(slug),
        source: 'firestore',
      };
    }
  }

  const q = await db.collection('articles').where('slug', '==', slug).limit(1).get();
  if (!q.empty) {
    const data = (q.docs[0]!.data() || {}) as Record<string, unknown>;
    const title = titleFromFirestore(data);
    if (title) {
      return {
        found: true,
        slug,
        title,
        authorName: authorFromFirestore(data),
        articleUrl: normalizeArticleUrl(slug),
        source: 'firestore',
      };
    }
  }

  return null;
}

async function fetchWebflowArticles(): Promise<{ items: any[]; error?: string }> {
  const cfg = getWebflowConfig();
  const token = cfg.apiToken || env.WEBFLOW_API_TOKEN;
  const siteId = cfg.siteId || env.WEBFLOW_SITE_ID;
  const collectionId = cfg.articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!token || !siteId || !collectionId) {
    return { items: [], error: 'Webflow er ikke konfigureret' };
  }

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const pageSize = 100;
  let offset = 0;
  const items: any[] = [];

  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers, cache: 'no-store' });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      return { items, error: (j as { message?: string }).message || `Webflow ${res.status}` };
    }
    const data: any = await res.json();
    const page = data.items || [];
    items.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return { items };
}

async function resolveFromWebflow(slug: string): Promise<ResolvedArticle | null> {
  const { items } = await fetchWebflowArticles();
  const match = items.find((it) => {
    if (it?.isDraft === true) return false;
    const fd = (it?.fieldData || {}) as Record<string, unknown>;
    return typeof fd.slug === 'string' && fd.slug.trim() === slug;
  });

  if (!match) return null;

  const fd = (match.fieldData || {}) as Record<string, unknown>;
  const name = typeof fd.name === 'string' ? fd.name.trim() : '';
  if (!name) return null;

  return {
    found: true,
    slug,
    title: name,
    authorName: null,
    articleUrl: normalizeArticleUrl(slug),
    source: 'webflow',
  };
}

export async function resolveArticleBySlug(slug: string): Promise<ResolvedArticle | null> {
  const fromFs = await resolveFromFirestore(slug);
  if (fromFs) return fromFs;
  return resolveFromWebflow(slug);
}
