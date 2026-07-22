import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { COL, type AnalysisRunDoc, type SeoVersionDoc } from '@/lib/seo-engine/store';
import { isSeoEngineAdmin } from '@/lib/seo-engine/access';

function requireDb() {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke tilgængelig');
  return db;
}

function tsMillis(v: unknown): number {
  if (!v) return 0;
  if (typeof (v as { toMillis?: () => number }).toMillis === 'function') {
    return (v as { toMillis: () => number }).toMillis();
  }
  if (typeof v === 'string' || typeof v === 'number') return new Date(v).getTime() || 0;
  return 0;
}

function filterVisibleToUser<T extends { createdBy?: string; deletedAt?: unknown }>(
  rows: T[],
  userId: string
): T[] {
  const admin = isSeoEngineAdmin(userId);
  return rows.filter((r) => {
    if (r.deletedAt) return false;
    if (!r.createdBy) return false;
    if (r.createdBy.startsWith('system:')) return admin;
    return admin || r.createdBy === userId;
  });
}

/**
 * Prefer indexed orderBy; fall back to client sort if index missing / old docs without timestamp.
 */
export async function listSeoVersionsForArticle(
  articleKey: string,
  limit = 50,
  opts?: { userId?: string }
): Promise<Array<SeoVersionDoc & { id: string }>> {
  const db = requireDb();
  const capped = Math.min(100, Math.max(1, limit));
  let docs: Array<SeoVersionDoc & { id: string }> = [];
  try {
    const snap = await db
      .collection(COL.versions)
      .where('articleKey', '==', articleKey)
      .orderBy('createdAt', 'desc')
      .limit(capped)
      .get();
    docs = snap.docs.map((d) => ({ ...(d.data() as SeoVersionDoc), id: d.id }));
  } catch {
    const snap = await db
      .collection(COL.versions)
      .where('articleKey', '==', articleKey)
      .limit(Math.min(200, capped * 3))
      .get();
    docs = snap.docs
      .map((d) => ({ ...(d.data() as SeoVersionDoc), id: d.id }))
      .sort(
        (a, b) =>
          tsMillis(b.createdAt) - tsMillis(a.createdAt) || String(b.id).localeCompare(String(a.id))
      )
      .slice(0, capped);
  }
  if (opts?.userId) docs = filterVisibleToUser(docs, opts.userId);
  return docs.filter((v) => !v.deletedAt).slice(0, capped);
}

export async function listAnalysisRunsForArticle(
  articleKey: string,
  limit = 50,
  opts?: { userId?: string }
): Promise<Array<AnalysisRunDoc & { id: string }>> {
  const db = requireDb();
  const capped = Math.min(100, Math.max(1, limit));
  let docs: Array<AnalysisRunDoc & { id: string }> = [];
  try {
    const snap = await db
      .collection(COL.analysisRuns)
      .where('articleKey', '==', articleKey)
      .orderBy('endedAt', 'desc')
      .limit(capped)
      .get();
    docs = snap.docs.map((d) => ({ ...(d.data() as AnalysisRunDoc), id: d.id }));
  } catch {
    const snap = await db
      .collection(COL.analysisRuns)
      .where('articleKey', '==', articleKey)
      .limit(Math.min(200, capped * 3))
      .get();
    docs = snap.docs
      .map((d) => ({ ...(d.data() as AnalysisRunDoc), id: d.id }))
      .sort(
        (a, b) =>
          tsMillis(b.endedAt || b.startedAt) - tsMillis(a.endedAt || a.startedAt) ||
          String(b.id).localeCompare(String(a.id))
      )
      .slice(0, capped);
  }
  if (opts?.userId) docs = filterVisibleToUser(docs, opts.userId);
  return docs.filter((r) => !r.deletedAt).slice(0, capped);
}

/**
 * Soft-delete only docs the user may see. Admin deletes all for key; owner deletes own.
 * Never soft-deletes system docs for non-admin.
 */
export async function softDeleteSeoArticle(
  articleKey: string,
  opts: { userId: string }
): Promise<{ versions: number; runs: number }> {
  const db = requireDb();
  const admin = isSeoEngineAdmin(opts.userId);
  const stamp = FieldValue.serverTimestamp();

  const versions = await db.collection(COL.versions).where('articleKey', '==', articleKey).get();
  const runs = await db.collection(COL.analysisRuns).where('articleKey', '==', articleKey).get();

  const canTouch = (createdBy?: string) => {
    if (!createdBy) return false;
    if (createdBy.startsWith('system:')) return admin;
    return admin || createdBy === opts.userId;
  };

  const versionRefs = versions.docs.filter((d) => canTouch((d.data() as SeoVersionDoc).createdBy));
  const runRefs = runs.docs.filter((d) => canTouch((d.data() as AnalysisRunDoc).createdBy));

  if (!admin && versionRefs.length === 0 && runRefs.length === 0) {
    throw Object.assign(new Error('Ingen egne dokumenter at slette'), { code: 'forbidden' });
  }

  if (admin || versionRefs.length > 0) {
    await db.collection(COL.articles).doc(articleKey).set({ deletedAt: stamp }, { merge: true });
  }

  const allRefs = [...versionRefs.map((d) => d.ref), ...runRefs.map((d) => d.ref)];
  const CHUNK = 400;
  for (let i = 0; i < allRefs.length; i += CHUNK) {
    const batch = db.batch();
    for (const ref of allRefs.slice(i, i + CHUNK)) {
      batch.set(ref, { deletedAt: stamp }, { merge: true });
    }
    await batch.commit();
  }
  return { versions: versionRefs.length, runs: runRefs.length };
}

export function assertSameArticleKey(
  a: { articleKey?: string },
  b: { articleKey?: string }
): void {
  if (!a.articleKey || !b.articleKey || a.articleKey !== b.articleKey) {
    throw Object.assign(new Error('Diff kræver samme articleKey'), { code: 'invalid_input' });
  }
}

/** Field-level semantic diff between two publish field maps. */
export function diffPublishFields(
  prev: Record<string, { value?: unknown }>,
  next: Record<string, { value?: unknown }>
): Array<{ fieldPath: string; previous: unknown; next: unknown }> {
  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const out: Array<{ fieldPath: string; previous: unknown; next: unknown }> = [];
  for (const key of keys) {
    const x = JSON.stringify(prev[key]?.value ?? null);
    const y = JSON.stringify(next[key]?.value ?? null);
    if (x !== y) {
      out.push({
        fieldPath: key,
        previous: prev[key]?.value ?? null,
        next: next[key]?.value ?? null,
      });
    }
  }
  return out;
}

/** Test helper: decide which history rows a user may see. */
export function filterHistoryRowsForUser<T extends { createdBy?: string }>(
  rows: T[],
  userId: string
): T[] {
  return filterVisibleToUser(rows, userId);
}
