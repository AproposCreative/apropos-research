#!/usr/bin/env npx tsx
/**
 * One-off SEO overwrite backfill for newest published Webflow articles (DA + EN).
 *
 * Dry-run is the default (zero CMS writes). Real AI only.
 * Live writes require ALL of:
 *   --apply --overwrite --limit=10 --locales=da,en --from-report=<dry-run-report.json>
 *
 * IMPORTANT: dotenv must load BEFORE any `@/lib/*` import (env is snapshotted
 * at module load). Keep backfill imports dynamic after config().
 */
import { config } from 'dotenv';
import { dirname, join, resolve } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

async function main() {
  const {
    assertApplyOverwriteGates,
    getBackfillHelpText,
    parseBackfillCliArgs,
    resolveEffectiveLimit,
    resolveEffectiveLocales,
    runOverwriteBackfill,
  } = await import('../lib/seo-engine/overwrite-backfill');

  const cli = parseBackfillCliArgs(process.argv.slice(2));
  if (cli.help) {
    console.log(getBackfillHelpText());
    process.exit(0);
  }

  if (cli.limitExplicit && (cli.limit == null || !Number.isFinite(cli.limit) || cli.limit <= 0)) {
    console.error('Invalid --limit=N (must be a positive integer)');
    process.exit(1);
  }
  if (cli.localesExplicit && !cli.locales) {
    console.error('Invalid --locales= (allowed: da,en)');
    process.exit(1);
  }

  const gate = assertApplyOverwriteGates(cli);
  if (gate.ok === false) {
    console.error(gate.reason);
    process.exit(1);
  }

  const apply = cli.apply && !cli.dryRun;
  if (apply) {
    console.error(
      'APPLY MODE: will overwrite CMS seo-title/meta-description from frozen --from-report. Backup first.'
    );
  } else {
    console.log(
      'DRY-RUN: zero Webflow writes (real AI). Apply later with --apply --overwrite --limit=10 --locales=da,en --from-report=<this-report>.'
    );
  }

  // Quick sanity: OpenAI must be visible after dotenv (before lib import it was empty)
  const { getOpenAIClient } = await import('../lib/openai');
  if (!getOpenAIClient()) {
    console.error(
      'OpenAI client unavailable after dotenv load. Check env NAME: OPENAI_API_KEY (value not printed).'
    );
    process.exit(1);
  }
  console.log('OpenAI client: ready (real AI mode)');

  const fromReportPath = cli.fromReport ? resolve(cli.fromReport) : null;

  const result = await runOverwriteBackfill({
    limit: resolveEffectiveLimit(cli),
    locales: resolveEffectiveLocales(cli),
    apply,
    fromReportPath,
    itemIds: cli.itemIds.length > 0 ? cli.itemIds : undefined,
  });

  console.log('\n--- summary ---');
  console.log('mode:', result.mode);
  console.log('selected:', result.selected.length);
  console.log('frozenManifest:', result.frozenManifest.length);
  console.log('backup:', result.backupPath);
  console.log('report:', result.reportPath);
  if (result.stoppedOnError) {
    console.error('STOPPED ON ERROR:', result.errorMessage);
    process.exit(2);
  }

  const proposed = result.results.flatMap((r) =>
    r.locales.filter((l) => l.status === 'proposed' || l.status === 'written')
  ).length;
  const skipped = result.results.flatMap((r) =>
    r.locales.filter((l) => l.status.startsWith('skipped') || l.status === 'blocked_fetch')
  ).length;
  console.log('proposals/written:', proposed, 'skipped/blocked:', skipped);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
