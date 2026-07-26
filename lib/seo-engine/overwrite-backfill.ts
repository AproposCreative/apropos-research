/**
 * One-off SEO overwrite backfill helpers (DA + EN).
 *
 * Separate from auto-seo-worker empty-only / DK-only rules.
 * Live CMS writes require:
 *   --apply --overwrite --limit=10 --locales=da,en --from-report=<dry-run-report.json>
 */

import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { env } from '@/lib/config/env';
import { ensureSeoEngineBackfillDir } from '@/lib/seo-engine/backfill-paths';
import { webflowItemToSeoEngineInput } from '@/lib/seo-engine/cms-contract';
import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';
import { computeInputVersionHash } from '@/lib/seo-engine/hash';
import { analyzeArticle, strategizeFromRun } from '@/lib/seo-engine/pipeline';
import { reviewSeoTitleValidationError, resolveEffectiveArticleType } from '@/lib/seo-engine/review-title-rule';
import type { SeoEngineInputContract } from '@/lib/seo-engine/schema';
import type { ValidationResult } from '@/lib/seo-engine/validator';
import {
  getCmsSeoSlugs,
  isCmsSeoFieldEmpty,
  toWebflowSeoPatch,
} from '@/lib/seo-engine/webflow-adapter';
import { SEO_DESCRIPTION_MAX, SEO_TITLE_MAX } from '@/lib/seo/constants';
import { getWebflowConfig } from '@/lib/webflow-config';
import {
  fetchArticleItemByLocale,
  isWebflowLocalePublished,
  patchArticleFieldDataForLocale,
  publishArticleItemForLocale,
  resolveWebflowLocaleIds,
  WebflowLocaleFetchError,
  type WebflowLocaleItem,
} from '@/lib/webflow/locale-items';

export type BackfillLocaleCode = 'da' | 'en';

export type ParsedBackfillCli = {
  apply: boolean;
  overwrite: boolean;
  dryRun: boolean;
  limit: number | null;
  locales: BackfillLocaleCode[] | null;
  localesRaw: string | null;
  limitExplicit: boolean;
  localesExplicit: boolean;
  fromReport: string | null;
  itemIds: string[];
  compose: boolean;
  baseReport: string | null;
  retryReport: string | null;
  outReport: string | null;
  resume: boolean;
  partialApplyReport: string | null;
  help: boolean;
};

export type ApplyGateResult =
  | { ok: true }
  | { ok: false; reason: string };

export type ListedArticleItem = {
  id: string;
  slug: string;
  title: string;
  lastPublished: string;
  lastUpdated: string | null;
  isDraft: boolean;
};

export type SourceSignature = {
  lastUpdated: string | null;
  lastPublished: string | null;
  contentHash: string;
  inputVersionHash: string;
  oldSeoTitle: string | null;
  oldMetaDescription: string | null;
};

export type LocaleBackupSnapshot = {
  locale: BackfillLocaleCode;
  cmsLocaleId: string;
  wasPublished: boolean;
  isDraft: boolean;
  lastPublished: string | null;
  lastUpdated: string | null;
  status: string;
  oldSeoTitle: string | null;
  oldMetaDescription: string | null;
  contentHash?: string | null;
  fetchKind?: 'ok' | 'missing' | 'blocking';
  fetchError?: string;
};

export type LocaleProposal = {
  locale: BackfillLocaleCode;
  cmsLocaleId: string;
  articleKey: string;
  title: string;
  slug: string;
  wasPublished: boolean;
  oldSeoTitle: string | null;
  oldMetaDescription: string | null;
  newSeoTitle: string;
  newMetaDescription: string;
  analysisRunId: string;
  seoVersionId: string;
  mode: 'ai' | 'demo';
  validationErrors: string[];
  validationWarnings: string[];
  sourceSignature: SourceSignature;
  /** Editor-chosen or suggested type used for review-title gate. */
  effectiveArticleType?: string;
  /** True when seoTitle was regenerated to satisfy the review-keyword rule. */
  reviewTitleCorrected?: boolean;
  /** Prior frozen seoTitle before review correction (audit). */
  priorFrozenSeoTitle?: string;
};

export type FrozenManifestEntry = {
  itemId: string;
  locale: BackfillLocaleCode;
  cmsLocaleId: string;
  articleKey: string;
  newSeoTitle: string;
  newMetaDescription: string;
  wasPublished: boolean;
  sourceSignature: SourceSignature;
};

export type ItemBackfillResult = {
  itemId: string;
  slug: string;
  title: string;
  locales: Array<{
    locale: BackfillLocaleCode;
    status:
      | 'proposed'
      | 'skipped_missing'
      | 'skipped_unpublished'
      | 'skipped_validation'
      | 'written'
      | 'error'
      | 'blocked_fetch';
    reason?: string;
    proposal?: LocaleProposal;
    readbackOk?: boolean;
    published?: boolean;
  }>;
};

export const BACKFILL_SYSTEM_USER = 'system:seo-overwrite-backfill';
export const APPLY_REQUIRED_LIMIT = 10;
export const APPLY_REQUIRED_LOCALES: BackfillLocaleCode[] = ['da', 'en'];
export const BACKFILL_REPORT_SCHEMA_VERSION = 2;

const HELP_TEXT = `
SEO Engine one-off overwrite backfill (DA + EN)

Default: dry-run (zero Webflow writes). Real AI only — demo strategies are rejected.

Usage:
  npm run seo-engine:backfill-overwrite -- [flags]
  npx tsx scripts/seo-engine-overwrite-backfill.ts [flags]

Flags:
  --dry-run                 Default. Generate proposals + frozen manifest (no CMS writes).
  --apply                   Live CMS writes (REQUIRES --overwrite + --limit=10 + --locales=da,en
                            + --from-report=<dry-run-report.json>).
  --overwrite               Explicit confirmation that existing SEO may be overwritten.
  --from-report=PATH        Frozen dry-run report; apply writes ONLY those proposals.
  --compose                 Merge --base-report + --retry-report into --out (no CMS writes).
  --base-report=PATH        Base dry-run report for --compose.
  --retry-report=PATH       Retry dry-run report (proposed locales) for --compose.
  --out=PATH                Output path for composite dry-run report.
  --resume                  Resume a partial apply: verify already-written locales, write ONLY unattempted.
  --partial-apply-report=P  Partial apply report (required with --resume).
  --item-id=ID              Optional dry-run target (repeatable / comma-separated). Skips newest-N selection.
  --limit=N                 Select N newest published DK items (apply requires N=10).
  --locales=da,en           Locales to process (apply requires exactly da,en).
  --help                    Show this help.

Safety:
  - Apply without --overwrite or --from-report is rejected.
  - Only definitive 404/missing locale is skipped; auth/5xx/network block apply.
  - Transient readback/fetch failures (429/5xx/network) retry with backoff + Retry-After.
  - Auth (401/403) and expected-locale 404 still block immediately (no silent skip).
  - Unpublished locales (incl. DA) are skipped/stopped — never written.
  - Apply verifies lastUpdated + contentHash + inputVersionHash before each PATCH.
  - Backup of all target locales is written before the first CMS write.
  - Resume never re-patches already-correct locales; no AI re-generation.
  - Stops on first write/readback/concurrency error (no automatic rollback).

Rollback:
  1. Open the backup JSON written before apply.
  2. For each locale entry, PATCH seo-title / meta-description from old* fields.
  3. Re-publish only locales where wasPublished=true.
`.trim();

export function getBackfillHelpText(): string {
  return HELP_TEXT;
}

export function parseBackfillCliArgs(argv: string[]): ParsedBackfillCli {
  const flags = argv.filter((a) => a.startsWith('--'));
  const apply = flags.includes('--apply');
  const overwrite = flags.includes('--overwrite');
  const help = flags.includes('--help') || flags.includes('-h');
  const compose = flags.includes('--compose');
  const resume = flags.includes('--resume');
  const limitFlag = flags.find((a) => a.startsWith('--limit='));
  const localesFlag = flags.find((a) => a.startsWith('--locales='));
  const fromReportFlag = flags.find((a) => a.startsWith('--from-report='));
  const baseReportFlag = flags.find((a) => a.startsWith('--base-report='));
  const retryReportFlag = flags.find((a) => a.startsWith('--retry-report='));
  const outReportFlag = flags.find((a) => a.startsWith('--out='));
  const partialApplyFlag = flags.find((a) => a.startsWith('--partial-apply-report='));
  const itemIdFlags = flags.filter((a) => a.startsWith('--item-id='));
  const limitExplicit = Boolean(limitFlag);
  const localesExplicit = Boolean(localesFlag);

  let limit: number | null = null;
  if (limitFlag) {
    const n = Number(limitFlag.slice('--limit='.length));
    limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : (NaN as unknown as number);
  }

  let locales: BackfillLocaleCode[] | null = null;
  let localesRaw: string | null = null;
  if (localesFlag) {
    localesRaw = localesFlag.slice('--locales='.length).trim().toLowerCase();
    const parts = localesRaw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    locales = [];
    for (const p of parts) {
      if (p === 'da' || p === 'dk') locales.push('da');
      else if (p === 'en') locales.push('en');
      else {
        locales = null;
        break;
      }
    }
    if (locales) locales = [...new Set(locales)];
  }

  const fromReport = fromReportFlag
    ? fromReportFlag.slice('--from-report='.length).trim() || null
    : null;
  const baseReport = baseReportFlag
    ? baseReportFlag.slice('--base-report='.length).trim() || null
    : null;
  const retryReport = retryReportFlag
    ? retryReportFlag.slice('--retry-report='.length).trim() || null
    : null;
  const outReport = outReportFlag ? outReportFlag.slice('--out='.length).trim() || null : null;
  const partialApplyReport = partialApplyFlag
    ? partialApplyFlag.slice('--partial-apply-report='.length).trim() || null
    : null;

  const itemIds: string[] = [];
  for (const f of itemIdFlags) {
    const raw = f.slice('--item-id='.length).trim();
    for (const part of raw.split(',')) {
      const id = part.trim();
      if (id) itemIds.push(id);
    }
  }

  const dryRunFlag = flags.includes('--dry-run');
  // Resume is a live-write path (subset apply); treat like apply for dryRun default.
  const dryRun = dryRunFlag || (!apply && !resume);

  return {
    apply,
    overwrite,
    dryRun,
    limit: limitExplicit ? limit : null,
    locales,
    localesRaw,
    limitExplicit,
    localesExplicit,
    fromReport,
    itemIds: [...new Set(itemIds)],
    compose,
    baseReport,
    retryReport,
    outReport,
    resume,
    partialApplyReport,
    help,
  };
}

/** Gate live writes: --apply/--resume + --overwrite + limit=10 + locales=da,en + --from-report. */
export function assertApplyOverwriteGates(cli: ParsedBackfillCli): ApplyGateResult {
  if (!cli.apply && !cli.resume) return { ok: true };
  const mode = cli.resume ? '--resume' : '--apply';
  if (cli.resume && cli.apply) {
    return { ok: false, reason: 'Reject: use either --apply or --resume, not both.' };
  }
  if (!cli.overwrite) {
    return {
      ok: false,
      reason: `Reject: ${mode} requires --overwrite (existing SEO would be overwritten).`,
    };
  }
  if (!cli.fromReport) {
    return {
      ok: false,
      reason: `Reject: ${mode} requires --from-report=<dry-run-report.json> (frozen reviewed proposals).`,
    };
  }
  if (cli.resume && !cli.partialApplyReport) {
    return {
      ok: false,
      reason: 'Reject: --resume requires --partial-apply-report=<partial-apply.json>.',
    };
  }
  if (!cli.limitExplicit || cli.limit !== APPLY_REQUIRED_LIMIT) {
    return {
      ok: false,
      reason: `Reject: ${mode} requires explicit --limit=${APPLY_REQUIRED_LIMIT}.`,
    };
  }
  if (!cli.localesExplicit || !cli.locales) {
    return {
      ok: false,
      reason: `Reject: ${mode} requires explicit --locales=da,en.`,
    };
  }
  const sorted = [...cli.locales].sort().join(',');
  const required = [...APPLY_REQUIRED_LOCALES].sort().join(',');
  if (sorted !== required) {
    return {
      ok: false,
      reason: `Reject: ${mode} requires --locales=da,en (both, no other set).`,
    };
  }
  return { ok: true };
}

export function resolveEffectiveLimit(cli: ParsedBackfillCli): number {
  if (cli.limitExplicit && cli.limit != null && Number.isFinite(cli.limit) && cli.limit > 0) {
    return cli.limit;
  }
  return APPLY_REQUIRED_LIMIT;
}

export function resolveEffectiveLocales(cli: ParsedBackfillCli): BackfillLocaleCode[] {
  if (cli.locales && cli.locales.length > 0) return cli.locales;
  return [...APPLY_REQUIRED_LOCALES];
}

export function buildLocaleArticleKey(itemId: string, locale: BackfillLocaleCode): string {
  return `wf:${itemId}:${locale}`;
}

export function buildOverwriteSeoEngineInput(args: {
  fieldData: Record<string, unknown>;
  language: BackfillLocaleCode;
}): SeoEngineInputContract {
  const base = webflowItemToSeoEngineInput({
    fieldData: args.fieldData,
    language: args.language,
  });
  const unlocked: SeoEngineInputContract = {
    ...base,
    existingSeoTitle: null,
    existingMetaDescription: null,
  };
  if (unlocked.primaryImage && !unlocked.primaryImage.url?.trim()) {
    delete (unlocked as { primaryImage?: unknown }).primaryImage;
  }
  return omitUndefinedFields(unlocked);
}

export function omitUndefinedFields<T extends Record<string, unknown>>(obj: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v !== undefined) out[k] = v;
  }
  return out as T;
}

export function selectNewestPublishedItems(
  items: ListedArticleItem[],
  limit: number
): ListedArticleItem[] {
  const published = items.filter((it) => !it.isDraft && Boolean(it.lastPublished?.trim()));
  published.sort((a, b) => {
    const ta = Date.parse(a.lastPublished) || 0;
    const tb = Date.parse(b.lastPublished) || 0;
    if (tb !== ta) return tb - ta;
    return a.id.localeCompare(b.id);
  });
  return published.slice(0, Math.max(0, limit));
}

export function hashCmsContent(fieldData: Record<string, unknown>): string {
  const content = String(fieldData.content || '');
  const name = String(fieldData.name || fieldData.title || '');
  return createHash('sha256').update(`${name}\n${content}`, 'utf8').digest('hex');
}

export function buildSourceSignature(args: {
  item: WebflowLocaleItem;
  input: SeoEngineInputContract;
  oldSeoTitle: string | null;
  oldMetaDescription: string | null;
}): SourceSignature {
  return {
    lastUpdated: args.item.lastUpdated ?? null,
    lastPublished: args.item.lastPublished ?? null,
    contentHash: hashCmsContent(args.item.fieldData),
    inputVersionHash: computeInputVersionHash(args.input),
    oldSeoTitle: args.oldSeoTitle,
    oldMetaDescription: args.oldMetaDescription,
  };
}

/** True when live CMS still matches the dry-run source signature. */
export function sourceSignaturesMatch(expected: SourceSignature, live: SourceSignature): boolean {
  return (
    expected.lastUpdated === live.lastUpdated &&
    expected.contentHash === live.contentHash &&
    expected.inputVersionHash === live.inputVersionHash &&
    expected.oldSeoTitle === live.oldSeoTitle &&
    expected.oldMetaDescription === live.oldMetaDescription
  );
}

export type FetchFailureKind = 'missing' | 'blocking';

/**
 * Only definitive missing locale (404) may be skipped.
 * Auth (401/403), rate-limit (429), 5xx, network (0) block apply.
 */
export function classifyLocaleFetchFailure(err: unknown): {
  kind: FetchFailureKind;
  status: number | null;
  message: string;
  retryAfterMs: number | null;
} {
  if (err instanceof WebflowLocaleFetchError) {
    const status = err.status;
    if (status === 404) {
      return { kind: 'missing', status, message: err.message, retryAfterMs: null };
    }
    return {
      kind: 'blocking',
      status,
      message: err.message || `Webflow fetch failed HTTP ${status}`,
      retryAfterMs: err.retryAfterMs ?? null,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Legacy string errors: only treat explicit 404 as missing
  if (/\b404\b/.test(msg) && /not found|fetch item error 404/i.test(msg)) {
    return { kind: 'missing', status: 404, message: msg, retryAfterMs: null };
  }
  return { kind: 'blocking', status: null, message: msg, retryAfterMs: null };
}

/** HTTP statuses (and 0=network) that are safe to retry for Webflow reads. */
export const TRANSIENT_FETCH_STATUSES = new Set([0, 408, 425, 429, 500, 502, 503, 504]);

export function isTransientFetchFailure(err: unknown): boolean {
  const classified = classifyLocaleFetchFailure(err);
  if (classified.kind === 'missing') return false;
  if (classified.status === 401 || classified.status === 403) return false;
  if (classified.status == null) return true; // unknown/network-ish
  return TRANSIENT_FETCH_STATUSES.has(classified.status);
}

export type TransientRetryOptions = {
  maxAttempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  sleep?: (ms: number) => Promise<void>;
  onRetry?: (info: {
    attempt: number;
    maxAttempts: number;
    delayMs: number;
    status: number | null;
    message: string;
  }) => void;
};

export function computeTransientBackoffMs(args: {
  attempt: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryAfterMs?: number | null;
}): number {
  if (args.retryAfterMs != null && Number.isFinite(args.retryAfterMs) && args.retryAfterMs > 0) {
    return Math.min(args.maxDelayMs, Math.round(args.retryAfterMs));
  }
  const exp = args.baseDelayMs * 2 ** Math.max(0, args.attempt);
  return Math.min(args.maxDelayMs, Math.round(exp));
}

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Wrap a locale fetch with bounded transient retries (429/5xx/network).
 * Auth (401/403) and definitive 404 are never retried.
 */
export function withTransientFetchRetry(
  fetchFn: typeof fetchArticleItemByLocale,
  opts: TransientRetryOptions = {}
): typeof fetchArticleItemByLocale {
  const maxAttempts = Math.max(1, opts.maxAttempts ?? 5);
  const baseDelayMs = opts.baseDelayMs ?? 400;
  const maxDelayMs = opts.maxDelayMs ?? 8_000;
  const sleep = opts.sleep ?? defaultSleep;

  return async (itemId, cmsLocaleId) => {
    let lastErr: unknown;
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        return await fetchFn(itemId, cmsLocaleId);
      } catch (err) {
        lastErr = err;
        if (!isTransientFetchFailure(err) || attempt >= maxAttempts - 1) {
          throw err;
        }
        const classified = classifyLocaleFetchFailure(err);
        const delayMs = computeTransientBackoffMs({
          attempt,
          baseDelayMs,
          maxDelayMs,
          retryAfterMs: classified.retryAfterMs,
        });
        opts.onRetry?.({
          attempt: attempt + 1,
          maxAttempts,
          delayMs,
          status: classified.status,
          message: classified.message,
        });
        await sleep(delayMs);
      }
    }
    throw lastErr;
  };
}

export function readCmsSeoPair(fieldData: Record<string, unknown>): {
  seoTitle: string | null;
  metaDescription: string | null;
} {
  const slugs = getCmsSeoSlugs();
  const title = fieldData[slugs.seoTitle];
  const meta = fieldData[slugs.metaDescription];
  return {
    seoTitle: isCmsSeoFieldEmpty(title) ? null : String(title).trim(),
    metaDescription: isCmsSeoFieldEmpty(meta) ? null : String(meta).trim(),
  };
}

export type OverwriteFieldValidation = {
  ok: boolean;
  errors: string[];
};

export function validateOverwriteFields(args: {
  seoTitle: string;
  metaDescription: string;
  packValidation?: ValidationResult;
  language?: string | null;
  articleType?: string | null;
}): OverwriteFieldValidation {
  const errors: string[] = [];
  const title = args.seoTitle?.trim() || '';
  const meta = args.metaDescription?.trim() || '';

  if (!title) errors.push('seoTitle is empty');
  if (!meta) errors.push('metaDescription is empty');
  if (title.length > SEO_TITLE_MAX) {
    errors.push(`seoTitle length ${title.length} > max ${SEO_TITLE_MAX}`);
  }
  if (meta.length > SEO_DESCRIPTION_MAX) {
    errors.push(`metaDescription length ${meta.length} > max ${SEO_DESCRIPTION_MAX}`);
  }
  for (const p of findForbiddenPhrases(title)) {
    errors.push(`forbidden phrase in seoTitle: ${p}`);
  }
  for (const p of findForbiddenPhrases(meta)) {
    errors.push(`forbidden phrase in metaDescription: ${p}`);
  }
  const reviewErr = reviewSeoTitleValidationError({
    seoTitle: title,
    language: args.language,
    articleType: args.articleType,
  });
  if (reviewErr) {
    errors.push(`${reviewErr.code}${reviewErr.fieldPath ? `:${reviewErr.fieldPath}` : ''}: ${reviewErr.message}`);
  }
  for (const e of args.packValidation?.errors || []) {
    errors.push(`${e.code}${e.fieldPath ? `:${e.fieldPath}` : ''}: ${e.message}`);
  }
  return { ok: errors.length === 0, errors: [...new Set(errors)] };
}

export function exactReadbackMatch(args: {
  expectedSeoTitle: string;
  expectedMetaDescription: string;
  fieldData: Record<string, unknown>;
}): boolean {
  const pair = readCmsSeoPair(args.fieldData);
  return (
    pair.seoTitle === args.expectedSeoTitle.trim() &&
    pair.metaDescription === args.expectedMetaDescription.trim()
  );
}

export function buildLocaleBackup(item: WebflowLocaleItem, locale: BackfillLocaleCode): LocaleBackupSnapshot {
  const pair = readCmsSeoPair(item.fieldData);
  return {
    locale,
    cmsLocaleId: String(item.cmsLocaleId || ''),
    wasPublished: isWebflowLocalePublished(item),
    isDraft: item.isDraft === true,
    lastPublished: item.lastPublished ?? null,
    lastUpdated: item.lastUpdated ?? null,
    status: item.isDraft ? 'draft' : item.lastPublished ? 'published' : 'unknown',
    oldSeoTitle: pair.seoTitle,
    oldMetaDescription: pair.metaDescription,
    contentHash: hashCmsContent(item.fieldData),
    fetchKind: 'ok',
  };
}

export function formatProposalChangeReport(itemId: string, proposal: LocaleProposal): string {
  return [
    `item=${itemId} locale=${proposal.locale} key=${proposal.articleKey}`,
    `  title: ${proposal.title}`,
    `  slug:  ${proposal.slug}`,
    `  seo-title:`,
    `    OLD: ${proposal.oldSeoTitle ?? '(empty)'}`,
    `    NEW: ${proposal.newSeoTitle}`,
    `  meta-description:`,
    `    OLD: ${proposal.oldMetaDescription ?? '(empty)'}`,
    `    NEW: ${proposal.newMetaDescription}`,
  ].join('\n');
}

export type DryRunReportDocument = {
  schemaVersion: number;
  createdAt: string;
  mode: 'dry-run';
  limit: number;
  locales: BackfillLocaleCode[];
  backupPath: string | null;
  stoppedOnError: boolean;
  errorMessage: string | null;
  selected: Array<{
    id: string;
    slug: string;
    title: string;
    lastPublished: string;
    locales: BackfillLocaleCode[];
  }>;
  results: ItemBackfillResult[];
  /** Frozen write list — apply must use exactly these entries. */
  frozenManifest: FrozenManifestEntry[];
};

/** Statuses allowed on a dry-run report used for --from-report apply. */
export const APPLY_ALLOWED_LOCALE_STATUSES = new Set([
  'proposed',
  'skipped_missing',
  'skipped_unpublished',
]);

/** Unresolved statuses that must never reach apply. */
export const APPLY_BLOCKING_LOCALE_STATUSES = new Set([
  'error',
  'blocked_fetch',
  'skipped_validation',
  'written', // apply report only — not a dry-run approval status
]);

function localeKey(itemId: string, locale: BackfillLocaleCode): string {
  return `${itemId}:${locale}`;
}

/**
 * Fail closed: reject dry-run reports with unresolved locale statuses.
 * Allowed: proposed; EN-only skipped_missing / skipped_unpublished.
 * Every frozenManifest entry must match a proposed result.
 */
export function assertDryRunReportCleanForApply(
  doc: Partial<DryRunReportDocument>
): ApplyGateResult {
  if (doc.mode !== 'dry-run') {
    return { ok: false, reason: '--from-report must be a dry-run report (mode=dry-run).' };
  }
  if (doc.stoppedOnError) {
    return { ok: false, reason: '--from-report dry-run stopped on error — refuse apply.' };
  }
  if (!Array.isArray(doc.results)) {
    return { ok: false, reason: '--from-report missing results[].' };
  }

  const proposedKeys = new Set<string>();
  const proposedByKey = new Map<string, LocaleProposal>();
  for (const item of doc.results) {
    if (!item?.itemId || !Array.isArray(item.locales)) {
      return { ok: false, reason: '--from-report has malformed results entry.' };
    }
    for (const loc of item.locales) {
      const status = loc?.status;
      if (!status || APPLY_BLOCKING_LOCALE_STATUSES.has(status)) {
        return {
          ok: false,
          reason: `Reject: unresolved status "${status || 'undefined'}" for ${item.itemId}:${loc?.locale || '?'} — refuse apply.`,
        };
      }
      if (!APPLY_ALLOWED_LOCALE_STATUSES.has(status)) {
        return {
          ok: false,
          reason: `Reject: unsupported status "${status}" for ${item.itemId}:${loc?.locale || '?'}.`,
        };
      }
      if (
        (status === 'skipped_missing' || status === 'skipped_unpublished') &&
        loc.locale !== 'en'
      ) {
        return {
          ok: false,
          reason: `Reject: ${status} is only allowed for EN (got ${item.itemId}:${loc.locale}).`,
        };
      }
      if (status === 'proposed') {
        if (!loc.proposal?.newSeoTitle?.trim() || !loc.proposal?.newMetaDescription?.trim()) {
          return {
            ok: false,
            reason: `Reject: proposed locale ${item.itemId}:${loc.locale} missing proposal text.`,
          };
        }
        if ((loc.proposal.validationErrors || []).length > 0) {
          return {
            ok: false,
            reason: `Reject: proposed locale ${item.itemId}:${loc.locale} has validationErrors.`,
          };
        }
        if (loc.proposal.mode === 'demo') {
          return {
            ok: false,
            reason: `Reject: proposed locale ${item.itemId}:${loc.locale} is demo mode.`,
          };
        }
        const key = localeKey(item.itemId, loc.locale);
        proposedKeys.add(key);
        proposedByKey.set(key, loc.proposal);
      }
    }
  }

  if (!Array.isArray(doc.frozenManifest) || doc.frozenManifest.length === 0) {
    return {
      ok: false,
      reason: '--from-report has empty frozenManifest (no approved proposals to write).',
    };
  }

  const manifestKeys = new Set<string>();
  for (const entry of doc.frozenManifest) {
    if (!entry?.itemId || !entry.locale || !entry.newSeoTitle?.trim() || !entry.newMetaDescription?.trim()) {
      return { ok: false, reason: 'frozenManifest entry missing required fields.' };
    }
    if (!entry.sourceSignature?.contentHash || !entry.sourceSignature?.inputVersionHash) {
      return { ok: false, reason: 'frozenManifest entry missing sourceSignature hashes.' };
    }
    const key = localeKey(entry.itemId, entry.locale);
    const matchedProposal = proposedByKey.get(key);
    const fieldCheck = validateOverwriteFields({
      seoTitle: entry.newSeoTitle,
      metaDescription: entry.newMetaDescription,
      language: entry.locale,
      articleType: matchedProposal?.effectiveArticleType,
    });
    if (!fieldCheck.ok) {
      return {
        ok: false,
        reason: `Reject: frozenManifest ${entry.itemId}:${entry.locale} failed field validation: ${fieldCheck.errors.join('; ')}`,
      };
    }
    if (manifestKeys.has(key)) {
      return { ok: false, reason: `Reject: duplicate frozenManifest entry ${key}.` };
    }
    manifestKeys.add(key);
    if (!proposedKeys.has(key)) {
      return {
        ok: false,
        reason: `Reject: frozenManifest ${key} has no matching proposed result.`,
      };
    }
  }

  for (const key of proposedKeys) {
    if (!manifestKeys.has(key)) {
      return {
        ok: false,
        reason: `Reject: proposed result ${key} missing from frozenManifest.`,
      };
    }
  }

  return { ok: true };
}

/** Validate a dry-run report is usable as --from-report. */
export function loadAndValidateFromReport(path: string): {
  ok: true;
  report: DryRunReportDocument;
} | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Cannot read --from-report: ${msg}` };
  }
  const doc = raw as Partial<DryRunReportDocument>;
  const clean = assertDryRunReportCleanForApply(doc);
  if (clean.ok === false) return clean;
  return { ok: true, report: doc as DryRunReportDocument };
}

export type ApplyReportDocument = {
  createdAt: string;
  mode: 'apply' | 'resume';
  backupPath: string;
  stoppedOnError: boolean;
  errorMessage: string | null;
  frozenManifest?: FrozenManifestEntry[];
  results: ItemBackfillResult[];
};

export type ResumeVerifyEntry = {
  key: string;
  entry: FrozenManifestEntry;
  priorStatus: 'written' | 'error';
  /** written+readbackOk from partial apply, or patched with failed readback. */
  kind: 'already_verified' | 'recover_readback';
};

export type ResumePlan = {
  verify: ResumeVerifyEntry[];
  toWrite: FrozenManifestEntry[];
  attemptedKeys: string[];
  unattemptedKeys: string[];
  verifiedKeysFromPartial: string[];
  recoverKeys: string[];
};

/**
 * Build a safe resume plan from original composite + partial apply report.
 * Writes ONLY unattempted manifest entries; never re-patches verified ones.
 */
export function buildResumePlan(args: {
  composite: DryRunReportDocument;
  partialApply: ApplyReportDocument;
}): { ok: true; plan: ResumePlan } | { ok: false; reason: string } {
  if (args.composite.mode !== 'dry-run') {
    return { ok: false, reason: 'Composite must be mode=dry-run.' };
  }
  if (args.partialApply.mode !== 'apply' && args.partialApply.mode !== 'resume') {
    return { ok: false, reason: 'Partial report must be mode=apply (or resume).' };
  }
  const manifest = args.composite.frozenManifest || [];
  if (manifest.length === 0) {
    return { ok: false, reason: 'Composite frozenManifest is empty.' };
  }

  const byKey = new Map<string, FrozenManifestEntry>();
  for (const entry of manifest) {
    byKey.set(localeKey(entry.itemId, entry.locale), entry);
  }

  const attemptedKeys: string[] = [];
  const verifiedKeysFromPartial: string[] = [];
  const recoverKeys: string[] = [];
  const verify: ResumeVerifyEntry[] = [];

  for (const item of args.partialApply.results || []) {
    for (const loc of item.locales || []) {
      const key = localeKey(item.itemId, loc.locale);
      attemptedKeys.push(key);
      const entry = byKey.get(key);
      if (!entry) {
        return {
          ok: false,
          reason: `Partial apply result ${key} not found in composite frozenManifest.`,
        };
      }
      if (loc.status === 'written' && loc.readbackOk === true) {
        verifiedKeysFromPartial.push(key);
        verify.push({
          key,
          entry,
          priorStatus: 'written',
          kind: 'already_verified',
        });
        continue;
      }
      // Patched+published but readback fetch failed — recover via live exact compare only.
      if (loc.status === 'error' && loc.published === true) {
        recoverKeys.push(key);
        verify.push({
          key,
          entry,
          priorStatus: 'error',
          kind: 'recover_readback',
        });
        continue;
      }
      return {
        ok: false,
        reason: `Cannot resume: ${key} has unresolved status "${loc.status}" (not written/recoverable).`,
      };
    }
  }

  const attemptedSet = new Set(attemptedKeys);
  const unattemptedKeys: string[] = [];
  const toWrite: FrozenManifestEntry[] = [];
  for (const entry of manifest) {
    const key = localeKey(entry.itemId, entry.locale);
    if (!attemptedSet.has(key)) {
      unattemptedKeys.push(key);
      toWrite.push(entry);
    }
  }

  return {
    ok: true,
    plan: {
      verify,
      toWrite,
      attemptedKeys,
      unattemptedKeys,
      verifiedKeysFromPartial,
      recoverKeys,
    },
  };
}

export function loadPartialApplyReport(path: string): {
  ok: true;
  report: ApplyReportDocument;
} | { ok: false; reason: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, 'utf8'));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ok: false, reason: `Cannot read --partial-apply-report: ${msg}` };
  }
  const doc = raw as Partial<ApplyReportDocument>;
  if (doc.mode !== 'apply' && doc.mode !== 'resume') {
    return { ok: false, reason: '--partial-apply-report must be mode=apply.' };
  }
  if (!Array.isArray(doc.results)) {
    return { ok: false, reason: '--partial-apply-report missing results[].' };
  }
  return { ok: true, report: doc as ApplyReportDocument };
}

export function writeResumePlanArtifact(path: string, plan: ResumePlan): void {
  writeFileSync(
    path,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        kind: 'resume-plan',
        verifiedKeysFromPartial: plan.verifiedKeysFromPartial,
        recoverKeys: plan.recoverKeys,
        unattemptedKeys: plan.unattemptedKeys,
        toWrite: plan.toWrite.map((e) => ({
          itemId: e.itemId,
          locale: e.locale,
          articleKey: e.articleKey,
          newSeoTitle: e.newSeoTitle,
          newMetaDescription: e.newMetaDescription,
        })),
        verifyCount: plan.verify.length,
        writeCount: plan.toWrite.length,
      },
      null,
      2
    ),
    'utf8'
  );
}

function proposalToManifestEntry(
  itemId: string,
  proposal: LocaleProposal
): FrozenManifestEntry {
  return {
    itemId,
    locale: proposal.locale,
    cmsLocaleId: proposal.cmsLocaleId,
    articleKey: proposal.articleKey,
    newSeoTitle: proposal.newSeoTitle,
    newMetaDescription: proposal.newMetaDescription,
    wasPublished: proposal.wasPublished,
    sourceSignature: proposal.sourceSignature,
  };
}

/**
 * Merge a base dry-run report with a retry dry-run that replaces failed locales.
 * Keeps base selected set; rebuilds frozenManifest from proposed results.
 * Does not modify files on disk — caller writes the composite.
 */
export function mergeDryRunReports(args: {
  base: DryRunReportDocument;
  retry: DryRunReportDocument;
}): { ok: true; report: DryRunReportDocument } | { ok: false; reason: string } {
  if (args.base.mode !== 'dry-run' || args.retry.mode !== 'dry-run') {
    return { ok: false, reason: 'Both base and retry must be mode=dry-run.' };
  }
  if (args.retry.stoppedOnError) {
    return { ok: false, reason: 'Retry report stoppedOnError — refuse merge.' };
  }

  const baseSelectedIds = (args.base.selected || []).map((s) => s.id);
  if (baseSelectedIds.length === 0) {
    return { ok: false, reason: 'Base report has empty selected[].' };
  }
  const baseSelectedSet = new Set(baseSelectedIds);
  for (const s of args.retry.selected || []) {
    if (!baseSelectedSet.has(s.id)) {
      return {
        ok: false,
        reason: `Retry selected item ${s.id} is not in base selected set.`,
      };
    }
  }

  // Clone base results
  const mergedResults: ItemBackfillResult[] = args.base.results.map((item) => ({
    itemId: item.itemId,
    slug: item.slug,
    title: item.title,
    locales: item.locales.map((l) => ({ ...l, proposal: l.proposal ? { ...l.proposal } : undefined })),
  }));
  const byItem = new Map(mergedResults.map((r) => [r.itemId, r]));

  let replacements = 0;
  for (const retryItem of args.retry.results || []) {
    const baseItem = byItem.get(retryItem.itemId);
    if (!baseItem) {
      return {
        ok: false,
        reason: `Retry item ${retryItem.itemId} not found in base results.`,
      };
    }
    for (const retryLoc of retryItem.locales || []) {
      if (retryLoc.status !== 'proposed') {
        return {
          ok: false,
          reason: `Retry ${retryItem.itemId}:${retryLoc.locale} must be proposed (got ${retryLoc.status}).`,
        };
      }
      if (!retryLoc.proposal) {
        return {
          ok: false,
          reason: `Retry ${retryItem.itemId}:${retryLoc.locale} missing proposal.`,
        };
      }
      const idx = baseItem.locales.findIndex((l) => l.locale === retryLoc.locale);
      const prev = idx >= 0 ? baseItem.locales[idx] : null;
      if (prev && prev.status === 'proposed') {
        return {
          ok: false,
          reason: `Conflict: ${retryItem.itemId}:${retryLoc.locale} already proposed in base — refuse silent overwrite.`,
        };
      }
      if (
        prev &&
        prev.status !== 'error' &&
        prev.status !== 'skipped_validation' &&
        prev.status !== 'blocked_fetch'
      ) {
        return {
          ok: false,
          reason: `Conflict: ${retryItem.itemId}:${retryLoc.locale} base status "${prev.status}" is not replaceable.`,
        };
      }
      const next = {
        locale: retryLoc.locale,
        status: 'proposed' as const,
        proposal: { ...retryLoc.proposal },
      };
      if (idx >= 0) baseItem.locales[idx] = next;
      else baseItem.locales.push(next);
      if (retryItem.slug) baseItem.slug = retryItem.slug;
      if (retryItem.title) baseItem.title = retryItem.title;
      replacements += 1;
    }
  }

  if (replacements === 0) {
    return { ok: false, reason: 'Retry report provided no proposed locales to merge.' };
  }

  // Rebuild frozenManifest from all proposed (deterministic order: base selected, then da,en)
  const localeOrder: BackfillLocaleCode[] = ['da', 'en'];
  const frozenManifest: FrozenManifestEntry[] = [];
  for (const sel of args.base.selected) {
    const item = byItem.get(sel.id);
    if (!item) {
      return { ok: false, reason: `Missing results for selected item ${sel.id}.` };
    }
    for (const locale of localeOrder) {
      const loc = item.locales.find((l) => l.locale === locale);
      if (!loc) continue;
      if (loc.status === 'proposed' && loc.proposal) {
        frozenManifest.push(proposalToManifestEntry(item.itemId, loc.proposal));
      }
    }
  }

  const composite: DryRunReportDocument = {
    schemaVersion: args.base.schemaVersion || BACKFILL_REPORT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    mode: 'dry-run',
    limit: args.base.limit,
    locales: args.base.locales,
    backupPath: args.base.backupPath,
    stoppedOnError: false,
    errorMessage: null,
    selected: args.base.selected.map((s) => ({ ...s })),
    results: mergedResults,
    frozenManifest,
  };

  const clean = assertDryRunReportCleanForApply(composite);
  if (clean.ok === false) {
    return { ok: false, reason: `Merged report still unclean: ${clean.reason}` };
  }

  return { ok: true, report: composite };
}

export function writeDryRunReport(path: string, report: DryRunReportDocument): void {
  writeFileSync(path, JSON.stringify(report, null, 2), 'utf8');
}


async function resolveWebflowRuntime(): Promise<{ token: string; collectionId: string }> {
  const file = getWebflowConfig();
  const token = (file.apiToken !== undefined ? file.apiToken : env.WEBFLOW_API_TOKEN) || undefined;
  const collectionId =
    (file.articlesCollectionId !== undefined
      ? file.articlesCollectionId
      : env.WEBFLOW_ARTICLES_COLLECTION_ID) || undefined;
  if (!token || !collectionId) {
    throw new Error(
      'Missing Webflow credentials. Set env NAMES: WEBFLOW_API_TOKEN, WEBFLOW_ARTICLES_COLLECTION_ID'
    );
  }
  return { token, collectionId };
}

/**
 * List articles for a specific Webflow CMS locale (localized slugs included).
 * EN slugs may differ from DK — callers must map by locale, not assume same slug.
 */
export async function listArticleItemsForLocale(
  locale: 'da' | 'en'
): Promise<ListedArticleItem[]> {
  const { token, collectionId } = await resolveWebflowRuntime();
  const { dk, en } = resolveWebflowLocaleIds();
  const cmsLocaleId = locale === 'en' ? en : dk;
  const out: ListedArticleItem[] = [];
  let offset = 0;
  const pageSize = 100;
  for (;;) {
    const qs = new URLSearchParams({
      cmsLocaleId,
      limit: String(pageSize),
      offset: String(offset),
    });
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (!res.ok) {
      throw new Error(`Webflow list items failed (${locale}): HTTP ${res.status}`);
    }
    const data = (await res.json()) as {
      items?: Array<{
        id?: string;
        lastPublished?: string | null;
        lastUpdated?: string | null;
        isDraft?: boolean;
        fieldData?: Record<string, unknown>;
      }>;
    };
    const items = data.items || [];
    for (const it of items) {
      const fd = it.fieldData || {};
      out.push({
        id: String(it.id || ''),
        slug: String(fd.slug || '').trim(),
        title: String(fd.name || fd.title || '').trim(),
        lastPublished: String(it.lastPublished || '').trim(),
        lastUpdated: it.lastUpdated ? String(it.lastUpdated) : null,
        isDraft: it.isDraft === true,
      });
    }
    if (items.length < pageSize) break;
    offset += pageSize;
  }
  return out.filter((it) => it.id);
}

/** @deprecated Prefer listArticleItemsForLocale('da') — kept for archive/batch callers. */
export async function listDkArticleItems(): Promise<ListedArticleItem[]> {
  return listArticleItemsForLocale('da');
}

export type RunBackfillOptions = {
  limit: number;
  locales: BackfillLocaleCode[];
  apply: boolean;
  /** Resume a partial apply (verify prior writes; write only unattempted). */
  resume?: boolean;
  /** Required when apply/resume — path to reviewed dry-run report. */
  fromReportPath?: string | null;
  /** Required when resume=true — path to partial apply report. */
  partialApplyReportPath?: string | null;
  /** Optional dry-run override: exact Webflow item ids (skips newest-N selection). */
  itemIds?: string[];
  listFn?: () => Promise<ListedArticleItem[]>;
  patchFn?: typeof patchArticleFieldDataForLocale;
  publishFn?: typeof publishArticleItemForLocale;
  fetchFn?: typeof fetchArticleItemByLocale;
  analyzeFn?: typeof analyzeArticle;
  strategizeFn?: typeof strategizeFromRun;
  reportDir?: string;
  onLog?: (line: string) => void;
  /** Override transient fetch retry (tests). */
  fetchRetry?: TransientRetryOptions;
  /** Optional pace delay between apply writes (ms). */
  writePaceMs?: number;
};

export type RunBackfillResult = {
  mode: 'dry-run' | 'apply' | 'resume';
  selected: ListedArticleItem[];
  results: ItemBackfillResult[];
  backupPath: string | null;
  reportPath: string;
  frozenManifest: FrozenManifestEntry[];
  stoppedOnError: boolean;
  errorMessage?: string;
  resumePlanPath?: string | null;
  verifiedCount?: number;
};

function stampNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureReportDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
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

async function runDryRunPropose(opts: {
  selected: ListedArticleItem[];
  locales: BackfillLocaleCode[];
  cmsLocaleFor: (code: BackfillLocaleCode) => string;
  fetchFn: typeof fetchArticleItemByLocale;
  analyzeFn: typeof analyzeArticle;
  strategizeFn: typeof strategizeFromRun;
  log: (line: string) => void;
}): Promise<{
  results: ItemBackfillResult[];
  frozenManifest: FrozenManifestEntry[];
  stoppedOnError: boolean;
  errorMessage?: string;
  backups: Array<{ itemId: string; slug: string; title: string; locales: LocaleBackupSnapshot[] }>;
}> {
  const results: ItemBackfillResult[] = [];
  const frozenManifest: FrozenManifestEntry[] = [];
  const backups: Array<{
    itemId: string;
    slug: string;
    title: string;
    locales: LocaleBackupSnapshot[];
  }> = [];
  let stoppedOnError = false;
  let errorMessage: string | undefined;

  // Complete backup pass first (classify fetch failures correctly)
  for (const item of opts.selected) {
    const localeBackups: LocaleBackupSnapshot[] = [];
    for (const locale of opts.locales) {
      const cmsLocaleId = opts.cmsLocaleFor(locale);
      const outcome = await safeFetchLocale(opts.fetchFn, item.id, cmsLocaleId);
      if (outcome.kind === 'ok') {
        localeBackups.push(buildLocaleBackup({ ...outcome.item, cmsLocaleId }, locale));
      } else if (outcome.kind === 'missing') {
        localeBackups.push({
          locale,
          cmsLocaleId,
          wasPublished: false,
          isDraft: true,
          lastPublished: null,
          lastUpdated: null,
          status: 'missing',
          oldSeoTitle: null,
          oldMetaDescription: null,
          contentHash: null,
          fetchKind: 'missing',
          fetchError: outcome.message,
        });
      } else {
        localeBackups.push({
          locale,
          cmsLocaleId,
          wasPublished: false,
          isDraft: true,
          lastPublished: null,
          lastUpdated: null,
          status: 'fetch_error',
          oldSeoTitle: null,
          oldMetaDescription: null,
          contentHash: null,
          fetchKind: 'blocking',
          fetchError: outcome.message,
        });
        stoppedOnError = true;
        errorMessage = `Blocking fetch during backup for ${item.id}:${locale}: ${outcome.message}`;
      }
    }
    backups.push({
      itemId: item.id,
      slug: item.slug,
      title: item.title,
      locales: localeBackups,
    });
    if (stoppedOnError) break;
  }

  if (stoppedOnError) {
    return { results, frozenManifest, stoppedOnError, errorMessage, backups };
  }

  outer: for (const item of opts.selected) {
    const itemResult: ItemBackfillResult = {
      itemId: item.id,
      slug: item.slug,
      title: item.title,
      locales: [],
    };

    for (const locale of opts.locales) {
      const cmsLocaleId = opts.cmsLocaleFor(locale);
      try {
        const outcome = await safeFetchLocale(opts.fetchFn, item.id, cmsLocaleId);
        if (outcome.kind === 'missing') {
          itemResult.locales.push({
            locale,
            status: 'skipped_missing',
            reason: `Locale ${locale} missing (404) — skip (no invent/translate)`,
          });
          opts.log(`SKIP missing locale ${locale} for ${item.id}`);
          continue;
        }
        if (outcome.kind === 'blocking') {
          stoppedOnError = true;
          errorMessage = `Blocking fetch ${item.id}:${locale}: ${outcome.message}`;
          itemResult.locales.push({
            locale,
            status: 'blocked_fetch',
            reason: errorMessage,
          });
          results.push(itemResult);
          break outer;
        }

        const live = outcome.item;

        // Unpublished (DA or EN): skip EN; stop for DA (was selected as published)
        if (!isWebflowLocalePublished(live)) {
          if (locale === 'da') {
            stoppedOnError = true;
            errorMessage = `DA locale no longer published for ${item.id} — stop`;
            itemResult.locales.push({
              locale,
              status: 'skipped_unpublished',
              reason: errorMessage,
            });
            results.push(itemResult);
            break outer;
          }
          itemResult.locales.push({
            locale,
            status: 'skipped_unpublished',
            reason: 'EN exists but is not published — skip',
          });
          opts.log(`SKIP unpublished EN for ${item.id}`);
          continue;
        }

        const oldPair = readCmsSeoPair(live.fieldData);
        const input = buildOverwriteSeoEngineInput({
          fieldData: live.fieldData,
          language: locale,
        });

        if ((input.body || '').trim().length < 200) {
          itemResult.locales.push({
            locale,
            status: 'skipped_validation',
            reason: 'Body shorter than 200 chars',
          });
          continue;
        }

        if (input.existingSeoTitle || input.existingMetaDescription) {
          throw new Error('Internal error: overwrite input still carries existing SEO');
        }

        const articleKey = buildLocaleArticleKey(item.id, locale);
        const analysis = await opts.analyzeFn(input, {
          userId: BACKFILL_SYSTEM_USER,
          webflowItemId: item.id,
          articleKey,
        });
        const strategy = await opts.strategizeFn(analysis.analysisRunId, {
          userId: BACKFILL_SYSTEM_USER,
          currentInput: input,
        });

        if (strategy.mode === 'demo') {
          stoppedOnError = true;
          errorMessage = `Demo mode rejected for ${item.id}:${locale} — real AI required`;
          itemResult.locales.push({
            locale,
            status: 'error',
            reason: errorMessage,
          });
          results.push(itemResult);
          break outer;
        }

        const seoTitle = String(strategy.pack.recommended.fields.seoTitle.value || '').trim();
        const metaDescription = String(
          strategy.pack.recommended.fields.metaDescription.value || ''
        ).trim();
        const effectiveArticleType = resolveEffectiveArticleType(analysis.analysis);

        const fieldCheck = validateOverwriteFields({
          seoTitle,
          metaDescription,
          packValidation: strategy.validation,
          language: locale,
          articleType: effectiveArticleType,
        });

        const sourceSignature = buildSourceSignature({
          item: live,
          input,
          oldSeoTitle: oldPair.seoTitle,
          oldMetaDescription: oldPair.metaDescription,
        });

        const proposal: LocaleProposal = {
          locale,
          cmsLocaleId,
          articleKey,
          title: String(live.fieldData.name || live.fieldData.title || item.title || '').trim(),
          slug: String(live.fieldData.slug || item.slug || '').trim(),
          wasPublished: true,
          oldSeoTitle: oldPair.seoTitle,
          oldMetaDescription: oldPair.metaDescription,
          newSeoTitle: seoTitle,
          newMetaDescription: metaDescription,
          analysisRunId: analysis.analysisRunId,
          seoVersionId: strategy.seoVersionId,
          mode: strategy.mode,
          validationErrors: fieldCheck.errors,
          validationWarnings: (strategy.validation.warnings || []).map(
            (w) => `${w.code}: ${w.message}`
          ),
          sourceSignature,
          effectiveArticleType,
        };

        opts.log(formatProposalChangeReport(item.id, proposal));

        if (!fieldCheck.ok) {
          itemResult.locales.push({
            locale,
            status: 'skipped_validation',
            reason: fieldCheck.errors.join('; '),
            proposal,
          });
          continue;
        }

        itemResult.locales.push({ locale, status: 'proposed', proposal });
        frozenManifest.push({
          itemId: item.id,
          locale,
          cmsLocaleId,
          articleKey,
          newSeoTitle: seoTitle,
          newMetaDescription: metaDescription,
          wasPublished: true,
          sourceSignature,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        itemResult.locales.push({ locale, status: 'error', reason: msg });
        opts.log(`ERROR (dry-run continues) ${item.id}:${locale}: ${msg}`);
      }
    }

    results.push(itemResult);
  }

  return { results, frozenManifest, stoppedOnError, errorMessage, backups };
}

/**
 * Live CMS writes from a frozen SEO-title/meta manifest.
 * Backup of all locales is written before the first PATCH; stop-on-error; exact readback.
 */
export async function applyFrozenSeoManifest(opts: {
  manifest: FrozenManifestEntry[];
  fetchFn: typeof fetchArticleItemByLocale;
  patchFn: typeof patchArticleFieldDataForLocale;
  publishFn: typeof publishArticleItemForLocale;
  reportDir: string;
  stamp: string;
  log: (line: string) => void;
  writePaceMs?: number;
  reportMode?: 'apply' | 'resume';
}): Promise<{
  results: ItemBackfillResult[];
  backupPath: string;
  reportPath: string;
  stoppedOnError: boolean;
  errorMessage?: string;
}> {
  const results: ItemBackfillResult[] = [];
  const byItem = new Map<string, ItemBackfillResult>();
  let stoppedOnError = false;
  let errorMessage: string | undefined;

  // Complete backup of ALL manifest locales before first write
  const backups: Array<{
    itemId: string;
    locale: BackfillLocaleCode;
    snapshot: LocaleBackupSnapshot;
  }> = [];

  for (const entry of opts.manifest) {
    const outcome = await safeFetchLocale(opts.fetchFn, entry.itemId, entry.cmsLocaleId);
    if (outcome.kind === 'blocking') {
      stoppedOnError = true;
      errorMessage = `Blocking fetch during apply-backup for ${entry.itemId}:${entry.locale}: ${outcome.message}`;
      break;
    }
    if (outcome.kind === 'missing') {
      stoppedOnError = true;
      errorMessage = `Locale missing during apply-backup for ${entry.itemId}:${entry.locale} (was in frozen manifest)`;
      break;
    }
    backups.push({
      itemId: entry.itemId,
      locale: entry.locale,
      snapshot: buildLocaleBackup({ ...outcome.item, cmsLocaleId: entry.cmsLocaleId }, entry.locale),
    });
  }

  const backupPath = join(opts.reportDir, `backup-apply-${opts.stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: 'apply',
        note: 'Rollback: restore oldSeoTitle/oldMetaDescription via Webflow PATCH; re-publish only wasPublished=true. No secrets stored.',
        items: backups,
        stoppedBeforeWrite: stoppedOnError,
        errorMessage: errorMessage || null,
      },
      null,
      2
    ),
    'utf8'
  );
  opts.log(`Apply backup written: ${backupPath}`);

  if (stoppedOnError) {
    const reportPath = join(opts.reportDir, `report-apply-${opts.stamp}.json`);
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          mode: 'apply',
          backupPath,
          stoppedOnError: true,
          errorMessage,
          results: [],
        },
        null,
        2
      ),
      'utf8'
    );
    return { results, backupPath, reportPath, stoppedOnError, errorMessage };
  }

  for (const entry of opts.manifest) {
    if (stoppedOnError) break;

    let itemResult = byItem.get(entry.itemId);
    if (!itemResult) {
      itemResult = {
        itemId: entry.itemId,
        slug: '',
        title: '',
        locales: [],
      };
      byItem.set(entry.itemId, itemResult);
      results.push(itemResult);
    }

    try {
      const outcome = await safeFetchLocale(opts.fetchFn, entry.itemId, entry.cmsLocaleId);
      if (outcome.kind !== 'ok') {
        stoppedOnError = true;
        errorMessage =
          outcome.kind === 'missing'
            ? `Locale missing at write time for ${entry.itemId}:${entry.locale}`
            : `Blocking fetch at write time for ${entry.itemId}:${entry.locale}: ${outcome.message}`;
        itemResult.locales.push({
          locale: entry.locale,
          status: outcome.kind === 'missing' ? 'skipped_missing' : 'blocked_fetch',
          reason: errorMessage,
        });
        break;
      }

      const live = outcome.item;
      itemResult.slug = String(live.fieldData.slug || '');
      itemResult.title = String(live.fieldData.name || live.fieldData.title || '');

      if (!isWebflowLocalePublished(live)) {
        stoppedOnError = true;
        errorMessage = `Locale no longer published for ${entry.itemId}:${entry.locale} — stop (no write)`;
        itemResult.locales.push({
          locale: entry.locale,
          status: 'skipped_unpublished',
          reason: errorMessage,
        });
        break;
      }

      const oldPair = readCmsSeoPair(live.fieldData);
      const input = buildOverwriteSeoEngineInput({
        fieldData: live.fieldData,
        language: entry.locale,
      });
      const liveSig = buildSourceSignature({
        item: live,
        input,
        oldSeoTitle: oldPair.seoTitle,
        oldMetaDescription: oldPair.metaDescription,
      });

      if (!sourceSignaturesMatch(entry.sourceSignature, liveSig)) {
        stoppedOnError = true;
        errorMessage = `Concurrent change detected for ${entry.itemId}:${entry.locale} (lastUpdated/content/input-hash/old SEO mismatch). Restore from ${backupPath}. No automatic rollback.`;
        itemResult.locales.push({
          locale: entry.locale,
          status: 'error',
          reason: errorMessage,
        });
        break;
      }

      const fieldCheck = validateOverwriteFields({
        seoTitle: entry.newSeoTitle,
        metaDescription: entry.newMetaDescription,
      });
      if (!fieldCheck.ok) {
        stoppedOnError = true;
        errorMessage = `Frozen proposal failed validation for ${entry.itemId}:${entry.locale}`;
        itemResult.locales.push({
          locale: entry.locale,
          status: 'error',
          reason: fieldCheck.errors.join('; '),
        });
        break;
      }

      const cmsPatch = toWebflowSeoPatch({
        seoTitle: entry.newSeoTitle,
        metaDescription: entry.newMetaDescription,
      });
      await opts.patchFn(entry.itemId, cmsPatch, entry.cmsLocaleId);

      let published = false;
      if (entry.wasPublished) {
        await opts.publishFn(entry.itemId, entry.cmsLocaleId);
        published = true;
      }

      const freshOutcome = await safeFetchLocale(opts.fetchFn, entry.itemId, entry.cmsLocaleId);
      if (freshOutcome.kind !== 'ok') {
        stoppedOnError = true;
        errorMessage = `Readback fetch failed for ${entry.itemId}:${entry.locale}. Restore from ${backupPath}.`;
        itemResult.locales.push({
          locale: entry.locale,
          status: 'error',
          reason: errorMessage,
          published,
        });
        break;
      }

      const readbackOk = exactReadbackMatch({
        expectedSeoTitle: entry.newSeoTitle,
        expectedMetaDescription: entry.newMetaDescription,
        fieldData: freshOutcome.item.fieldData,
      });
      if (!readbackOk) {
        stoppedOnError = true;
        errorMessage = `Readback mismatch for ${entry.itemId}:${entry.locale}. Restore from ${backupPath}. No automatic rollback.`;
        itemResult.locales.push({
          locale: entry.locale,
          status: 'error',
          reason: errorMessage,
          readbackOk: false,
          published,
        });
        break;
      }

      itemResult.locales.push({
        locale: entry.locale,
        status: 'written',
        readbackOk: true,
        published,
      });
      opts.log(`WROTE ${entry.itemId}:${entry.locale} published=${published}`);
      if (opts.writePaceMs && opts.writePaceMs > 0) {
        await defaultSleep(opts.writePaceMs);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stoppedOnError = true;
      errorMessage = `Stop on first error at ${entry.itemId}:${entry.locale}: ${msg}. Restore from ${backupPath}.`;
      itemResult.locales.push({ locale: entry.locale, status: 'error', reason: msg });
      break;
    }
  }

  const reportPath = join(opts.reportDir, `report-${opts.reportMode || 'apply'}-${opts.stamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: opts.reportMode || 'apply',
        backupPath,
        stoppedOnError,
        errorMessage: errorMessage || null,
        frozenManifest: opts.manifest,
        results,
      },
      null,
      2
    ),
    'utf8'
  );
  opts.log(`Apply report written: ${reportPath}`);

  return { results, backupPath, reportPath, stoppedOnError, errorMessage };
}

async function verifyFrozenEntryLive(args: {
  entry: FrozenManifestEntry;
  fetchFn: typeof fetchArticleItemByLocale;
}): Promise<{ ok: true } | { ok: false; reason: string }> {
  const outcome = await safeFetchLocale(args.fetchFn, args.entry.itemId, args.entry.cmsLocaleId);
  if (outcome.kind !== 'ok') {
    return {
      ok: false,
      reason: `Verify fetch failed for ${args.entry.itemId}:${args.entry.locale}: ${outcome.message}`,
    };
  }
  const match = exactReadbackMatch({
    expectedSeoTitle: args.entry.newSeoTitle,
    expectedMetaDescription: args.entry.newMetaDescription,
    fieldData: outcome.item.fieldData,
  });
  if (!match) {
    return {
      ok: false,
      reason: `Verify mismatch for ${args.entry.itemId}:${args.entry.locale} — live SEO does not exact-match frozen expected. STOP (no new writes).`,
    };
  }
  return { ok: true };
}

export async function runOverwriteBackfill(
  opts: RunBackfillOptions
): Promise<RunBackfillResult> {
  const log = opts.onLog || ((line: string) => console.log(line));
  const baseFetchFn = opts.fetchFn || fetchArticleItemByLocale;
  // Transient retry is for live apply/resume readback+fetches (429/5xx/network).
  // Dry-run keeps fail-fast classification so 5xx still stops immediately in tests/CI.
  const fetchFn =
    opts.apply || opts.resume
      ? withTransientFetchRetry(baseFetchFn, {
          ...(opts.fetchRetry || {}),
          onRetry:
            opts.fetchRetry?.onRetry ||
            ((info) => {
              log(
                `Transient fetch retry ${info.attempt}/${info.maxAttempts} status=${info.status ?? 'n/a'} waitMs=${info.delayMs}`
              );
            }),
        })
      : baseFetchFn;
  const patchFn = opts.patchFn || patchArticleFieldDataForLocale;
  const publishFn = opts.publishFn || publishArticleItemForLocale;
  const analyzeFn = opts.analyzeFn || analyzeArticle;
  const strategizeFn = opts.strategizeFn || strategizeFromRun;
  const localeIds = resolveWebflowLocaleIds();
  const cmsLocaleFor = (code: BackfillLocaleCode) => (code === 'da' ? localeIds.dk : localeIds.en);

  const reportDir = ensureSeoEngineBackfillDir({ reportDir: opts.reportDir });
  const stamp = stampNow();

  if (opts.resume) {
    if (!opts.fromReportPath) throw new Error('--from-report is required for resume');
    if (!opts.partialApplyReportPath) {
      throw new Error('--partial-apply-report is required for resume');
    }
    const loaded = loadAndValidateFromReport(opts.fromReportPath);
    if (loaded.ok === false) throw new Error(loaded.reason);
    const partial = loadPartialApplyReport(opts.partialApplyReportPath);
    if (partial.ok === false) throw new Error(partial.reason);

    const planned = buildResumePlan({
      composite: loaded.report,
      partialApply: partial.report,
    });
    if (planned.ok === false) throw new Error(planned.reason);
    const plan = planned.plan;
    const resumePlanPath = join(reportDir, `resume-plan-${stamp}.json`);
    writeResumePlanArtifact(resumePlanPath, plan);
    log(
      `RESUME plan: verify=${plan.verify.length} (recover=${plan.recoverKeys.length}) write=${plan.toWrite.length} — no re-generation`
    );
    log(`Resume plan artifact: ${resumePlanPath}`);

    const results: ItemBackfillResult[] = [];
    const byItem = new Map<string, ItemBackfillResult>();
    let stoppedOnError = false;
    let errorMessage: string | undefined;
    let verifiedCount = 0;

    for (const v of plan.verify) {
      if (stoppedOnError) break;
      let itemResult = byItem.get(v.entry.itemId);
      if (!itemResult) {
        itemResult = { itemId: v.entry.itemId, slug: '', title: '', locales: [] };
        byItem.set(v.entry.itemId, itemResult);
        results.push(itemResult);
      }
      const checked = await verifyFrozenEntryLive({ entry: v.entry, fetchFn });
      if (checked.ok === false) {
        stoppedOnError = true;
        errorMessage = checked.reason;
        itemResult.locales.push({
          locale: v.entry.locale,
          status: 'error',
          reason: checked.reason,
          readbackOk: false,
        });
        break;
      }
      itemResult.locales.push({
        locale: v.entry.locale,
        status: 'written',
        readbackOk: true,
        published: v.entry.wasPublished,
        reason:
          v.kind === 'recover_readback'
            ? 'Recovered: prior readback fetch failed; live exact match now verified (no re-patch).'
            : 'Prior apply verified; live exact match re-confirmed (no re-patch).',
      });
      verifiedCount += 1;
      log(`VERIFIED ${v.key} kind=${v.kind}`);
    }

    let backupPath: string | null = null;
    let writeReportPath: string | null = null;

    if (!stoppedOnError && plan.toWrite.length > 0) {
      log(`Writing ONLY unattempted entries (${plan.toWrite.length}) after source-signature check`);
      const applied = await applyFrozenSeoManifest({
        manifest: plan.toWrite,
        fetchFn,
        patchFn,
        publishFn,
        reportDir,
        stamp: `${stamp}-writes`,
        log,
        writePaceMs: opts.writePaceMs ?? 250,
        reportMode: 'resume',
      });
      backupPath = applied.backupPath;
      writeReportPath = applied.reportPath;
      if (applied.stoppedOnError) {
        stoppedOnError = true;
        errorMessage = applied.errorMessage;
      }
      for (const item of applied.results) {
        let itemResult = byItem.get(item.itemId);
        if (!itemResult) {
          itemResult = { itemId: item.itemId, slug: item.slug, title: item.title, locales: [] };
          byItem.set(item.itemId, itemResult);
          results.push(itemResult);
        } else {
          if (item.slug) itemResult.slug = item.slug;
          if (item.title) itemResult.title = item.title;
        }
        for (const loc of item.locales) {
          itemResult.locales.push(loc);
          if (loc.status === 'written' && loc.readbackOk === true) verifiedCount += 1;
        }
      }
    } else if (!stoppedOnError) {
      log('No unattempted entries to write');
    }

    const reportPath = join(reportDir, `report-resume-${stamp}.json`);
    writeFileSync(
      reportPath,
      JSON.stringify(
        {
          createdAt: new Date().toISOString(),
          mode: 'resume',
          backupPath,
          writeReportPath,
          resumePlanPath,
          partialApplyReportPath: opts.partialApplyReportPath,
          fromReportPath: opts.fromReportPath,
          stoppedOnError,
          errorMessage: errorMessage || null,
          verifiedCount,
          expectedTotal: loaded.report.frozenManifest.length,
          allVerified: !stoppedOnError && verifiedCount === loaded.report.frozenManifest.length,
          frozenManifest: loaded.report.frozenManifest,
          results,
        },
        null,
        2
      ),
      'utf8'
    );
    log(`Resume report written: ${reportPath}`);
    log(`verified ${verifiedCount}/${loaded.report.frozenManifest.length}`);

    return {
      mode: 'resume',
      selected: loaded.report.selected.map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        lastPublished: s.lastPublished,
        lastUpdated: null,
        isDraft: false,
      })),
      results,
      backupPath,
      reportPath,
      frozenManifest: loaded.report.frozenManifest,
      stoppedOnError,
      errorMessage,
      resumePlanPath,
      verifiedCount,
    };
  }

  if (opts.apply) {
    if (!opts.fromReportPath) {
      throw new Error('--from-report is required for apply');
    }
    const loaded = loadAndValidateFromReport(opts.fromReportPath);
    if (loaded.ok === false) throw new Error(loaded.reason);

    log(
      `APPLY from frozen manifest (${loaded.report.frozenManifest.length} locale writes) — no AI regenerate`
    );
    const applied = await applyFrozenSeoManifest({
      manifest: loaded.report.frozenManifest,
      fetchFn,
      patchFn,
      publishFn,
      reportDir,
      stamp,
      log,
      writePaceMs: opts.writePaceMs ?? 250,
      reportMode: 'apply',
    });

    const verifiedCount = applied.results
      .flatMap((r) => r.locales)
      .filter((l) => l.status === 'written' && l.readbackOk === true).length;

    return {
      mode: 'apply',
      selected: loaded.report.selected.map((s) => ({
        id: s.id,
        slug: s.slug,
        title: s.title,
        lastPublished: s.lastPublished,
        lastUpdated: null,
        isDraft: false,
      })),
      results: applied.results,
      backupPath: applied.backupPath,
      reportPath: applied.reportPath,
      frozenManifest: loaded.report.frozenManifest,
      stoppedOnError: applied.stoppedOnError,
      errorMessage: applied.errorMessage,
      verifiedCount,
    };
  }

  // DRY-RUN path (real AI)
  const listFn = opts.listFn || listDkArticleItems;
  let selected: ListedArticleItem[];
  if (opts.itemIds && opts.itemIds.length > 0) {
    const all = await listFn();
    const byId = new Map(all.map((it) => [it.id, it]));
    selected = [];
    for (const id of opts.itemIds) {
      const hit = byId.get(id);
      if (!hit) {
        throw new Error(`--item-id=${id} not found in DK articles list`);
      }
      selected.push(hit);
    }
    log(`Using explicit --item-id selection (${selected.length}):`);
  } else {
    const all = await listFn();
    selected = selectNewestPublishedItems(all, opts.limit);
    log(`Selected ${selected.length} newest published DK items (limit=${opts.limit}):`);
  }
  for (const it of selected) {
    log(
      `  - ${it.id}  slug=${it.slug || '(none)'}  title=${it.title || '(none)'}  published=${it.lastPublished}  locales=${opts.locales.join(',')}`
    );
  }

  const proposed = await runDryRunPropose({
    selected,
    locales: opts.locales,
    cmsLocaleFor,
    fetchFn,
    analyzeFn,
    strategizeFn,
    log,
  });

  const backupPath = join(reportDir, `backup-${stamp}.json`);
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: 'dry-run',
        note: 'Rollback reference for a future apply. No secrets stored.',
        items: proposed.backups,
      },
      null,
      2
    ),
    'utf8'
  );

  const report: DryRunReportDocument = {
    schemaVersion: BACKFILL_REPORT_SCHEMA_VERSION,
    createdAt: new Date().toISOString(),
    mode: 'dry-run',
    limit: opts.limit,
    locales: opts.locales,
    backupPath,
    stoppedOnError: proposed.stoppedOnError,
    errorMessage: proposed.errorMessage || null,
    selected: selected.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      lastPublished: s.lastPublished,
      locales: opts.locales,
    })),
    results: proposed.results,
    frozenManifest: proposed.frozenManifest,
  };
  const reportPath = join(reportDir, `report-${stamp}.json`);
  writeDryRunReport(reportPath, report);
  log(`Dry-run report written: ${reportPath}`);

  return {
    mode: 'dry-run',
    selected,
    results: proposed.results,
    backupPath,
    reportPath,
    frozenManifest: proposed.frozenManifest,
    stoppedOnError: proposed.stoppedOnError,
    errorMessage: proposed.errorMessage,
  };
}
