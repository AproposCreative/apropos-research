import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminDb } from '@/lib/firebase-admin';
import { WORKSPACE_MAX_BYTES, workspaceRestoreSchema, workspaceSnapshotSchema } from '@/lib/writer-workspace';

export const runtime = 'nodejs';
const reply = (body: unknown, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } });
export async function POST(req: NextRequest) {
  const user = await editorialRequestAccess(req);
  if (!user) return reply({ error: 'Log ind for at gendanne dit arbejdsrum.' }, 401);
  const raw = await req.text();
  if (Buffer.byteLength(raw, 'utf8') > WORKSPACE_MAX_BYTES) return reply({ error: 'Den lokale kopi er for stor. Download den, før du fortsætter.' }, 413);
  const parsed = workspaceRestoreSchema.safeParse((() => { try { return JSON.parse(raw); } catch { return null; } })());
  if (!parsed.success) return reply({ error: 'Ugyldig gendannelse.' }, 400);
  const body = parsed.data;
  const hash = createHash('sha256').update(JSON.stringify(body)).digest('hex');
  try {
    const db = getAdminDb(); if (!db) throw new Error('unavailable');
    const ref = db.collection('writerWorkspaces').doc(user.uid);
    const receipt = ref.collection('restores').doc(body.operationId);
    const result = await db.runTransaction(async tx => {
      const existing = (await tx.get(receipt)).data();
      if (existing) return existing.hash === hash ? { workspace: existing.workspace } : { status: 409, error: 'Gendannelsens indhold er ændret. Åbn versionslisten igen.' };
      const [current, selected] = await Promise.all([
        tx.get(ref), tx.get(body.selection.kind === 'shared'
          ? db.collection('writerWorkspaceShares').doc(body.selection.id)
          : ref.collection(body.selection.kind).doc(body.selection.id)),
      ]);
      if (!selected.exists) return { status: 404, error: 'Versionen findes ikke.' };
      const previous = current.exists ? workspaceSnapshotSchema.parse(current.data()) : null;
      const selectedData = selected.data();
      if (body.selection.kind === 'shared' && !selectedData?.participants?.includes(user.uid))
        return { status: 404, error: 'Den delte kopi findes ikke.' };
      const source = body.selection.kind === 'shared' ? selectedData?.snapshot : selectedData;
      const snapshot = workspaceSnapshotSchema.parse({ ...source, updatedAt: source?.updatedAt || source?.savedAt });
      if ((previous?.revision || 0) !== body.revision) return { status: 409, error: 'Arbejdsrummet er ændret på en anden enhed. Prøv igen; intet er overskrevet.' };
      const now = new Date().toISOString();
      // Both the server version and unsaved local typing survive the restore.
      if (previous) tx.set(ref.collection('history').doc(String(previous.revision)), previous);
      tx.set(ref.collection('conflicts').doc(hash), { revision: body.revision, data: body.local, savedAt: now });
      const workspace = { revision: body.revision + 1, updatedAt: now,
        data: { ...snapshot.data, currentDraftId: `restored-${body.operationId}` } };
      tx.set(ref, workspace);
      tx.create(receipt, { hash, workspace });
      return { workspace };
    });
    return 'status' in result ? reply({ error: result.error }, result.status) : reply(result);
  } catch { return reply({ error: 'Gendannelsen kunne ikke bekræftes. Prøv den samme gendannelse igen.' }, 503); }
}
