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
  const fd = data.fieldData;
  if (fd && typeof fd === 'object') {
    const name = (fd as Record<string, unknown>).name;
    if (typeof name === 'string' && name.trim()) return name.trim();
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

function plainTextSnippet(raw: unknown, maxLen = 4000): string | null {
  if (typeof raw !== 'string' || !raw.trim()) return null;
  const text = raw
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, ' ')
    .trim();
  if (!text) return null;
  return text.length > maxLen ? `${text.slice(0, maxLen - 1).trim()}…` : text;
}

function descriptionFromRecord(data: Record<string, unknown>): string | null {
  const fd =
    data.fieldData && typeof data.fieldData === 'object'
      ? (data.fieldData as Record<string, unknown>)
      : data;

  for (const key of [
    'summary',
    'excerpt',
    'meta-description',
    'metaDescription',
    'seo-description',
    'post-summary',
    'post-body',
    'body',
    'content',
  ]) {
    const snippet = plainTextSnippet(fd[key]);
    if (snippet) return snippet;
  }
  return null;
}

function coverUrlFromRecord(data: Record<string, unknown>): string | null {
  const fd =
    data.fieldData && typeof data.fieldData === 'object'
      ? (data.fieldData as Record<string, unknown>)
      : data;

  for (const key of ['cover', 'thumbnail', 'main-image', 'mainImage', 'image']) {
    const v = fd[key];
    if (typeof v === 'string' && /^https?:\/\//i.test(v.trim())) return v.trim();
    if (v && typeof v === 'object') {
      const url = (v as { url?: unknown }).url;
      if (typeof url === 'string' && /^https?:\/\//i.test(url.trim())) return url.trim();
    }
  }
  return null;
}

function toResolved(
  slug: string,
  data: Record<string, unknown>,
  source: 'firestore' | 'webflow'
): ResolvedArticle | null {
  const title = titleFromFirestore(data);
  if (!title) return null;
  return {
    found: true,
    slug,
    title,
    authorName: authorFromFirestore(data),
    articleUrl: normalizeArticleUrl(slug),
    source,
    description: descriptionFromRecord(data),
    coverUrl: coverUrlFromRecord(data),
  };
}

async function resolveFromFirestore(slug: string): Promise<ResolvedArticle | null> {
  const db = getAdminDb();
  if (!db) return null;

  const byId = await db.collection('articles').doc(slug).get();
  if (byId.exists) {
    const resolved = toResolved(slug, (byId.data() || {}) as Record<string, unknown>, 'firestore');
    if (resolved) return resolved;
  }

  for (const field of ['slug', 'fieldData.slug'] as const) {
    try {
      const q = await db.collection('articles').where(field, '==', slug).limit(1).get();
      if (!q.empty) {
        const resolved = toResolved(
          slug,
          (q.docs[0]!.data() || {}) as Record<string, unknown>,
          'firestore'
        );
        if (resolved) return resolved;
      }
    } catch {
      /* ignore invalid field path */
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
  return toResolved(slug, match as Record<string, unknown>, 'webflow');
}

export async function resolveArticleBySlug(slug: string): Promise<ResolvedArticle | null> {
  const fromFs = await resolveFromFirestore(slug);
  if (fromFs) return fromFs;
  return resolveFromWebflow(slug);
}
