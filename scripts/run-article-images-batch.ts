#!/usr/bin/env npx tsx
/**
 * Fuld billed-batch: thumb + mobil + brødtekst via autoOptimizeArticleByItemId.
 * Bruges til at hente artikler hvor fx mobil stadig er stor PNG efter kun thumb-batch.
 */
import { config } from 'dotenv';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { autoOptimizeArticleByItemId } from '../lib/webflow/article-image-auto-optimize';
import { previewMobileImageOptimization } from '../lib/webflow/mobile-image-optimizer';
import { previewThumbImageOptimization } from '../lib/webflow/thumb-image-optimizer';
import { previewContentImageOptimization } from '../lib/webflow/content-image-optimizer';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env.local') });

async function main() {
  const limit = Number(process.env.BATCH_LIMIT || 50);
  const force =
    process.env.BATCH_FORCE === '1' ||
    process.env.BATCH_FORCE === 'true' ||
    process.env.BATCH_FORCE === 'yes';

  if (force) {
    console.log('Force-tilstand: genoptimerer også allerede optimerede billeder (nye SEO-filnavne).\n');
  }

  const [mobilePreview, thumbPreview, contentPreview] = await Promise.all([
    previewMobileImageOptimization({ limit, force }),
    previewThumbImageOptimization({ limit, force }),
    previewContentImageOptimization({ articleLimit: limit, force }),
  ]);

  const ids = new Set<string>();
  for (const c of mobilePreview.candidates.filter((x) => x.status === 'ready')) ids.add(c.id);
  for (const c of thumbPreview.candidates.filter((x) => x.status === 'ready')) ids.add(c.id);
  for (const c of contentPreview.candidates.filter((x) => x.status === 'ready')) ids.add(c.id);

  const itemIds = [...ids].slice(0, limit);
  console.log(
    `Klar: mobil ${mobilePreview.ready}, thumb ${thumbPreview.ready}, brødtekst ${contentPreview.ready} — behandler ${itemIds.length} artikler\n`
  );

  if (itemIds.length === 0) {
    console.log('Intet at optimere.');
    return;
  }

  let ok = 0;
  let failed = 0;

  for (const itemId of itemIds) {
    try {
      const result = await autoOptimizeArticleByItemId(itemId, {
        source: force ? 'batch:article-images-seo-force' : 'batch:article-images',
        force,
      });
      const flags = [
        result.thumbOptimized ? 'thumb' : null,
        result.mobileOptimized ? 'mobil' : null,
        result.contentImagesOptimized > 0 ? `${result.contentImagesOptimized} inline` : null,
      ]
        .filter(Boolean)
        .join(', ');
      console.log(
        `  ${result.patched ? '✓' : '·'} ${itemId}${flags ? ` — ${flags}` : result.reason ? ` — ${result.reason}` : ''}`
      );
      if (result.patched || result.mobileOptimized || result.thumbOptimized) ok += 1;
    } catch (e) {
      failed += 1;
      console.log(`  ✗ ${itemId} — ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  console.log(`\nFærdig: ${ok} opdateret, ${failed} fejl`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
