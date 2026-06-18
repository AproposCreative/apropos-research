import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { optimizeAndUploadImage, type OptimizeAndUploadImageResult } from '@/lib/images/optimize-and-upload';
import { resolveArticleSeoImageBaseName } from '@/lib/images/seo-image-name';
import { logger } from '@/lib/logger';
import {
  getMobileImageFieldSlugs,
  patchMobileImageFromThumb,
  type MobileImageOptimizeOptions,
} from '@/lib/webflow/mobile-image-optimizer';

export type ThumbImageOptimizeOptions = MobileImageOptimizeOptions & {
  minOriginalKB?: number;
  preserveDimensions?: boolean;
};

export type ThumbImageCandidate = {
  id: string;
  title: string;
  slug: string;
  thumbUrl: string | null;
  status: 'ready' | 'skip-existing' | 'missing-thumb' | 'skip-small';
};

export type ThumbImageRunResult = ThumbImageCandidate & {
  ok: boolean;
  error?: string;
  output?: OptimizeAndUploadImageResult;
};

const THUMB_OPTIMIZED_PATH = 'webflow/thumb-images';

function resolveImageUrl(value: unknown): string | null {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === 'object' && value !== null && 'url' in value) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

export function isOptimizedThumbImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const lower = decoded.toLowerCase();
  return (
    (lower.includes(THUMB_OPTIMIZED_PATH) || lower.includes('webflow%2fthumb-images')) &&
    /\.webp(\?|$|&)/i.test(lower)
  );
}

export function needsThumbImageOptimization(args: {
  thumbUrl: string | null;
  force?: boolean;
  minOriginalKB?: number;
}): boolean {
  if (!args.thumbUrl) return false;
  if (args.force) return true;
  if (isOptimizedThumbImageUrl(args.thumbUrl)) return false;

  const lower = args.thumbUrl.toLowerCase();
  if (/\.png(\?|$)/i.test(lower)) return true;
  if (/\.(jpe?g|webp)(\?|$)/i.test(lower) && lower.includes('cdn.prod.website-files.com')) {
    return true;
  }
  if (/\.(jpe?g)(\?|$)/i.test(lower) && !lower.includes(THUMB_OPTIMIZED_PATH)) {
    return true;
  }
  return !isOptimizedThumbImageUrl(args.thumbUrl);
}

async function fetchAllArticleItems(): Promise<any[]> {
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

  const headers = { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' } as const;
  const pageSize = 100;
  let offset = 0;
  const items: any[] = [];

  while (offset < 5000) {
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

function candidateFromItem(
  item: any,
  thumbSlug: string,
  force: boolean,
  minOriginalKB: number
): ThumbImageCandidate {
  const fd = (item?.fieldData || {}) as Record<string, unknown>;
  const thumbUrl = resolveImageUrl(fd[thumbSlug]);
  const title = typeof fd.name === 'string' && fd.name.trim() ? fd.name.trim() : String(item.id);
  const slug = typeof fd.slug === 'string' && fd.slug.trim() ? fd.slug.trim() : title;

  if (!thumbUrl) {
    return { id: String(item.id), title, slug, thumbUrl: null, status: 'missing-thumb' };
  }
  if (!needsThumbImageOptimization({ thumbUrl, force, minOriginalKB })) {
    return { id: String(item.id), title, slug, thumbUrl, status: 'skip-existing' };
  }
  return { id: String(item.id), title, slug, thumbUrl, status: 'ready' };
}

export async function previewThumbImageOptimization(options: ThumbImageOptimizeOptions = {}): Promise<{
  thumbSlug: string;
  total: number;
  ready: number;
  missingThumb: number;
  existing: number;
  candidates: ThumbImageCandidate[];
}> {
  const { thumbSlug } = await getMobileImageFieldSlugs();
  const force = !!options.force;
  const minOriginalKB = Math.max(0, Math.round(options.minOriginalKB ?? 120));
  const items = await fetchAllArticleItems();
  const candidates = items.map((item) => candidateFromItem(item, thumbSlug, force, minOriginalKB));
  return {
    thumbSlug,
    total: candidates.length,
    ready: candidates.filter((c) => c.status === 'ready').length,
    missingThumb: candidates.filter((c) => c.status === 'missing-thumb').length,
    existing: candidates.filter((c) => c.status === 'skip-existing').length,
    candidates,
  };
}

async function updateThumbField(itemId: string, thumbSlug: string, url: string): Promise<void> {
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

  const itemUrl = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items/${itemId}`;
  const current = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!current.ok) {
    const j = await current.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow fetch item error ${current.status}`);
  }
  const item: { fieldData?: Record<string, unknown> } = await current.json();
  const fieldData = { ...(item.fieldData || {}), [thumbSlug]: url };
  const patch = await fetch(itemUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ fieldData }),
  });
  if (!patch.ok) {
    const j = await patch.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow patch error ${patch.status}`);
  }
}

async function logOptimization(result: ThumbImageRunResult, thumbSlug: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection('webflowThumbImageOptimize').add({
    itemId: result.id,
    thumbSlug,
    slug: result.slug,
    title: result.title,
    thumbUrl: result.thumbUrl,
    ok: result.ok,
    error: result.error || null,
    output: result.output || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function runThumbImageOptimization(options: ThumbImageOptimizeOptions = {}): Promise<{
  thumbSlug: string;
  total: number;
  ready: number;
  totalCandidates: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  allAlreadyOptimized: boolean;
  skippedReason: string | null;
  results: ThumbImageRunResult[];
}> {
  const { thumbSlug, mobileImageSlug } = await getMobileImageFieldSlugs();
  const force = !!options.force;
  const limit = Math.min(Math.max(Math.round(options.limit ?? 10), 1), 25);
  const minOriginalKB = Math.max(0, Math.round(options.minOriginalKB ?? 120));
  const items = await fetchAllArticleItems();
  const allCandidates = items.map((item) => candidateFromItem(item, thumbSlug, force, minOriginalKB));
  const readyCount = allCandidates.filter((c) => c.status === 'ready').length;
  const candidates = allCandidates.filter((c) => c.status === 'ready').slice(0, limit);

  const results: ThumbImageRunResult[] = [];

  for (const candidate of candidates) {
    if (!candidate.thumbUrl) {
      results.push({ ...candidate, ok: false, error: 'Mangler thumb URL' });
      continue;
    }

    try {
      const output = await optimizeAndUploadImage({
        imageUrl: candidate.thumbUrl,
        maxSizeKB: options.maxSizeKB ?? Number(process.env.WEBFLOW_THUMB_IMAGE_MAX_KB || 600),
        maxLongEdge: options.maxLongEdge ?? 2400,
        qualityStart: options.qualityStart ?? 88,
        qualityMin: options.qualityMin ?? 72,
        preserveDimensions: options.preserveDimensions !== false,
        minOriginalKB,
        folder: 'webflow/thumb-images',
        baseName: resolveArticleSeoImageBaseName({
          slug: candidate.slug,
          title: candidate.title,
        }),
        role: 'thumb',
      });
      await updateThumbField(candidate.id, thumbSlug, output.url);

      const sourceItem = items.find((it) => String(it.id) === candidate.id);
      const fd = (sourceItem?.fieldData || {}) as Record<string, unknown>;
      const mobileImageUrl = resolveImageUrl(fd[mobileImageSlug]);
      await patchMobileImageFromThumb({
        itemId: candidate.id,
        thumbUrl: output.url,
        mobileImageUrl,
        articleSlug: candidate.slug,
        articleTitle: candidate.title,
        articleSeoTitle:
          typeof fd['seo-title'] === 'string' ? fd['seo-title'] : undefined,
        force,
      }).catch((e) => {
        logger.warn('[webflow/thumb-image] mobile follow-up skipped', {
          itemId: candidate.id,
          message: e instanceof Error ? e.message : String(e),
        });
      });

      const result: ThumbImageRunResult = { ...candidate, ok: true, output };
      results.push(result);
      await logOptimization(result, thumbSlug).catch(() => undefined);
    } catch (e) {
      const result: ThumbImageRunResult = {
        ...candidate,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
      results.push(result);
      await logOptimization(result, thumbSlug).catch(() => undefined);
    }
  }

  const processed = results.length;
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const allAlreadyOptimized = readyCount === 0 && !force;

  let skippedReason: string | null = null;
  if (processed === 0) {
    if (allAlreadyOptimized) {
      skippedReason = 'Alle desktop-billeder er allerede optimeret (WebP).';
    } else if (readyCount === 0) {
      skippedReason = 'Ingen artikler er klar — tjek at thumb-feltet er udfyldt.';
    } else {
      skippedReason = 'Ingen artikler blev behandlet i denne batch.';
    }
  }

  return {
    thumbSlug,
    total: allCandidates.length,
    ready: readyCount,
    totalCandidates: readyCount,
    processed,
    succeeded,
    failed,
    skipped: allCandidates.length - readyCount,
    allAlreadyOptimized,
    skippedReason,
    results,
  };
}

export async function maybeOptimizeThumbImageForFieldData(args: {
  fieldData: Record<string, unknown>;
  articleTitle?: string;
  articleSlug?: string;
  articleSeoTitle?: string;
  force?: boolean;
}): Promise<boolean> {
  const enabled =
    process.env.WEBFLOW_AUTO_THUMB_IMAGE_OPTIMIZE !== '0' &&
    process.env.WEBFLOW_AUTO_THUMB_IMAGE_OPTIMIZE !== 'false';
  if (!enabled) return false;

  try {
    const { thumbSlug } = await getMobileImageFieldSlugs();
    const thumbUrl = resolveImageUrl(args.fieldData[thumbSlug] ?? args.fieldData.thumb);
    const minOriginalKB = Number(process.env.WEBFLOW_THUMB_IMAGE_MIN_KB || 120);
    if (!needsThumbImageOptimization({ thumbUrl, force: args.force, minOriginalKB })) {
      return false;
    }
    if (!thumbUrl) return false;

    const output = await optimizeAndUploadImage({
      imageUrl: thumbUrl,
      maxSizeKB: Number(process.env.WEBFLOW_THUMB_IMAGE_MAX_KB || 600),
      maxLongEdge: Number(process.env.WEBFLOW_THUMB_IMAGE_MAX_EDGE || 2400),
      qualityStart: 88,
      qualityMin: 72,
      preserveDimensions: true,
      minOriginalKB,
      folder: 'webflow/thumb-images',
      baseName: resolveArticleSeoImageBaseName({
        slug: args.articleSlug,
        seoTitle: args.articleSeoTitle,
        title: args.articleTitle,
      }),
      role: 'thumb',
    });
    args.fieldData[thumbSlug] = output.url;
    return true;
  } catch (e) {
    logger.warn('[webflow/thumb-image] auto optimize skipped', {
      message: e instanceof Error ? e.message : String(e),
    });
    return false;
  }
}
