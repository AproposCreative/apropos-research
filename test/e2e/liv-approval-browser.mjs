/** Offline component integration test. No production auth, endpoints, or data. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const component = resolve('app/ai/liv/LivApprovalFeed.tsx');
const bundled = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import Feed from ${JSON.stringify(component)}; createRoot(document.getElementById('root')).render(<Feed/>);`,
  resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-auth', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    // Match Next's CJS interop while still rendering its real Image component.
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'fixture' }));
    builder.onLoad({ filter: /^image$/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents:
      `export {Image as default} from ${JSON.stringify(resolve('node_modules/next/dist/client/image-component.js'))};` }));
    builder.onLoad({ filter: /^auth$/, namespace: 'fixture' }, () => ({ contents:
      `const user = {getIdToken: async () => 'offline-fixture-only'}; export const useAuth = () => ({user});` }));
  } }] });
const source = await readFile(component, 'utf8');
const css = (await postcss([tailwind({ content: [{ raw: source, extension: 'tsx' }], theme: { extend: {} } })])
  .process('@tailwind base; @tailwind components; @tailwind utilities;', { from: undefined })).css;
const stories = ['Når en serie bliver vores fælles samtale', 'Hvad kan biografen, som sofaen ikke kan?',
  'Kunst, der flytter ind i hverdagen', 'Byens små scener har noget på hjerte', 'Hvem bestemmer den gode smag?', 'Reservehistorie'].map((title, i) => ({
  itemId: String(i).padStart(24, '0'), payloadHash: 'b'.repeat(64), revision: 0, decision: 'pending', state: 'ready',
  title, category: ['TV-serie', 'Film', 'Kunst', 'Musik', 'Kultur', 'Kultur'][i],
  summary: 'Demonstrationsdata til lokal UI-test. Liv undersøger en kulturel vinkel og giver plads til både analyse og modargumenter.',
  paragraphs: ['Dette er et længere uddrag, som kun bruges til at afprøve læsevisningen.'],
  image: '/fixture.svg', imageAlt: 'Test af billedformat', credit: 'Lokal testgrafik', scheduledDay: '2026-09-12', kind: 'scheduled' }));
let failNext = false;
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/api/liv/delivery/feed') {
    res.setHeader('Content-Type', 'application/json');
    if (req.method === 'POST') {
      if (failNext) { failNext = false; res.statusCode = 409; return res.end(JSON.stringify({ error: 'Historien er ændret. Opdater listen.' })); }
      let raw = ''; for await (const chunk of req) raw += chunk;
      const input = JSON.parse(raw), story = stories.find(s => s.itemId === input.itemId);
      assert.equal(input.revision, story.revision);
      story.revision++; story.decision = input.decision;
      return res.end(JSON.stringify({ decision: story.decision, revision: story.revision }));
    }
    const offset = Number(url.searchParams.get('offset') || 0);
    return res.end(JSON.stringify({ stories: stories.slice(offset, offset + 5), total: stories.length,
      nextOffset: offset + 5 < stories.length ? offset + 5 : null, queueEnabled: true, preparationEnabled: true }));
  }
  if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundled.outputFiles[0].text); }
  if (url.pathname === '/fixture.svg') {
    res.setHeader('Content-Type', 'image/svg+xml');
    return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="600"><rect width="960" height="600" fill="#334354"/><text x="480" y="310" text-anchor="middle" fill="white" font-family="sans-serif" font-size="32">Billedplads · lokal test</text></svg>');
  }
  res.setHeader('Content-Type', 'text/html');
  res.end(`<!doctype html><html lang="da"><meta name="viewport" content="width=device-width, initial-scale=1"><style>${css}
    body {margin:0;background:#080808;color:white;font-family:Arial,sans-serif} #root {display:flex;height:100dvh;flex-direction:column}</style>
    <div id="root"></div><script src="/bundle.js"></script></html>`);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 });
  const errors = []; page.on('pageerror', error => { errors.push(error.message); console.error('Browser error:', error.message); });
  const origin = `http://127.0.0.1:${server.address().port}`;
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin);
  try { await page.getByRole('heading', { name: stories[0].title }).waitFor({ timeout: 10000 }); }
  catch (error) { console.error(await page.locator('body').innerText()); throw error; }
  assert.equal(await page.locator('article').count(), 5);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const first = page.locator('article').first();
  for (const name of ['Godkend', 'Afvis']) assert.ok((await first.getByRole('button', { name, exact: true }).boundingBox()).height >= 44);
  await mkdir('tmp/liv-approval-visual', { recursive: true });
  await page.screenshot({ path: 'tmp/liv-approval-visual/mobile.png' });
  await first.getByRole('button', { name: 'Godkend', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Godkendt.' }).waitFor();
  assert.equal(await first.getByRole('button', { name: 'Godkend', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.reload(); await page.getByRole('heading', { name: stories[0].title }).waitFor();
  assert.equal(await first.getByRole('button', { name: 'Godkend', exact: true }).getAttribute('aria-pressed'), 'true');
  await first.getByRole('button', { name: 'Afvis', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Afvist.' }).waitFor();
  await first.getByRole('button').first().click();
  await first.getByText(stories[0].paragraphs[0], { exact: true }).waitFor();
  assert.equal(await first.getByRole('button').first().getAttribute('aria-expanded'), 'true');
  await page.getByRole('button', { name: 'Vis fem mere' }).click();
  await page.getByRole('heading', { name: 'Reservehistorie' }).waitFor();
  assert.equal(await page.locator('article').count(), 6);
  failNext = true;
  await first.getByRole('button', { name: 'Godkend', exact: true }).click();
  await page.getByRole('alert').waitFor();
  assert.equal(await first.getByRole('button', { name: 'Godkend', exact: true }).isDisabled(), true);
  await page.getByRole('button', { name: 'Opdater', exact: true }).click();
  await page.getByRole('alert').waitFor({ state: 'hidden' });
  assert.equal(await first.getByRole('button', { name: 'Afvis', exact: true }).getAttribute('aria-pressed'), 'true');
  await page.setViewportSize({ width: 320, height: 740 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'tmp/liv-approval-visual/desktop.png' });
  assert.deepEqual(errors, []);
  console.log('PASS: five cards, mobile 320/390px, desktop, 44px targets, approve/reject/reload, details, pagination, conflict recovery, no page errors. Offline fixtures only.');
} finally { await browser.close(); server.close(); }
