/**
 * Locale-aware Webflow CMS item helpers (DK/EN localization).
 */

import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { resolveAutoTranslateEnabled } from '@/lib/webflow/article-translation-settings';

export type WebflowLocaleIds = {
  dk: string;
  en: string;
};

async function resolveRuntime(): Promise<{ token: string; collectionId: string }> {
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const collectionId =
    (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) ||
    undefined;
  if (!token || !collectionId) {
    throw new Error('Manglende Webflow API token eller Articles Collection ID');
  }
  return { token, collectionId };
}

export function resolveWebflowLocaleIds(): WebflowLocaleIds {
  return {
    dk: env.WEBFLOW_CMS_LOCALE_DK,
    en: env.WEBFLOW_CMS_LOCALE_EN,
  };
}

/** Synk check (env default). Brug resolveAutoTranslateEnabled() for runtime/Firestore. */
export function isArticleAutoTranslateEnabled(): boolean {
  return env.WEBFLOW_AUTO_TRANSLATE_EN === 'true';
}

export async function isArticleAutoTranslateEnabledAsync(): Promise<boolean> {
  return resolveAutoTranslateEnabled();
}

/** Tjek om en artikel har en variant for den angivne CMS-locale. */
export async function articleLocaleExists(itemId: string, cmsLocaleId: string): Promise<boolean> {
  const { token, collectionId } = await resolveRuntime();
  const qs = new URLSearchParams({ cmsLocaleId });
  const itemUrl = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}?${qs}`;
  const res = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  return res.ok;
}

export type WebflowLocaleItem = {
  id: string;
  cmsLocaleId?: string;
  fieldData: Record<string, unknown>;
  lastPublished?: string | null;
  lastUpdated?: string | null;
  isDraft?: boolean;
  isArchived?: boolean;
};

/** Locale er live på sitet (ikke kun kladde). */
export function isWebflowLocalePublished(
  item: Pick<WebflowLocaleItem, 'lastPublished' | 'isDraft'>
): boolean {
  if (item.isDraft === true) return false;
  return Boolean(item.lastPublished?.trim());
}

/** Typed Webflow locale fetch failure — callers can distinguish 404 vs auth/5xx. */
export class WebflowLocaleFetchError extends Error {
  readonly status: number;
  /** Parsed Retry-After delay in ms when the API provided one (e.g. 429). */
  readonly retryAfterMs: number | null;
  constructor(message: string, status: number, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'WebflowLocaleFetchError';
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/** Parse Retry-After header (seconds or HTTP-date) into milliseconds. */
export function parseRetryAfterMs(headerValue: string | null): number | null {
  if (!headerValue?.trim()) return null;
  const raw = headerValue.trim();
  const asSeconds = Number(raw);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) {
    return Math.round(asSeconds * 1000);
  }
  const asDate = Date.parse(raw);
  if (Number.isFinite(asDate)) {
    return Math.max(0, asDate - Date.now());
  }
  return null;
}

export async function fetchArticleItemByLocale(
  itemId: string,
  cmsLocaleId: string,
  options: { live?: boolean; exact?: boolean } = {}
): Promise<WebflowLocaleItem> {
  const { token, collectionId } = await resolveRuntime();
  const qs = new URLSearchParams({ cmsLocaleId });
  const itemUrl = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}${options.live ? '/live' : ''}?${qs}`;
  let res: Response;
  try {
    res = await fetch(itemUrl, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    throw new WebflowLocaleFetchError(`Webflow network error: ${msg}`, 0);
  }
  if (!res.ok) {
    const retryAfterMs = parseRetryAfterMs(res.headers.get('retry-after'));
    const j = (await res.json().catch(() => ({}))) as { message?: string };
    throw new WebflowLocaleFetchError(
      j?.message || `Webflow fetch item error ${res.status}`,
      res.status,
      retryAfterMs
    );
  }
  const item: {
    id?: string;
    cmsLocaleId?: string;
    lastPublished?: string | null;
    lastUpdated?: string | null;
    isDraft?: boolean;
    isArchived?: boolean;
    fieldData?: Record<string, unknown>;
  } = await res.json();
  if (options.exact && (item.id !== itemId || item.cmsLocaleId !== cmsLocaleId ||
      !item.fieldData || typeof item.fieldData !== 'object' || Array.isArray(item.fieldData) ||
      (options.live && (item.isDraft !== false || item.isArchived === true || !Number.isFinite(Date.parse(item.lastPublished || '')))))) {
    throw new Error('Webflow returnerede en anden artikel eller sprogversion.');
  }
  return {
    id: String(item.id || itemId),
    cmsLocaleId: item.cmsLocaleId,
    lastPublished: item.lastPublished ?? null,
    lastUpdated: item.lastUpdated ?? null,
    isDraft: item.isDraft,
    isArchived: item.isArchived,
    fieldData: (item.fieldData || {}) as Record<string, unknown>,
  };
}

/** Only an explicitly qualified English live copy may use this operation. */
export async function unpublishEnglishArticle(itemId: string): Promise<void> {
  const { token, collectionId } = await resolveRuntime();
  const { dk, en } = resolveWebflowLocaleIds();
  if (!/^[a-f0-9]{24}$/.test(itemId) || !/^[a-f0-9]{24}$/.test(en) || en === dk) {
    throw new Error('Engelsk artikelidentitet kunne ikke bekræftes.');
  }
  const qs = new URLSearchParams({ cmsLocaleId: en });
  const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}/live?${qs}`, {
    method: 'DELETE', headers: { Authorization: `Bearer ${token}` },
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (res.status !== 204) throw new Error(`Webflow afpublicerede ikke EN (${res.status}).`);
}

/** Attach a translated English draft to an existing article identity. */
export async function createEnglishArticleVariant(itemId: string, fieldData: Record<string, unknown>): Promise<void> {
  const { token, collectionId } = await resolveRuntime();
  const { dk, en } = resolveWebflowLocaleIds();
  if (!/^[a-f0-9]{24}$/.test(itemId) || !/^[a-f0-9]{24}$/.test(en) || en === dk) {
    throw new Error('Engelsk artikelidentitet kunne ikke bekræftes.');
  }
  const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/insert`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ items: [{ id: itemId, cmsLocaleIds: [en], isDraft: true, fieldData }] }),
    redirect: 'error', signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Webflow kunne ikke oprette den engelske kladde (${res.status}).`);
  const result = await res.json();
  if (!Array.isArray(result.items) || result.items.length !== 1 ||
      result.items[0].id !== itemId || result.items[0].cmsLocaleId !== en) {
    throw new Error('Webflow bekræftede ikke den forventede engelske kladde.');
  }
}

export async function patchArticleFieldDataForLocale(
  itemId: string,
  fieldData: Record<string, unknown>,
  cmsLocaleId: string
): Promise<void> {
  const { getCmsSeoSlugs } = await import('@/lib/seo-engine/webflow-adapter');
  const slugs = getCmsSeoSlugs();
  const metadataFields = (['seoTitle', 'metaDescription'] as const).filter(field => slugs[field] in fieldData);
  if (metadataFields.length) {
    const ids = resolveWebflowLocaleIds();
    const locale = cmsLocaleId === ids.dk ? 'da' : cmsLocaleId === ids.en ? 'en' : null;
    if (!locale) throw new Error('Ukendt SEO-locale');
    const { assertEditorialMetadataWritable } = await import('@/lib/seo-engine/post-publish/editorial');
    await assertEditorialMetadataWritable(itemId, locale, metadataFields);
  }
  const { token, collectionId } = await resolveRuntime();
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ id: itemId, cmsLocaleId, fieldData }],
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow locale update error ${res.status}`);
  }
}

/** Publicér ét item for en specifik CMS-locale. */
export async function publishArticleItemForLocale(itemId: string, cmsLocaleId: string): Promise<void> {
  const { token, collectionId } = await resolveRuntime();
  const res = await fetch(`https://api.webflow.com/v2/collections/${collectionId}/items/publish`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Accept-Version': '1.0.0',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      items: [{ id: itemId, cmsLocaleIds: [cmsLocaleId] }],
    }),
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow locale publish error ${res.status}`);
  }
}
