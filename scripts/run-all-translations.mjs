#!/usr/bin/env node
/**
 * Kør bulk DK→EN oversættelse indtil køen er tom.
 * Usage: node scripts/run-all-translations.mjs [baseUrl]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const base = (process.argv[2] || process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const maxBatches = Number(process.env.TRANSLATION_MAX_BATCHES || 60);
const articleLimit = Number(process.env.TRANSLATION_BATCH_SIZE || 3);

async function enableAutoTranslate() {
  const res = await fetch(`${base}/api/webflow/article-translation/status`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ enabled: true }),
  });
  const j = await res.json();
  console.log('Auto-oversættelse:', res.ok ? `slået til (${j.enabled})` : j.error);
}

async function runBatch(batchNum) {
  const res = await fetch(`${base}/api/webflow/article-translation/run`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ force: false, articleLimit }),
  });
  const j = await res.json();
  if (!res.ok || !j.ok) throw new Error(j.error || `Batch ${batchNum} fejlede`);
  return j;
}

async function main() {
  console.log(`\nBulk oversættelse — ${base}\n`);
  await enableAutoTranslate();

  let totalSucceeded = 0;
  let totalFailed = 0;

  for (let i = 1; i <= maxBatches; i++) {
    const preview = await fetch(`${base}/api/webflow/article-translation/preview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ force: false, limit: 5 }),
    }).then((r) => r.json());

    const ready = Number(preview.ready ?? 0);
    if (!preview.ok || ready === 0) {
      console.log(`\nFærdig efter ${i - 1} batches. Ingen flere i kø (${ready} klar).`);
      break;
    }

    console.log(`\n--- Batch ${i} (${ready} tilbage) ---`);
    const result = await runBatch(i);
    totalSucceeded += Number(result.succeeded ?? 0);
    totalFailed += Number(result.failed ?? 0);
    console.log(
      `OK: ${result.succeeded}/${result.processed} · fejl: ${result.failed} · tilbage: ${Math.max(0, ready - Number(result.succeeded ?? 0))}`
    );
    for (const row of result.results || []) {
      const title = String(row.title || row.id).slice(0, 50);
      if (row.ok) console.log(`  ✓ ${title}`);
      else console.log(`  ✗ ${title}: ${row.error || row.reason || 'skip'}`);
    }

    if (Number(result.processed) === 0) break;
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log(`\nTotal oversat: ${totalSucceeded} · fejl: ${totalFailed}\n`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
