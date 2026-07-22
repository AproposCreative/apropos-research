/**
 * Settings Scan/Kør for Auto-SEO.
 *
 * Scan = read-only preview with frozen candidate fingerprints (lastUpdated + contentHash).
 * Kør = only processes client-sent scan candidates via durable enqueue + runSeoEngineJob
 *       (stale-check, content-hash claim, empty-only, validator, exact readback, audit).
 * Never overwrites filled SEO fields. Max 3 per run.
 */

import { createHash, randomUUID } from 'node:crypto';
import { FieldValue } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import { cmsSeoEmptiness, webflowItemToSeoEngineInput } from '@/lib/seo-engine/cms-contract';
import { computeInputVersionHash } from '@/lib/seo-engine/hash';
import { writeQueuedSeoEngineJob } from '@/lib/seo-engine/jobs';
import { listDkArticleItems, hashCmsContent, type ListedArticleItem } from '@/lib/seo-engine/overwrite-backfill';
import { checkReviewSeoTitle } from '@/lib/seo-engine/review-title-rule';
import { runSeoEngineJob } from '@/lib/seo-engine/auto-seo-worker';
import { getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import {
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  resolveWebflowLocaleIds,
} from '@/lib/webflow/locale-items';
import { COL } from '@/lib/seo-engine/store';

export type AutoSeoCandidateStatus =
  | 'missing_seo'
  | 'validator_error'
  | 'ok_filled'
  | 'unpublished'
  | 'body_too_short'
  | 'fetch_error';

export type AutoSeoCandidate = {
  id: string;
  slug: string;
  title: string;
  status: AutoSeoCandidateStatus;
  seoTitleEmpty: boolean;
  metaDescriptionEmpty: boolean;
  /** CMS lastUpdated at scan time — required for Kør TOCTOU gate. */
  lastUpdated: string;
  /** Content fingerprint (name+body) at scan time. */
  contentHash: string;
  /** Input contract hash with unlocked SEO (empty-only contract). */
  inputVersionHash: string;
  reason?: string;
};

export type AutoSeoPreviewResult = {
  scanId: string;
  total: number;
  ready: number;
  missingSeo: number;
  validatorFlagged: number;
  fetchErrors: number;
  candidates: AutoSeoCandidate[];
  scannedAt: string;
  expiresAt: string;
};

export type AutoSeoRunCandidateInput = {
  id: string;
  lastUpdated: string;
  contentHash: string;
  inputVersionHash?: string;
  slug?: string;
  title?: string;
  seoTitleEmpty?: boolean;
  metaDescriptionEmpty?: boolean;
};

export type AutoSeoRunRow = {
  id: string;
  slug: string;
  title: string;
  ok: boolean;
  skipped?: boolean;
  reason?: string;
  patched?: string[];
  error?: string;
  jobId?: string;
};

export type AutoSeoRunResult = {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
  skippedReason: string | null;
  results: AutoSeoRunRow[];
  ranAt: string;
};

const SCAN_TTL_MS = 30 * 60 * 1000;
const MAX_RUN = 3;
const SCAN_COL = 'seoEngineAutoSeoScans';

export type AutoSeoScanRecord = {
  scanId: string;
  createdBy: string;
  scannedAt: string;
  expiresAt: string;
  candidates: AutoSeoCandidate[];
};

type FetchLocaleFn = typeof fetchArticleItemByLocale;
type ListFn = () => Promise<ListedArticleItem[]>;
type RunJobFn = typeof runSeoEngineJob;
type EnqueueFn = typeof writeQueuedSeoEngineJob;

export type AutoSeoBatchDeps = {
  fetchFn?: FetchLocaleFn;
  listFn?: ListFn;
  runJobFn?: RunJobFn;
  enqueueFn?: EnqueueFn;
  /** In-memory scan store for tests (bypasses Firestore). */
  scanStore?: Map<string, AutoSeoScanRecord>;
  now?: () => number;
};

const memoryScans = new Map<string, AutoSeoScanRecord>();

async function loadPublishedDkSample(
  limit: number,
  listFn: ListFn
): Promise<ListedArticleItem[]> {
  const items = await listFn();
  const published = items.filter((it) => !it.isDraft && Boolean(it.lastPublished?.trim()));
  published.sort((a, b) => {
    const ta = Date.parse(a.lastPublished) || 0;
    const tb = Date.parse(b.lastPublished) || 0;
    if (tb !== ta) return tb - ta;
    return a.id.localeCompare(b.id);
  });
  return published.slice(0, Math.max(1, Math.min(100, limit)));
}

async function persistScan(record: AutoSeoScanRecord, deps: AutoSeoBatchDeps): Promise<void> {
  if (deps.scanStore) {
    deps.scanStore.set(record.scanId, record);
    return;
  }
  const db = getAdminDb();
  if (!db) {
    memoryScans.set(record.scanId, record);
    return;
  }
  await db.collection(SCAN_COL).doc(record.scanId).set({
    ...record,
    createdAt: FieldValue.serverTimestamp(),
  });
}

async function loadScan(
  scanId: string,
  deps: AutoSeoBatchDeps
): Promise<AutoSeoScanRecord | null> {
  if (deps.scanStore) return deps.scanStore.get(scanId) || null;
  const db = getAdminDb();
  if (!db) return memoryScans.get(scanId) || null;
  const snap = await db.collection(SCAN_COL).doc(scanId).get();
  if (!snap.exists) return memoryScans.get(scanId) || null;
  return snap.data() as AutoSeoScanRecord;
}

export function isScanExpired(record: AutoSeoScanRecord, nowMs: number): boolean {
  return Date.parse(record.expiresAt) <= nowMs;
}

/**
 * Validate a run candidate against frozen scan + live CMS fingerprints.
 * Pure helper for TOCTOU tests.
 */
export function validateRunCandidateAgainstLive(args: {
  scanned: AutoSeoCandidate;
  liveLastUpdated: string;
  liveContentHash: string;
  liveSeoTitleEmpty: boolean;
  liveMetaEmpty: boolean;
}): { ok: true } | { ok: false; reason: string } {
  if (args.scanned.status !== 'missing_seo') {
    return { ok: false, reason: 'Kun missing_seo-kandidater kan køres (empty-only)' };
  }
  if (args.scanned.lastUpdated !== args.liveLastUpdated) {
    return { ok: false, reason: 'Stale: cmsLastUpdated ændret siden scan' };
  }
  if (args.scanned.contentHash !== args.liveContentHash) {
    return { ok: false, reason: 'Stale: contentHash ændret siden scan' };
  }
  if (!args.liveSeoTitleEmpty && !args.liveMetaEmpty) {
    return { ok: false, reason: 'SEO allerede udfyldt efter scan (TOCTOU)' };
  }
  // Empty-only: if a field was empty at scan but is now filled, still allow job —
  // durable worker re-checks emptiness and skips filled fields.
  return { ok: true };
}

/**
 * Exact readback helper (shared invariant).
 */
export function exactPatchedFieldsMatch(args: {
  expected: { seoTitle?: string; metaDescription?: string };
  liveSeoTitle: string | null;
  liveMetaDescription: string | null;
}): boolean {
  if (args.expected.seoTitle !== undefined) {
    if ((args.liveSeoTitle || '').trim() !== args.expected.seoTitle.trim()) return false;
  }
  if (args.expected.metaDescription !== undefined) {
    if ((args.liveMetaDescription || '').trim() !== args.expected.metaDescription.trim()) {
      return false;
    }
  }
  return true;
}

export async function previewAutoSeoBatch(
  options?: { limit?: number; userId?: string },
  deps: AutoSeoBatchDeps = {}
): Promise<AutoSeoPreviewResult> {
  const limit = options?.limit ?? 50;
  const userId = options?.userId || 'anonymous';
  const fetchFn = deps.fetchFn || fetchArticleItemByLocale;
  const listFn = deps.listFn || listDkArticleItems;
  const now = deps.now || Date.now;
  const { dk } = resolveWebflowLocaleIds();
  const sample = await loadPublishedDkSample(limit, listFn);
  const candidates: AutoSeoCandidate[] = [];
  let missingSeo = 0;
  let validatorFlagged = 0;
  let fetchErrors = 0;

  for (const item of sample) {
    try {
      const live = await fetchFn(item.id, dk);
      const lastUpdated = String(live.lastUpdated || '');
      const contentHash = hashCmsContent(live.fieldData);
      const unlocked = webflowItemToSeoEngineInput({
        fieldData: live.fieldData,
        language: 'da',
      });
      // Fingerprint as worker will see it after unlocking empty SEO for analyze
      const unlockedForHash = {
        ...unlocked,
        existingSeoTitle: null,
        existingMetaDescription: null,
      };
      const inputVersionHash = computeInputVersionHash(unlockedForHash);

      if (!isWebflowLocalePublished(live)) {
        candidates.push({
          id: item.id,
          slug: item.slug,
          title: item.title,
          status: 'unpublished',
          seoTitleEmpty: false,
          metaDescriptionEmpty: false,
          lastUpdated,
          contentHash,
          inputVersionHash,
          reason: 'DK ikke publiceret',
        });
        continue;
      }

      const empty = cmsSeoEmptiness(live.fieldData);
      const slugs = getCmsSeoSlugs();
      const seoTitle = isCmsSeoFieldEmpty(live.fieldData[slugs.seoTitle])
        ? ''
        : String(live.fieldData[slugs.seoTitle]).trim();

      let validatorReason: string | undefined;
      if (seoTitle) {
        const slugHint = `${item.slug} ${item.title}`.toLowerCase();
        const looksLikeReview =
          /anmeldelse|review/.test(slugHint) ||
          /-(film|serie|koncert|album|spil|teater)-|festival-202/.test(slugHint);
        if (looksLikeReview && !/kunst/.test(slugHint)) {
          const check = checkReviewSeoTitle({
            seoTitle,
            language: 'da',
            articleType: 'Koncertanmeldelse',
          });
          if (!check.ok) validatorReason = check.message;
        }
      }

      if ((unlocked.body || '').trim().length < 200) {
        candidates.push({
          id: item.id,
          slug: item.slug,
          title: String(live.fieldData.name || item.title),
          status: 'body_too_short',
          seoTitleEmpty: empty.seoTitleEmpty,
          metaDescriptionEmpty: empty.metaDescriptionEmpty,
          lastUpdated,
          contentHash,
          inputVersionHash,
          reason: 'Brødtekst for kort',
        });
        continue;
      }

      if (empty.anyEmpty) {
        missingSeo += 1;
        candidates.push({
          id: item.id,
          slug: item.slug,
          title: String(live.fieldData.name || item.title),
          status: 'missing_seo',
          seoTitleEmpty: empty.seoTitleEmpty,
          metaDescriptionEmpty: empty.metaDescriptionEmpty,
          lastUpdated,
          contentHash,
          inputVersionHash,
          reason: [
            empty.seoTitleEmpty ? 'tom seo-title' : null,
            empty.metaDescriptionEmpty ? 'tom meta' : null,
          ]
            .filter(Boolean)
            .join(', '),
        });
      } else if (validatorReason) {
        validatorFlagged += 1;
        candidates.push({
          id: item.id,
          slug: item.slug,
          title: String(live.fieldData.name || item.title),
          status: 'validator_error',
          seoTitleEmpty: false,
          metaDescriptionEmpty: false,
          lastUpdated,
          contentHash,
          inputVersionHash,
          reason: validatorReason,
        });
      }
    } catch (err) {
      fetchErrors += 1;
      candidates.push({
        id: item.id,
        slug: item.slug,
        title: item.title,
        status: 'fetch_error',
        seoTitleEmpty: false,
        metaDescriptionEmpty: false,
        lastUpdated: '',
        contentHash: '',
        inputVersionHash: '',
        reason: err instanceof Error ? err.message.slice(0, 120) : 'fetch fejl',
      });
    }
  }

  const readyCandidates = candidates.filter((c) => c.status === 'missing_seo');
  const flagged = candidates.filter((c) => c.status === 'validator_error');
  const scanId = randomUUID();
  const scannedAt = new Date(now()).toISOString();
  const expiresAt = new Date(now() + SCAN_TTL_MS).toISOString();
  const frozen = [...readyCandidates, ...flagged].slice(0, 40);

  await persistScan(
    {
      scanId,
      createdBy: userId,
      scannedAt,
      expiresAt,
      candidates: frozen,
    },
    deps
  );

  return {
    scanId,
    total: sample.length,
    ready: readyCandidates.length,
    missingSeo: readyCandidates.length,
    validatorFlagged: flagged.length,
    fetchErrors,
    candidates: frozen,
    scannedAt,
    expiresAt,
  };
}

/**
 * Kør: requires scanId + candidates from that scan. Max 3 missing_seo.
 * Re-fetches, TOCTOU-validates, then durable enqueue + runSeoEngineJob.
 */
export async function runAutoSeoBatch(
  options: {
    scanId: string;
    candidates: AutoSeoRunCandidateInput[];
    userId: string;
    articleLimit?: number;
  },
  deps: AutoSeoBatchDeps = {}
): Promise<AutoSeoRunResult> {
  const fetchFn = deps.fetchFn || fetchArticleItemByLocale;
  const enqueueFn = deps.enqueueFn || writeQueuedSeoEngineJob;
  const runJobFn = deps.runJobFn || runSeoEngineJob;
  const now = deps.now || Date.now;
  const articleLimit = Math.max(1, Math.min(MAX_RUN, options.articleLimit ?? MAX_RUN));

  if (!options.scanId?.trim()) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      skippedReason: 'Scan mangler — kør Scan først.',
      results: [],
      ranAt: new Date(now()).toISOString(),
    };
  }
  if (!Array.isArray(options.candidates) || options.candidates.length === 0) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      skippedReason: 'Ingen kandidater fra scan — send scanned candidates.',
      results: [],
      ranAt: new Date(now()).toISOString(),
    };
  }

  const scan = await loadScan(options.scanId, deps);
  if (!scan) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      skippedReason: 'Scan ikke fundet eller udløbet — kør Scan igen.',
      results: [],
      ranAt: new Date(now()).toISOString(),
    };
  }
  if (isScanExpired(scan, now())) {
    return {
      processed: 0,
      succeeded: 0,
      failed: 0,
      skipped: 0,
      skippedReason: 'Scan er forældet — kør Scan igen.',
      results: [],
      ranAt: new Date(now()).toISOString(),
    };
  }

  const byId = new Map(scan.candidates.map((c) => [c.id, c]));
  const { dk } = resolveWebflowLocaleIds();
  const results: AutoSeoRunRow[] = [];
  let succeeded = 0;
  let failed = 0;
  let skipped = 0;
  let processed = 0;

  for (const incoming of options.candidates) {
    if (processed >= articleLimit) break;
    const scanned = byId.get(incoming.id);
    if (!scanned) {
      skipped += 1;
      results.push({
        id: incoming.id,
        slug: incoming.slug || '',
        title: incoming.title || '',
        ok: false,
        skipped: true,
        reason: 'Kandidat ikke i frozen scan',
      });
      continue;
    }
    // Client fingerprints must match frozen scan (binding)
    if (
      scanned.lastUpdated !== incoming.lastUpdated ||
      scanned.contentHash !== incoming.contentHash
    ) {
      skipped += 1;
      results.push({
        id: scanned.id,
        slug: scanned.slug,
        title: scanned.title,
        ok: false,
        skipped: true,
        reason: 'Kandidat-fingeraftryk matcher ikke scan (afvist)',
      });
      continue;
    }
    if (scanned.status !== 'missing_seo') {
      skipped += 1;
      results.push({
        id: scanned.id,
        slug: scanned.slug,
        title: scanned.title,
        ok: false,
        skipped: true,
        reason: 'Kun empty-only missing_seo køres (validator_error er flag-only)',
      });
      continue;
    }

    try {
      const live = await fetchFn(scanned.id, dk);
      const liveHash = hashCmsContent(live.fieldData);
      const empty = cmsSeoEmptiness(live.fieldData);
      const gate = validateRunCandidateAgainstLive({
        scanned,
        liveLastUpdated: String(live.lastUpdated || ''),
        liveContentHash: liveHash,
        liveSeoTitleEmpty: empty.seoTitleEmpty,
        liveMetaEmpty: empty.metaDescriptionEmpty,
      });
      if (!gate.ok) {
        skipped += 1;
        results.push({
          id: scanned.id,
          slug: scanned.slug,
          title: scanned.title,
          ok: false,
          skipped: true,
          reason: gate.reason,
        });
        continue;
      }

      processed += 1;
      const enq = await enqueueFn({
        itemId: scanned.id,
        cmsLastUpdated: scanned.lastUpdated,
        source: 'manual',
      });
      const jobResult = await runJobFn(enq.jobId);
      if (jobResult.ok && !jobResult.skipped) {
        succeeded += 1;
        results.push({
          id: scanned.id,
          slug: scanned.slug,
          title: scanned.title,
          ok: true,
          jobId: enq.jobId,
          patched: ['empty-only-via-durable-job'],
        });
      } else if (jobResult.skipped) {
        skipped += 1;
        results.push({
          id: scanned.id,
          slug: scanned.slug,
          title: scanned.title,
          ok: false,
          skipped: true,
          reason: jobResult.reason || 'skipped',
          jobId: enq.jobId,
        });
      } else {
        failed += 1;
        results.push({
          id: scanned.id,
          slug: scanned.slug,
          title: scanned.title,
          ok: false,
          error: jobResult.reason || 'job failed',
          jobId: enq.jobId,
        });
      }
    } catch (err) {
      failed += 1;
      processed += 1;
      results.push({
        id: scanned.id,
        slug: scanned.slug,
        title: scanned.title,
        ok: false,
        error: err instanceof Error ? err.message.slice(0, 180) : String(err).slice(0, 180),
      });
    }
  }

  let skippedReason: string | null = null;
  if (processed === 0) {
    skippedReason =
      results.find((r) => r.skipped)?.reason ||
      'Ingen kandidater kunne køres (stale/filled/ikke i scan).';
  }

  return {
    processed,
    succeeded,
    failed,
    skipped,
    skippedReason,
    results,
    ranAt: new Date(now()).toISOString(),
  };
}

/** Test helper — stable hash for fixtures. */
export function fingerprintForTests(name: string, content: string): string {
  return createHash('sha256').update(`${name}\n${content}`, 'utf8').digest('hex');
}

// Re-export COL touch so tree-shaking keeps store path for scans
void COL;
