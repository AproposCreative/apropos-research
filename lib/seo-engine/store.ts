import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import type {
  EditorialAnalysisV1,
  SeoEngineInputContract,
  SeoStrategyPackV1,
} from '@/lib/seo-engine/schema';
import type { ValidationResult } from '@/lib/seo-engine/validator';
import {
  SEO_ENGINE_PROMPT_VERSION,
  SEO_ENGINE_SCHEMA_VERSION,
  SEO_ENGINE_VALIDATOR_VERSION,
  SEO_ENGINE_VERSION,
  SEO_ENGINE_JSONLD_VERSION,
} from '@/lib/seo-engine/versions';

export const COL = {
  articles: 'seoEngineArticles',
  analysisRuns: 'seoEngineAnalysisRuns',
  snapshots: 'seoEngineInputSnapshots',
  versions: 'seoEngineVersions',
  fieldRevisions: 'seoEngineFieldRevisions',
  jobs: 'seoEngineJobs',
  contentClaims: 'seoEngineContentClaims',
  rateLimits: 'seoEngineRateLimits',
} as const;

export type AnalysisRunDoc = {
  id: string;
  articleKey: string;
  inputVersionHash: string;
  snapshotPath: string;
  inputMode: 'full' | 'long_article_extract';
  status: 'succeeded' | 'failed';
  mode: 'ai' | 'demo';
  analysis?: EditorialAnalysisV1;
  error?: string;
  /** Truncated debug — never raw article */
  debug?: Record<string, unknown>;
  provider?: string;
  model?: string;
  engineVersion: string;
  schemaVersion: string;
  promptVersion: string;
  validatorVersion: string;
  jsonLdVersion: string;
  startedAt?: unknown;
  endedAt?: unknown;
  createdBy: string;
  deletedAt?: unknown;
  /** Safe Fase-B failure metadata (never article body) */
  strategyFailure?: {
    at?: unknown;
    message: string;
    code?: string;
    details?: unknown;
  };
};

export type SeoVersionDoc = {
  id: string;
  analysisRunId: string;
  articleKey: string;
  inputVersionHash: string;
  revision: number;
  stale: boolean;
  pack: SeoStrategyPackV1;
  validation: ValidationResult;
  mode?: 'ai' | 'demo';
  engineVersion: string;
  schemaVersion: string;
  promptVersion: string;
  validatorVersion: string;
  jsonLdVersion: string;
  createdBy: string;
  createdAt?: unknown;
  deletedAt?: unknown;
};

export type InputSnapshotDoc = {
  inputVersionHash: string;
  contract: SeoEngineInputContract;
  normalizedText: string;
  inputMode: 'full' | 'long_article_extract';
  extractManifest?: Record<string, unknown>;
  byteSize: number;
  createdAt?: unknown;
};

function requireDb(): Firestore {
  const db = getAdminDb();
  if (!db) throw new Error('Firestore er ikke tilgængelig');
  return db;
}

export function versionStamps() {
  return {
    engineVersion: SEO_ENGINE_VERSION,
    schemaVersion: SEO_ENGINE_SCHEMA_VERSION,
    promptVersion: SEO_ENGINE_PROMPT_VERSION,
    validatorVersion: SEO_ENGINE_VALIDATOR_VERSION,
    jsonLdVersion: SEO_ENGINE_JSONLD_VERSION,
  };
}

export async function upsertInputSnapshot(
  snapshot: Omit<InputSnapshotDoc, 'createdAt'>
): Promise<void> {
  const db = requireDb();
  const ref = db.collection(COL.snapshots).doc(snapshot.inputVersionHash);
  const existing = await ref.get();
  if (existing.exists) return;
  await ref.set({
    ...snapshot,
    createdAt: FieldValue.serverTimestamp(),
  });
}

export async function getInputSnapshot(
  inputVersionHash: string
): Promise<InputSnapshotDoc | null> {
  const db = requireDb();
  const snap = await db.collection(COL.snapshots).doc(inputVersionHash).get();
  if (!snap.exists) return null;
  return snap.data() as InputSnapshotDoc;
}

export async function saveAnalysisRun(
  doc: Omit<AnalysisRunDoc, 'startedAt' | 'endedAt'> & { id: string }
): Promise<string> {
  const db = requireDb();
  const ref = db.collection(COL.analysisRuns).doc(doc.id);
  await ref.set({
    ...doc,
    ...versionStamps(),
    startedAt: FieldValue.serverTimestamp(),
    endedAt: FieldValue.serverTimestamp(),
  });
  await db
    .collection(COL.articles)
    .doc(doc.articleKey)
    .set(
      {
        latestAnalysisRunId: doc.id,
        inputVersionHash: doc.inputVersionHash,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return doc.id;
}

export async function getAnalysisRun(runId: string): Promise<(AnalysisRunDoc & { id: string }) | null> {
  const db = requireDb();
  const snap = await db.collection(COL.analysisRuns).doc(runId).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as AnalysisRunDoc), id: snap.id };
}

/** Persist Fase-B failure without dumping article/prompt text. */
export async function markAnalysisStrategyFailure(
  analysisRunId: string,
  failure: { message: string; code?: string; details?: unknown }
): Promise<void> {
  const db = requireDb();
  await db
    .collection(COL.analysisRuns)
    .doc(analysisRunId)
    .set(
      {
        strategyFailure: {
          message: failure.message.slice(0, 500),
          code: failure.code,
          details: failure.details,
          at: FieldValue.serverTimestamp(),
        },
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
}

export async function saveSeoVersion(
  doc: Omit<SeoVersionDoc, 'createdAt' | 'revision' | 'stale'> & {
    id: string;
    revision?: number;
    stale?: boolean;
  }
): Promise<string> {
  const db = requireDb();
  const ref = db.collection(COL.versions).doc(doc.id);
  await ref.set({
    ...doc,
    ...versionStamps(),
    revision: doc.revision ?? 1,
    stale: doc.stale ?? false,
    createdAt: FieldValue.serverTimestamp(),
  });
  await db
    .collection(COL.articles)
    .doc(doc.articleKey)
    .set(
      {
        latestSeoVersionId: doc.id,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true }
    );
  return doc.id;
}

export async function getSeoVersion(
  seoVersionId: string
): Promise<(SeoVersionDoc & { id: string }) | null> {
  const db = requireDb();
  const snap = await db.collection(COL.versions).doc(seoVersionId).get();
  if (!snap.exists) return null;
  return { ...(snap.data() as SeoVersionDoc), id: snap.id };
}

export async function markSeoVersionStale(seoVersionId: string): Promise<void> {
  const db = requireDb();
  await db.collection(COL.versions).doc(seoVersionId).set(
    { stale: true, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}

export async function appendFieldRevision(args: {
  seoVersionId: string;
  fieldPath: string;
  previousValue: unknown;
  newValue: unknown;
  source: 'ai' | 'editor' | 'regeneration';
  userId: string;
  instruction?: string;
}): Promise<void> {
  const db = requireDb();
  await db.collection(COL.fieldRevisions).add({
    ...args,
    at: FieldValue.serverTimestamp(),
  });
}

/**
 * Atomic revision bump + field revision logs in one transaction.
 * Avoids orphan audit rows on 409 revision conflicts.
 */
export async function applyFieldPatchesInTransaction(args: {
  seoVersionId: string;
  expectedRevision: number;
  pack: SeoStrategyPackV1;
  validation: ValidationResult;
  revisionLogs: Array<{
    fieldPath: string;
    previousValue: unknown;
    newValue: unknown;
    source: 'ai' | 'editor' | 'regeneration';
    userId: string;
    instruction?: string;
  }>;
}): Promise<number> {
  const db = requireDb();
  const ref = db.collection(COL.versions).doc(args.seoVersionId);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) throw new Error('seoVersion findes ikke');
    const data = snap.data() as SeoVersionDoc;
    if (data.revision !== args.expectedRevision) {
      const err = new Error('revision_conflict');
      (err as Error & { code?: string }).code = 'revision_conflict';
      throw err;
    }
    const next = data.revision + 1;
    tx.update(ref, {
      revision: next,
      pack: args.pack,
      validation: args.validation,
      updatedAt: FieldValue.serverTimestamp(),
    });
    for (const log of args.revisionLogs) {
      const revRef = db.collection(COL.fieldRevisions).doc();
      tx.set(revRef, {
        seoVersionId: args.seoVersionId,
        ...log,
        at: FieldValue.serverTimestamp(),
      });
    }
    return next;
  });
}

export async function bumpSeoVersionRevision(
  seoVersionId: string,
  expectedRevision: number,
  pack: SeoStrategyPackV1,
  validation: ValidationResult
): Promise<number> {
  return applyFieldPatchesInTransaction({
    seoVersionId,
    expectedRevision,
    pack,
    validation,
    revisionLogs: [],
  });
}

/** Soft-delete marker — no hard purge by default. */
export async function softDeleteArticleKey(articleKey: string): Promise<void> {
  const db = requireDb();
  await db.collection(COL.articles).doc(articleKey).set(
    { deletedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
}
