import { getAdminDb } from '@/lib/firebase-admin';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { sourcePolicy } from '@/lib/research/source-policy';
import type { NextRequest } from 'next/server';

export async function personalSourcePolicy(request: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(request);
  // Internal/system generation must never inherit a colleague's preferences.
  if (!uid) return undefined;
  const db = getAdminDb();
  if (!db) throw new Error('Dine kildevalg kunne ikke hentes. Prøv igen.');
  try {
    const rows = await db.collection('mediaSources').where('userId', '==', uid).limit(101).get();
    if (rows.size > 100) throw new Error('source_limit');
    return sourcePolicy(rows.docs.map(d => d.data()));
  } catch { throw new Error('Dine kildevalg kunne ikke hentes. Prøv igen.'); }
}
