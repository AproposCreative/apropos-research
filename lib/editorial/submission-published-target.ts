import { z } from 'zod';
import { load } from 'cheerio';
import { env } from '@/lib/config/env';
import { getWebflowConfig } from '@/lib/webflow-config';
import { readLivWebflowJson, inspectLivCmsDraft, type LivCmsInspectionPolicy } from '@/lib/liv/cms-readback';
import { patchArticleFieldDataForLocale } from '@/lib/webflow/locale-items';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readPublicMedia } from '@/lib/liv/public-media-reader';
import { createHash } from 'node:crypto';
import sharp from 'sharp';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { readSubmission, submissionStore } from './submissions';
import { submissionId, submissionVersion, type SubmissionArticle } from './submission-contract';

export type PublishedTarget = { itemId: string; fields: Record<string, unknown>; fieldDataHash: string; linkedAt: string };
export const linkPublishedSubmissionInput = z.object({ submissionId, expectedRevision: z.number().int().positive(), itemId: z.string().regex(/^[a-f0-9]{24}$/) }).strict();
const bodyWithoutImages = (html: string) => { const $ = load(html); $('figure,img').remove(); return $('body').html()?.trim(); };
export function assertMediaOnlyUpdate(before: SubmissionArticle, after: SubmissionArticle) {
  const stable = (article: SubmissionArticle) => {
    const { featuredImage: _image, featuredImageAlt: _alt, fotoCredit: _credit, content, ...rest } = article;
    return { ...rest, content: bodyWithoutImages(content) };
  };
  if (cmsFieldHash(stable(before)) !== cmsFieldHash(stable(after))) throw Error('mcp_submission_media_only_update');
}
export async function readSubmissionCms(itemId: string, live = false) {
  if (!/^[a-f0-9]{24}$/.test(itemId)) throw Error('mcp_submission_cms_identity_invalid');
  const collection = getWebflowConfig().articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  const row = await readLivWebflowJson(`collections/${collection}/items/${itemId}${live ? '/live' : ''}?cmsLocaleId=${env.WEBFLOW_CMS_LOCALE_DK}`);
  if (row.id !== itemId || row.cmsLocaleId !== env.WEBFLOW_CMS_LOCALE_DK || row.isArchived === true || typeof row.isDraft !== 'boolean' || !row.fieldData) throw Error('mcp_submission_cms_identity_invalid');
  return row;
}
/** Before a new create, never turn an existing title/slug into a second article.
 * Returned identities are candidates, not permission to edit somebody else's item. */
export async function assertSubmissionNotAlreadySaved(article: Pick<SubmissionArticle, 'title' | 'slug'>) {
  const collection = getWebflowConfig().articlesCollectionId ?? env.WEBFLOW_ARTICLES_COLLECTION_ID;
  for (let offset = 0; offset < 5000; offset += 100) {
    const page = await readLivWebflowJson(`collections/${collection}/items?cmsLocaleId=${env.WEBFLOW_CMS_LOCALE_DK}&offset=${offset}&limit=100`);
    if (!Array.isArray(page.items)) throw Error('mcp_submission_cms_listing_unconfirmed');
    if (page.items.some(item => item.cmsLocaleId === env.WEBFLOW_CMS_LOCALE_DK && !item.isArchived &&
      (item.fieldData?.slug === article.slug || item.fieldData?.name === article.title))) throw Error('mcp_submission_existing_article_requires_link');
    if (page.items.length < 100) return;
  }
  throw Error('mcp_submission_cms_listing_unconfirmed');
}
export async function linkPublishedSubmission(uid: string, raw: unknown) {
  const input = linkPublishedSubmissionInput.parse(raw), row = await readSubmission(uid, input.submissionId);
  if (row.revision !== input.expectedRevision || !['draft', 'published'].includes(row.status)) throw Error('mcp_submission_revision_conflict');
  const staged = await readSubmissionCms(input.itemId), live = await readSubmissionCms(input.itemId, true);
  const fields = staged.fieldData as Record<string, unknown>, liveFields = live.fieldData as Record<string, unknown>;
  // Webflow omits optional nulls in its live projection. Nothing else is ignored.
  for (const [key, value] of Object.entries(fields)) if (value === null && !Object.hasOwn(liveFields, key)) liveFields[key] = null;
  if (live.isDraft !== false || !live.lastPublished || cmsFieldHash(fields) !== cmsFieldHash(liveFields) ||
      fields.name !== row.article.title || fields.slug !== row.article.slug || fields.content !== row.article.content ||
      fields['seo-title'] !== row.article.seoTitle || fields['meta-description'] !== row.article.seoDescription ||
      fields.author !== row.article.author || fields.section !== row.article.category || fields.stjerne !== row.article.rating) throw Error('mcp_submission_existing_article_mismatch');
  const target: PublishedTarget = { itemId: input.itemId, fields, fieldDataHash: cmsFieldHash(fields), linkedAt: new Date().toISOString() };
  const { db, collection } = submissionStore(), ref = collection.doc(row.id);
  const revision = await db.runTransaction(async tx => {
    const current = (await tx.get(ref)).data();
    if (current?.uid !== uid || current.revision !== row.revision || current.contentHash !== row.contentHash) throw Error('mcp_submission_revision_conflict');
    if (current.publishedTarget && current.publishedTarget.itemId !== target.itemId) throw Error('mcp_submission_cms_identity_invalid');
    if (current.publishedTarget?.fieldDataHash === target.fieldDataHash) return row.revision;
    tx.set(ref.collection('cmsBindings').doc(target.fieldDataHash), target);
    // The destination is part of the version: an older UI confirmation cannot
    // approve a newly bound live item. No CMS field or publication is changed.
    tx.create(ref.collection('versions').doc(String(row.revision)), row);
    tx.update(ref, { publishedTarget: target, revision: row.revision + 1, contentHash: submissionVersion(row, target),
      status: 'draft', updatedAt: target.linkedAt });
    return row.revision + 1;
  });
  return { submissionId: row.id, itemId: target.itemId, revision, mediaOnly: true, paidAiCalls: 0,
    publicationApproval: false, instruction: 'Samme live artikel er knyttet. Importér kun de valgte billeder. Tekst, rating, slug og SEO er låst; vis nyt preview før publicering.' };
}

/** Narrow staged patch of the SAME item. Every unrelated CMS field is retained.
 * Callers persist an attempted stage first and reconcile timeouts by readback. */
export async function stageSubmissionMedia(target: PublishedTarget, expected: WebflowArticleFields,
  policy: LivCmsInspectionPolicy, checkpoint: (data: Record<string, unknown>) => Promise<void>, assertLease: () => Promise<unknown>) {
  const current = await readSubmissionCms(target.itemId);
  if (cmsFieldHash(current.fieldData as Record<string, unknown>) !== target.fieldDataHash) throw Error('mcp_submission_cms_conflict');
  const $ = load(expected.content);
  for (const node of $('img').toArray()) {
    const image = $(node), meta = await sharp(await readPublicMedia(image.attr('src') || '', 'image'), { limitInputPixels: 80_000_000 }).metadata();
    image.attr({ width: String(meta.width), height: String(meta.height) });
  }
  const canonical = { ...expected, content: $('body').html() || '', readTime: target.fields['minutes-to-read'] as number };
  const thumb = { url: canonical.featuredImage, alt: canonical.featuredImageAlt };
  const patch = { thumb, 'mobile-image': thumb, 'foto-credit': canonical.fotoCredit, content: canonical.content };
  await checkpoint({ target, expected: canonical, patch });
  await assertLease();
  const latest = await readSubmissionCms(target.itemId);
  if (cmsFieldHash(latest.fieldData as Record<string, unknown>) !== target.fieldDataHash) throw Error('mcp_submission_cms_conflict');
  await patchArticleFieldDataForLocale(target.itemId, patch, env.WEBFLOW_CMS_LOCALE_DK);
  return verifyStagedMedia(target, canonical, policy);
}

export async function verifyStagedMedia(target: PublishedTarget, expected: WebflowArticleFields, policy: LivCmsInspectionPolicy) {
  const current = await readSubmissionCms(target.itemId), fields = current.fieldData as Record<string, unknown>;
  const preserved = (value: Record<string, unknown>) => Object.fromEntries(Object.entries(value).filter(([key]) => !['thumb', 'mobile-image', 'foto-credit', 'content'].includes(key)));
  if (cmsFieldHash(preserved(fields)) !== cmsFieldHash(preserved(target.fields)) ||
      bodyWithoutImages(String(fields.content)) !== bodyWithoutImages(String(target.fields.content))) throw Error('mcp_submission_cms_conflict');
  const mobile = fields['mobile-image'] as { url?: string } | undefined;
  if (!mobile?.url || createHash('sha256').update(await readPublicMedia(mobile.url, 'image')).digest('hex') !== expected.featuredImageHash) throw Error('mcp_submission_media_identity_changed');
  const proof = await inspectLivCmsDraft({ itemId: target.itemId, expected, inspectionPolicy: { ...policy, allowPublishedUpdate: true } });
  if (!proof.publicationReady) throw Error('mcp_submission_cms_checks_failed');
  return { itemId: target.itemId, expected, proof, cmsFields: fields, mediaOnly: true };
}
