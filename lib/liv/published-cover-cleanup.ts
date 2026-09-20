import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { cmsFieldHash } from './cms-field-hash';
import { readLivWebflowJson } from './cms-readback';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { patchArticleFieldDataForLocale, publishArticleItemForLocale } from '@/lib/webflow/locale-items';
import { ensureTextFreeImage, getTextFreeReceipt, imageByteHash, readEditorialImage, readTextFreeAsset } from '@/lib/images/text-free';

type Fields = Record<string, unknown>;
const object = (v: unknown): Fields => v && typeof v === 'object' && !Array.isArray(v) ? v as Fields : {};
const fail = (code: string): never => { throw new Error(`cover_cleanup_${code}`); };
export const withoutCoverFields = (fields: Fields) => Object.fromEntries(Object.entries(fields).filter(([key]) => !['thumb', 'mobile-image', 'foto-credit'].includes(key)));
const identity = z.object({ itemId: z.string().regex(/^[a-f0-9]{24}$/) });
const inputSchema = z.discriminatedUnion('action', [
  identity.extend({ action: z.literal('prepare'), sourceBase64: z.string().min(100).max(2_800_000).regex(/^[A-Za-z0-9+/]+={0,2}$/),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/), sourceName: z.string().min(1).max(200),
    expectedCmsHash: z.string().regex(/^[a-f0-9]{64}$/), credit: z.string().trim().min(3).max(300), alt: z.string().trim().min(10).max(240) }).strict(),
  identity.extend({ action: z.literal('apply'), revisionId: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
function runtime(itemId: string) {
  if (!identity.safeParse({ itemId }).success) return fail('invalid');
  const collectionId = getWebflowConfig().articlesCollectionId || env.WEBFLOW_ARTICLES_COLLECTION_ID, localeId = env.WEBFLOW_CMS_LOCALE_DK;
  if (![collectionId, localeId].every(v => /^[a-f0-9]{24}$/.test(v || ''))) return fail('configuration');
  return { localeId, path: `collections/${collectionId}/items/${itemId}` };
}
async function read(itemId: string, live = false) {
  const { path, localeId } = runtime(itemId);
  const item = await readLivWebflowJson(`${path}${live ? '/live' : ''}?cmsLocaleId=${localeId}`);
  if (item.id !== itemId || item.cmsLocaleId !== localeId || item.isArchived === true || item.isDraft === true || !item.lastPublished) return fail('not_published');
  return object(item.fieldData);
}
export async function publishedCoverBaseline(itemId: string) {
  const [fields, live] = await Promise.all([read(itemId), read(itemId, true)]);
  if (cmsFieldHash(fields) !== cmsFieldHash(live)) return fail('unpublished_changes');
  return { itemId, title: fields.name, expectedCmsHash: cmsFieldHash(fields), cover: fields.thumb, credit: fields['foto-credit'] };
}

/** API-only repair of an already published cover, not a second daily article.
 * No reset/unpublish, no SEO/body edits, no blind publish retries. */
export async function cleanPublishedCover(value: unknown) {
  const parsed = inputSchema.safeParse(value); if (!parsed.success) return fail('invalid');
  const input = parsed.data, db = getAdminDb(); if (!db) return fail('store_unavailable');
  if (input.action === 'prepare') {
    const baseline = await publishedCoverBaseline(input.itemId);
    if (baseline.expectedCmsHash !== input.expectedCmsHash) return fail('article_changed');
    const original = Buffer.from(input.sourceBase64, 'base64');
    if (imageByteHash(original) !== input.sourceHash) return fail('source_mismatch');
    const { sourceBase64: _bytes, ...metadata } = input;
    const revisionId = cmsFieldHash(metadata), ref = db.collection('publishedCoverCleanups').doc(revisionId);
    const existing = (await ref.get()).data();
    if (existing?.receiptId) {
      try { return { revisionId, status: existing.status, image: (await getTextFreeReceipt(existing.receiptId)).image }; }
      catch (error) { if (!(error instanceof Error) || error.message !== 'image_text_not_ready' || existing.status !== 'prepared') throw error; }
    }
    await ref.set({ input: metadata, requestedAt: new Date().toISOString(), provenance: 'user-supplied; rights not independently verified' }, { merge: true });
    const { receipt } = await ensureTextFreeImage(original);
    await ref.set({ receiptId: receipt.id, status: 'prepared' }, { merge: true });
    return { revisionId, status: 'prepared', image: receipt.image, edited: receipt.edited };
  }
  const ref = db.collection('publishedCoverCleanups').doc(input.revisionId);
  const lease = await acquireCmsWriteLease(input.itemId, 'da');
  try {
    let row = (await ref.get()).data();
    if (!row?.receiptId || row.input.itemId !== input.itemId) return fail('not_ready');
    const receipt = await getTextFreeReceipt(row.receiptId);
    const bytes = await readTextFreeAsset(receipt.image);
    if (receipt.image.width < 1200 || receipt.image.height < 600) return fail('image_too_small');
    const verify = async (fields: Fields) => {
      if (cmsFieldHash(withoutCoverFields(fields)) !== row!.restHash || fields['foto-credit'] !== row!.input.credit) return fail('other_fields_changed');
      for (const key of ['thumb', 'mobile-image']) {
        const image = object(fields[key]);
        if (image.alt !== row!.input.alt || typeof image.url !== 'string' || !(await readEditorialImage(image.url)).equals(bytes)) return fail('readback_mismatch');
      }
    };
    if (!row.patchStarted) {
      const fields = await read(input.itemId), live = await read(input.itemId, true);
      if (cmsFieldHash(fields) !== row.input.expectedCmsHash || cmsFieldHash(fields) !== cmsFieldHash(live)) return fail('article_changed');
      await lease.assertOwned();
      await ref.update({ patchStarted: true, before: fields, restHash: cmsFieldHash(withoutCoverFields(fields)) });
      row = (await ref.get()).data()!;
      await patchArticleFieldDataForLocale(input.itemId, {
        thumb: { url: receipt.image.url, alt: row.input.alt }, 'mobile-image': { url: receipt.image.url, alt: row.input.alt }, 'foto-credit': row.input.credit,
      }, runtime(input.itemId).localeId);
    }
    const staged = await read(input.itemId);
    await verify(staged);
    if (!row.publishStarted) {
      await lease.assertOwned();
      if (cmsFieldHash(await read(input.itemId)) !== cmsFieldHash(staged)) return fail('article_changed');
      await ref.update({ publishStarted: true, stagedHash: cmsFieldHash(staged), publishRequestedAt: new Date().toISOString() });
      await publishArticleItemForLocale(input.itemId, runtime(input.itemId).localeId);
    }
    // An ambiguous previous publish is reconciled here, never repeated.
    const live = await read(input.itemId, true);
    await verify(live);
    const url = `https://www.aproposmagazine.com/articles/${String(live.slug)}`;
    await ref.update({ status: 'published', verifiedAt: new Date().toISOString(), liveHash: cmsFieldHash(live), url });
    return { status: 'published', publicationVerified: true, revisionId: input.revisionId, url, image: receipt.image };
  } finally { await lease.release(); }
}
