#!/usr/bin/env node
/**
 * Ingest articles from Apropos Magazine's Webflow CMS as style-training samples.
 * Fetches published articles via the Webflow Data API v2, extracts title, content,
 * author, category, and date, then stores them in data/apropos-style-samples.jsonl.
 */
import pino from 'pino';
import fs from 'node:fs';
import path from 'node:path';

const logger = pino({ level: 'info' });

const WEBFLOW_API_BASE = 'https://api.webflow.com/v2';
const OUTPUT_PATH = path.resolve(process.cwd(), 'data', 'apropos-style-samples.jsonl');
const ITEMS_PER_PAGE = 100;

interface StyleSample {
  id: string;
  title: string;
  subtitle: string;
  author: string;
  category: string;
  intro: string;
  bodyText: string;
  date: string;
  wordCount: number;
  slug: string;
  seoTitle: string;
  metaDescription: string;
  rating: number | null;
  platform: string;
  topic: string;
  readTime: number | null;
  fetchedAt: string;
}

function stripHtml(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<\/?(h[1-6]|div|section|article|blockquote|li|ul|ol|span|em|strong|a|figure|figcaption|img)[^>]*>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function loadExistingIds(): Set<string> {
  const ids = new Set<string>();
  try {
    if (fs.existsSync(OUTPUT_PATH)) {
      const content = fs.readFileSync(OUTPUT_PATH, 'utf8');
      for (const line of content.split('\n')) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.id) ids.add(obj.id);
        } catch {}
      }
    }
  } catch {}
  return ids;
}

async function fetchWebflowItems(token: string, siteId: string, collectionId: string): Promise<any[]> {
  const allItems: any[] = [];
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const url = `${WEBFLOW_API_BASE}/collections/${collectionId}/items?limit=${ITEMS_PER_PAGE}&offset=${offset}`;
    logger.info({ url, offset }, 'Fetching items from Webflow');

    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Version': '1.0.0',
      },
    });

    if (!res.ok) {
      const err = await res.text().catch(() => '');
      logger.error({ status: res.status, body: err.slice(0, 500) }, 'Webflow API error');
      break;
    }

    const data = await res.json();
    const items: any[] = data.items || [];
    allItems.push(...items);
    logger.info({ fetched: items.length, totalSoFar: allItems.length }, 'Batch fetched');

    if (items.length < ITEMS_PER_PAGE) {
      hasMore = false;
    } else {
      offset += ITEMS_PER_PAGE;
    }
  }

  return allItems;
}

async function resolveAuthorName(
  token: string,
  siteId: string,
  authorsCollectionId: string | undefined,
  authorRefId: string,
  cache: Map<string, string>
): Promise<string> {
  if (cache.has(authorRefId)) return cache.get(authorRefId)!;
  if (!authorsCollectionId) return 'Unknown';

  try {
    const res = await fetch(`${WEBFLOW_API_BASE}/collections/${authorsCollectionId}/items/${authorRefId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const name = data.fieldData?.name || data.fieldData?.title || 'Unknown';
      cache.set(authorRefId, name);
      return name;
    }
  } catch {}
  cache.set(authorRefId, 'Unknown');
  return 'Unknown';
}

async function resolveSectionName(
  token: string,
  sectionsCollectionId: string | undefined,
  sectionRefId: string,
  cache: Map<string, string>
): Promise<string> {
  if (cache.has(sectionRefId)) return cache.get(sectionRefId)!;
  if (!sectionsCollectionId) return '';

  try {
    const res = await fetch(`${WEBFLOW_API_BASE}/collections/${sectionsCollectionId}/items/${sectionRefId}`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (res.ok) {
      const data = await res.json();
      const name = data.fieldData?.name || data.fieldData?.title || '';
      cache.set(sectionRefId, name);
      return name;
    }
  } catch {}
  cache.set(sectionRefId, '');
  return '';
}

function loadWebflowConfig(): Record<string, string | undefined> {
  try {
    const cfgPath = path.resolve(process.cwd(), 'data', 'webflow-config.json');
    if (fs.existsSync(cfgPath)) {
      return JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
    }
  } catch {}
  return {};
}

export async function ingestApropos() {
  const cfg = loadWebflowConfig();
  const token = cfg.apiToken || process.env.WEBFLOW_API_TOKEN;
  const siteId = cfg.siteId || process.env.WEBFLOW_SITE_ID;
  const articlesCollectionId = cfg.articlesCollectionId || process.env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const authorsCollectionId = cfg.authorsCollectionId || process.env.WEBFLOW_AUTHORS_COLLECTION_ID;
  const sectionsCollectionId = process.env.WEBFLOW_SECTIONS_COLLECTION_ID;

  if (!token || !siteId) {
    logger.warn('Missing WEBFLOW_API_TOKEN or WEBFLOW_SITE_ID — skipping Apropos ingest');
    return { added: 0, skipped: 0, total: 0 };
  }

  let colId = articlesCollectionId;
  if (!colId) {
    logger.info('No WEBFLOW_ARTICLES_COLLECTION_ID set, attempting auto-discovery');
    const listRes = await fetch(`${WEBFLOW_API_BASE}/sites/${siteId}/collections`, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (listRes.ok) {
      const data = await listRes.json();
      const cols: any[] = Array.isArray(data) ? data : (data.collections || data.items || []);
      const candidate = cols.find((c: any) => {
        const slug = (c.slug || '').toLowerCase();
        const name = (c.name || '').toLowerCase();
        return slug.includes('article') || name.includes('article') || slug.includes('blog') || slug.includes('artik');
      });
      colId = candidate?.id;
    }
    if (!colId) {
      logger.error('Could not find articles collection in Webflow');
      return { added: 0, skipped: 0, total: 0 };
    }
    logger.info({ collectionId: colId }, 'Auto-discovered articles collection');
  }

  const existingIds = loadExistingIds();
  const items = await fetchWebflowItems(token, siteId, colId);
  logger.info({ totalItems: items.length }, 'Webflow items fetched');

  const authorCache = new Map<string, string>();
  const sectionCache = new Map<string, string>();
  const samples: StyleSample[] = [];
  let skipped = 0;

  for (const item of items) {
    const id = item.id;
    if (existingIds.has(id)) {
      skipped++;
      continue;
    }

    const fd = item.fieldData || {};
    const title = fd.name || fd.title || '';
    const rawContent = fd['post-body'] || fd.content || fd['post-content'] || '';
    const bodyText = stripHtml(rawContent);

    if (!title || bodyText.length < 200) {
      skipped++;
      continue;
    }

    let author = 'Unknown';
    const authorRef = fd.author;
    if (typeof authorRef === 'string' && authorRef.length > 10) {
      author = await resolveAuthorName(token, siteId, authorsCollectionId, authorRef, authorCache);
    } else if (typeof authorRef === 'string') {
      author = authorRef;
    }

    let category = '';
    const sectionRef = fd.section;
    if (typeof sectionRef === 'string' && sectionRef.length > 10) {
      category = await resolveSectionName(token, sectionsCollectionId, sectionRef, sectionCache);
    } else if (typeof sectionRef === 'string') {
      category = sectionRef;
    }
    if (!category) {
      category = fd.category || fd.tag || '';
    }

    const subtitle = fd.subtitle || '';
    const intro = stripHtml(fd.intro || fd.excerpt || '');
    const date = fd['publish-date'] || item.createdOn || new Date().toISOString();
    const wordCount = bodyText.split(/\s+/).filter(Boolean).length;
    const slug = fd.slug || '';
    const seoTitle = fd['seo-title'] || '';
    const metaDescription = fd['meta-description'] || '';
    const rawRating = fd.stjerne ?? fd.rating ?? null;
    const rating = typeof rawRating === 'number' ? rawRating : (typeof rawRating === 'string' && /^\d+$/.test(rawRating) ? parseInt(rawRating, 10) : null);
    const platform = fd['simple-rerfence'] || fd['watch-now-link'] || fd.streaming_service || '';
    const rawTopic = fd.topic || '';
    const topic = typeof rawTopic === 'string' ? rawTopic : '';
    const rawReadTime = fd['minutes-to-read'] ?? null;
    const readTime = typeof rawReadTime === 'number' ? rawReadTime : null;

    samples.push({
      id,
      title,
      subtitle,
      author,
      category,
      intro,
      bodyText,
      date,
      wordCount,
      slug,
      seoTitle,
      metaDescription,
      rating,
      platform,
      topic,
      readTime,
      fetchedAt: new Date().toISOString(),
    });
  }

  if (samples.length > 0) {
    const dir = path.dirname(OUTPUT_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    const lines = samples.map((s) => JSON.stringify(s)).join('\n') + '\n';
    fs.appendFileSync(OUTPUT_PATH, lines, 'utf8');
  }

  logger.info({
    added: samples.length,
    skipped,
    total: items.length,
    outputPath: OUTPUT_PATH,
  }, 'Apropos ingest complete');

  return { added: samples.length, skipped, total: items.length };
}

async function main() {
  const dotenv = await import('dotenv');
  dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
  dotenv.config();

  const result = await ingestApropos();
  console.log(`Done: ${result.added} new style samples, ${result.skipped} skipped, ${result.total} total from CMS`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
