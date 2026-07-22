#!/usr/bin/env npx tsx
/**
 * One-off SEO overwrite backfill for newest published Webflow articles (DA + EN).
 *
 * Dry-run is the default (zero CMS writes).
 * Live writes require ALL of: --apply --overwrite --limit=10 --locales=da,en
 *
 * See docs/seo-engine-runbook.md → "One-off overwrite backfill"
 * and --help for rollback instructions.
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

import {
  assertApplyOverwriteGates,
  getBackfillHelpText,
  parseBackfillCliArgs,
  resolveEffectiveLimit,
  resolveEffectiveLocales,
  runOverwriteBackfill,
} from '../lib/seo-engine/overwrite-backfill';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

async function main() {
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
      'APPLY MODE: will overwrite CMS seo-title/meta-description. Backup will be written first.'
    );
  } else {
    console.log('DRY-RUN: zero Webflow writes. Pass --apply --overwrite --limit=10 --locales=da,en for live.');
  }

  const result = await runOverwriteBackfill({
    limit: resolveEffectiveLimit(cli),
    locales: resolveEffectiveLocales(cli),
    apply,
  });

  console.log('\n--- summary ---');
  console.log('mode:', result.mode);
  console.log('selected:', result.selected.length);
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
    r.locales.filter((l) => l.status.startsWith('skipped'))
  ).length;
  console.log('proposals/written:', proposed, 'skipped:', skipped);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
