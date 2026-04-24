#!/usr/bin/env npx tsx
import fs from 'node:fs';
import path from 'node:path';
import { config as loadEnv } from 'dotenv';
import { publishArticleToWebflow } from '@/lib/webflow-service';
import { getWebflowConfig } from '@/lib/webflow-config';
import type { WebflowArticleFields } from '@/lib/webflow/types';

type SourceArticle = {
  url?: string;
  title?: string;
  author?: string;
  category?: string;
  content?: string;
  date?: string;
  tags?: string[];
  excerpt?: string;
};

type MigrationResult = {
  detectedLivArticles: number;
  uniqueSlugs: number;
  existingInWebflow: number;
  attempted: number;
  created: number;
  failed: number;
  skippedInvalid: number;
};

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

function slugFromUrl(rawUrl: string | undefined, fallbackTitle: string): string {
  if (rawUrl) {
    try {
      const u = new URL(rawUrl);
      const last = u.pathname.split('/').filter(Boolean).pop();
      if (last && last.trim()) return slugify(last.trim());
    } catch {
      // Fall through to title-based slug.
    }
  }
  return slugify(fallbackTitle);
}

function looksLikeLivArticle(a: SourceArticle): boolean {
  const author = String(a.author || '').toLowerCase();
  const tags = Array.isArray(a.tags) ? a.tags.map((t) => String(t).toLowerCase()) : [];
  return author.includes('liv brandt') || tags.some((t) => t.includes('liv brandt'));
}

function readSourceArticles(): SourceArticle[] {
  const filePath = path.join(process.cwd(), 'data', 'apropos-articles.json');
  const raw = fs.readFileSync(filePath, 'utf8');
  const parsed = JSON.parse(raw);
  return Array.isArray(parsed) ? (parsed as SourceArticle[]) : [];
}

function resolveWebflowConfigForScript() {
  const fileCfg = getWebflowConfig();
  const token = (fileCfg.apiToken !== undefined ? fileCfg.apiToken : process.env.WEBFLOW_API_TOKEN) || '';
  const siteId = (fileCfg.siteId !== undefined ? fileCfg.siteId : process.env.WEBFLOW_SITE_ID) || '';
  const articlesCollectionId =
    (fileCfg.articlesCollectionId !== undefined
      ? fileCfg.articlesCollectionId
      : process.env.WEBFLOW_ARTICLES_COLLECTION_ID) || '';
  return { token, siteId, articlesCollectionId };
}

async function fetchExistingWebflowSlugs(): Promise<Set<string>> {
  const { token, siteId, articlesCollectionId } = resolveWebflowConfigForScript();
  const slugs = new Set<string>();
  if (!token || !siteId || !articlesCollectionId) return slugs;

  const pageLimit = 100;
  let offset = 0;
  for (let page = 0; page < 20; page += 1) {
    const url =
      `https://api.webflow.com/v2/sites/${siteId}/collections/${articlesCollectionId}/items` +
      `?limit=${pageLimit}&offset=${offset}`;
    const res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        'Accept-Version': '1.0.0',
      },
    });
    if (!res.ok) break;
    const data = (await res.json()) as { items?: Array<{ fieldData?: Record<string, unknown> }> };
    const items = Array.isArray(data.items) ? data.items : [];
    for (const item of items) {
      const slug = item?.fieldData?.slug;
      if (typeof slug === 'string' && slug.trim()) slugs.add(slug.trim().toLowerCase());
    }
    if (items.length < pageLimit) break;
    offset += pageLimit;
  }
  return slugs;
}

function toWebflowArticleFields(a: SourceArticle): WebflowArticleFields | null {
  const title = String(a.title || '').trim();
  const content = String(a.content || '').trim();
  if (!title || !content) return null;

  const slug = slugFromUrl(a.url, title);
  const excerpt = String(a.excerpt || '').trim();
  const category = String(a.category || 'Kultur').trim() || 'Kultur';
  const tags = Array.isArray(a.tags)
    ? Array.from(
        new Set(
          a.tags
            .map((t) => String(t).trim())
            .filter(Boolean)
            .filter((t) => t.toLowerCase() !== 'liv brandt')
        )
      ).slice(0, 12)
    : [];

  const publishDate = a.date && !Number.isNaN(new Date(a.date).getTime()) ? a.date : new Date().toISOString();

  return {
    id: `liv-migration-${slug}`,
    title,
    slug,
    subtitle: '',
    content,
    excerpt,
    intro: excerpt,
    category,
    tags,
    author: 'Liv Brandt',
    publishDate,
    status: 'draft',
    seoTitle: title.slice(0, 80),
    seoDescription: (excerpt || content.slice(0, 250)).slice(0, 250),
    readTime: Math.max(1, Math.ceil(content.split(/\s+/).filter(Boolean).length / 200)),
    wordCount: content.split(/\s+/).filter(Boolean).length,
    featured: false,
    trending: false,
    presseakkreditering: false,
    aiGenerated: true,
    aiSourceUrl: a.url || null,
    aiModel: 'legacy-liv-migration',
  };
}

async function main() {
  loadEnv({ path: path.join(process.cwd(), '.env.local') });
  loadEnv({ path: path.join(process.cwd(), '.env') });

  const apply = process.argv.includes('--apply');
  const source = readSourceArticles();
  const liv = source.filter(looksLikeLivArticle);

  const dedupBySlug = new Map<string, SourceArticle>();
  for (const article of liv) {
    const title = String(article.title || '').trim();
    const slug = slugFromUrl(article.url, title || 'untitled');
    if (!slug) continue;
    const existing = dedupBySlug.get(slug);
    if (!existing) {
      dedupBySlug.set(slug, article);
      continue;
    }
    const aDate = new Date(article.date || 0).getTime();
    const eDate = new Date(existing.date || 0).getTime();
    if ((Number.isFinite(aDate) ? aDate : 0) > (Number.isFinite(eDate) ? eDate : 0)) {
      dedupBySlug.set(slug, article);
    }
  }

  const existingSlugs = await fetchExistingWebflowSlugs();
  const candidates = Array.from(dedupBySlug.values()).filter((a) => {
    const slug = slugFromUrl(a.url, String(a.title || ''));
    return !existingSlugs.has(slug.toLowerCase());
  });

  const result: MigrationResult = {
    detectedLivArticles: liv.length,
    uniqueSlugs: dedupBySlug.size,
    existingInWebflow: dedupBySlug.size - candidates.length,
    attempted: 0,
    created: 0,
    failed: 0,
    skippedInvalid: 0,
  };

  if (!apply) {
    console.log(
      JSON.stringify(
        {
          mode: 'dry-run',
          ...result,
          toCreateIfApply: candidates.length,
          note: 'Kør med --apply for at oprette manglende Liv-artikler som drafts i Webflow.',
        },
        null,
        2
      )
    );
    return;
  }

  for (const raw of candidates) {
    const payload = toWebflowArticleFields(raw);
    if (!payload) {
      result.skippedInvalid += 1;
      continue;
    }

    result.attempted += 1;
    try {
      await publishArticleToWebflow(payload);
      result.created += 1;
    } catch (error) {
      result.failed += 1;
      const title = String(raw.title || 'untitled');
      const message = error instanceof Error ? error.message : String(error);
      console.error(`[liv-migrate] failed: ${title} -> ${message}`);
    }
  }

  console.log(JSON.stringify({ mode: 'apply', ...result }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
