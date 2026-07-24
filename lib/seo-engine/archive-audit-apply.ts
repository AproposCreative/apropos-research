/**
 * UI-driven Arkiv-audit apply: preview → confirm → backup → write SEO title + meta.
 * Reuses durable overwrite-backfill helpers (source signatures, exact readback, frozen manifest).
 */

import { createHash, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { FieldValue, type Firestore } from 'firebase-admin/firestore';
import { getAdminDb } from '@/lib/firebase-admin';
import {
  ARCHIVE_APPLY_BACKUP_COL,
  ARCHIVE_APPLY_COL,
  ARCHIVE_APPLY_MAX_BATCH,
  ARCHIVE_APPLY_PREVIEW_PACE_MS,
  ARCHIVE_APPLY_PREVIEW_SCHEMA,
  ARCHIVE_APPLY_PREVIEW_TTL_MS,
  ARCHIVE_APPLY_SYSTEM_USER,
  ARCHIVE_APPLY_WEBFLOW_BUSY_DA,
} from '@/lib/seo-engine/archive-audit-apply-constants';
import { ensureSeoEngineBackfillDir } from '@/lib/seo-engine/backfill-paths';
import { analyzeArticle } from '@/lib/seo-engine/pipeline';
import { proposeArchiveSeoMeta } from '@/lib/seo-engine/archive-seo-meta-agent';
import { resolveEffectiveArticleType } from '@/lib/seo-engine/review-title-rule';
import {
  applyFrozenSeoManifest,
  assertDryRunReportCleanForApply,
  buildLocaleArticleKey,
  buildLocaleBackup,
  buildOverwriteSeoEngineInput,
  buildSourceSignature,
  classifyLocaleFetchFailure,
  formatProposalChangeReport,
  readCmsSeoPair,
  validateOverwriteFields,
  withTransientFetchRetry,
  type ApplyGateResult,
  type BackfillLocaleCode,
  type DryRunReportDocument,
  type FrozenManifestEntry,
  type ItemBackfillResult,
  type LocaleBackupSnapshot,
  type LocaleProposal,
} from '@/lib/seo-engine/overwrite-backfill';
import {
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  patchArticleFieldDataForLocale,
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
  type WebflowLocaleItem,
} from '@/lib/webflow/locale-items';
import {
  resolveAutoTranslateEnabled,
  setAutoTranslateEnabled,
} from '@/lib/webflow/article-translation-settings';

export {
  ARCHIVE_APPLY_BACKUP_COL,
  ARCHIVE_APPLY_COL,
  ARCHIVE_APPLY_MAX_BATCH,
  ARCHIVE_APPLY_PREVIEW_PACE_MS,
  ARCHIVE_APPLY_PREVIEW_SCHEMA,
  ARCHIVE_APPLY_PREVIEW_TTL_MS,
  ARCHIVE_APPLY_SYSTEM_USER,
  ARCHIVE_APPLY_WEBFLOW_BUSY_DA,
} from '@/lib/seo-engine/archive-audit-apply-constants';

const previewSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Map blocking Webflow fetch failures to a calm Danish UI message when rate-limited. */
export function formatArchiveApplyFetchError(args: {
  itemId: string;
  locale: string;
  message: string;
  status?: number | null;
}): string {
  const msg = args.message || '';
  const status = args.status ?? null;
  const rateLimited =
    status === 429 || /too many requests|rate.?limit|429\b/i.test(msg);
  if (rateLimited) return ARCHIVE_APPLY_WEBFLOW_BUSY_DA;
  return `Blocking fetch ${args.itemId}:${args.locale}: ${msg}`;
}

/**
 * Cache successful locale fetches by itemId+cmsLocaleId for one preview run.
 * Failed promises are not retained so callers can retry with backoff.
 */
export function createCachedLocaleFetch(
  fetchFn: typeof fetchArticleItemByLocale
): typeof fetchArticleItemByLocale {
  const cache = new Map<string, Promise<WebflowLocaleItem>>();
  return (itemId, cmsLocaleId) => {
    const key = `${itemId}:${cmsLocaleId}`;
    const hit = cache.get(key);
    if (hit) return hit;
    const pending = fetchFn(itemId, cmsLocaleId).catch((err) => {
      cache.delete(key);
      throw err;
    });
    cache.set(key, pending);
    return pending;
  };
}

export type ArchiveApplySelection = {
  itemId: string;
  locale: BackfillLocaleCode;
};

export type ArchiveApplyUiProposal = {
  itemId: string;
  locale: BackfillLocaleCode;
  title: string;
  slug: string;
  oldSeoTitle: string | null;
  oldMetaDescription: string | null;
  newSeoTitle: string;
  newMetaDescription: string;
  analysisRunId: string;
  seoVersionId: string;
};

export type ArchiveApplyPreviewDocument = {
  schemaVersion: number;
  previewId: string;
  confirmToken: string;
  createdAt: string;
  createdBy: string;
  mode: 'dry-run';
  selection: ArchiveApplySelection[];
  limit: number;
  locales: BackfillLocaleCode[];
  backupPath: string | null;
  stoppedOnError: boolean;
  errorMessage: string | null;
  /** Apply-clean locale outcomes (proposed / allowed skips only). */
  results: ItemBackfillResult[];
  frozenManifest: FrozenManifestEntry[];
  proposals: ArchiveApplyUiProposal[];
  /** Validation/fetch rejects shown in UI but excluded from apply gate. */
  rejected: Array<{
    itemId: string;
    locale: BackfillLocaleCode;
    status: string;
    reason?: string;
  }>;
  expiresAt: string;
  appliedAt?: string | null;
};

export type ArchiveApplyPreviewStore = {
  save: (doc: ArchiveApplyPreviewDocument) => Promise<void>;
  get: (previewId: string) => Promise<ArchiveApplyPreviewDocument | null>;
  markApplied: (previewId: string, appliedAt: string) => Promise<void>;
};

function stripUndefinedDeep(value: unknown): unknown {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) {
    return value.map((v) => stripUndefinedDeep(v)).filter((v) => v !== undefined);
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (v === undefined) continue;
    const next = stripUndefinedDeep(v);
    if (next !== undefined) out[k] = next;
  }
  return out;
}

function requireDb(): Firestore {
  const db = getAdminDb();
  if (!db) throw Object.assign(new Error('Firestore er ikke tilgængelig'), { code: 'fail_closed' });
  return db;
}

export function createFirestoreArchiveApplyPreviewStore(): ArchiveApplyPreviewStore {
  return {
    async save(doc) {
      const db = requireDb();
      await db
        .collection(ARCHIVE_APPLY_COL)
        .doc(doc.previewId)
        .set(stripUndefinedDeep(doc) as Record<string, unknown>);
    },
    async get(previewId) {
      const db = requireDb();
      const snap = await db.collection(ARCHIVE_APPLY_COL).doc(previewId).get();
      if (!snap.exists) return null;
      return snap.data() as ArchiveApplyPreviewDocument;
    },
    async markApplied(previewId, appliedAt) {
      const db = requireDb();
      await db.collection(ARCHIVE_APPLY_COL).doc(previewId).set(
        {
          appliedAt,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
      );
    },
  };
}

/** In-memory store for unit tests (no Firebase). */
export function createMemoryArchiveApplyPreviewStore(
  seed?: Map<string, ArchiveApplyPreviewDocument>
): ArchiveApplyPreviewStore {
  const map = seed || new Map<string, ArchiveApplyPreviewDocument>();
  return {
    async save(doc) {
      map.set(doc.previewId, structuredClone(doc));
    },
    async get(previewId) {
      const doc = map.get(previewId);
      return doc ? structuredClone(doc) : null;
    },
    async markApplied(previewId, appliedAt) {
      const doc = map.get(previewId);
      if (doc) {
        doc.appliedAt = appliedAt;
        map.set(previewId, doc);
      }
    },
  };
}

export function normalizeArchiveApplySelection(
  raw: unknown
): { ok: true; selection: ArchiveApplySelection[] } | { ok: false; reason: string } {
  if (!Array.isArray(raw)) {
    return { ok: false, reason: 'selection must be an array of { itemId, locale }' };
  }
  const seen = new Set<string>();
  const selection: ArchiveApplySelection[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') {
      return { ok: false, reason: 'selection entry must be an object' };
    }
    const itemId = String((entry as { itemId?: unknown }).itemId || '').trim();
    const locale = String((entry as { locale?: unknown }).locale || '').trim();
    if (!itemId) return { ok: false, reason: 'selection entry missing itemId' };
    if (locale !== 'da' && locale !== 'en') {
      return { ok: false, reason: `invalid locale "${locale}" (expected da|en)` };
    }
    const key = `${itemId}:${locale}`;
    if (seen.has(key)) continue;
    seen.add(key);
    selection.push({ itemId, locale });
  }
  return { ok: true, selection: sortSelectionDaFirst(selection) };
}

/** DA before EN; stable by itemId within locale. */
export function sortSelectionDaFirst(selection: ArchiveApplySelection[]): ArchiveApplySelection[] {
  return [...selection].sort((a, b) => {
    if (a.locale !== b.locale) {
      if (a.locale === 'da') return -1;
      if (b.locale === 'da') return 1;
    }
    return a.itemId.localeCompare(b.itemId);
  });
}

export function assertArchiveApplySelectionGates(
  selection: ArchiveApplySelection[]
): ApplyGateResult {
  if (!selection.length) {
    return { ok: false, reason: 'Ingen valgte rækker — vælg mindst én artikel/locale.' };
  }
  if (selection.length > ARCHIVE_APPLY_MAX_BATCH) {
    return {
      ok: false,
      reason: `Max ${ARCHIVE_APPLY_MAX_BATCH} valgte pr. bekræftelse (fik ${selection.length}).`,
    };
  }
  for (const s of selection) {
    if (!s.itemId?.trim()) return { ok: false, reason: 'Tom itemId i valg.' };
    if (s.locale !== 'da' && s.locale !== 'en') {
      return { ok: false, reason: `Ugyldig locale: ${s.locale}` };
    }
  }
  return { ok: true };
}

export function assertArchiveApplyConfirmGates(args: {
  previewId?: string | null;
  confirmOverwrite?: boolean;
  confirmToken?: string | null;
  expectedConfirmToken?: string | null;
  preview?: ArchiveApplyPreviewDocument | null;
}): ApplyGateResult {
  const previewId = String(args.previewId || '').trim();
  if (!previewId) {
    return { ok: false, reason: 'Reject: apply kræver previewId (frozen preview).' };
  }
  if (args.confirmOverwrite !== true) {
    return {
      ok: false,
      reason: 'Reject: confirmOverwrite=true kræves (eksplicit overskrivning).',
    };
  }
  const token = String(args.confirmToken || '').trim();
  if (!token) {
    return { ok: false, reason: 'Reject: confirmToken mangler (fra preview-svar).' };
  }
  const expected = String(args.expectedConfirmToken || args.preview?.confirmToken || '').trim();
  if (!expected) {
    return { ok: false, reason: 'Reject: preview mangler confirmToken.' };
  }
  if (token !== expected) {
    return { ok: false, reason: 'Reject: confirmToken matcher ikke frozen preview.' };
  }
  if (args.preview) {
    if (args.preview.previewId !== previewId) {
      return { ok: false, reason: 'Reject: previewId mismatch.' };
    }
    if (args.preview.mode !== 'dry-run') {
      return { ok: false, reason: 'Reject: preview er ikke mode=dry-run.' };
    }
    if (args.preview.appliedAt) {
      return { ok: false, reason: 'Reject: preview er allerede anvendt.' };
    }
    const expires = Date.parse(args.preview.expiresAt || '');
    if (Number.isFinite(expires) && expires < Date.now()) {
      return { ok: false, reason: 'Reject: preview er udløbet — kør ny preview.' };
    }
    const clean = assertDryRunReportCleanForApply(previewToDryRunShape(args.preview));
    if (clean.ok === false) return clean;
  }
  return { ok: true };
}

export function previewToDryRunShape(
  preview: ArchiveApplyPreviewDocument
): Partial<DryRunReportDocument> {
  return {
    mode: 'dry-run',
    stoppedOnError: preview.stoppedOnError,
    errorMessage: preview.errorMessage,
    results: preview.results,
    frozenManifest: preview.frozenManifest,
    limit: preview.limit,
    locales: preview.locales,
    backupPath: preview.backupPath,
    createdAt: preview.createdAt,
    schemaVersion: preview.schemaVersion,
    selected: [],
  };
}

function newPreviewId(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const rand = randomBytes(4).toString('hex');
  return `aap-${stamp}-${rand}`;
}

function newConfirmToken(): string {
  return randomBytes(24).toString('hex');
}

function stampNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

type LocaleFetchOutcome =
  | { kind: 'ok'; item: WebflowLocaleItem }
  | { kind: 'missing'; message: string; status: number | null }
  | { kind: 'blocking'; message: string; status: number | null };

async function safeFetchLocale(
  fetchFn: typeof fetchArticleItemByLocale,
  itemId: string,
  cmsLocaleId: string
): Promise<LocaleFetchOutcome> {
  try {
    const item = await fetchFn(itemId, cmsLocaleId);
    return { kind: 'ok', item };
  } catch (err) {
    const classified = classifyLocaleFetchFailure(err);
    if (classified.kind === 'missing') {
      return { kind: 'missing', message: classified.message, status: classified.status };
    }
    return { kind: 'blocking', message: classified.message, status: classified.status };
  }
}

function cmsLocaleFor(code: BackfillLocaleCode): string {
  const ids = resolveWebflowLocaleIds();
  return code === 'da' ? ids.dk : ids.en;
}

/**
 * Generate overwrite proposals for selected archive rows (no CMS writes).
 * Uses real analyze + strategize (overwrite input unlocks existing SEO).
 * Webflow reads use transient retry (429/5xx) + per-id cache + pacing.
 */
export async function generateArchiveApplyPreview(opts: {
  selection: ArchiveApplySelection[];
  createdBy: string;
  store?: ArchiveApplyPreviewStore;
  fetchFn?: typeof fetchArticleItemByLocale;
  analyzeFn?: typeof analyzeArticle;
  /** @deprecated Prefer proposeSeoMetaFn — strategize 2-alts path removed for Arkiv */
  strategizeFn?: unknown;
  proposeSeoMetaFn?: typeof proposeArchiveSeoMeta;
  onLog?: (line: string) => void;
  /** Override preview fetch pacing (tests: 0). Default ARCHIVE_APPLY_PREVIEW_PACE_MS. */
  previewPaceMs?: number;
  /** Override transient retry (tests). */
  transientRetry?: Parameters<typeof withTransientFetchRetry>[1];
  sleep?: (ms: number) => Promise<void>;
}): Promise<ArchiveApplyPreviewDocument> {
  const gate = assertArchiveApplySelectionGates(opts.selection);
  if (gate.ok === false) {
    throw Object.assign(new Error(gate.reason), { code: 'invalid_input' });
  }

  const selection = sortSelectionDaFirst(opts.selection);
  const log = opts.onLog || (() => undefined);
  const sleep = opts.sleep || previewSleep;
  const paceMs =
    opts.previewPaceMs != null ? Math.max(0, opts.previewPaceMs) : ARCHIVE_APPLY_PREVIEW_PACE_MS;
  const baseFetch = opts.fetchFn || fetchArticleItemByLocale;
  const retryFetch = withTransientFetchRetry(baseFetch, {
    maxAttempts: opts.transientRetry?.maxAttempts ?? 5,
    baseDelayMs: opts.transientRetry?.baseDelayMs ?? 400,
    maxDelayMs: opts.transientRetry?.maxDelayMs ?? 8_000,
    sleep: opts.transientRetry?.sleep ?? sleep,
    onRetry: (info) => {
      opts.transientRetry?.onRetry?.(info);
      log(
        `Transient fetch retry ${info.attempt}/${info.maxAttempts} status=${info.status ?? 'n/a'} waitMs=${info.delayMs}`
      );
    },
  });
  const fetchFn = createCachedLocaleFetch(retryFetch);
  const analyzeFn = opts.analyzeFn || analyzeArticle;
  const proposeSeoMetaFn = opts.proposeSeoMetaFn || proposeArchiveSeoMeta;
  const store = opts.store || createFirestoreArchiveApplyPreviewStore();

  const results: ItemBackfillResult[] = [];
  const frozenManifest: FrozenManifestEntry[] = [];
  const proposals: ArchiveApplyUiProposal[] = [];
  const rejected: ArchiveApplyPreviewDocument['rejected'] = [];
  const byItem = new Map<string, ItemBackfillResult>();
  let stoppedOnError = false;
  let errorMessage: string | undefined;

  const pushRejected = (
    itemId: string,
    locale: BackfillLocaleCode,
    status: string,
    reason?: string
  ) => {
    rejected.push({ itemId, locale, status, reason });
  };

  for (let i = 0; i < selection.length; i++) {
    const sel = selection[i]!;
    if (stoppedOnError) break;
    if (i > 0 && paceMs > 0) await sleep(paceMs);

    let itemResult = byItem.get(sel.itemId);
    if (!itemResult) {
      itemResult = { itemId: sel.itemId, slug: '', title: '', locales: [] };
      byItem.set(sel.itemId, itemResult);
      results.push(itemResult);
    }

    const cmsLocaleId = cmsLocaleFor(sel.locale);
    try {
      const outcome = await safeFetchLocale(fetchFn, sel.itemId, cmsLocaleId);
      if (outcome.kind === 'missing') {
        if (sel.locale === 'en') {
          itemResult.locales.push({
            locale: sel.locale,
            status: 'skipped_missing',
            reason: `Locale ${sel.locale} mangler (404) — skip`,
          });
        } else {
          stoppedOnError = true;
          errorMessage = `DA locale mangler for ${sel.itemId}`;
          pushRejected(sel.itemId, sel.locale, 'skipped_missing', errorMessage);
          itemResult.locales.push({
            locale: sel.locale,
            status: 'skipped_missing',
            reason: errorMessage,
          });
        }
        continue;
      }
      if (outcome.kind === 'blocking') {
        stoppedOnError = true;
        errorMessage = formatArchiveApplyFetchError({
          itemId: sel.itemId,
          locale: sel.locale,
          message: outcome.message,
          status: outcome.status,
        });
        pushRejected(sel.itemId, sel.locale, 'blocked_fetch', errorMessage);
        itemResult.locales.push({
          locale: sel.locale,
          status: 'blocked_fetch',
          reason: errorMessage,
        });
        break;
      }

      const live = outcome.item;
      itemResult.slug = String(live.fieldData.slug || itemResult.slug || '');
      itemResult.title = String(
        live.fieldData.name || live.fieldData.title || itemResult.title || ''
      );

      if (!isWebflowLocalePublished(live)) {
        if (sel.locale === 'da') {
          stoppedOnError = true;
          errorMessage = `DA er ikke publiceret for ${sel.itemId} — stop`;
          pushRejected(sel.itemId, sel.locale, 'skipped_unpublished', errorMessage);
          break;
        }
        itemResult.locales.push({
          locale: sel.locale,
          status: 'skipped_unpublished',
          reason: 'EN findes men er ikke publiceret — skip',
        });
        continue;
      }

      const oldPair = readCmsSeoPair(live.fieldData);
      const input = buildOverwriteSeoEngineInput({
        fieldData: live.fieldData,
        language: sel.locale,
      });

      if ((input.body || '').trim().length < 200) {
        pushRejected(sel.itemId, sel.locale, 'skipped_validation', 'Body kortere end 200 tegn');
        continue;
      }

      if (input.existingSeoTitle || input.existingMetaDescription) {
        throw new Error('Internal error: overwrite input still carries existing SEO');
      }

      const articleKey = buildLocaleArticleKey(sel.itemId, sel.locale);
      let effectiveArticleType: string | null = null;
      let analysisRunId = 'archive-seo-meta-agent';
      let seoVersionId = 'archive-seo-meta-agent';

      try {
        const analysis = await analyzeFn(input, {
          userId: ARCHIVE_APPLY_SYSTEM_USER,
          webflowItemId: sel.itemId,
          articleKey,
        });
        analysisRunId = analysis.analysisRunId;
        effectiveArticleType = resolveEffectiveArticleType(analysis.analysis);
      } catch {
        // Analysis is optional for Arkiv seo_meta — agent still produces one title+meta
        effectiveArticleType =
          typeof (live.fieldData as Record<string, unknown>)['article-type'] === 'string'
            ? String((live.fieldData as Record<string, unknown>)['article-type'])
            : null;
      }

      const metaProposal = await proposeSeoMetaFn({
        title: itemResult.title,
        slug: itemResult.slug,
        bodyHtml: input.body || '',
        language: sel.locale,
        articleType: effectiveArticleType,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
      });

      const seoTitle = metaProposal.seoTitle;
      const metaDescription = metaProposal.metaDescription;

      const fieldCheck = validateOverwriteFields({
        seoTitle,
        metaDescription,
        language: sel.locale,
        articleType: effectiveArticleType,
      });

      const sourceSignature = buildSourceSignature({
        item: live,
        input,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
      });

      const proposal: LocaleProposal = {
        locale: sel.locale,
        cmsLocaleId,
        articleKey,
        title: itemResult.title,
        slug: itemResult.slug,
        wasPublished: true,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
        newSeoTitle: seoTitle,
        newMetaDescription: metaDescription,
        analysisRunId,
        seoVersionId,
        mode: 'ai',
        validationErrors: fieldCheck.errors,
        validationWarnings: [],
        sourceSignature,
        effectiveArticleType: effectiveArticleType || undefined,
      };

      log(formatProposalChangeReport(sel.itemId, proposal));

      if (!fieldCheck.ok) {
        pushRejected(sel.itemId, sel.locale, 'skipped_validation', fieldCheck.errors.join('; '));
        continue;
      }

      itemResult.locales.push({ locale: sel.locale, status: 'proposed', proposal });
      frozenManifest.push({
        itemId: sel.itemId,
        locale: sel.locale,
        cmsLocaleId,
        articleKey,
        newSeoTitle: seoTitle,
        newMetaDescription: metaDescription,
        wasPublished: true,
        sourceSignature,
      });
      proposals.push({
        itemId: sel.itemId,
        locale: sel.locale,
        title: itemResult.title,
        slug: itemResult.slug,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
        newSeoTitle: seoTitle,
        newMetaDescription: metaDescription,
        analysisRunId,
        seoVersionId,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      pushRejected(sel.itemId, sel.locale, 'error', msg);
      log(`ERROR (preview continues) ${sel.itemId}:${sel.locale}: ${msg}`);
    }
  }

  // Keep only apply-allowed statuses in results (proposed + EN skips).
  // Blocking/DA-missing statuses stay in rejected so clean-gate can pass when proposals exist.
  const cleanedResults: ItemBackfillResult[] = [];
  for (const item of results) {
    const allowed = item.locales.filter((loc) => {
      if (loc.status === 'proposed') return true;
      if (
        (loc.status === 'skipped_missing' || loc.status === 'skipped_unpublished') &&
        loc.locale === 'en'
      ) {
        return true;
      }
      // Move any leftover blocking statuses out of results
      if (
        loc.status === 'blocked_fetch' ||
        loc.status === 'error' ||
        loc.status === 'skipped_validation' ||
        loc.status === 'skipped_missing' ||
        loc.status === 'skipped_unpublished'
      ) {
        if (!rejected.some((r) => r.itemId === item.itemId && r.locale === loc.locale)) {
          pushRejected(item.itemId, loc.locale, loc.status, loc.reason);
        }
        return false;
      }
      return false;
    });
    if (allowed.length) {
      cleanedResults.push({ ...item, locales: allowed });
    }
  }

  // Sort frozen manifest DA-first for apply order
  frozenManifest.sort((a, b) => {
    if (a.locale !== b.locale) {
      if (a.locale === 'da') return -1;
      if (b.locale === 'da') return 1;
    }
    return a.itemId.localeCompare(b.itemId);
  });

  // If we hit a hard stop, refuse applyability by clearing manifest
  if (stoppedOnError) {
    frozenManifest.length = 0;
  }

  const previewId = newPreviewId();
  const confirmToken = newConfirmToken();
  const createdAt = new Date().toISOString();
  const locales = [...new Set(selection.map((s) => s.locale))] as BackfillLocaleCode[];

  const doc: ArchiveApplyPreviewDocument = {
    schemaVersion: ARCHIVE_APPLY_PREVIEW_SCHEMA,
    previewId,
    confirmToken,
    createdAt,
    createdBy: opts.createdBy,
    mode: 'dry-run',
    selection,
    limit: selection.length,
    locales,
    backupPath: null,
    stoppedOnError,
    errorMessage: errorMessage || null,
    results: cleanedResults,
    frozenManifest,
    proposals: stoppedOnError ? [] : proposals,
    rejected,
    expiresAt: new Date(Date.now() + ARCHIVE_APPLY_PREVIEW_TTL_MS).toISOString(),
    appliedAt: null,
  };

  // Only persist clean, applyable previews (or stopped ones for UI transparency)
  await store.save(doc);
  return doc;
}

export type ArchiveApplyResult = {
  previewId: string;
  backupPath: string;
  /** Firestore doc id when backup was also persisted (serverless durability). */
  backupDocId: string | null;
  reportPath: string;
  stoppedOnError: boolean;
  errorMessage?: string;
  results: ItemBackfillResult[];
  autoTranslatePaused: boolean;
  autoTranslateRestored: boolean;
  writtenCount: number;
};

/**
 * Apply a frozen archive preview: backup → patch SEO title/meta only → readback.
 * Requires confirmOverwrite + confirmToken matching the preview.
 */
export async function applyArchiveApplyPreview(opts: {
  previewId: string;
  confirmOverwrite: boolean;
  confirmToken: string;
  store?: ArchiveApplyPreviewStore;
  fetchFn?: typeof fetchArticleItemByLocale;
  patchFn?: typeof patchArticleFieldDataForLocale;
  publishFn?: typeof publishArticleItemForLocale;
  reportDir?: string;
  pauseAutoTranslate?: boolean;
  resolveAutoTranslate?: () => Promise<boolean>;
  setAutoTranslate?: (enabled: boolean) => Promise<void>;
  onLog?: (line: string) => void;
  writePaceMs?: number;
}): Promise<ArchiveApplyResult> {
  const store = opts.store || createFirestoreArchiveApplyPreviewStore();
  const preview = await store.get(opts.previewId);
  if (!preview) {
    throw Object.assign(new Error('Preview ikke fundet — kør ny preview'), {
      code: 'not_found',
    });
  }

  const gate = assertArchiveApplyConfirmGates({
    previewId: opts.previewId,
    confirmOverwrite: opts.confirmOverwrite,
    confirmToken: opts.confirmToken,
    preview,
  });
  if (gate.ok === false) {
    throw Object.assign(new Error(gate.reason), { code: 'forbidden' });
  }

  if (!preview.frozenManifest.length) {
    throw Object.assign(new Error('Preview har ingen godkendte forslag at skrive'), {
      code: 'invalid_input',
    });
  }

  const log = opts.onLog || (() => undefined);
  const baseFetch = opts.fetchFn || fetchArticleItemByLocale;
  const fetchFn = withTransientFetchRetry(baseFetch, {
    onRetry: (info) => {
      log(
        `Transient fetch retry ${info.attempt}/${info.maxAttempts} status=${info.status ?? 'n/a'} waitMs=${info.delayMs}`
      );
    },
  });
  const patchFn = opts.patchFn || patchArticleFieldDataForLocale;
  const publishFn = opts.publishFn || publishArticleItemForLocale;

  // Vercel/Lambda: only os.tmpdir() is writable — never repo-relative tmp/
  const reportDir = ensureSeoEngineBackfillDir({ reportDir: opts.reportDir });
  const stamp = stampNow();

  const shouldPause = opts.pauseAutoTranslate !== false;
  const resolveAT = opts.resolveAutoTranslate || resolveAutoTranslateEnabled;
  const setAT = opts.setAutoTranslate || setAutoTranslateEnabled;

  let autoTranslatePaused = false;
  let autoTranslateRestored = false;
  let priorAutoTranslate: boolean | null = null;
  let result: ArchiveApplyResult | null = null;

  try {
    if (shouldPause) {
      try {
        priorAutoTranslate = await resolveAT();
        if (priorAutoTranslate) {
          await setAT(false);
          autoTranslatePaused = true;
          log('Auto-translate midlertidigt slået fra under apply');
        }
      } catch (err) {
        log(
          `Kunne ikke pause auto-translate (fortsætter): ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const applied = await applyFrozenSeoManifest({
      manifest: preview.frozenManifest,
      fetchFn,
      patchFn,
      publishFn,
      reportDir,
      stamp: `archive-${stamp}`,
      log,
      writePaceMs: opts.writePaceMs ?? 250,
      reportMode: 'apply',
    });

    let backupDocId: string | null = null;
    try {
      const backupRaw = readFileSync(applied.backupPath, 'utf8');
      const backupPayload = JSON.parse(backupRaw) as Record<string, unknown>;
      const db = getAdminDb();
      if (db) {
        const docId = preview.previewId;
        await db.collection(ARCHIVE_APPLY_BACKUP_COL).doc(docId).set(
          stripUndefinedDeep({
            previewId: preview.previewId,
            createdAt: new Date().toISOString(),
            createdBy: preview.createdBy,
            selection: preview.selection,
            backupPath: applied.backupPath,
            reportPath: applied.reportPath,
            stoppedOnError: applied.stoppedOnError,
            errorMessage: applied.errorMessage || null,
            backup: backupPayload,
            note: 'SEO title + meta only. Rollback via backup JSON / this Firestore doc. No secrets.',
          }) as Record<string, unknown>
        );
        backupDocId = docId;
        log(`Apply backup also stored in Firestore ${ARCHIVE_APPLY_BACKUP_COL}/${docId}`);
      }
    } catch (err) {
      log(
        `ADVARSEL: kunne ikke persistere backup til Firestore: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }

    const uiBackupMeta = join(reportDir, `archive-apply-meta-${stamp}.json`);
    writeFileSync(
      uiBackupMeta,
      JSON.stringify(
        {
          previewId: preview.previewId,
          createdAt: new Date().toISOString(),
          selection: preview.selection,
          backupPath: applied.backupPath,
          backupDocId,
          reportPath: applied.reportPath,
          note: 'SEO title + meta only. Rollback via backup JSON / Firestore. No secrets.',
        },
        null,
        2
      ),
      'utf8'
    );

    if (!applied.stoppedOnError) {
      await store.markApplied(preview.previewId, new Date().toISOString());
    }

    const writtenCount = applied.results.reduce(
      (n, item) => n + item.locales.filter((l) => l.status === 'written').length,
      0
    );

    result = {
      previewId: preview.previewId,
      backupPath: applied.backupPath,
      backupDocId,
      reportPath: applied.reportPath,
      stoppedOnError: applied.stoppedOnError,
      errorMessage: applied.errorMessage,
      results: applied.results,
      autoTranslatePaused,
      autoTranslateRestored: false,
      writtenCount,
    };
  } finally {
    if (autoTranslatePaused && priorAutoTranslate === true) {
      try {
        await setAT(true);
        autoTranslateRestored = true;
        log('Auto-translate genaktiveret efter apply');
      } catch (err) {
        log(
          `ADVARSEL: kunne ikke genaktivere auto-translate: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
    if (result) result.autoTranslateRestored = autoTranslateRestored;
  }

  if (!result) {
    throw Object.assign(new Error('Apply fejlede uden resultat'), { code: 'internal' });
  }
  return result;
}

/** Hash used in tests to assert preview freeze stability. */
export function hashFrozenManifest(manifest: FrozenManifestEntry[]): string {
  return createHash('sha256').update(JSON.stringify(manifest)).digest('hex').slice(0, 16);
}

/** Public helper for UI: backup snapshot of one locale (read-only). */
export function snapshotLocaleForUi(
  item: WebflowLocaleItem,
  locale: BackfillLocaleCode
): LocaleBackupSnapshot {
  return buildLocaleBackup(item, locale);
}
