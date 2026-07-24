#!/usr/bin/env npx tsx
/**
 * Read-only SEO+GEO/AEO archive audit CLI.
 *
 *   npx tsx scripts/seo-engine-archive-audit.ts --limit=80
 *   npx tsx scripts/seo-engine-archive-audit.ts --limit=300 --locales=da,en
 *
 * Writes frozen report under tmp/seo-engine-backfill/. Never writes CMS.
 * IMPORTANT: dotenv must load BEFORE any `@/lib/*` import.
 */
import { config } from 'dotenv';
import { mkdirSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

async function main() {
  if (hasFlag('help') || hasFlag('h')) {
    console.log(`Usage:
  npx tsx scripts/seo-engine-archive-audit.ts --limit=80 --locales=da,en --days=28

Read-only. Writes tmp/seo-engine-backfill/report-archive-audit-*.json
Requires WEBFLOW_* . Optional: GA4_PROPERTY_ID, GSC_SITE_URL.`);
    return;
  }

  const { runArchiveAudit } = await import('../lib/seo-engine/archive-audit');
  const limit = Math.max(1, Math.min(1000, Number(arg('limit') || 80)));
  const locales = (arg('locales') || 'da,en')
    .split(',')
    .map((s) => s.trim())
    .filter((s): s is 'da' | 'en' => s === 'da' || s === 'en');
  const days = Math.max(7, Math.min(90, Number(arg('days') || 28)));

  console.log(`[archive-audit] read-only scan limit=${limit} locales=${locales.join(',')} days=${days}`);
  const report = await runArchiveAudit({ limit, locales, measurementWindowDays: days });

  const outDir = join(root, 'tmp/seo-engine-backfill');
  mkdirSync(outDir, { recursive: true });
  const stamp = report.createdAt.replace(/[:.]/g, '-');
  const outPath = join(outDir, `report-archive-audit-${stamp}.json`);
  const latestPath = join(outDir, 'report-archive-audit-latest.json');
  const json = JSON.stringify(report, null, 2);
  writeFileSync(outPath, json, 'utf8');
  writeFileSync(latestPath, json, 'utf8');

  console.log(`[archive-audit] scanned=${report.scanned}`);
  console.log(
    `[archive-audit] summary P0=${report.summary.p0} P1=${report.summary.p1} P2=${report.summary.p2} ok=${report.summary.ok}`
  );
  console.log(
    `[archive-audit] joins gsc=${report.summary.gscJoinHits} ga4=${report.summary.ga4JoinHits} quickWins=${report.summary.quickWins}`
  );
  console.log(`[archive-audit] gsc: ${report.gscProvenance?.setupStatus || 'n/a'}`);
  console.log(`[archive-audit] ga4: ${report.ga4Provenance?.setupStatus || 'n/a'}`);
  console.log(`[archive-audit] report: ${outPath}`);
  console.log(`[archive-audit] latest: ${latestPath}`);
}

main().catch((e) => {
  console.error('[archive-audit] failed:', e instanceof Error ? e.message : e);
  process.exit(1);
});
