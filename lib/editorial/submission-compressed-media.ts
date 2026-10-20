import { createHash } from 'node:crypto';
import { load } from 'cheerio';
import type { DocumentData } from 'firebase-admin/firestore';
import { env } from '@/lib/config/env';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readLivStoredImage } from '@/lib/liv/stored-image-reader';
import { verifyCompressedFields } from '@/lib/webflow/published-image-optimization';
import { imageProtectedContentHash } from './image-content-invariant';
import type { SubmissionRecord, SubmissionArticle } from './submission-contract';
import { submissionStore } from './submissions';

const policy = 'published-compression-2026-10-09-v1';
export type PublishedMediaDerivative = {
  assetId: string; originalUrl: string; originalHash: string;
  url: string; hash: string; role: 'cover' | 'body';
  field: 'thumb' | 'mobile-image' | 'content'; receiptId: string;
};

/** A server-verified derivation is not a new personal selection, nor a rewrite
 * of the immutable original. A receipt alone never proves current bytes. */
export function selectedAssetUrls(row: SubmissionRecord, asset: DocumentData) {
  return [asset.url, ...(row.publishedTarget?.mediaDerivatives || []).filter(d =>
    d.assetId === asset.assetId && d.originalUrl === asset.url &&
    d.originalHash === asset.originalHash).map(d => d.url)].filter((url): url is string => !!url);
}

/** Narrow recovery for a published, locally UNCHANGED version. No heuristics,
 * arbitrary CMS edits, missing receipts, or conflicting local copy are adopted. */
export async function inspectPublishedCompression(row: SubmissionRecord, fields: Record<string, unknown>, remote: SubmissionArticle) {
  const target = row.publishedTarget;
  const publication = (row as SubmissionRecord & { publication?: {
    contentHash: string; fieldDataHash: string;
    receipt?: { mediaIdentity?: { cmsHash: string; assets: Array<{
      assetId: string; approvedHash: string; published: Array<{ url: string; hash: string }>;
    }> } };
  } }).publication;
  if (!target || row.status !== 'published' || publication?.contentHash !== row.contentHash ||
      publication.fieldDataHash !== target.fieldDataHash ||
      publication.receipt?.mediaIdentity?.cmsHash !== target.fieldDataHash ||
      imageProtectedContentHash(row.article) !== imageProtectedContentHash(remote)) return null;
  const receiptId = cmsFieldHash({ policy, itemId: target.itemId, cmsLocaleId: env.WEBFLOW_CMS_LOCALE_DK, beforeHash: target.fieldDataHash });
  const { db, collection } = submissionStore();
  const receipt = (await db.collection('webflowArticleImageAutoOptimize').doc(receiptId).get()).data();
  if (!receipt || receipt.status !== 'complete' || receipt.policy !== policy ||
      receipt.itemId !== target.itemId || receipt.cmsLocaleId !== env.WEBFLOW_CMS_LOCALE_DK ||
      receipt.beforeHash !== target.fieldDataHash || cmsFieldHash(receipt.before || {}) !== target.fieldDataHash ||
      receipt.afterHash !== cmsFieldHash(fields)) return null;
  const changed = Object.keys(receipt.patch || {});
  if (!changed.length || changed.some(key => !['thumb', 'mobile-image', 'content', 'post-body'].includes(key))) return null;
  await verifyCompressedFields({ ...receipt.before, ...receipt.patch }, fields, changed);
  const assets = await collection.doc(row.id).collection('chatAssets').limit(101).get();
  if (assets.size > 100) throw Error('mcp_submission_media_window_exceeded');
  const before = load(String(target.fields.content || '')), after = load(String(fields.content || ''));
  const original = load(row.article.content);
  const selected = new Set([row.article.featuredImage, ...original('img').toArray().map(n => original(n).attr('src'))]);
  const derivatives: PublishedMediaDerivative[] = [];
  for (const doc of assets.docs) {
    const asset = doc.data();
    if (asset.uid !== row.uid || asset.status !== 'attached' || !selected.has(asset.url)) continue;
    const proof = publication.receipt.mediaIdentity.assets.find(a => a.assetId === asset.assetId);
    if (!proof || proof.approvedHash !== asset.originalHash || asset.hash !== asset.originalHash)
      throw Error('mcp_submission_media_identity_changed');
    const pairs: Array<{ field: PublishedMediaDerivative['field']; beforeUrl?: string; url?: string }> =
      asset.role === 'cover' ? (['thumb', 'mobile-image'] as const).map(field => ({
        field, beforeUrl: (target.fields[field] as { url?: string })?.url, url: (fields[field] as { url?: string })?.url,
      })) : (() => {
        const old = before('figure').filter((_, n) => before(n).attr('data-apropos-asset') === asset.assetId);
        const next = after('figure').filter((_, n) => after(n).attr('data-apropos-asset') === asset.assetId);
        if (old.length !== 1 || next.length !== 1 || old.find('img').length !== 1 || next.find('img').length !== 1 ||
            old.find('img').attr('alt') !== next.find('img').attr('alt') ||
            old.find('figcaption').text() !== next.find('figcaption').text())
          throw Error('mcp_submission_media_identity_changed');
        return [{ field: 'content', beforeUrl: old.find('img').attr('src'), url: next.find('img').attr('src') }];
      })();
    for (const pair of pairs) {
      if (!pair.url || !proof.published.some(p => p.url === pair.beforeUrl && p.hash === asset.originalHash))
        throw Error('mcp_submission_media_identity_changed');
      const bytes = await readLivStoredImage(pair.url);
      derivatives.push({ assetId: asset.assetId, originalUrl: asset.url, originalHash: asset.originalHash,
        url: pair.url, hash: createHash('sha256').update(bytes).digest('hex'), role: asset.role,
        field: pair.field, receiptId });
    }
  }
  // Every displayed image must have its own original and dated publication proof.
  if (derivatives.filter(d => d.field === 'content').length !== after('img').length ||
      derivatives.filter(d => d.role === 'cover').length !== 2) throw Error('mcp_submission_media_identity_changed');
  return { derivatives, receiptId };
}
