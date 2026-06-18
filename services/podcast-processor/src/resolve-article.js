import { getDb } from './firebase.js';

function articleUrlForSlug(slug) {
  const base = (process.env.NEWSLETTER_ARTICLE_BASE_URL || 'https://www.aproposmagazine.com').replace(/\/$/, '');
  if (base.includes('/articles')) return `${base}/${slug}`;
  return `${base}/articles/${slug}`;
}

function titleFrom(data) {
  for (const key of ['name', 'title', 'articleTitle']) {
    const v = data[key];
    if (typeof v === 'string' && v.trim()) return v.trim();
  }
  return null;
}

async function fromFirestore(slug) {
  const db = getDb();
  const byId = await db.collection('articles').doc(slug).get();
  if (byId.exists) {
    const title = titleFrom(byId.data() || {});
    if (title) return { slug, title, articleUrl: articleUrlForSlug(slug) };
  }

  const q = await db.collection('articles').where('slug', '==', slug).limit(1).get();
  if (!q.empty) {
    const title = titleFrom(q.docs[0].data() || {});
    if (title) return { slug, title, articleUrl: articleUrlForSlug(slug) };
  }
  return null;
}

async function fromWebflow(slug) {
  const token = process.env.WEBFLOW_API_TOKEN?.trim();
  const siteId = process.env.WEBFLOW_SITE_ID?.trim();
  const collectionId = process.env.WEBFLOW_ARTICLES_COLLECTION_ID?.trim();
  if (!token || !siteId || !collectionId) return null;

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' };
  let offset = 0;
  const pageSize = 100;

  while (offset < 5000) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) return null;
    const data = await res.json();
    const page = data.items || [];
    const match = page.find((it) => {
      if (it?.isDraft) return false;
      const fd = it.fieldData || {};
      return fd.slug === slug && typeof fd.name === 'string' && fd.name.trim();
    });
    if (match) {
      return {
        slug,
        title: match.fieldData.name.trim(),
        articleUrl: articleUrlForSlug(slug),
      };
    }
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return null;
}

export async function resolveArticle(slug) {
  const fs = await fromFirestore(slug);
  if (fs) return fs;
  return fromWebflow(slug);
}
