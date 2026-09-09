import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import type { WebflowArticleFields } from '@/lib/webflow/types';

type JsonObject = Record<string, unknown>;
export type LivCmsReadback = {
  itemId: string;
  localeId: string;
  checkedAt: string;
  draftConfirmed: boolean;
  /** Readback does not verify image rights or authorize publication. */
  publicationReady: false;
  checks: { id: string; ok: boolean }[];
};

const OBJECT_ID = /^[a-f0-9]{24}$/i;
function object(value: unknown): JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonObject : {};
}
function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** GET-only adapter. Credentials stay server-side; upstream bodies are not logged. */
export async function readLivWebflowJson(path: string): Promise<JsonObject> {
  // Only CMS schema/item reads with validated IDs, never arbitrary URLs.
  if (!/^collections\/[a-f0-9]{24}(?:\/items\/[a-f0-9]{24}(?:\/live)?\?cmsLocaleId=[a-f0-9]{24})?$/i.test(path)) {
    throw new Error('liv_cms_readback_invalid_path');
  }
  const config = getWebflowConfig();
  const token = config.apiToken !== undefined ? config.apiToken : env.WEBFLOW_API_TOKEN;
  if (!token) throw new Error('liv_cms_readback_missing_configuration');
  const response = await fetch(`https://api.webflow.com/v2/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' },
    cache: 'no-store',
    redirect: 'error',
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`liv_cms_readback_http_${response.status}`);
  if (!response.headers.get('content-type')?.toLowerCase().includes('application/json')) {
    throw new Error('liv_cms_readback_not_json');
  }
  // Reject oversized and truncated responses without including CMS content in errors.
  const reader = response.body?.getReader();
  if (!reader) throw new Error('liv_cms_readback_empty');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 2_000_000) throw new Error('liv_cms_readback_too_large');
      chunks.push(value);
    }
  } finally {
    await reader.cancel().catch(() => {});
  }
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new Error('liv_cms_readback_invalid_json'); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('liv_cms_readback_invalid_object');
  }
  return parsed as JsonObject;
}

/**
 * Inspect a saved DK draft, including actual schema and resolved reference items.
 * This is deliberately not a publishing function or an image-rights certificate.
 */
export async function inspectLivCmsDraft(input: {
  itemId: string;
  expected: WebflowArticleFields;
}, dependencies?: {
  collectionId: string;
  localeId: string;
  read: (path: string) => Promise<JsonObject>;
}): Promise<LivCmsReadback> {
  const config = dependencies ? undefined : getWebflowConfig();
  const collectionId = dependencies?.collectionId ??
    (config?.articlesCollectionId !== undefined ? config.articlesCollectionId : env.WEBFLOW_ARTICLES_COLLECTION_ID);
  const localeId = dependencies?.localeId ?? env.WEBFLOW_CMS_LOCALE_DK;
  const read = dependencies?.read ?? readLivWebflowJson;
  if (![collectionId, localeId, input.itemId].every(id => typeof id === 'string' && OBJECT_ID.test(id))) {
    throw new Error('liv_cms_readback_invalid_identity');
  }
  const [item, schema] = await Promise.all([
    read(`collections/${collectionId}/items/${input.itemId}?cmsLocaleId=${localeId}`),
    read(`collections/${collectionId}`),
  ]);
  const fields = object(item.fieldData);
  const schemaFields = Array.isArray(schema.fields) ? schema.fields.map(object) : [];
  // Identity and draft state are hard requirements, even when content still needs editing.
  if (item.id !== input.itemId || item.cmsLocaleId !== localeId || item.isDraft !== true || item.isArchived === true ||
      fields.name !== input.expected.title || fields.slug !== input.expected.slug) {
    throw new Error('liv_cms_readback_draft_mismatch');
  }
  if (schema.id !== collectionId || !schemaFields.length) throw new Error('liv_cms_readback_schema_missing');
  const checks: LivCmsReadback['checks'] = [];
  for (const field of schemaFields) {
    if (field.isRequired !== true && field.required !== true) continue;
    const value = fields[text(field.slug)];
    checks.push({ id: `required:${text(field.slug)}`, ok: value !== undefined && value !== null && value !== '' &&
      (!Array.isArray(value) || value.length > 0) });
  }
  for (const [slug, expected] of [
    ['subtitle', input.expected.subtitle], ['seo-title', input.expected.seoTitle],
    ['meta-description', input.expected.seoDescription],
  ] as const) {
    checks.push({ id: `field:${slug}`, ok: !!text(expected) && text(fields[slug]) === text(expected) });
  }
  checks.push({ id: 'field:content', ok: !!text(fields.content) });
  checks.push({ id: 'field:intro', ok: !!text(fields.intro) });
  checks.push({ id: 'field:ai-generated', ok: fields['ai-generated'] === true });
  if (input.expected.rating !== undefined) {
    checks.push({ id: 'field:stjerne', ok: schemaFields.some(field => field.slug === 'stjerne') &&
      Number.isInteger(input.expected.rating) && input.expected.rating >= 1 && input.expected.rating <= 6 &&
      fields.stjerne === input.expected.rating });
  }
  // Articles currently has no word-count field. Keep the count in the canonical
  // article; check CMS readback only if the field actually exists in its schema.
  if (schemaFields.some(field => field.slug === 'word-count')) {
    checks.push({ id: 'field:word-count', ok: typeof fields['word-count'] === 'number' &&
      fields['word-count'] === input.expected.wordCount && fields['word-count'] > 0 });
  }
  checks.push({ id: 'field:minutes-to-read', ok: typeof fields['minutes-to-read'] === 'number' &&
    fields['minutes-to-read'] === input.expected.readTime && fields['minutes-to-read'] > 0 });
  checks.push({ id: 'field:presseakkreditering', ok: fields.presseakkreditering === false });
  checks.push({ id: 'image:thumb-present', ok: /^https:\/\//.test(text(object(fields.thumb).url)) });
  checks.push({ id: 'image:credit-present', ok: !!text(fields['foto-credit']) });

  for (const [slug, expectedName] of [['author', input.expected.author], ['section', input.expected.category]] as const) {
    const field = schemaFields.find(field => field.slug === slug);
    const referenceCollection = text(object(field?.validations).collectionId) || text(object(field?.reference).collectionId);
    const referenceId = text(fields[slug]);
    let ok = false;
    if (field?.type === 'Reference' && OBJECT_ID.test(referenceCollection) && OBJECT_ID.test(referenceId)) {
      const referenced = await read(`collections/${referenceCollection}/items/${referenceId}?cmsLocaleId=${localeId}`);
      ok = referenced.id === referenceId && referenced.cmsLocaleId === localeId && referenced.isArchived !== true &&
        text(object(referenced.fieldData).name) === expectedName;
    }
    checks.push({ id: `reference:${slug}`, ok });
  }
  // Search results, TMDB images and og:image URLs do not themselves grant reuse rights.
  checks.push({ id: 'image:rights-and-asset-unverified', ok: false });
  return { itemId: input.itemId, localeId, checkedAt: new Date().toISOString(), draftConfirmed: true,
    publicationReady: false, checks };
}
