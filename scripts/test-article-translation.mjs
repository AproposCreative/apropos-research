#!/usr/bin/env node
/**
 * Test DK→EN article translation pipeline.
 * Usage: node scripts/test-article-translation.mjs [itemId] [--force]
 */
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env') });
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const itemId = process.argv[2] || '6a43dac2d58842c195707030';
const force = process.argv.includes('--force');
const base = process.env.NEXT_PUBLIC_BASE_URL?.replace(/\/$/, '') || 'http://localhost:3000';
const secret =
  process.env.INTERNAL_API_SECRET?.trim() || process.env.CRON_SECRET?.trim() || '';

const localeEn = process.env.WEBFLOW_CMS_LOCALE_EN || '690ca0f6b0d13d8788354156';
const token = process.env.WEBFLOW_API_TOKEN;
const collectionId = process.env.WEBFLOW_ARTICLES_COLLECTION_ID || '67dbf17ba540975b5b21c2a6';

async function fetchEnItem(id) {
  const url = `https://api.webflow.com/v2/collections/${collectionId}/items/${id}?cmsLocaleId=${localeEn}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}`, 'Accept-Version': '1.0.0' },
  });
  if (!res.ok) throw new Error(`Webflow EN fetch ${res.status}`);
  return res.json();
}

async function main() {
  console.log(`\nArticle translation test — item ${itemId}\n`);

  const headers = { 'Content-Type': 'application/json' };
  if (secret) headers['x-internal-api-secret'] = secret;

  const res = await fetch(`${base}/api/internal/translate-article`, {
    method: 'POST',
    headers,
    body: JSON.stringify({ itemId, source: 'test-script', force }),
  });
  const json = await res.json().catch(() => ({}));
  console.log('API status:', res.status);
  console.log('API body:', JSON.stringify(json, null, 2));

  if (!res.ok) process.exit(1);

  if (json.data?.skipped) {
    console.log('\nSkipped:', json.data.reason);
    console.log(json.data.reason?.includes('engelsk locale') ? '\n✓ Skip test passed' : '\n✗ Unexpected skip');
    process.exit(json.data.reason?.includes('engelsk locale') ? 0 : 1);
  }

  const en = await fetchEnItem(itemId);
  const fd = en.fieldData || {};
  const intro = String(fd.intro || '');
  const content = String(fd.content || '').slice(0, 500);
  const danishMarkers = /\b(og|det|der|ikke|med|en|af)\b/gi;
  const introLooksEnglish = !/[æøåÆØÅ]/.test(intro) && intro.length > 20;
  const hasEnglishContent = /the |and |with |was |were /i.test(content);

  console.log('\nEN preview:');
  console.log('  name:', fd.name);
  console.log('  slug:', fd.slug);
  console.log('  seo-title:', fd['seo-title']);
  console.log('  intro (first 120):', intro.slice(0, 120));
  console.log('  intro looks English:', introLooksEnglish);
  console.log('  content snippet English:', hasEnglishContent);

  const ok = introLooksEnglish && fd.name && fd.slug;
  console.log(ok ? '\n✓ Translation test passed' : '\n✗ Translation test failed');
  process.exit(ok ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
