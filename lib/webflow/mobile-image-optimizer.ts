import { imageMeetsPolicy, inspectImageBatch } from '@/lib/images/inspect-image';
import { FieldValue } from 'firebase-admin/firestore';
import { env } from '@/lib/config/env';
import { getAdminDb } from '@/lib/firebase-admin';
import { optimizeAndUploadImage, type OptimizeAndUploadImageResult } from '@/lib/images/optimize-and-upload';
import { resolveArticleSeoImageBaseName } from '@/lib/images/seo-image-name';
import { logger } from '@/lib/logger';
import { getWebflowConfig } from '@/lib/webflow-config';

export type MobileImageOptimizeOptions = {
  maxSizeKB?: number;
  maxLongEdge?: number;
  qualityStart?: number;
  qualityMin?: number;
  force?: boolean;
  limit?: number;
  offset?: number;
};

export type MobileImageCandidate = {
  id: string;
  title: string;
  slug: string;
  thumbUrl: string | null;
  mobileImageUrl: string | null;
  status: 'ready' | 'skip-existing' | 'missing-thumb' | 'check-failed';
  error?: string;
};

const MOBILE_OPTIMIZED_PATH = 'webflow/mobile-images';

/** Kun spring over hvis Mobile Image er vores optimerede WebP-upload (Firebase). */
export function isOptimizedMobileImageUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  let decoded = url;
  try {
    decoded = decodeURIComponent(url);
  } catch {
    /* keep raw */
  }
  const lower = decoded.toLowerCase();
  return (
    (lower.includes(MOBILE_OPTIMIZED_PATH) || lower.includes('webflow%2fmobile-images')) &&
    /\.webp(\?|$|&)/i.test(lower)
  );
}

export async function needsMobileImageOptimization(args: {
  thumbUrl: string | null; mobileImageUrl: string | null; force?: boolean;
  maxSizeKB?: number; maxLongEdge?: number;
}): Promise<boolean> {
  if (!args.thumbUrl) return false;
  if (args.force || !args.mobileImageUrl) return true;
  return !(await imageMeetsPolicy(args.mobileImageUrl, Math.min(260, args.maxSizeKB ?? 260), Math.min(1200, args.maxLongEdge ?? 1200)));
}

export type MobileImageRunResult = MobileImageCandidate & {
  ok: boolean;
  error?: string;
  output?: OptimizeAndUploadImageResult;
};

type WebflowRuntime = {
  token: string;
  siteId: string;
  collectionId: string;
};

type WebflowField = {
  slug: string;
  displayName?: string;
  name?: string;
  type?: string;
};

function resolveRuntime(): WebflowRuntime {
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const siteId = (file.siteId !== undefined ? file.siteId : env.WEBFLOW_SITE_ID) || undefined;
  const collectionId = (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) || undefined;

  if (!token || !siteId || !collectionId) {
    throw new Error('Manglende Webflow API token, Site ID eller Articles Collection ID');
  }
  return { token, siteId, collectionId };
}

function fieldLabel(field: WebflowField): string {
  return `${field.slug} ${field.displayName || ''} ${field.name || ''}`.toLowerCase();
}

function findImageField(fields: WebflowField[], role: 'thumb' | 'mobile'): string {
  const bySlug = role === 'thumb'
    ? ['thumb', 'thumbnail', 'featured-image']
    : ['mobile-image', 'mobileimage', 'mobile-thumb', 'mobile-thumbnail'];
  const exact = fields.find((f) => bySlug.includes((f.slug || '').toLowerCase()));
  if (exact?.slug) return exact.slug;

  const found = fields.find((f) => {
    const label = fieldLabel(f);
    if (role === 'thumb') return label.includes('thumb') || label.includes('featured image');
    return label.includes('mobile image') || label.includes('mobile-image') || (label.includes('mobile') && label.includes('image'));
  });
  if (found?.slug) return found.slug;

  throw new Error(role === 'thumb' ? 'Kunne ikke finde thumb-felt i Webflow schema' : 'Kunne ikke finde Mobile Image-felt i Webflow schema');
}

export async function getMobileImageFieldSlugs(): Promise<{ thumbSlug: string; mobileImageSlug: string; fields: WebflowField[] }> {
  const { token, collectionId } = resolveRuntime();
  const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}`, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow schema error ${res.status}`);
  }
  const schema: any = await res.json();
  const fields = (schema.fields || []) as WebflowField[];
  return {
    thumbSlug: findImageField(fields, 'thumb'),
    mobileImageSlug: findImageField(fields, 'mobile'),
    fields,
  };
}

function resolveImageUrl(value: unknown): string | null {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (value && typeof value === 'object' && value !== null && 'url' in value) {
    const url = (value as { url?: unknown }).url;
    if (typeof url === 'string' && /^https?:\/\//i.test(url)) return url;
  }
  return null;
}

async function fetchAllArticleItems(): Promise<any[]> {
  const { token, siteId, collectionId } = resolveRuntime();
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

async function candidateFromItem(item: any, thumbSlug: string, mobileImageSlug: string, force: boolean, options: MobileImageOptimizeOptions): Promise<MobileImageCandidate> {
  const fd = (item?.fieldData || {}) as Record<string, unknown>;
  const thumbUrl = resolveImageUrl(fd[thumbSlug]);
  const mobileImageUrl = resolveImageUrl(fd[mobileImageSlug]);
  const title = typeof fd.name === 'string' && fd.name.trim() ? fd.name.trim() : String(item.id);
  const slug = typeof fd.slug === 'string' && fd.slug.trim() ? fd.slug.trim() : title;
  const base = { id: String(item.id), title, slug, thumbUrl, mobileImageUrl };
  if (!thumbUrl) return { ...base, status: 'missing-thumb' };
  try {
    const needed = await needsMobileImageOptimization({ thumbUrl, mobileImageUrl, force, ...options });
    return { ...base, status: needed ? 'ready' : 'skip-existing' };
  } catch (error) { return { ...base, status: 'check-failed', error: error instanceof Error ? error.message : String(error) }; }

}

export async function previewMobileImageOptimization(options: MobileImageOptimizeOptions = {}): Promise<{
  thumbSlug: string;
  mobileImageSlug: string;
  total: number;
  ready: number;
  missingThumb: number;
  existing: number;
  candidates: MobileImageCandidate[];
  offset: number; checked: number; nextOffset: number | null;
}> {
  const { thumbSlug, mobileImageSlug } = await getMobileImageFieldSlugs();
  const force = !!options.force;
  const items = await fetchAllArticleItems();
  const batch = await inspectImageBatch(items, options.offset, item => candidateFromItem(item, thumbSlug, mobileImageSlug, force, options));
  const candidates = batch.candidates;
  return {
    thumbSlug,
    mobileImageSlug,
    ...batch,
    total: items.length,
    ready: candidates.filter((c) => c.status === 'ready').length,
    missingThumb: candidates.filter((c) => c.status === 'missing-thumb').length,
    existing: candidates.filter((c) => c.status === 'skip-existing').length,
    candidates,
  };
}

async function updateMobileImageField(itemId: string, fieldSlug: string, url: string, expectedMobile: string | null, thumbSlug: string, expectedThumb: string): Promise<void> {
  const { token, siteId, collectionId } = resolveRuntime();
  const itemUrl = `https://api.webflow.com/v2/sites/${siteId}/collections/${collectionId}/items/${itemId}`;
  const current = await fetch(itemUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
    },
  });
  if (!current.ok) {
    const j = await current.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow fetch item error ${current.status}`);
  }
  const item: any = await current.json();
  if (resolveImageUrl(item.fieldData?.[fieldSlug]) !== expectedMobile || resolveImageUrl(item.fieldData?.[thumbSlug]) !== expectedThumb) {
    throw new Error('Article images changed during optimization; retry from a fresh preview');
  }
  const res = await fetch(itemUrl, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fieldData: {
        [fieldSlug]: item.fieldData?.[fieldSlug] && typeof item.fieldData[fieldSlug] === 'object' && 'alt' in item.fieldData[fieldSlug]
          ? { url, alt: item.fieldData[fieldSlug].alt } : url,
      },
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow update error ${res.status}`);
  }
}

async function logOptimization(result: MobileImageRunResult, mobileImageSlug: string): Promise<void> {
  const db = getAdminDb();
  if (!db) return;
  await db.collection('webflowMobileImageOptimizations').add({
    itemId: result.id,
    title: result.title,
    slug: result.slug,
    thumbUrl: result.thumbUrl,
    mobileImageUrl: result.output?.url || result.mobileImageUrl || null,
    mobileImageSlug,
    ok: result.ok,
    error: result.error || null,
    fileName: result.output?.fileName || null,
    originalSizeKB: result.output?.originalSizeKB || null,
    processedSizeKB: result.output?.processedSizeKB || null,
    width: result.output?.width || null,
    height: result.output?.height || null,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function runMobileImageOptimization(options: MobileImageOptimizeOptions = {}): Promise<{
  thumbSlug: string;
  mobileImageSlug: string;
  total: number;
  ready: number;
  totalCandidates: number;
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  allAlreadyOptimized: boolean;
  skippedReason: string | null;
  results: MobileImageRunResult[];
  offset: number; checked: number; nextOffset: number | null;
}> {
  const { thumbSlug, mobileImageSlug } = await getMobileImageFieldSlugs();
  const force = !!options.force;
  const limit = Math.min(Math.max(Math.round(options.limit ?? 10), 1), 25);
  const items = await fetchAllArticleItems();
  const batch = await inspectImageBatch(items, options.offset, item => candidateFromItem(item, thumbSlug, mobileImageSlug, force, options));
  const allCandidates = batch.candidates;
  const readyCount = allCandidates.filter((c) => c.status === 'ready').length;
  const candidates = allCandidates.filter((c) => c.status === 'ready').slice(0, limit);

  const results: MobileImageRunResult[] = allCandidates.filter(c => c.status === 'check-failed').map(c => ({ ...c, ok: false }));

  for (const candidate of candidates) {
    if (!candidate.thumbUrl) {
      results.push({ ...candidate, ok: false, error: 'Mangler thumb URL' });
      continue;
    }

    try {
      const output = await optimizeAndUploadImage({
        imageUrl: candidate.mobileImageUrl || candidate.thumbUrl,
        maxSizeKB: Math.min(260, options.maxSizeKB ?? 260),
        maxLongEdge: Math.min(1200, options.maxLongEdge ?? 1200),
        qualityStart: options.qualityStart ?? 85,
        qualityMin: options.qualityMin ?? 65,
        folder: 'webflow/mobile-images',
        baseName: resolveArticleSeoImageBaseName({
          slug: candidate.slug,
          title: candidate.title,
        }),
        role: 'mobile',
      });
      await updateMobileImageField(candidate.id, mobileImageSlug, output.url, candidate.mobileImageUrl, thumbSlug, candidate.thumbUrl);
      const result: MobileImageRunResult = {
        ...candidate,
        mobileImageUrl: output.url,
        ok: true,
        output,
      };
      results.push(result);
      await logOptimization(result, mobileImageSlug).catch((e) => {
        logger.warn('[webflow/mobile-image] failed to log optimization', {
          message: e instanceof Error ? e.message : String(e),
        });
      });
    } catch (e) {
      const result: MobileImageRunResult = {
        ...candidate,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      };
      results.push(result);
      await logOptimization(result, mobileImageSlug).catch(() => undefined);
    }
  }

  const processed = results.length;
  const succeeded = results.filter((r) => r.ok).length;
  const failed = results.filter((r) => !r.ok).length;
  const allAlreadyOptimized = allCandidates.length > 0 && allCandidates.every(c => c.status === 'skip-existing') && !force;

  let skippedReason: string | null = null;
  if (processed === 0) {
    if (allAlreadyOptimized) {
      skippedReason =
        'De kontrollerede mobilbilleder overholder størrelse og opløsning.';
    } else if (readyCount === 0) {
      skippedReason = 'Ingen billeder klar i denne gruppe. Kontrollér manglende billeder og fejl i målingen.';
    } else {
      skippedReason = 'Ingen artikler blev behandlet i denne batch.';
    }
  }

  return {
    thumbSlug,
    mobileImageSlug,
    offset: batch.offset, checked: batch.checked, nextOffset: batch.nextOffset,
    total: items.length,
    ready: readyCount,
    totalCandidates: candidates.length,
    processed,
    succeeded,
    failed,
    skipped: allCandidates.filter(c => c.status !== 'ready' && c.status !== 'check-failed').length,
    allAlreadyOptimized,
    skippedReason,
    results,
  };
}

export async function patchMobileImageFromThumb(args: {
  itemId: string;
  thumbUrl: string;
  mobileImageUrl?: string | null;
  articleTitle?: string;
  articleSlug?: string;
  articleSeoTitle?: string;
  force?: boolean;
}): Promise<{ patched: boolean; output?: OptimizeAndUploadImageResult }> {
  const enabled =
    process.env.WEBFLOW_MOBILE_IMAGE_OPTIMIZE !== '0' &&
    process.env.WEBFLOW_MOBILE_IMAGE_OPTIMIZE !== 'false';
  if (!enabled) return { patched: false };

  const { thumbSlug, mobileImageSlug } = await getMobileImageFieldSlugs();
  if (
    !(await needsMobileImageOptimization({
      thumbUrl: args.thumbUrl,
      mobileImageUrl: args.mobileImageUrl ?? null,
      force: args.force,
      maxSizeKB: Math.min(260, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_KB || 260)),
      maxLongEdge: Math.min(1200, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_EDGE || 1200)),
    }))
  ) {
    return { patched: false };
  }

  const output = await optimizeAndUploadImage({
    imageUrl: args.mobileImageUrl || args.thumbUrl,
    maxSizeKB: Math.min(260, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_KB || 260)),
    maxLongEdge: Math.min(1200, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_EDGE || 1200)),
    qualityStart: 85,
    qualityMin: 65,
    folder: 'webflow/mobile-images',
    baseName: resolveArticleSeoImageBaseName({
      slug: args.articleSlug,
      seoTitle: args.articleSeoTitle,
      title: args.articleTitle,
    }),
    role: 'mobile',
  });
  await updateMobileImageField(args.itemId, mobileImageSlug, output.url, args.mobileImageUrl ?? null, thumbSlug, args.thumbUrl);
  return { patched: true, output };
}

export async function maybeOptimizeMobileImageForFieldData(args: {
  fieldData: Record<string, any>;
  articleTitle?: string;
  articleSlug?: string;
  articleSeoTitle?: string;
  force?: boolean;
}): Promise<void> {
  const enabled =
    process.env.WEBFLOW_MOBILE_IMAGE_OPTIMIZE !== '0' &&
    process.env.WEBFLOW_MOBILE_IMAGE_OPTIMIZE !== 'false';
  if (!enabled) return;

  try {
    const { fieldData } = args;
    const { thumbSlug, mobileImageSlug } = await getMobileImageFieldSlugs();
    const thumbUrl = resolveImageUrl(fieldData[thumbSlug] ?? fieldData.thumb);
    const mobileImageUrl = resolveImageUrl(fieldData[mobileImageSlug]);
    if (!thumbUrl) return;
    if (!(await needsMobileImageOptimization({ thumbUrl, mobileImageUrl, force: args.force ?? false, maxSizeKB: Math.min(260, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_KB || 260)), maxLongEdge: Math.min(1200, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_EDGE || 1200)) }))) {
      return;
    }
    const output = await optimizeAndUploadImage({
      imageUrl: mobileImageUrl || thumbUrl,
      maxSizeKB: Math.min(260, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_KB || 260)),
      maxLongEdge: Math.min(1200, Number(process.env.WEBFLOW_MOBILE_IMAGE_MAX_EDGE || 1200)),
      qualityStart: 85,
      qualityMin: 65,
      folder: 'webflow/mobile-images',
      baseName: resolveArticleSeoImageBaseName({
        slug: args.articleSlug,
        seoTitle: args.articleSeoTitle,
        title: args.articleTitle,
      }),
      role: 'mobile',
    });
    const prior = fieldData[mobileImageSlug];
    fieldData[mobileImageSlug] = prior && typeof prior === 'object' && 'alt' in prior ? { url: output.url, alt: prior.alt } : output.url;
  } catch (e) {
    logger.warn('[webflow/mobile-image] auto optimization failed', {
      message: e instanceof Error ? e.message : String(e),
    });
    throw e;
  }
}
