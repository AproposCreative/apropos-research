/**
 * Sætter Webflow CMS Switch `lydversion` = true når en artikel får podcast-lyd.
 * Best-effort: fejler ikke podcast-pipelinen hvis Webflow er nede.
 */

import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import {
  articleLocaleExists,
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  patchArticleFieldDataForLocale,
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';

export const WEBFLOW_LYDVERSION_FIELD = 'lydversion';

type Runtime = { token: string; collectionId: string };

function resolveRuntime(): Runtime | null {
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const collectionId =
    (file.articlesCollectionId !== undefined ? file.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID) ||
    undefined;
  if (!token || !collectionId) return null;
  return { token, collectionId };
}

async function listMatchBySlug(
  runtime: Runtime,
  slug: string,
  cmsLocaleId?: string
): Promise<string | null> {
  const pageSize = 100;
  let offset = 0;
  while (offset < 5000) {
    const qs = new URLSearchParams({
      limit: String(pageSize),
      offset: String(offset),
    });
    if (cmsLocaleId) qs.set('cmsLocaleId', cmsLocaleId);
    const url = `https://api.webflow.com/v2/collections/${runtime.collectionId}/items?${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${runtime.token}`, 'Accept-Version': '1.0.0' },
      cache: 'no-store',
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { items?: Array<{ id?: string; fieldData?: { slug?: string } }> };
    const page = data.items || [];
    const match = page.find((it) => String(it.fieldData?.slug || '').trim() === slug);
    if (match?.id) return String(match.id);
    if (page.length < pageSize) break;
    offset += pageSize;
  }
  return null;
}

/** Find Articles item-id via slug (prøver DK, derefter EN). */
export async function findWebflowArticleIdBySlug(slug: string): Promise<string | null> {
  const runtime = resolveRuntime();
  if (!runtime) return null;
  const trimmed = slug.trim();
  if (!trimmed) return null;

  // Fast path: Webflow list supports slug query on some plans/API versions
  const qs = new URLSearchParams({ limit: '5', slug: trimmed });
  const url = `https://api.webflow.com/v2/collections/${runtime.collectionId}/items?${qs}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${runtime.token}`, 'Accept-Version': '1.0.0' },
      cache: 'no-store',
    });
    if (res.ok) {
      const data = (await res.json()) as { items?: Array<{ id?: string; fieldData?: { slug?: string } }> };
      const exact = (data.items || []).find((it) => String(it.fieldData?.slug || '').trim() === trimmed);
      if (exact?.id) return String(exact.id);
    }
  } catch {
    /* fall through */
  }

  const locales = resolveWebflowLocaleIds();
  return (
    (await listMatchBySlug(runtime, trimmed, locales.dk)) ||
    (await listMatchBySlug(runtime, trimmed, locales.en)) ||
    (await listMatchBySlug(runtime, trimmed))
  );
}

/**
 * Markér artikel (og EN-variant hvis den findes) med Lydversion = true.
 * Publicerer kun locales der allerede er live.
 */
export async function markWebflowAudioVersion(slug: string): Promise<{
  ok: boolean;
  itemId?: string;
  updatedLocales: string[];
  skipped?: string;
}> {
  const runtime = resolveRuntime();
  if (!runtime) {
    return { ok: false, updatedLocales: [], skipped: 'Webflow ikke konfigureret' };
  }

  let itemId: string | null = null;
  try {
    itemId = await findWebflowArticleIdBySlug(slug);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn('[podcast] lydversion lookup failed', slug, msg);
    return { ok: false, updatedLocales: [], skipped: msg };
  }

  if (!itemId) {
    return { ok: false, updatedLocales: [], skipped: `Ingen Webflow-artikel med slug ${slug}` };
  }

  const locales = resolveWebflowLocaleIds();
  const targets = [locales.dk, locales.en];
  const updatedLocales: string[] = [];

  for (const cmsLocaleId of targets) {
    try {
      const exists = await articleLocaleExists(itemId, cmsLocaleId);
      if (!exists) continue;

      const item = await fetchArticleItemByLocale(itemId, cmsLocaleId);
      if (item.fieldData[WEBFLOW_LYDVERSION_FIELD] === true) {
        updatedLocales.push(cmsLocaleId);
        continue;
      }

      await patchArticleFieldDataForLocale(itemId, { [WEBFLOW_LYDVERSION_FIELD]: true }, cmsLocaleId);

      if (isWebflowLocalePublished(item)) {
        await publishArticleItemForLocale(itemId, cmsLocaleId);
      }
      updatedLocales.push(cmsLocaleId);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn('[podcast] lydversion patch failed', slug, cmsLocaleId, msg);
    }
  }

  return { ok: updatedLocales.length > 0, itemId, updatedLocales };
}
