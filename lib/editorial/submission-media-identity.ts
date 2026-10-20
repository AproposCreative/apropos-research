import { createHash } from 'node:crypto';
import sharp from 'sharp';
import { load } from 'cheerio';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { readLivStoredImage } from '@/lib/liv/stored-image-reader';
import { readSubmission, submissionStore } from './submissions';
import { selectedAssetUrls } from './submission-compressed-media';

/** Verify selected file bytes, not asset metadata or a constructed hosted URL.
 * Called after live CMS/public readback. The receipt is a dated observation, not
 * a promise that an external editor can never change the article again. */
export async function verifySubmissionMedia(uid: string, id: string, fields: Record<string, unknown>) {
  const row = await readSubmission(uid, id), $ = load(String(fields.content || ''));
  const receipts = await submissionStore().collection.doc(id).collection('chatAssets').limit(100).get();
  const local = load(row.article?.content || '');
  const selected = new Set([row.article?.featuredImage, ...local('img').toArray().map(node => local(node).attr('src'))]);
  const assets = [];
  for (const doc of receipts.docs) {
    const asset = doc.data();
    if (asset.status !== 'attached' || !selectedAssetUrls(row, asset).some(url => selected.has(url))) continue;
    const urls = asset.role === 'cover' ? ['thumb', 'mobile-image'].map(key => (fields[key] as { url?: string })?.url) :
      $('img').toArray().filter(node => $(node).attr('src') === asset.url || $(node).closest('figure').attr('data-apropos-asset') === asset.assetId).map(node => $(node).attr('src'));
    if (!urls.length || urls.some(url => !url)) throw Error('mcp_submission_media_identity_changed');
    const verified = [];
    for (const url of [...new Set(urls)] as string[]) {
      const bytes = await readLivStoredImage(url);
      const hash = createHash('sha256').update(bytes).digest('hex');
      const meta = await sharp(bytes, { limitInputPixels: 80_000_000 }).metadata();
      const derivative = row.publishedTarget?.mediaDerivatives?.find(d => d.assetId === asset.assetId &&
        d.originalUrl === asset.url && d.originalHash === asset.originalHash && d.url === url);
      if (!bytes.length || !meta.width || !meta.height || !['jpeg', 'png', 'webp'].includes(meta.format || '') ||
          (derivative ? hash !== derivative.hash : hash !== asset.hash || (asset.preserveOriginal && hash !== asset.originalHash)))
        throw Error('mcp_submission_media_identity_changed');
      verified.push({ url, hash, bytes: bytes.length, width: meta.width, height: meta.height,
        ...(derivative ? { derivativeReceipt: derivative.receiptId, originalHash: derivative.originalHash } : {}) });
    }
    assets.push({ assetId: asset.assetId, role: asset.role, approvedHash: asset.originalHash, published: verified, fallbackUsed: false });
  }
  return { cmsHash: cmsFieldHash(fields), assets, checkedAt: new Date().toISOString() };
}
