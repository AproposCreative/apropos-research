#!/usr/bin/env node
/**
 * Capture the landing product showcase for static hero image.
 * Usage: node scripts/capture-landing-studio.mjs [baseUrl]
 */
import { chromium } from 'playwright';
import fs from 'fs';
import path from 'path';

const base = process.argv[2] || 'http://localhost:3000';
const outDir = path.join(process.cwd(), 'public/images/landing');
const outFile = path.join(outDir, 'studio-hero.png');

async function main() {
  fs.mkdirSync(outDir, { recursive: true });
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  const url = `${base.replace(/\/$/, '')}/landing`;
  console.log(`Capturing ${url} …`);
  await page.goto(url, { waitUntil: 'networkidle', timeout: 120000 });
  await page.waitForTimeout(2500);

  const showcase = page.locator('section').nth(1);
  await showcase.screenshot({ path: outFile, type: 'png' });
  console.log(`Saved ${outFile}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
