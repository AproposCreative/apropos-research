import { load } from 'cheerio';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { inspectLivCmsDraft, readLivWebflowJson } from '@/lib/liv/cms-readback';
import { publishArticleItemForLocale, patchArticleFieldDataForLocale } from '@/lib/webflow/locale-items';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

type Json = Record<string, unknown>;
const object = (value: unknown): Json => value && typeof value === 'object' && !Array.isArray(value) ? value as Json : {};
const normalized = (html: string) => {
  const document = load(html);
  document('script,style,template,noscript').remove();
  document('p,h1,h2,h3,h4,li,br,figure,figcaption,div').each((_i, node) => { document(node).append(' '); });
  return document.root().text().replace(/\s+/gu, ' ').trim();
};

/** Server-owned final step. One targeted publish, no write retries, no Instagram. */
export async function publishVerifiedLivArticle(input: { itemId: string; expected: WebflowArticleFields;
  beforePublish?: (fieldDataHash: string) => Promise<void>; publicationDate?: string; assertLease?: () => Promise<void> },
  dependencies?: {
    collectionId: string; localeId: string;
    inspect: typeof inspectLivCmsDraft;
    read: (path: string) => Promise<Json>;
    publish: (itemId: string, localeId: string) => Promise<void>;
    patchDate?: (itemId: string, fields: Record<string, unknown>, localeId: string) => Promise<void>;
    readPage: (url: string) => Promise<Buffer>;
    wait?: (ms: number) => Promise<void>;
  }) {
  const config = dependencies ? undefined : getWebflowConfig();
  const collectionId = dependencies?.collectionId ?? config?.articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const localeId = dependencies?.localeId ?? env.WEBFLOW_CMS_LOCALE_DK;
  if (![input.itemId, collectionId, localeId].every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.expected.slug)) throw new Error('liv_publication_invalid_identity');
  const inspect = dependencies?.inspect ?? inspectLivCmsDraft;
  const read = dependencies?.read ?? readLivWebflowJson;
  const path = `collections/${collectionId}/items/${input.itemId}`;
  if (input.publicationDate) {
    if (!Number.isFinite(Date.parse(input.publicationDate)) || !input.assertLease) throw new Error('liv_publication_invalid_date');
    await input.assertLease();
    const draft = await read(`${path}?cmsLocaleId=${localeId}`);
    if (draft.id !== input.itemId || draft.cmsLocaleId !== localeId || draft.isDraft !== true || draft.isArchived === true) {
      throw new Error('liv_publication_draft_changed');
    }
    // Deterministic, repeatable metadata-only patch. Never republish or replace body/media here.
    if (object(draft.fieldData)['publish-date'] !== input.publicationDate) {
      await (dependencies?.patchDate ?? patchArticleFieldDataForLocale)(input.itemId,
        { 'publish-date': input.publicationDate }, localeId!);
    }
  }
  // Reinspect immediately before publishing: never trust a browser-supplied
  // approval flag or an earlier save receipt as proof of current readiness.
  const proof = await inspect(input);
  if (proof.itemId !== input.itemId || proof.localeId !== localeId || !proof.draftConfirmed ||
      !proof.publicationReady || !proof.checks.length || proof.checks.some(check => !check.ok)) {
    throw new Error('liv_publication_checks_failed');
  }
  const staged = await read(`${path}?cmsLocaleId=${localeId}`);
  const fields = object(staged.fieldData);
  if (staged.id !== input.itemId || staged.cmsLocaleId !== localeId || staged.isDraft !== true || staged.isArchived === true ||
      fields.name !== input.expected.title || fields.slug !== input.expected.slug ||
      (input.publicationDate && fields['publish-date'] !== input.publicationDate) ||
      cmsFieldHash(fields) !== proof.fieldDataHash ||
      normalized(String(fields.content || '')) !== normalized(input.expected.content)) throw new Error('liv_publication_draft_changed');

  // Persist write intent before contacting Webflow. A crashed/ambiguous attempt
  // is subsequently reconciled by reads only, never blindly republished.
  await input.beforePublish?.(cmsFieldHash(fields));
  await (dependencies?.publish ?? publishArticleItemForLocale)(input.itemId, localeId);
  return verifyLiveLivArticle({ ...input, fieldDataHash: cmsFieldHash(fields) }, {
    collectionId: collectionId!, localeId: localeId!, read,
    readPage: dependencies?.readPage ?? (url => readPublicMedia(url, 'html')), wait: dependencies?.wait,
  });
}

/** Safe to repeat after a lost publish response. This function performs no writes. */
export async function verifyLiveLivArticle(input: { itemId: string; expected: WebflowArticleFields; fieldDataHash: string },
  dependencies?: { collectionId: string; localeId: string; read: (path: string) => Promise<Json>;
    readPage: (url: string) => Promise<Buffer>; wait?: (ms: number) => Promise<void> }) {
  const config = dependencies ? undefined : getWebflowConfig();
  const collectionId = dependencies?.collectionId ?? config?.articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const localeId = dependencies?.localeId ?? env.WEBFLOW_CMS_LOCALE_DK;
  if (![input.itemId, collectionId, localeId].every(id => typeof id === 'string' && /^[a-f0-9]{24}$/i.test(id)) ||
      !/^[a-f0-9]{64}$/.test(input.fieldDataHash) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(input.expected.slug)) {
    throw new Error('liv_publication_invalid_identity');
  }
  const read = dependencies?.read ?? readLivWebflowJson;
  const path = `collections/${collectionId}/items/${input.itemId}`;
  const url = `https://www.aproposmagazine.com/articles/${input.expected.slug}`;
  // Publish returns 202: allow bounded propagation, retry reads only. Never
  // repeat the external write after an ambiguous response.
  const wait = dependencies?.wait ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  for (const delay of [0, 500, 1500, 3000]) {
    if (delay) await wait(delay);
    try {
      const live = await read(`${path}/live?cmsLocaleId=${localeId}`);
      if (live.id !== input.itemId || live.cmsLocaleId !== localeId || live.isDraft !== false || live.isArchived === true ||
          typeof live.lastPublished !== 'string' || !Number.isFinite(Date.parse(live.lastPublished)) ||
          cmsFieldHash(object(live.fieldData)) !== input.fieldDataHash) throw new Error('liv_publication_live_mismatch');
      const fields = object(live.fieldData);

      const html = (await (dependencies?.readPage ?? (url => readPublicMedia(url, 'html')))(url)).toString('utf8');
      const page = load(html);
      page('script,style,template,noscript,[hidden]').remove();
      const visible = normalized(page.html());
      const expectedText = normalized(input.expected.content);
      if (!expectedText || !page('h1').toArray().some(node => normalized(page(node).text()) === normalized(input.expected.title)) ||
          !visible.includes(expectedText)) throw new Error('liv_publication_public_page_mismatch');
      const pageImages = new Set(page('img').toArray().map(node => page(node).attr('src')));
      const body = load(String(fields.content || ''));
      const images = [String(object(fields.thumb).url || ''), ...body('img').toArray().map(node => body(node).attr('src') || '')];
      if (images.some(url => !url || !pageImages.has(url))) throw new Error('liv_publication_public_images_missing');
      return { publicationVerified: true as const, publicUrl: url, itemId: input.itemId, localeId,
        checkedAt: new Date().toISOString() };
    } catch (error) {
      if (delay === 3000 || (error instanceof Error && /http_(401|403)$/.test(error.message))) throw error;
    }
  }
  throw new Error('liv_publication_unverified');
}
