#!/usr/bin/env node
/**
 * Browser E2E for "Importér artikel"-templaten:
 * Firebase login → /ai → vælg template → auto-åbnet dropzone → upload 3 billeder →
 * verificér disabled/enabled send + blink → kør import → tjek articleUpdate.
 *
 *   node scripts/test-import-article-browser.mjs
 *   TEST_BASE_URL=http://localhost:3000 node scripts/test-import-article-browser.mjs
 */
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { tmpdir } from 'os';
import { writeFileSync, mkdtempSync } from 'fs';
import sharp from 'sharp';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env') });
config({ path: join(root, '.env.local') });

const BASE = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;

const results = [];
const pass = (label, detail = '') => { results.push({ ok: true, label, detail }); console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`); };
const fail = (label, detail = '') => { results.push({ ok: false, label, detail }); console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`); };

const ARTICLE_TEXT = `The Death of Robin Hood er en mørk og blodig gentænkning af den klassiske myte. Hugh Jackman spiller en aldrende, desillusioneret Robin Hood, der trækkes ud af sit selvvalgte eksil for et sidste, dødsdømt opgør. Filmen er instrueret med sikker hånd og veksler mellem rå vold og stille, melankolske øjeblikke.

Jackman bærer filmen på sine skuldre. Hans Robin er en mand mærket af tab, og skuespillet er fyldt med en tyngde, der gør den velkendte figur ny igen. Jodie Comer leverer et intenst modspil som Marian, og deres scener sammen er filmens absolutte højdepunkter.

Visuelt er filmen et mesterværk af gråtoner og fakkellys. Skovene virker truende, og slottene kolde. Lydsiden understøtter den dystre stemning med en sparsom, dunkel score.

Hvor filmen halter er i sit tempo. Anden akt trækker i langdrag, og enkelte sidekarakterer får for lidt at lave. Men når det endelige opgør indfinder sig, leverer filmen et følelsesladet og uforglemmeligt klimaks.

The Death of Robin Hood er ikke en eventyrfilm for hele familien. Det er en voksen, tragisk afsked med en legende — og som sådan er den en stor succes.`;

function initAdmin() {
  if (getApps().length) return getApps()[0];
  const privateKey = process.env.FIREBASE_ADMIN_PRIVATE_KEY;
  if (!privateKey) throw new Error('FIREBASE_ADMIN_PRIVATE_KEY missing');
  return initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: privateKey.replace(/\\n/g, '\n'),
    }),
  });
}

async function ensureTestUser() {
  const auth = getAuth(initAdmin());
  const email = process.env.AI_CHAT_E2E_EMAIL || 'ai-chat-e2e@apropos.test';
  const password = process.env.AI_CHAT_E2E_PASSWORD || 'AproposE2e!Chat2026';
  try {
    const user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password, emailVerified: true });
    return { email, password };
  } catch (e) {
    if (e?.code === 'auth/user-not-found') {
      await auth.createUser({ email, password, emailVerified: true });
      return { email, password };
    }
    throw e;
  }
}

async function makeTestImages() {
  const dir = mkdtempSync(join(tmpdir(), 'apropos-import-'));
  const colors = [{ r: 40, g: 60, b: 90 }, { r: 90, g: 40, b: 50 }, { r: 40, g: 80, b: 60 }];
  const paths = [];
  for (let i = 0; i < 3; i += 1) {
    const p = join(dir, `test-image-${i + 1}.png`);
    const buf = await sharp({ create: { width: 1400, height: 900, channels: 3, background: colors[i] } })
      .png()
      .toBuffer();
    writeFileSync(p, buf);
    paths.push(p);
  }
  return paths;
}

async function signIn(page, credentials) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', credentials.email);
  await page.fill('#password', credentials.password);
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/ai/, { timeout: 45000 });
  await page.goto(`${BASE}/ai?view=ai`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
}

async function main() {
  console.log(`\nImportér artikel — browser E2E — ${BASE}\n`);
  if (!API_KEY) { fail('Firebase client config', 'NEXT_PUBLIC_FIREBASE_API_KEY missing'); process.exit(1); }

  let credentials;
  try { credentials = await ensureTestUser(); pass('E2E test user ready', credentials.email); }
  catch (e) { fail('E2E test user', e.message); process.exit(1); }

  const imagePaths = await makeTestImages();
  pass('Test-billeder genereret', `${imagePaths.length} stk`);

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 1000 } });
  // Lad wizard være åben (vælg ikke collapsed-pref).
  const page = await context.newPage();

  try {
    await signIn(page, credentials);
    pass('Login → /ai');

    // Åbn wizard hvis kollapset (klik progress-knappen "Artikel opsætning").
    const templateBtn = page.getByRole('button', { name: 'Importér artikel' });
    if (!(await templateBtn.count())) {
      const progress = page.getByText('Artikel opsætning').first();
      if (await progress.count()) await progress.click({ timeout: 5000 }).catch(() => {});
      await page.waitForTimeout(800);
    }

    await templateBtn.first().waitFor({ state: 'visible', timeout: 20000 });
    await templateBtn.first().click();
    pass('Template "Importér artikel" valgt');

    // Dropzone skal åbne automatisk (helper-tekst).
    const dropHelper = page.getByText(/Upload 3 billeder/i).first();
    await dropHelper.waitFor({ state: 'visible', timeout: 10000 });
    pass('Dropzone åbnede automatisk');

    const composer = page.locator('textarea').last();
    await composer.waitFor({ state: 'visible', timeout: 10000 });

    const sendBtn = page.locator('button.touch-target.w-11.h-11.bg-white').last();
    const disabledBefore = await sendBtn.isDisabled();
    if (disabledBefore) pass('Send disabled uden tekst/billeder');
    else fail('Send disabled uden tekst/billeder', 'knappen var aktiv');

    await composer.fill(ARTICLE_TEXT);
    await page.waitForTimeout(400);
    const disabledTextOnly = await sendBtn.isDisabled();
    if (disabledTextOnly) pass('Send stadig disabled med tekst men 0 billeder');
    else fail('Send stadig disabled med tekst men 0 billeder', 'knappen var aktiv');

    // Upload 3 billeder via skjult file input.
    const fileInput = page.locator('input[type="file"][multiple]').last();
    await fileInput.setInputFiles(imagePaths);

    // Vent på 3 thumbnails (Hero + Body 1/2).
    await page.getByText('Hero', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByText('Body 1', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    await page.getByText('Body 2', { exact: true }).first().waitFor({ state: 'visible', timeout: 30000 });
    pass('3 billeder uploadet (Hero/Body 1/Body 2)');

    await page.waitForTimeout(500);
    const enabledAfter = !(await sendBtn.isDisabled());
    if (enabledAfter) pass('Send aktiveret efter 3 billeder + tekst');
    else fail('Send aktiveret efter 3 billeder + tekst', 'knappen var stadig disabled');

    // Kør import.
    const importResp = page.waitForResponse(
      (res) => res.url().includes('/api/articles/import') && res.request().method() === 'POST',
      { timeout: 180000 }
    );
    await sendBtn.click();
    const res = await importResp;
    const status = res.status();
    let json = null;
    try { json = await res.json(); } catch {}

    if (status === 200) {
      const update = json?.data?.articleUpdate;
      if (update && update.content) {
        pass('POST /api/articles/import 200', `titel: "${(update.title || '').slice(0, 50)}"`);
        const checks = [
          [!!update.featuredImage, 'featuredImage sat (hero)'],
          [/firebasestorage|\.webp/i.test(update.featuredImage || ''), 'hero er optimeret WebP-URL'],
          [/<figure/i.test(update.content || ''), 'body-billeder indsat som <figure> i content'],
          [(update.content.match(/<figure/gi) || []).length === 2, 'præcis 2 inline-billeder'],
          [!!update.slug, `slug: ${update.slug}`],
          [(update.seoTitle || '').length > 0 && (update.seoTitle || '').length <= 60, `seoTitle ≤60 (${(update.seoTitle || '').length})`],
          [(update.seoDescription || '').length <= 155, `metaDescription ≤155 (${(update.seoDescription || '').length})`],
          [typeof update.readTime === 'number' && update.readTime >= 1, `readTime: ${update.readTime} min`],
          [Array.isArray(update.topicsSelected) && update.topicsSelected.length >= 1, `emner: ${(update.topicsSelected || []).join(', ')}`],
        ];
        for (const [ok, label] of checks) (ok ? pass : fail)(label);
      } else {
        fail('articleUpdate i svar', JSON.stringify(json).slice(0, 200));
      }
    } else {
      fail('POST /api/articles/import', `HTTP ${status} ${JSON.stringify(json).slice(0, 200)}`);
    }

    const shot = join(root, 'scripts', 'import-test-result.png');
    await page.screenshot({ path: shot, fullPage: false }).catch(() => {});
    pass('Screenshot gemt', shot);
  } catch (e) {
    fail('Import flow', e.message);
    await page.screenshot({ path: join(root, 'scripts', 'import-test-error.png') }).catch(() => {});
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
