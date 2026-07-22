/**
 * One-off SEO overwrite backfill helpers (DA + EN).
 *
 * Separate from auto-seo-worker empty-only / DK-only rules.
 * Live CMS writes require CLI gates: --apply + --overwrite + --limit=10 + --locales=da,en.
 */

import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { env } from '@/lib/config/env';
import { webflowItemToSeoEngineInput } from '@/lib/seo-engine/cms-contract';
import { findForbiddenPhrases } from '@/lib/seo-engine/forbidden-phrases';
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
      | 'skipped_unpublished_en'
      | 'skipped_validation'
      | 'written'
      | 'error';
    reason?: string;
    proposal?: LocaleProposal;
    readbackOk?: boolean;
    published?: boolean;
  }>;
};

export const BACKFILL_SYSTEM_USER = 'system:seo-overwrite-backfill';
export const APPLY_REQUIRED_LIMIT = 10;
export const APPLY_REQUIRED_LOCALES: BackfillLocaleCode[] = ['da', 'en'];

const HELP_TEXT = `
SEO Engine one-off overwrite backfill (DA + EN)

Default: dry-run (zero Webflow writes).

Usage:
  npm run seo-engine:backfill-overwrite -- [flags]
  npx tsx scripts/seo-engine-overwrite-backfill.ts [flags]

Flags:
  --dry-run              Default. Generate proposals + report only (no CMS writes).
  --apply                Live CMS writes (REQUIRES --overwrite + --limit=10 + --locales=da,en).
  --overwrite            Explicit confirmation that existing SEO may be overwritten.
  --limit=N              Select N newest published DK items (apply requires N=10).
  --locales=da,en        Locales to process (apply requires exactly da,en).
  --help                 Show this help.

Safety:
  - Apply without --overwrite is rejected.
  - Missing EN locale is skipped (never invented/translated).
  - Only re-publishes locales that were already published.
  - Stops on first write/readback error (no automatic rollback).
  - Before writes: timestamped backup under tmp/seo-engine-backfill/ (gitignored).

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
  const limitExplicit = Boolean(limitFlag);
  const localesExplicit = Boolean(localesFlag);

  let limit: number | null = null;
  if (limitFlag) {
    const n = Number(limitFlag.slice('--limit='.length));
    limit = Number.isFinite(n) && n > 0 ? Math.floor(n) : NaN as unknown as number;
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
    if (locales) {
      locales = [...new Set(locales)];
    }
  }

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
    help,
  };
}

/** Gate live writes: require --apply + --overwrite + explicit limit=10 + locales=da,en. */
export function assertApplyOverwriteGates(cli: ParsedBackfillCli): ApplyGateResult {
  if (!cli.apply) return { ok: true };
  if (!cli.overwrite) {
    return {
      ok: false,
      reason: 'Reject: --apply requires --overwrite (existing SEO would be overwritten).',
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

/** Locale-separated articleKey for backfill history (does not change auto-worker wf:{id}). */
export function buildLocaleArticleKey(itemId: string, locale: BackfillLocaleCode): string {
  return `wf:${itemId}:${locale}`;
}

/**
 * Build engine input for overwrite mode: strip existing CMS SEO so AI is not locked.
 */
export function buildOverwriteSeoEngineInput(args: {
  fieldData: Record<string, unknown>;
  language: BackfillLocaleCode;
}): SeoEngineInputContract {
  const base = webflowItemToSeoEngineInput({
    fieldData: args.fieldData,
    language: args.language,
  });
  return {
    ...base,
    existingSeoTitle: null,
    existingMetaDescription: null,
  };
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

/** Stricter than pack heuristics: empty + max length + forbidden phrases are blockers. */
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
  };
}

export function formatProposalChangeReport(
  itemId: string,
  proposal: LocaleProposal
): string {
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

/** List all DK-locale article items (id, slug, title, publish timestamps). */
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
  /** Injected for tests — defaults hit real Webflow / pipeline. */
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
  stoppedOnError: boolean;
  errorMessage?: string;
};

function stampNow(): string {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function ensureReportDir(dir: string): void {
  mkdirSync(dir, { recursive: true });
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

  const listFn = opts.listFn || listDkArticleItems;
  const all = await listFn();
  const selected = selectNewestPublishedItems(all, opts.limit);
  log(`Selected ${selected.length} newest published DK items (limit=${opts.limit}):`);
  for (const it of selected) {
    log(
      `  - ${it.id}  slug=${it.slug || '(none)'}  title=${it.title || '(none)'}  published=${it.lastPublished}  locales=${opts.locales.join(',')}`
    );
  }

  const root = process.cwd();
  const reportDir = opts.reportDir || join(root, 'tmp', 'seo-engine-backfill');
  ensureReportDir(reportDir);
  const stamp = stampNow();
  const backupPath = join(reportDir, `backup-${stamp}.json`);
  const reportPath = join(reportDir, `report-${stamp}.json`);

  const backups: Array<{
    itemId: string;
    slug: string;
    title: string;
    locales: LocaleBackupSnapshot[];
  }> = [];

  const results: ItemBackfillResult[] = [];
  let stoppedOnError = false;
  let errorMessage: string | undefined;

  // Pre-fetch backups for all selected items/locales before any write
  for (const item of selected) {
    const localeBackups: LocaleBackupSnapshot[] = [];
    for (const locale of opts.locales) {
      try {
        const cmsLocaleId = cmsLocaleFor(locale);
        const live = await fetchFn(item.id, cmsLocaleId);
        localeBackups.push(buildLocaleBackup({ ...live, cmsLocaleId }, locale));
      } catch (err) {
        localeBackups.push({
          locale,
          cmsLocaleId: cmsLocaleFor(locale),
          wasPublished: false,
          isDraft: true,
          lastPublished: null,
          lastUpdated: null,
          status: 'missing',
          oldSeoTitle: null,
          oldMetaDescription: null,
        });
        void err;
      }
    }
    backups.push({
      itemId: item.id,
      slug: item.slug,
      title: item.title,
      locales: localeBackups,
    });
  }

  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        createdAt: new Date().toISOString(),
        mode: opts.apply ? 'apply' : 'dry-run',
        note: 'Rollback: restore oldSeoTitle/oldMetaDescription via Webflow PATCH; re-publish only wasPublished=true. No secrets stored.',
        items: backups,
      },
      null,
      2
    ),
    'utf8'
  );
  log(`Backup written: ${backupPath}`);

  outer: for (const item of selected) {
    const itemResult: ItemBackfillResult = {
      itemId: item.id,
      slug: item.slug,
      title: item.title,
      locales: [],
    };

    for (const locale of opts.locales) {
      const cmsLocaleId = cmsLocaleFor(locale);
      try {
        let live: WebflowLocaleItem;
        try {
          live = await fetchFn(item.id, cmsLocaleId);
        } catch {
          itemResult.locales.push({
            locale,
            status: 'skipped_missing',
            reason: `Locale ${locale} does not exist for item — skip (no invent/translate)`,
          });
          log(`SKIP missing locale ${locale} for ${item.id}`);
          continue;
        }

        // For EN: only process when published EN exists
        if (locale === 'en' && !isWebflowLocalePublished(live)) {
          itemResult.locales.push({
            locale,
            status: 'skipped_unpublished_en',
            reason: 'EN exists but is not published — skip',
          });
          log(`SKIP unpublished EN for ${item.id}`);
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
          log(`SKIP short body ${locale} ${item.id}`);
          continue;
        }

        // Guard: overwrite mode must not lock existing SEO into AI input
        if (input.existingSeoTitle || input.existingMetaDescription) {
          throw new Error('Internal error: overwrite input still carries existing SEO');
        }

        const articleKey = buildLocaleArticleKey(item.id, locale);
        const analysis = await analyzeFn(input, {
          userId: BACKFILL_SYSTEM_USER,
          webflowItemId: item.id,
          articleKey,
        });
        const strategy = await strategizeFn(analysis.analysisRunId, {
          userId: BACKFILL_SYSTEM_USER,
          currentInput: input,
        });

        const seoTitle = String(strategy.pack.recommended.fields.seoTitle.value || '').trim();
        const metaDescription = String(
          strategy.pack.recommended.fields.metaDescription.value || ''
        ).trim();

        const fieldCheck = validateOverwriteFields({
          seoTitle,
          metaDescription,
          packValidation: strategy.validation,
        });

        const proposal: LocaleProposal = {
          locale,
          cmsLocaleId,
          articleKey,
          title: String(live.fieldData.name || live.fieldData.title || item.title || '').trim(),
          slug: String(live.fieldData.slug || item.slug || '').trim(),
          wasPublished: isWebflowLocalePublished(live),
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
        };

        log(formatProposalChangeReport(item.id, proposal));

        if (!fieldCheck.ok) {
          itemResult.locales.push({
            locale,
            status: 'skipped_validation',
            reason: fieldCheck.errors.join('; '),
            proposal,
          });
          if (opts.apply) {
            stoppedOnError = true;
            errorMessage = `Validation blocked apply for ${item.id}:${locale}`;
            results.push(itemResult);
            break outer;
          }
          continue;
        }

        if (strategy.mode === 'demo') {
          itemResult.locales.push({
            locale,
            status: 'skipped_validation',
            reason: 'Demo mode strategy must not be written to CMS',
            proposal,
          });
          if (opts.apply) {
            stoppedOnError = true;
            errorMessage = `Demo mode blocked apply for ${item.id}:${locale}`;
            results.push(itemResult);
            break outer;
          }
          continue;
        }

        if (!opts.apply) {
          itemResult.locales.push({ locale, status: 'proposed', proposal });
          continue;
        }

        // APPLY path
        const cmsPatch = toWebflowSeoPatch({ seoTitle, metaDescription });
        await patchFn(item.id, cmsPatch, cmsLocaleId);

        let published = false;
        if (proposal.wasPublished) {
          await publishFn(item.id, cmsLocaleId);
          published = true;
        }

        const fresh = await fetchFn(item.id, cmsLocaleId);
        const readbackOk = exactReadbackMatch({
          expectedSeoTitle: seoTitle,
          expectedMetaDescription: metaDescription,
          fieldData: fresh.fieldData,
        });
        if (!readbackOk) {
          stoppedOnError = true;
          errorMessage = `Readback mismatch for ${item.id}:${locale} — stop. Restore from backup ${backupPath}. No automatic rollback.`;
          itemResult.locales.push({
            locale,
            status: 'error',
            reason: errorMessage,
            proposal,
            readbackOk: false,
            published,
          });
          results.push(itemResult);
          break outer;
        }

        itemResult.locales.push({
          locale,
          status: 'written',
          proposal,
          readbackOk: true,
          published,
        });
        log(`WROTE ${item.id}:${locale} published=${published}`);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        itemResult.locales.push({
          locale,
          status: 'error',
          reason: msg,
        });
        if (opts.apply) {
          stoppedOnError = true;
          errorMessage = `Stop on first error at ${item.id}:${locale}: ${msg}. Restore from backup ${backupPath}. No automatic rollback.`;
          results.push(itemResult);
          break outer;
        }
        log(`ERROR (dry-run continues) ${item.id}:${locale}: ${msg}`);
      }
    }

    results.push(itemResult);
  }

  const report = {
    createdAt: new Date().toISOString(),
    mode: opts.apply ? 'apply' : 'dry-run',
    limit: opts.limit,
    locales: opts.locales,
    backupPath,
    stoppedOnError,
    errorMessage: errorMessage || null,
    selected: selected.map((s) => ({
      id: s.id,
      slug: s.slug,
      title: s.title,
      lastPublished: s.lastPublished,
      locales: opts.locales,
    })),
    results,
  };
  writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  log(`Report written: ${reportPath}`);

  return {
    mode: opts.apply ? 'apply' : 'dry-run',
    selected,
    results,
    backupPath,
    reportPath,
    stoppedOnError,
    errorMessage,
  };
}
