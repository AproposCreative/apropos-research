import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { optimizeAndUploadImage, type OptimizeAndUploadImageResult } from '@/lib/images/optimize-and-upload';
import {
  buildContentImageRole,
  buildImageAltText,
  resolveArticleSeoImageBaseName,
} from '@/lib/images/seo-image-name';
import { logger } from '@/lib/logger';
import { readMapping } from '@/lib/webflow-mapping';

export type ContentImageOptimizeOptions = {
  maxSizeKB?: number;
  maxLongEdge?: number;
  qualityStart?: number;
  qualityMin?: number;
  minOriginalKB?: number;
  articleLimit?: number;
  imagesPerArticle?: number;
  force?: boolean;
};

export type ContentImageEntry = {
  src: string;
  index: number;
};

export type ContentImageCandidate = {
  id: string;
  title: string;
  slug: string;
  contentSlug: string;
  images: ContentImageEntry[];
  status: 'ready' | 'no-content' | 'no-images' | 'all-optimized';
};

export type ContentImageRunResult = ContentImageCandidate & {
  ok: boolean;
  error?: string;
  imagesOptimized?: number;
  imagesFailed?: number;
  outputs?: OptimizeAndUploadImageResult[];
};

const OPTIMIZED_PATH_MARKER = 'webflow/content-images';

function getContentFieldSlug(): string {
  const mapping = readMapping();
  const entry = mapping.entries?.find((e) => e.internal === 'content');
  return entry?.webflowSlug || 'content';
}

/** Re-export fetch helpers from mobile optimizer pattern */
async function resolveRuntime(): Promise<{ token: string; siteId: string; collectionId: string }> {
  const { getWebflowConfig } = await import('@/lib/webflow-config');
  const { env } = await import('@/lib/config/env');
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const siteId = (file.siteId !== undefined ? file.siteId : env.WEBFLOW_SITE_ID) || undefined;
  const collectionId =
    (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) ||
    undefined;
  if (!token || !siteId || !collectionId) {
    throw new Error('Manglende Webflow API token, Site ID eller Articles Collection ID');
  }
  return { token, siteId, collectionId };
}

async function fetchAllArticleItems(): Promise<any[]> {
  const { token, siteId, collectionId } = await resolveRuntime();
  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const pageSize = 100;
  const maxItems = 5000;
  let offset = 0;
  const items: any[] = [];

  while (offset < maxItems) {
    const url = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items?limit=${pageSize}&offset=${offset}`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error(j?.message || `Webflow items error ${res.status}`);
    }
    const data: any = await res.json();
    const page = data.items || [];
    items.push(...page);
    if (page.length < pageSize) break;
    offset += pageSize;
  }

  return items;
}

export function extractImageSrcsFromHtml(html: string): ContentImageEntry[] {
  if (!html || typeof html !== 'string') return [];
  const entries: ContentImageEntry[] = [];
  const re = /<img\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi;
  let match: RegExpExecArray | null;
  let index = 0;
  while ((match = re.exec(html)) !== null) {
    const src = match[1]?.trim();
    if (src && /^https?:\/\//i.test(src)) {
      entries.push({ src, index });
      index += 1;
    }
  }
  return entries;
}

export function shouldOptimizeSrc(src: string, force?: boolean): boolean {
  if (!src || !/^https?:\/\//i.test(src)) return false;
  const lower = src.toLowerCase();
  if (/\.(gif|svg)(\?|$)/i.test(lower)) return false;
  if (!force && lower.includes(OPTIMIZED_PATH_MARKER)) return false;
  if (!force && lower.includes('webflow/mobile-images')) return false;
  if (!force && lower.includes('webflow/thumb-images')) return false;
  return true;
}

async function estimateImageSizeKB(url: string): Promise<number | null> {
  try {
    const res = await fetch(url, { method: 'HEAD', signal: AbortSignal.timeout(8000) });
    const len = res.headers.get('content-length');
    if (len) return Math.round(Number(len) / 1024);
  } catch {
    /* fall through */
  }
  return null;
}

function candidateFromItem(item: any, contentSlug: string, options: ContentImageOptimizeOptions): ContentImageCandidate {
  const fd = (item?.fieldData || {}) as Record<string, unknown>;
  const rawContent = fd[contentSlug];
  const html = typeof rawContent === 'string' ? rawContent : '';
  const title = typeof fd.name === 'string' && fd.name.trim() ? fd.name.trim() : String(item.id);
  const slug = typeof fd.slug === 'string' && fd.slug.trim() ? fd.slug.trim() : title;

  if (!html.trim()) {
    return { id: String(item.id), title, slug, contentSlug, images: [], status: 'no-content' };
  }

  const allImages = extractImageSrcsFromHtml(html);
  const optimizable = allImages.filter((img) => shouldOptimizeSrc(img.src, options.force));

  let status: ContentImageCandidate['status'] = 'ready';
  if (optimizable.length === 0) {
    status = allImages.length === 0 ? 'no-images' : 'all-optimized';
  }

  return {
    id: String(item.id),
    title,
    slug,
    contentSlug,
    images: optimizable,
    status,
  };
}

export async function previewContentImageOptimization(
  options: ContentImageOptimizeOptions = {}
): Promise<{
  contentSlug: string;
  totalArticles: number;
  articlesWithImages: number;
  totalImages: number;
  optimizableImages: number;
  ready: number;
  candidates: ContentImageCandidate[];
}> {
  const contentSlug = getContentFieldSlug();
  const items = await fetchAllArticleItems();
  const candidates = items.map((item) => candidateFromItem(item, contentSlug, options));

  const articlesWithImages = candidates.filter((c) => c.images.length > 0 || c.status === 'all-optimized').length;
  let totalImgCount = 0;
  let optimizableCount = 0;
  for (const item of items) {
    const fd = (item?.fieldData || {}) as Record<string, unknown>;
    const html = typeof fd[contentSlug] === 'string' ? (fd[contentSlug] as string) : '';
    const imgs = extractImageSrcsFromHtml(html);
    totalImgCount += imgs.length;
    optimizableCount += imgs.filter((img) => shouldOptimizeSrc(img.src, options.force)).length;
  }

  return {
    contentSlug,
    totalArticles: candidates.length,
    articlesWithImages,
    totalImages: totalImgCount,
    optimizableImages: optimizableCount,
    ready: candidates.filter((c) => c.status === 'ready').length,
    candidates,
  };
}

async function updateArticleContent(itemId: string, contentSlug: string, html: string): Promise<void> {
  const { token, siteId, collectionId } = await resolveRuntime();
  const itemUrl = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items/${itemId}`;
  const current = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!current.ok) {
    const j = await current.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow fetch item error ${current.status}`);
  }
  const item: any = await current.json();
  const res = await fetch(itemUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fieldData: {
        ...(item.fieldData || {}),
        [contentSlug]: html,
      },
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow update error ${res.status}`);
  }
}

async function logContentOptimization(result: ContentImageRunResult): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection('webflowContentImageOptimizations').add({
    itemId: result.id,
    title: result.title,
    slug: result.slug,
    ok: result.ok,
    error: result.error || null,
    imagesOptimized: result.imagesOptimized ?? 0,
    imagesFailed: result.imagesFailed ?? 0,
    createdAt: FieldValue.serverTimestamp(),
  });
}

function escapeHtmlAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;');
}

function replaceImageSrc(html: string, oldSrc: string, newSrc: string, alt?: string): string {
  let next = html.split(oldSrc).join(newSrc);
  if (!alt?.trim()) return next;

  const escapedSrc = newSrc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const imgRe = new RegExp(`(<img\\b[^>]*\\bsrc\\s*=\\s*["']${escapedSrc}["'])([^>]*>)`, 'gi');
  next = next.replace(imgRe, (match, prefix: string, suffix: string) => {
    const safeAlt = escapeHtmlAttr(alt.trim());
    if (/\balt\s*=\s*["'][^"']+["']/i.test(match)) {
      return `${prefix}${suffix.replace(/\balt\s*=\s*["'][^"']*["']/i, `alt="${safeAlt}"`)}`;
    }
    return `${prefix} alt="${safeAlt}"${suffix}`;
  });
  return next;
}

export type ContentImageInlineOptimizeResult = {
  html: string;
  imagesOptimized: number;
  imagesFailed: number;
  changed: boolean;
};

/** Optimer inline-billeder i HTML (til publish/webhook — muterer ikke Webflow direkte). */
export async function optimizeContentHtmlInline(
  html: string,
  options: {
    articleSlug?: string;
    articleTitle?: string;
    articleSeoTitle?: string;
    maxSizeKB?: number;
    maxLongEdge?: number;
    minOriginalKB?: number;
    imagesPerArticle?: number;
    force?: boolean;
  } = {}
): Promise<ContentImageInlineOptimizeResult> {
  if (!html?.trim()) {
    return { html: html || '', imagesOptimized: 0, imagesFailed: 0, changed: false };
  }

  const imagesPerArticle = Math.min(Math.max(Math.round(options.imagesPerArticle ?? 8), 1), 12);
  const minOriginalKB = Math.max(0, Math.round(options.minOriginalKB ?? 80));
  const allImages = extractImageSrcsFromHtml(html).filter((img) => shouldOptimizeSrc(img.src, options.force));

  if (allImages.length === 0) {
    return { html, imagesOptimized: 0, imagesFailed: 0, changed: false };
  }

  const sized = await Promise.all(
    allImages.map(async (img) => {
      const sizeKB = await estimateImageSizeKB(img.src);
      return { ...img, sizeKB };
    })
  );
  const sorted = [...sized]
    .filter((img) => minOriginalKB === 0 || img.sizeKB === null || img.sizeKB >= minOriginalKB)
    .sort((a, b) => (b.sizeKB ?? 9999) - (a.sizeKB ?? 9999))
    .slice(0, imagesPerArticle);

  let nextHtml = html;
  let imagesOptimized = 0;
  let imagesFailed = 0;
  const baseName = resolveArticleSeoImageBaseName({
    slug: options.articleSlug,
    seoTitle: options.articleSeoTitle,
    title: options.articleTitle,
  });

  for (const img of sorted) {
    const role = buildContentImageRole(img.index);
    try {
      const output = await optimizeAndUploadImage({
        imageUrl: img.src,
        maxSizeKB: options.maxSizeKB ?? Number(process.env.WEBFLOW_CONTENT_IMAGE_MAX_KB || 200),
        maxLongEdge: options.maxLongEdge ?? Number(process.env.WEBFLOW_CONTENT_IMAGE_MAX_EDGE || 1200),
        qualityStart: 82,
        qualityMin: 55,
        folder: 'webflow/content-images',
        baseName,
        role,
      });
      const alt = buildImageAltText({
        seoTitle: options.articleSeoTitle,
        articleTitle: options.articleTitle,
        role,
      });
      nextHtml = replaceImageSrc(nextHtml, img.src, output.url, alt);
      imagesOptimized += 1;
    } catch (e) {
      imagesFailed += 1;
      logger.warn('[webflow/content-image] inline optimize failed', {
        src: img.src,
        message: e instanceof Error ? e.message : String(e),
      });
    }
  }

  return {
    html: nextHtml,
    imagesOptimized,
    imagesFailed,
    changed: nextHtml !== html,
  };
}

export async function maybeOptimizeContentImagesForFieldData(args: {
  fieldData: Record<string, unknown>;
  articleTitle?: string;
  articleSlug?: string;
  articleSeoTitle?: string;
  force?: boolean;
}): Promise<{ imagesOptimized: number; imagesFailed: number }> {
  const enabled =
    process.env.WEBFLOW_AUTO_CONTENT_IMAGE_OPTIMIZE !== '0' &&
    process.env.WEBFLOW_AUTO_CONTENT_IMAGE_OPTIMIZE !== 'false';
  if (!enabled) return { imagesOptimized: 0, imagesFailed: 0 };

  const contentSlug = getContentFieldSlug();
  const raw = args.fieldData[contentSlug];
  const html = typeof raw === 'string' ? raw : '';
  if (!html.trim()) return { imagesOptimized: 0, imagesFailed: 0 };

  try {
    const result = await optimizeContentHtmlInline(html, {
      articleTitle: args.articleTitle,
      articleSlug: args.articleSlug,
      articleSeoTitle: args.articleSeoTitle,
      force: args.force,
    });
    if (result.changed) {
      args.fieldData[contentSlug] = result.html;
    }
    return { imagesOptimized: result.imagesOptimized, imagesFailed: result.imagesFailed };
  } catch (e) {
    logger.warn('[webflow/content-image] auto optimize skipped', {
      message: e instanceof Error ? e.message : String(e),
    });
    return { imagesOptimized: 0, imagesFailed: 0 };
  }
}

export async function fetchArticleItemById(itemId: string): Promise<{ id: string; fieldData: Record<string, unknown> }> {
  const { token, siteId, collectionId } = await resolveRuntime();
  const itemUrl = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items/${itemId}`;
  const res = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow fetch item error ${res.status}`);
  }
  const item: { id?: string; fieldData?: Record<string, unknown> } = await res.json();
  return { id: String(item.id || itemId), fieldData: (item.fieldData || {}) as Record<string, unknown> };
}

export async function patchArticleFieldData(
  itemId: string,
  fieldData: Record<string, unknown>
): Promise<void> {
  const { token, siteId, collectionId } = await resolveRuntime();
  const itemUrl = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items/${itemId}`;
  const res = await fetch(itemUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fieldData }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow update error ${res.status}`);
  }
}

export async function runContentImageOptimization(options: ContentImageOptimizeOptions = {}): Promise<{
  contentSlug: string;
  totalArticles: number;
  ready: number;
  processed: number;
  succeeded: number;
  failed: number;
  imagesOptimized: number;
  imagesFailed: number;
  allAlreadyOptimized: boolean;
  skippedReason: string | null;
  results: ContentImageRunResult[];
}> {
  const contentSlug = getContentFieldSlug();
  const articleLimit = Math.min(Math.max(Math.round(options.articleLimit ?? 5), 1), 15);
  const imagesPerArticle = Math.min(Math.max(Math.round(options.imagesPerArticle ?? 5), 1), 10);
  const minOriginalKB = Math.max(0, Math.round(options.minOriginalKB ?? 80));

  const items = await fetchAllArticleItems();
  const allCandidates = items.map((item) => candidateFromItem(item, contentSlug, options));
  const readyCandidates = allCandidates.filter((c) => c.status === 'ready');
  const batch = readyCandidates.slice(0, articleLimit);

  const results: ContentImageRunResult[] = [];
  let imagesOptimized = 0;
  let imagesFailed = 0;

  for (const candidate of batch) {
    const item = items.find((i) => String(i.id) === candidate.id);
    if (!item) {
      results.push({ ...candidate, ok: false, error: 'Artikel ikke fundet' });
      continue;
    }

    const fd = (item.fieldData || {}) as Record<string, unknown>;
    let html = typeof fd[contentSlug] === 'string' ? (fd[contentSlug] as string) : '';
    if (!html.trim()) {
      results.push({ ...candidate, ok: false, error: 'Tom brødtekst' });
      continue;
    }

    const imagesToProcess = candidate.images.slice(0, imagesPerArticle);
    const outputs: OptimizeAndUploadImageResult[] = [];
    let articleImagesOk = 0;
    let articleImagesFail = 0;

    const sized = await Promise.all(
      imagesToProcess.map(async (img) => {
        const sizeKB = await estimateImageSizeKB(img.src);
        return { ...img, sizeKB };
      })
    );

    const sorted = [...sized].sort((a, b) => (b.sizeKB ?? 9999) - (a.sizeKB ?? 9999));

    const seoTitle = typeof fd['seo-title'] === 'string' ? fd['seo-title'] : undefined;
    const baseName = resolveArticleSeoImageBaseName({
      slug: candidate.slug,
      seoTitle,
      title: candidate.title,
    });

    for (const img of sorted) {
      if (minOriginalKB > 0 && img.sizeKB !== null && img.sizeKB < minOriginalKB) {
        continue;
      }

      const role = buildContentImageRole(img.index);
      try {
        const output = await optimizeAndUploadImage({
          imageUrl: img.src,
          maxSizeKB: options.maxSizeKB ?? 200,
          maxLongEdge: options.maxLongEdge ?? 1200,
          qualityStart: options.qualityStart ?? 82,
          qualityMin: options.qualityMin ?? 55,
          folder: 'webflow/content-images',
          baseName,
          role,
        });
        const alt = buildImageAltText({
          seoTitle,
          articleTitle: candidate.title,
          role,
        });
        html = replaceImageSrc(html, img.src, output.url, alt);
        outputs.push(output);
        articleImagesOk += 1;
        imagesOptimized += 1;
      } catch (e) {
        articleImagesFail += 1;
        imagesFailed += 1;
        logger.warn('[webflow/content-image] image optimize failed', {
          src: img.src,
          message: e instanceof Error ? e.message : String(e),
        });
      }
    }

    if (articleImagesOk === 0) {
      results.push({
        ...candidate,
        ok: false,
        error:
          articleImagesFail > 0
            ? 'Alle billeder fejlede'
            : minOriginalKB > 0
              ? `Ingen billeder over ${minOriginalKB} KB`
              : 'Ingen billeder at optimere',
        imagesOptimized: 0,
        imagesFailed: articleImagesFail,
      });
      continue;
    }

    try {
      await updateArticleContent(candidate.id, contentSlug, html);
      const result: ContentImageRunResult = {
        ...candidate,
        ok: true,
        imagesOptimized: articleImagesOk,
        imagesFailed: articleImagesFail,
        outputs,
      };
      results.push(result);
      await logContentOptimization(result).catch(() => undefined);
    } catch (e) {
      results.push({
        ...candidate,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        imagesOptimized: articleImagesOk,
        imagesFailed: articleImagesFail,
      });
    }
  }

  const processed = results.length;
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const allAlreadyOptimized = readyCandidates.length === 0 && !options.force;

  let skippedReason: string | null = null;
  if (processed === 0 || (succeeded === 0 && imagesOptimized === 0)) {
    if (allAlreadyOptimized) {
      skippedReason =
        'Ingen brødtekst-billeder mangler optimering. Aktivér «Tving genoptimering» eller sænk min. KB.';
    } else if (readyCandidates.length === 0) {
      skippedReason = 'Ingen artikler med optimerbare billeder i brødtekst.';
    } else {
      skippedReason = 'Ingen artikler blev opdateret i denne batch.';
    }
  }

  return {
    contentSlug,
    totalArticles: allCandidates.length,
    ready: readyCandidates.length,
    processed,
    succeeded,
    failed,
    imagesOptimized,
    imagesFailed,
    allAlreadyOptimized,
    skippedReason,
    results,
  };
}
