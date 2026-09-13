import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { mediaSourceUrl, validateMediaSource } from './media-source-validation';

/** Private server-side cache; an explicit refresh bypasses the 24-hour result. */
export async function checkMediaSource(userId: string, base: string, path: string, refresh = false) {
  const url = mediaSourceUrl(base, path).href;
  const db = getAdminDb(); if (!db) throw new Error('media_check_storage_unavailable');
  const key = createHash('sha256').update(url).digest('hex');
  const ref = db.collection('mediaSourceChecks').doc(userId).collection('checks').doc(key);
  const cached = (await ref.get()).data();
  if (!refresh && cached?.version === 1 && cached.url === url && cached.result &&
    typeof cached.expiresAt === 'number' && cached.expiresAt > Date.now()) return { ...cached.result, cached: true };
  const result = await validateMediaSource(base, path);
  await ref.set({ version: 1, url, result, expiresAt: Date.now() + 86400000 });
  return { ...result, cached: false };
}
