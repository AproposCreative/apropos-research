#!/usr/bin/env npx tsx
/**
 * Optimer billeder (thumb + mobil + brødtekst) for én Webflow-artikel via item ID.
 * Brug: npx tsx scripts/optimize-article-by-id.ts <itemId> [--force]
 * Nyttig når en artikel er publiceret/redigeret direkte i Webflow og derfor
 * aldrig kom gennem appens inline auto-optimering.
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { autoOptimizeArticleByItemId } from '../lib/webflow/article-image-auto-optimize';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });
config({ path: join(root, '.env') });

async function main() {
  const args = process.argv.slice(2);
  const itemId = args.find((a) => !a.startsWith('--'));
  const force = args.includes('--force') || process.env.BATCH_FORCE === '1';

  if (!itemId) {
    console.error('Mangler item ID. Brug: npx tsx scripts/optimize-article-by-id.ts <itemId> [--force]');
    process.exit(1);
  }

  console.log(`Optimerer artikel ${itemId}${force ? ' (force)' : ''}…`);
  const result = await autoOptimizeArticleByItemId(itemId, {
    source: force ? 'manual:single-force' : 'manual:single',
    force,
  });

  console.log('\nResultat:');
  console.log('  patched              :', result.patched);
  console.log('  thumbOptimized       :', result.thumbOptimized);
  console.log('  mobileOptimized      :', result.mobileOptimized);
  console.log('  contentImagesOptimized:', result.contentImagesOptimized);
  console.log('  contentImagesFailed  :', result.contentImagesFailed);
  if (result.reason) console.log('  reason               :', result.reason);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
