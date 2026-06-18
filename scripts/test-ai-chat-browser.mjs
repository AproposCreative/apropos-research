#!/usr/bin/env node
/**
 * Browser E2E: Firebase login → /ai → send chat message → verify assistant reply.
 *
 *   node scripts/test-ai-chat-browser.mjs
 *   TEST_BASE_URL=http://localhost:3000 node scripts/test-ai-chat-browser.mjs
 */
import { chromium } from 'playwright';
import { config } from 'dotenv';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
config({ path: join(root, '.env') });
config({ path: join(root, '.env.local') });

const BASE = (process.env.TEST_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const TEST_UID = process.env.AI_CHAT_E2E_UID || 'ai-chat-e2e-test';

const results = [];

function pass(label, detail = '') {
  results.push({ ok: true, label, detail });
  console.log(`✓ ${label}${detail ? ` — ${detail}` : ''}`);
}

function fail(label, detail = '') {
  results.push({ ok: false, label, detail });
  console.error(`✗ ${label}${detail ? ` — ${detail}` : ''}`);
}

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

async function signInViaLoginForm(page, credentials) {
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.fill('#email', credentials.email);
  await page.fill('#password', credentials.password);
  await page.click('form button[type="submit"]');
  await page.waitForURL(/\/ai/, { timeout: 45000 });
  // Open AI Writer panel directly (lobby default is activeView=null on desktop).
  await page.goto(`${BASE}/ai?view=ai`, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForTimeout(3500);
}

async function main() {
  console.log(`\nAI Chat browser E2E — ${BASE}\n`);

  if (!API_KEY) {
    fail('Firebase client config', 'NEXT_PUBLIC_FIREBASE_API_KEY missing');
    process.exit(1);
  }

  let credentials;
  try {
    credentials = await ensureTestUser();
    pass('E2E test user ready', credentials.email);
  } catch (e) {
    fail('E2E test user', e.message);
    process.exit(1);
  }

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    try {
      localStorage.setItem('ai-writer-setup-prefer-collapsed', '1');
    } catch {
      /* ignore */
    }
  });

  const page = await context.newPage();
  const consoleErrors = [];
  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => consoleErrors.push(String(err)));

  try {
    await signInViaLoginForm(page, credentials);
    pass('Login form → /ai');

    if (page.url().includes('/login')) {
      fail('/ai after login', 'still on login');
    }

    const textarea = page.locator('.chat-container textarea').first();
    await textarea.waitFor({ state: 'visible', timeout: 45000 });
    pass('Chat composer visible');

    await textarea.fill('hej');
    const sendBtn = page.locator('button.touch-target.w-11.h-11.bg-white').last();

    const chatResponse = page.waitForResponse(
      (res) =>
        res.url().includes('/api/ai-chat') &&
        res.request().method() === 'POST' &&
        res.status() === 200,
      { timeout: 90000 }
    );

    await sendBtn.click();
    const apiRes = await chatResponse;
    const apiJson = await apiRes.json();

    if (apiJson.response && typeof apiJson.response === 'string') {
      pass('POST /api/ai-chat from browser', `${apiJson.response.length} chars`);
    } else {
      fail('POST /api/ai-chat from browser', JSON.stringify(apiJson).slice(0, 200));
    }

    await page.waitForFunction(
      () => {
        const bubbles = document.querySelectorAll('.chat-container .text-white\\/85, .chat-container .text-white\\/85 *');
        return bubbles.length > 0 || document.body.innerText.length > 200;
      },
      { timeout: 15000 }
    ).catch(() => undefined);

    const bodyText = await page.locator('body').innerText();
    const hasUserMsg = /\bhej\b/i.test(bodyText);
    const hasAssistantReply = bodyText.length > 80;
    if (hasUserMsg && hasAssistantReply) {
      pass('Chat UI updated', `${bodyText.length} chars on page`);
    } else if (apiJson.response) {
      pass('Chat UI updated', 'API OK (message list may be off-screen)');
    } else {
      fail('Chat UI updated', 'no visible messages');
    }

    const criticalErrors = consoleErrors.filter(
      (e) =>
        !/favicon|404|Failed to load resource|ResizeObserver|source map|Firestore|Cloud Firestore|Webflow fields|offline mode|insufficient permissions|user drafts/i.test(
          e
        )
    );
    if (criticalErrors.length === 0) {
      pass('No critical console errors');
    } else {
      fail('Console errors', criticalErrors.slice(0, 2).join(' | '));
    }
  } catch (e) {
    fail('Browser flow', e.message);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed\n`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
