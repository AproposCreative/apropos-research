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
  cmsLocaleId: string
): Promise<WebflowLocaleItem> {
  const { token, collectionId } = await resolveRuntime();
  const qs = new URLSearchParams({ cmsLocaleId });
  const itemUrl = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}?${qs}`;
  let res: Response;
  try {
    res = await fetch(itemUrl, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
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
    fieldData?: Record<string, unknown>;
  } = await res.json();
  return {
    id: String(item.id || itemId),
    cmsLocaleId: item.cmsLocaleId,
    lastPublished: item.lastPublished ?? null,
    lastUpdated: item.lastUpdated ?? null,
    isDraft: item.isDraft,
    fieldData: (item.fieldData || {}) as Record<string, unknown>,
  };
}

export async function patchArticleFieldDataForLocale(
  itemId: string,
  fieldData: Record<string, unknown>,
  cmsLocaleId: string
): Promise<void> {
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
