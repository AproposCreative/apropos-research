import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { verifyEditorialToken } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { WORKSPACE_MAX_BYTES, workspaceWriteSchema } from '@/lib/writer-workspace';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
async function identity(req: NextRequest) {
  const header = req.headers.get('authorization') || '';
  return header.startsWith('Bearer ') ? verifyEditorialToken(header.slice(7)) : null;
}
export async function GET(req: NextRequest) {
  const user = await identity(req);
  if (!user) return reply({ error: 'Log ind for at hente dit arbejdsrum.' }, 401);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const saved = await db.collection('writerWorkspaces').doc(user.uid).get();
    return reply({ workspace: saved.exists ? saved.data() : null });
  } catch { return reply({ error: 'Dit arbejdsrum kunne ikke hentes.' }, 503); }
}
export async function PUT(req: NextRequest) {
  const user = await identity(req);
  if (!user) return reply({ error: 'Log ind for at gemme dit arbejdsrum.' }, 401);
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > WORKSPACE_MAX_BYTES) return reply({ error: 'Arbejdsrummet er for stort til automatisk synkronisering.' }, 413);
  const parsed = workspaceWriteSchema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success) return reply({ error: 'Ugyldigt arbejdsrum.' }, 400);
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const ref = db.collection('writerWorkspaces').doc(user.uid);
    const result = await db.runTransaction(async tx => {
      const previous = (await tx.get(ref)).data();
      // A retry of a completed identical save is a readback, not a new revision.
      if (previous && JSON.stringify(previous.data) === JSON.stringify(parsed.data.data)) return { revision: previous.revision };
      if ((previous?.revision || 0) !== parsed.data.revision) {
        const conflictId = createHash('sha256').update(raw).digest('hex');
        const conflict = ref.collection('conflicts').doc(conflictId);
        if (!(await tx.get(conflict)).exists) tx.create(conflict, { ...parsed.data, savedAt: new Date().toISOString() });
        return { conflict: true };
      }
      const revision = parsed.data.revision + 1;
      if (previous && previous.data.currentDraftId !== parsed.data.data.currentDraftId) {
        tx.set(ref.collection('history').doc(String(previous.revision)), previous);
      }
      tx.set(ref, { revision, data: parsed.data.data, updatedAt: new Date().toISOString() });
      return { revision };
    });
    return 'conflict' in result ? reply({ error: 'Ændret på en anden enhed. Begge versioner er bevaret.', conflict: true }, 409) : reply(result);
  } catch { return reply({ error: 'Ikke synkroniseret. Din lokale kopi er bevaret.' }, 503); }
}
