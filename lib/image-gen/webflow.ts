import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { imageGenArticle } from './article';
import { load } from 'cheerio';

type CmsItem = { id: string; isDraft?: boolean; isArchived?: boolean; lastPublished?: string | null;
  cmsLocaleId?: string; fieldData: Record<string, unknown> };
const idPattern = /^[a-f0-9]{24}$/;
export function imageGenCmsConfiguration() {
  const file = getWebflowConfig();
  // Production credentials are authoritative. A stale local config file must
  // never shadow rotated Vercel environment variables for CMS writes.
  const token = env.WEBFLOW_API_TOKEN ?? file.apiToken;
  const collection = env.WEBFLOW_ARTICLES_COLLECTION_ID ?? file.articlesCollectionId;
  const locale = env.WEBFLOW_CMS_LOCALE_DK;
  if (!token || !idPattern.test(collection || '') || !idPattern.test(locale || '')) throw new Error('image_gen_cms_unconfigured');
  return { token, collection, locale, site: env.WEBFLOW_SITE_ID ?? file.siteId };
}
const configuration = imageGenCmsConfiguration;
async function getCms(path: string, query: URLSearchParams) {
  const { token, collection } = configuration();
  const response = await fetch(`https://api.webflow.com/v2/collections/${collection}/items${path}?${query}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (!response.ok) throw new Error(`image_gen_cms_${response.status}`);
  if (!response.headers.get('content-type')?.includes('application/json')) throw new Error('image_gen_cms_invalid');
  // Bounded CMS read. Do not log article content or upstream errors.
  const reader = response.body?.getReader(); if (!reader) throw new Error('image_gen_cms_invalid');
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) {
    const chunk = await reader.read(); if (chunk.done) break;
    size += chunk.value.byteLength; if (size > 8_000_000) throw new Error('image_gen_cms_too_large');
    chunks.push(chunk.value);
  } } finally { await reader.cancel().catch(() => undefined); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}
function validateItem(value: unknown, locale: string): CmsItem {
  const row = value as CmsItem;
  if (!row || !idPattern.test(row.id) || !row.fieldData || Array.isArray(row.fieldData) || typeof row.fieldData !== 'object' ||
      (row.cmsLocaleId && row.cmsLocaleId !== locale)) throw new Error('image_gen_cms_invalid');
  return row;
}
export async function readImageGenArticle(id: string) {
  if (!idPattern.test(id)) throw new Error('image_gen_article_invalid');
  const { locale } = configuration();
  const row = validateItem(await getCms(`/${id}`, new URLSearchParams({ cmsLocaleId: locale })), locale);
  if (row.id !== id || row.isArchived) throw new Error('image_gen_article_unavailable');
  if (typeof row.fieldData.name !== 'string' || typeof row.fieldData.content !== 'string') throw new Error('image_gen_article_invalid');
  const $ = load(row.fieldData.content);
  const existingImages = $('img[src]').toArray().slice(0, 30).flatMap(node => {
    try {
      const url = new URL($(node).attr('src') || '');
      if (url.protocol !== 'https:' || url.username || url.password) return [];
      return [{ url: url.href, alt: $(node).attr('alt') || '', caption: $(node).closest('figure').find('figcaption').text() }];
    } catch { return []; }
  });
  return { article: imageGenArticle(id, row.fieldData.name, row.fieldData.content,
    { thumb: row.fieldData.thumb ?? null, credit: row.fieldData['foto-credit'] ?? null }),
    cover: row.fieldData.thumb ?? null, coverCredit: row.fieldData['foto-credit'] ?? null, existingImages,
    isDraft: Boolean(row.isDraft), lastPublished: row.lastPublished ?? null };
}

/** Staged field update only. Never send isDraft/isArchived or a publish request. */
export async function patchImageGenDraft(id: string, fieldData: Record<string, unknown>) {
  if (!idPattern.test(id) || !Object.keys(fieldData).length ||
      Object.keys(fieldData).some(key => !['thumb', 'foto-credit', 'content'].includes(key))) throw new Error('image_gen_fields_invalid');
  const { token, collection, locale } = configuration();
  const response = await fetch(`https://api.webflow.com/v2/collections/${collection}/items/${id}`, {
    method: 'PATCH', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ cmsLocaleId: locale, fieldData }), redirect: 'error', signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) throw new Error('image_gen_cms_save_uncertain');
}

/** Search is bounded per request. A cursor continues scanning rather than silently omitting older matches. */
export async function listImageGenArticles(input: { cursor?: number; query?: string }) {
  const offset = input.cursor ?? 0, query = (input.query ?? '').trim().toLocaleLowerCase('da');
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100_000 || offset % 100 || query.length > 150) {
    throw new Error('image_gen_list_invalid');
  }
  const { locale } = configuration();
  const found: Array<{ id: string; title: string; cover: string | null; isDraft: boolean; lastPublished: string | null }> = [];
  let nextCursor: number | null = offset;
  // At most 3 pages per search; opening a list costs one CMS read, no model calls.
  for (let page = 0; page < (query ? 3 : 1) && nextCursor !== null; page++) {
    const current: number = nextCursor;
    const data = await getCms('', new URLSearchParams({ cmsLocaleId: locale, limit: '100', offset: String(current) }));
    if (!Array.isArray(data.items)) throw new Error('image_gen_cms_invalid');
    for (const value of data.items) {
      const row = validateItem(value, locale), title = row.fieldData.name;
      if (row.isArchived || typeof title !== 'string' || !title.toLocaleLowerCase('da').includes(query)) continue;
      const cover = row.fieldData.thumb as { url?: unknown } | undefined;
      found.push({ id: row.id, title, cover: typeof cover?.url === 'string' ? cover.url : null,
        isDraft: Boolean(row.isDraft), lastPublished: row.lastPublished ?? null });
    }
    nextCursor = data.items.length === 100 ? current + 100 : null;
    if (found.length) break;
  }
  return { articles: found, nextCursor };
}
