import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { getCmsSeoSlugs, toWebflowSeoPatch } from '@/lib/seo-engine/webflow-adapter';
import { cmsLocaleIdFor, publicArticleUrl } from '@/lib/seo-engine/opportunity-engine/locale';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { publishedSnapshot, type CmsSnapshot } from './snapshot';
import { reviewKey, type Metadata, type PublishedArticle } from './policy';
import { load } from 'cheerio';

function runtimeConfig() {
  const file = getWebflowConfig();
  const token = file.apiToken ?? env.WEBFLOW_API_TOKEN;
  const collectionId = file.articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  if (!token || !collectionId) throw new Error('seo_webflow_auth_missing');
  return { token, collectionId };
}

async function readItem(itemId: string, cmsLocaleId: string, live: boolean): Promise<CmsSnapshot> {
  const { token, collectionId } = runtimeConfig();
  const path = `/v2/collections/${encodeURIComponent(collectionId)}/items/${encodeURIComponent(itemId)}${live ? '/live' : ''}`;
  const response = await fetch(`https://api.webflow.com${path}?${new URLSearchParams({ cmsLocaleId })}`, {
    headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`seo_webflow_${live ? 'live' : 'staged'}_read_${response.status}`);
  return response.json();
}

export async function readPublishedArticle(itemId: string, locale: 'da' | 'en') {
  const cmsLocaleId = cmsLocaleIdFor(locale);
  if (!cmsLocaleId) throw new Error('seo_webflow_locale_missing');
  const [live, staged] = await Promise.all([readItem(itemId, cmsLocaleId, true), readItem(itemId, cmsLocaleId, false)]);
  const snapshot = publishedSnapshot({ itemId, locale, cmsLocaleId, live, staged, slugs: getCmsSeoSlugs() });
  const slug = String(live.fieldData.slug || '');
  if (!slug || /[/?#\\]/.test(slug)) throw new Error('seo_invalid_article_slug');
  return { snapshot, live, staged, publicUrl: publicArticleUrl(encodeURIComponent(slug), locale) };
}

/** Exact HTML check, not a ready deployment or successful CMS request. */
export async function verifyPublicMetadata(url: string, expected: Metadata): Promise<{ url: string; checkedAt: string }> {
  const parsed = new URL(url);
  if (parsed.origin !== 'https://www.aproposmagazine.com' || !/^\/(en\/)?articles\/[^/]+$/.test(parsed.pathname)) {
    throw new Error('seo_public_url_not_allowed');
  }
  const response = await fetch(url, { cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`seo_public_read_${response.status}`);
  const html = await response.text();
  if (html.length > 3_000_000) throw new Error('seo_public_response_too_large');
  const $ = load(html);
  const title = $('head title');
  const description = $('head meta[name="description"]');
  if (title.length !== 1 || description.length !== 1 || title.text().trim() !== expected.seoTitle ||
    description.attr('content')?.trim() !== expected.metaDescription) throw new Error('seo_public_metadata_pending');
  return { url, checkedAt: new Date().toISOString() };
}

/**
 * Caller durably records the intended patch BEFORE invoking this function and
 * reconciles live state on ambiguous failures. Never automatically repeat it.
 */
export async function applyPublishedMetadata(args: {
  analyzed: PublishedArticle;
  patch: Partial<Metadata>;
  /** Recheck settings/locks and persist intent under the same CMS lease. */
  beforeWrite: (fresh: PublishedArticle) => Promise<void>;
}) {
  const keys = Object.keys(args.patch);
  if (!keys.length || keys.some(key => !['seoTitle', 'metaDescription'].includes(key))) throw new Error('seo_invalid_patch');
  const patch = toWebflowSeoPatch(args.patch);
  if (Object.keys(patch).length !== keys.length) throw new Error('seo_empty_patch_value');
  const { itemId, locale } = args.analyzed;
  const lease = await acquireCmsWriteLease(itemId, locale);
  try {
    const fresh = await readPublishedArticle(itemId, locale);
    if (!fresh.snapshot.published || fresh.snapshot.hasUnpublishedChanges || reviewKey(fresh.snapshot) !== reviewKey(args.analyzed)) {
      throw new Error('seo_article_changed_before_write');
    }
    await args.beforeWrite(fresh.snapshot);
    await lease.assertOwned();
    const { token, collectionId } = runtimeConfig();
    // Only metadata goes to the live PATCH endpoint; no whole-item publish action.
    const response = await fetch(`https://api.webflow.com/v2/collections/${encodeURIComponent(collectionId)}/items/live`, {
      method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: [{ id: itemId, cmsLocaleId: cmsLocaleIdFor(locale), fieldData: patch }] }),
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) throw new Error(`seo_webflow_live_write_${response.status}`);
    return await reconcilePublishedMetadata(args.analyzed, args.patch);
  } finally { await lease.release(); }
}

export async function reconcilePublishedMetadata(before: PublishedArticle, patch: Partial<Metadata>) {
  const current = await readPublishedArticle(before.itemId, before.locale);
  const expected = { ...before.metadata, ...patch };
  if (!current.snapshot.published || current.snapshot.hasUnpublishedChanges ||
    current.snapshot.contentVersion !== before.contentVersion ||
    current.snapshot.metadata.seoTitle !== expected.seoTitle ||
    current.snapshot.metadata.metaDescription !== expected.metaDescription) throw new Error('seo_cms_reconciliation_required');
  const publicReceipt = await verifyPublicMetadata(current.publicUrl, expected);
  return { after: current.snapshot, publicReceipt };
}
