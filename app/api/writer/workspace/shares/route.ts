import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });

export async function GET(request: Request) {
  const user = await editorialRequestAccess(request);
  if (!user) return reply({ error: 'Log ind.' }, 401);
  const id = new URL(request.url).searchParams.get('id');
  if (id && !/^[a-f0-9]{64}$/.test(id)) return reply({ error: 'Ugyldig deling.' }, 400);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const collection = db.collection('writerWorkspaceShares');
    if (id) {
      const doc = await collection.doc(id).get(); const shared = doc.data();
      if (!shared || !shared.participants?.includes(user.uid)) return reply({ error: 'Delingen findes ikke.' }, 404);
      return reply({ share: { id, snapshot: shared.snapshot, createdAt: shared.createdAt, own: shared.ownerUid === user.uid } });
    }
    const rows = await collection.where('participants', 'array-contains', user.uid).limit(50).get();
    return reply({ shares: rows.docs.map(doc => { const d = doc.data(); return {
      id: doc.id, title: d.snapshot?.data?.chatTitle || 'Delt arbejdsrum', createdAt: d.createdAt, own: d.ownerUid === user.uid,
    }; }).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) });
  } catch { return reply({ error: 'Delte kopier kunne ikke hentes.' }, 503); }
}

/** Retired: historical participant reads remain available, but no new copies. */
export async function POST(request: Request) {
  const user = await editorialRequestAccess(request);
  if (!user) return reply({ error: 'Log ind.' }, 401);
  return reply({ error: 'Delte historier er udfaset. Send den færdige historie til Webflow som kladde.' }, 410);
}
