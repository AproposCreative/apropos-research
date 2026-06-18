#!/usr/bin/env npx tsx
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { runThumbImageOptimization } from '../lib/webflow/thumb-image-optimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });

async function main() {
  const result = await runThumbImageOptimization({
    limit: 25,
    maxSizeKB: 600,
    minOriginalKB: 120,
    preserveDimensions: true,
    force: false,
  });

  console.log(
    `\nDesktop thumb batch — ${result.processed} behandlet, ${result.succeeded} OK, ${result.failed} fejl`
  );
  if (result.skippedReason) console.log('Note:', result.skippedReason);

  for (const row of result.results) {
    const size =
      row.output && row.ok
        ? `${row.output.originalSizeKB} KB → ${row.output.processedSizeKB} KB WebP (${row.output.width}×${row.output.height})`
        : row.error || row.status;
    console.log(`  ${row.ok ? '✓' : '✗'} ${row.title} (${row.slug}): ${size}`);
  }

  if (result.failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
