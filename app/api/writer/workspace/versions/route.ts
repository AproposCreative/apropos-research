import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { workspaceSnapshotSchema } from '@/lib/writer-workspace';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function GET(req: NextRequest) {
  const access = await editorialRequestAccess(req);
  if (!access) return reply({ error: 'Log ind for at se dine versioner.' }, 401);
  const kind = req.nextUrl.searchParams.get('kind');
  const id = req.nextUrl.searchParams.get('id');
  if (kind !== null && kind !== 'history' && kind !== 'conflicts') return reply({ error: 'Ugyldig version.' }, 400);
  if (id !== null && (!kind || !(kind === 'history' ? /^\d{1,16}$/ : /^[a-f0-9]{64}$/).test(id))) return reply({ error: 'Ugyldig version.' }, 400);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    // Even Frederik may only read his own workspace, not another editor's UID.
    const ref = db.collection('writerWorkspaces').doc(access.uid);
    if (kind && id) {
      const saved = await ref.collection(kind).doc(id).get();
      if (!saved.exists) return reply({ error: 'Versionen blev ikke fundet.' }, 404);
      const raw = saved.data();
      const snapshot = workspaceSnapshotSchema.parse({ ...raw, updatedAt: raw?.updatedAt || raw?.savedAt });
      return reply({ snapshot });
    }
    const kinds = kind ? [kind] : ['history', 'conflicts'];
    const versions = (await Promise.all(kinds.map(async collection => {
      const page = await ref.collection(collection).orderBy(collection === 'history' ? 'updatedAt' : 'savedAt', 'desc').limit(20).get();
      return page.docs.map(doc => {
        const raw = doc.data();
        const snapshot = workspaceSnapshotSchema.parse({ ...raw, updatedAt: raw.updatedAt || raw.savedAt });
        return { id: doc.id, kind: collection, title: snapshot.data.chatTitle,
          updatedAt: snapshot.updatedAt, revision: snapshot.revision };
      });
    }))).flat().sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    return reply({ versions, limitPerKind: 20 });
  } catch { return reply({ error: 'Versionerne kunne ikke hentes. Intet er ændret.' }, 503); }
}
