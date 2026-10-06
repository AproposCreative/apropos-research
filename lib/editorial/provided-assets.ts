import { load } from 'cheerio';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

/** Identity lock, not a quality/rightsholder attestation. No signed file URL. */
export async function lockProvidedAsset(uid: string, submissionId: string, url: string, hash: string) {
  const db = getAdminDb(); if (!db) throw Error('mcp_submission_store_unavailable');
  const ref = db.collection('editorialProvidedAssets').doc(cmsFieldHash({ url }));
  await db.runTransaction(async tx => {
    const old = (await tx.get(ref)).data();
    if (old && (old.url !== url || old.hash !== hash)) throw Error('mcp_submission_media_identity_changed');
    if (!old) tx.create(ref, { url, hash, uid, submissionId, preserveOriginal: true, lockedAt: new Date().toISOString() });
  });
}

/** Prevent later publication webhooks silently cropping/cleaning selected files. */
export async function containsLockedProvidedAsset(fields: Record<string, unknown>) {
  const $ = load(typeof fields.content === 'string' ? fields.content : '');
  const urls = [...new Set([
    ...['thumb', 'mobile-image'].map(key => (fields[key] as { url?: string } | undefined)?.url),
    ...$('img').toArray().map(node => $(node).attr('src')),
  ].filter((url): url is string => !!url))];
  if (!urls.length) return false;
  const db = getAdminDb(); if (!db) throw Error('mcp_submission_store_unavailable');
  const rows = await Promise.all(urls.slice(0, 16).map(url => db.collection('editorialProvidedAssets').doc(cmsFieldHash({ url })).get()));
  return rows.some((row, index) => row.data()?.url === urls[index] && row.data()?.preserveOriginal === true);
}
