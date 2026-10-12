import { getAdminDb } from '@/lib/firebase-admin';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { socialSubtitlesSchema, type SocialSubtitles } from './social-subtitles';

/** Only expose card copy already bound to the exact published CMS snapshot.
 * Never expose private drafts, author identities, research, or approval records.
 * A changed CMS hash fails closed; the editor can still fit the current text locally.
 */
export async function publishedSocialSubtitles(items: Array<{ id: string; fieldData: Record<string, unknown> }>) {
  const result = new Map<string, SocialSubtitles>();
  const db = getAdminDb();
  if (!db || !items.length) return result;
  const hashes = new Map(items.map(item => [item.id, cmsFieldHash(item.fieldData)]));
  const rows = await db.collection('editorialSubmissions').where('status', '==', 'published')
    .select('status', 'article.socialSubtitles', 'publishedTarget.itemId', 'publishedTarget.fieldDataHash').limit(301).get();
  // Bounded, optional enhancement. No expensive full scan or pagination on editor open.
  if (rows.size > 300) return result;
  for (const doc of rows.docs) {
    const row = doc.data(), target = row.publishedTarget;
    const parsed = socialSubtitlesSchema.safeParse(row.article?.socialSubtitles);
    if (row.status === 'published' && parsed.success && typeof target?.itemId === 'string' &&
        typeof target.fieldDataHash === 'string' && target.fieldDataHash === hashes.get(target.itemId)) {
      result.set(target.itemId, parsed.data);
    }
  }
  return result;
}
