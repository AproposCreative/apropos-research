import { getAdminDb } from '@/lib/firebase-admin';

function ref(uid: string) {
  const db = getAdminDb();
  if (!db || !uid || uid.length > 128 || uid.includes('/')) throw new Error('image_gen_workspace_unavailable');
  return { db, ref: db.collection('imageGenWorkspaces').doc(uid) };
}
export async function readImageGenWorkspace(uid: string) {
  const row = (await ref(uid).ref.get()).data();
  return { revision: row?.workspaceRevision ?? 0, state: row?.workspaceState ?? null };
}
/** State is inert private UI data, never authority for API, asset or CMS access. */
export async function writeImageGenWorkspace(uid: string, revision: number, state: unknown) {
  if (!Number.isSafeInteger(revision) || revision < 0 || !state || typeof state !== 'object' || Array.isArray(state) ||
      Buffer.byteLength(JSON.stringify(state)) > 25_000) throw new Error('image_gen_workspace_invalid');
  const { db, ref: target } = ref(uid);
  return db.runTransaction(async tx => {
    const row = (await tx.get(target)).data();
    if ((row?.workspaceRevision ?? 0) !== revision) throw new Error('image_gen_workspace_conflict');
    tx.set(target, { workspaceRevision: revision + 1, workspaceState: JSON.parse(JSON.stringify(state)),
      workspaceUpdatedAt: new Date().toISOString() }, { merge: true });
    return { revision: revision + 1 };
  });
}
