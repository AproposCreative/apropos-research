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
  isDraft?: boolean;
};

/** Locale er live på sitet (ikke kun kladde). */
export function isWebflowLocalePublished(
  item: Pick<WebflowLocaleItem, 'lastPublished' | 'isDraft'>
): boolean {
  if (item.isDraft === true) return false;
  return Boolean(item.lastPublished?.trim());
}

export async function fetchArticleItemByLocale(
  itemId: string,
  cmsLocaleId: string
): Promise<WebflowLocaleItem> {
  const { token, collectionId } = await resolveRuntime();
  const qs = new URLSearchParams({ cmsLocaleId });
  const itemUrl = `https://api.webflow.com/v2/collections/${collectionId}/items/${itemId}?${qs}`;
  const res = await fetch(itemUrl, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!res.ok) {
    const j = await res.json().catch(() => ({}));
    throw new Error(j?.message || `Webflow fetch item error ${res.status}`);
  }
  const item: {
    id?: string;
    cmsLocaleId?: string;
    lastPublished?: string | null;
    isDraft?: boolean;
    fieldData?: Record<string, unknown>;
  } = await res.json();
  return {
    id: String(item.id || itemId),
    cmsLocaleId: item.cmsLocaleId,
    lastPublished: item.lastPublished ?? null,
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
