import { createHash } from 'node:crypto';
import { z } from 'zod';
import { editorialRequestAccess } from '@/lib/editorial-access';
import { getAdminAuth, getAdminDb } from '@/lib/firebase-admin';
import { EDITORIAL_EMAILS, editorialRole, type AccessEntry } from '@/lib/auth-policy';
import { workspaceSnapshotSchema } from '@/lib/writer-workspace';

const input = z.object({ operationId: z.string().uuid(), revision: z.number().int().positive(),
  recipient: z.enum(EDITORIAL_EMAILS) }).strict();
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

/** Immutable explicit snapshot. Never reads a client-selected owner's workspace. */
export async function POST(request: Request) {
  const user = await editorialRequestAccess(request);
  if (!user) return reply({ error: 'Log ind.' }, 401);
  let data: z.infer<typeof input>;
  try { const raw = await request.text(); if (raw.length > 1000) throw new Error(); data = input.parse(JSON.parse(raw)); }
  catch { return reply({ error: 'Vælg modtager og en gemt version.' }, 400); }
  try {
    const db = getAdminDb(); const auth = getAdminAuth(); if (!db || !auth) throw new Error('unavailable');
    const recipient = await auth.getUserByEmail(data.recipient);
    const entry = (await db.collection('editorialAccess').doc(data.recipient).get()).data();
    if (!editorialRole({ email: recipient.email, emailVerified: recipient.emailVerified, disabled: recipient.disabled, entry: entry as AccessEntry | undefined }) || recipient.uid === user.uid)
      return reply({ error: 'Modtageren skal være en anden aktiv, verificeret kollega.' }, 400);
    const id = createHash('sha256').update(`${user.uid}:${data.operationId}`).digest('hex');
    const ref = db.collection('writerWorkspaceShares').doc(id);
    const result = await db.runTransaction(async tx => {
      const old = (await tx.get(ref)).data();
      if (old) return old.recipientUid === recipient.uid && old.snapshot.revision === data.revision ? 'existing' : 'conflict';
      const current = workspaceSnapshotSchema.safeParse((await tx.get(db.collection('writerWorkspaces').doc(user.uid))).data());
      if (!current.success || current.data.revision !== data.revision) return 'conflict';
      tx.create(ref, { ownerUid: user.uid, recipientUid: recipient.uid, participants: [user.uid, recipient.uid],
        snapshot: current.data, createdAt: new Date().toISOString() });
      return 'created';
    });
    if (result === 'conflict') return reply({ error: 'Versionen er ændret. Gennemse den aktuelle version før deling.' }, 409);
    return reply({ id, created: result === 'created' }, result === 'created' ? 201 : 200);
  } catch { return reply({ error: 'Delingen kunne ikke bekræftes. Prøv samme forsøg igen.' }, 503); }
}
