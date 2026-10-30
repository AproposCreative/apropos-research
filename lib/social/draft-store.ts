import { createHash } from 'node:crypto';
import { getAdminDb } from '@/lib/firebase-admin';
import { sameSocialDraft, type SocialDraftRecord, type SocialEditorDraft } from './editor-draft';
const hash = (value: string) => createHash('sha256').update(value).digest('hex');
function database() { const db = getAdminDb(); if (!db) throw Error('social_draft_storage_unavailable'); return db; }
function draftRef(uid: string, articleId: string, sourceHash: string) {
  return database().collection('socialEditorDrafts').doc(hash(JSON.stringify([uid, articleId, sourceHash])));
}
const record = (row?: Record<string, any>): SocialDraftRecord => ({
  revision: row?.revision ?? 0, draft: row?.draft ?? null, updatedAt: row?.updatedAt ?? null,
});
export async function readSocialDraft(uid: string, articleId: string, sourceHash: string) {
  const snap = await draftRef(uid, articleId, sourceHash).get();
  if (snap.exists && snap.data()?.ownerUid !== uid) throw Error('social_draft_owner_mismatch');
  return record(snap.data());
}
export async function lastSocialArticle(uid: string): Promise<string | null> {
  const row = (await database().collection('socialEditorOwners').doc(hash(uid)).get()).data();
  return row?.ownerUid === uid && typeof row.lastArticleId === 'string' ? row.lastArticleId : null;
}
export async function saveSocialDraft(uid: string, articleId: string, sourceHash: string,
  expectedRevision: number, draft: SocialEditorDraft): Promise<{ conflict: boolean; record: SocialDraftRecord }> {
  const db = database(), ref = draftRef(uid, articleId, sourceHash);
  return db.runTransaction(async tx => {
    const snap = await tx.get(ref), row = snap.data();
    if (row && row.ownerUid !== uid) throw Error('social_draft_owner_mismatch');
    if (row && sameSocialDraft(row.draft, draft)) return { conflict: false, record: record(row) };
    if ((row?.revision ?? 0) !== expectedRevision) return { conflict: true, record: record(row) };
    const next = { revision: expectedRevision + 1, draft, updatedAt: new Date().toISOString() };
    tx.set(ref, { ...next, articleId, sourceHash, ownerUid: uid });
    tx.set(db.collection('socialEditorOwners').doc(hash(uid)), { ownerUid: uid, lastArticleId: articleId });
    return { conflict: false, record: next };
  });
}
