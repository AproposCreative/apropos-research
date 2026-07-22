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
import { webflowItemToSeoEngineInput } from '@/lib/seo-engine/cms-contract';
import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';
import { computeInputVersionHash } from '@/lib/seo-engine/hash';
import { analyzeArticle, strategizeFromRun } from '@/lib/seo-engine/pipeline';
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
  --limit=N                 Select N newest published DK items (apply requires N=10).
  --locales=da,en           Locales to process (apply requires exactly da,en).
  --help                    Show this help.

Safety:
  - Apply without --overwrite or --from-report is rejected.
  - Only definitive 404/missing locale is skipped; auth/5xx/network block apply.
  - Unpublished locales (incl. DA) are skipped/stopped — never written.
  - Apply verifies lastUpdated + contentHash + inputVersionHash before each PATCH.
  - Backup of all target locales is written before the first CMS write.
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
  const limitFlag = flags.find((a) => a.startsWith('--limit='));
  const localesFlag = flags.find((a) => a.startsWith('--locales='));
  const fromReportFlag = flags.find((a) => a.startsWith('--from-report='));
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

  const dryRunFlag = flags.includes('--dry-run');
  const dryRun = dryRunFlag || !apply;

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
    help,
  };
}

/** Gate live writes: --apply + --overwrite + limit=10 + locales=da,en + --from-report. */
export function assertApplyOverwriteGates(cli: ParsedBackfillCli): ApplyGateResult {
  if (!cli.apply) return { ok: true };
  if (!cli.overwrite) {
    return {
      ok: false,
      reason: 'Reject: --apply requires --overwrite (existing SEO would be overwritten).',
    };
  }
  if (!cli.fromReport) {
    return {
      ok: false,
      reason:
        'Reject: --apply requires --from-report=<dry-run-report.json> (frozen reviewed proposals).',
    };
  }
  if (!cli.limitExplicit || cli.limit !== APPLY_REQUIRED_LIMIT) {
    return {
      ok: false,
      reason: `Reject: --apply requires explicit --limit=${APPLY_REQUIRED_LIMIT}.`,
    };
  }
  if (!cli.localesExplicit || !cli.locales) {
    return {
      ok: false,
      reason: 'Reject: --apply requires explicit --locales=da,en.',
    };
  }
  const sorted = [...cli.locales].sort().join(',');
  const required = [...APPLY_REQUIRED_LOCALES].sort().join(',');
  if (sorted !== required) {
    return {
      ok: false,
      reason: 'Reject: --apply requires --locales=da,en (both, no other set).',
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
} {
  if (err instanceof WebflowLocaleFetchError) {
    const status = err.status;
    if (status === 404) {
      return { kind: 'missing', status, message: err.message };
    }
    return {
      kind: 'blocking',
      status,
      message: err.message || `Webflow fetch failed HTTP ${status}`,
    };
  }
  const msg = err instanceof Error ? err.message : String(err);
  // Legacy string errors: only treat explicit 404 as missing
  if (/\b404\b/.test(msg) && /not found|fetch item error 404/i.test(msg)) {
    return { kind: 'missing', status: 404, message: msg };
  }
  return { kind: 'blocking', status: null, message: msg };
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
  if (doc.mode !== 'dry-run') {
    return { ok: false, reason: '--from-report must be a dry-run report (mode=dry-run).' };
  }
  if (!Array.isArray(doc.frozenManifest) || doc.frozenManifest.length === 0) {
    return {
      ok: false,
      reason: '--from-report has empty frozenManifest (no approved proposals to write).',
    };
  }
  if (doc.stoppedOnError) {
    return { ok: false, reason: '--from-report dry-run stopped on error — refuse apply.' };
  }
  for (const entry of doc.frozenManifest) {
    if (!entry?.itemId || !entry.locale || !entry.newSeoTitle || !entry.newMetaDescription) {
      return { ok: false, reason: 'frozenManifest entry missing required fields.' };
    }
    if (!entry.sourceSignature?.contentHash || !entry.sourceSignature?.inputVersionHash) {
      return { ok: false, reason: 'frozenManifest entry missing sourceSignature hashes.' };
    }
  }
  return { ok: true, report: doc as DryRunReportDocument };
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

export async function listDkArticleItems(): Promise<ListedArticleItem[]> {
  const { token, collectionId } = await resolveWebflowRuntime();
  const { dk } = resolveWebflowLocaleIds();
  const out: ListedArticleItem[] = [];
  let offset = 0;
  const pageSize = 100;
  for (;;) {
    const qs = new URLSearchParams({
      cmsLocaleId: dk,
      limit: String(pageSize),
      offset: String(offset),
    });
    const url = `https://api.webflow.com/v2/collections/${collectionId}/items?${qs}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
    });
    if (!res.ok) {
      throw new Error(`Webflow list items failed: HTTP ${res.status}`);
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

export type RunBackfillOptions = {
  limit: number;
  locales: BackfillLocaleCode[];
  apply: boolean;
  /** Required when apply=true — path to reviewed dry-run report. */
  fromReportPath?: string | null;
  listFn?: () => Promise<ListedArticleItem[]>;
  patchFn?: typeof patchArticleFieldDataForLocale;
  publishFn?: typeof publishArticleItemForLocale;
  fetchFn?: typeof fetchArticleItemByLocale;
  analyzeFn?: typeof analyzeArticle;
  strategizeFn?: typeof strategizeFromRun;
  reportDir?: string;
  onLog?: (line: string) => void;
};

export type RunBackfillResult = {
  mode: 'dry-run' | 'apply';
  selected: ListedArticleItem[];
  results: ItemBackfillResult[];
  backupPath: string | null;
  reportPath: string;
  frozenManifest: FrozenManifestEntry[];
  stoppedOnError: boolean;
  errorMessage?: string;
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

        const fieldCheck = validateOverwriteFields({
          seoTitle,
          metaDescription,
          packValidation: strategy.validation,
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

async function runApplyFromManifest(opts: {
  manifest: FrozenManifestEntry[];
  fetchFn: typeof fetchArticleItemByLocale;
  patchFn: typeof patchArticleFieldDataForLocale;
  publishFn: typeof publishArticleItemForLocale;
  reportDir: string;
  stamp: string;
  log: (line: string) => void;
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
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      stoppedOnError = true;
      errorMessage = `Stop on first error at ${entry.itemId}:${entry.locale}: ${msg}. Restore from ${backupPath}.`;
      itemResult.locales.push({ locale: entry.locale, status: 'error', reason: msg });
      break;
    }
  }

  const reportPath = join(opts.reportDir, `report-apply-${opts.stamp}.json`);
  writeFileSync(
    reportPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: 'apply',
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

export async function runOverwriteBackfill(
  opts: RunBackfillOptions
): Promise<RunBackfillResult> {
  const log = opts.onLog || ((line: string) => console.log(line));
  const fetchFn = opts.fetchFn || fetchArticleItemByLocale;
  const patchFn = opts.patchFn || patchArticleFieldDataForLocale;
  const publishFn = opts.publishFn || publishArticleItemForLocale;
  const analyzeFn = opts.analyzeFn || analyzeArticle;
  const strategizeFn = opts.strategizeFn || strategizeFromRun;
  const localeIds = resolveWebflowLocaleIds();
  const cmsLocaleFor = (code: BackfillLocaleCode) => (code === 'da' ? localeIds.dk : localeIds.en);

  const root = process.cwd();
  const reportDir = opts.reportDir || join(root, 'tmp', 'seo-engine-backfill');
  ensureReportDir(reportDir);
  const stamp = stampNow();

  if (opts.apply) {
    if (!opts.fromReportPath) {
      throw new Error('--from-report is required for apply');
    }
    const loaded = loadAndValidateFromReport(opts.fromReportPath);
    if (loaded.ok === false) throw new Error(loaded.reason);

    log(
      `APPLY from frozen manifest (${loaded.report.frozenManifest.length} locale writes) — no AI regenerate`
    );
    const applied = await runApplyFromManifest({
      manifest: loaded.report.frozenManifest,
      fetchFn,
      patchFn,
      publishFn,
      reportDir,
      stamp,
      log,
    });

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
    };
  }

  // DRY-RUN path (real AI)
  const listFn = opts.listFn || listDkArticleItems;
  const all = await listFn();
  const selected = selectNewestPublishedItems(all, opts.limit);
  log(`Selected ${selected.length} newest published DK items (limit=${opts.limit}):`);
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
  log(`Backup written: ${backupPath}`);

  const reportPath = join(reportDir, `report-${stamp}.json`);
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
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  log(`Report written: ${reportPath}`);
  log(`Frozen manifest entries: ${proposed.frozenManifest.length}`);

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
