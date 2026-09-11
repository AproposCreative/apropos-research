/** Offline component integration test. No production auth, endpoints, or data. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const component = resolve('app/ai/liv/LivDeskClient.tsx');
const bundled = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import Desk from ${JSON.stringify(component)}; createRoot(document.getElementById('root')).render(<Desk
    onClose={() => document.body.dataset.closed = 'true'} onOpenWriter={story => document.body.dataset.writer = story.id}/>);`,
  resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-auth', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    // This test exercises the desk, feed, research and history. Legacy manual generation is not executed.
    builder.onResolve({ filter: /^\.\/LivPostingClient$/ }, () => ({ path: 'manual', namespace: 'fixture' }));
    builder.onLoad({ filter: /^manual$/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents:
      `import React from 'react'; export default function Manual(){return React.createElement('p', null, 'Manuel drift — lokal teststub');}` }));
    // Match Next's CJS interop while still rendering its real Image component.
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'fixture' }));
    builder.onLoad({ filter: /^image$/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents:
      `export {Image as default} from ${JSON.stringify(resolve('node_modules/next/dist/client/image-component.js'))};` }));
    builder.onLoad({ filter: /^auth$/, namespace: 'fixture' }, () => ({ contents:
      `const user = {getIdToken: async () => 'offline-fixture-only'}; export const useAuth = () => ({user});` }));
  } }] });
const source = (await Promise.all(['LivDeskClient', 'LivApprovalFeed', 'LivPublicationHistory', 'LivImageSelection', 'LivContentColumn']
  .map(name => readFile(resolve(`app/ai/liv/${name}.tsx`), 'utf8')))).join('\n');
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
let historyMode = 'ready';
let emptyFeed = false;
const requests = [];
const draft = { id: 'research-fixture', status: 'draft', signal: { beat: 'Film', title: 'Et gemt researchudkast', angle: 'Test af bevaret Writer-adgang', sources: [] },
  article: { title: 'Et gemt researchudkast', imageSuggestions: [] }, updatedAt: '2026-09-11' };
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) requests.push(`${req.method} ${url.pathname}`);
  if (url.pathname === '/api/editorial/desk') {
    res.setHeader('Content-Type', 'application/json');
    return res.end(JSON.stringify({ stories: [draft] }));
  }
  if (url.pathname === '/api/liv/status') {
    res.setHeader('Content-Type', 'application/json');
    if (historyMode === 'error') { res.statusCode = 503; return res.end(JSON.stringify({ error: 'Historikken kunne ikke hentes.' })); }
    if (historyMode === 'malformed') return res.end(JSON.stringify({ entries: [null] }));
    return res.end(JSON.stringify({ entries: historyMode === 'empty' ? [] : [
      { id: 'live', status: 'published', title: 'En udgivet artikel', slug: 'en-udgivet-artikel', finishedAt: '2026-09-11T08:00:00Z' },
      { id: 'draft', status: 'draft', title: 'Må ikke stå under Udgivet' },
      { id: 'failed', status: 'failed', title: 'Fejlet kørsel' },
      { id: 'no-slug', status: 'published', title: 'Udgivelse uden link', finishedAt: 'invalid-date' },
    ] }));
  }
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
    return res.end(JSON.stringify({ stories: emptyFeed ? [] : stories.slice(offset, offset + 5), total: emptyFeed ? 0 : stories.length,
      nextOffset: emptyFeed ? null : offset + 5 < stories.length ? offset + 5 : null, queueEnabled: !emptyFeed, preparationEnabled: !emptyFeed }));
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
  assert.deepEqual(requests, ['GET /api/liv/delivery/feed']);
  assert.equal(await page.getByRole('navigation', { name: 'Redaktionens faner' }).getByRole('button').count(), 2);
  assert.equal(await page.getByRole('button', { name: 'Overblik', exact: true }).count(), 0);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
  const first = page.locator('article').first();
  async function checkColumnAlignment(card) {
    const [title, start, end, close, box, heading] = await Promise.all([
      page.getByRole('heading', { name: 'Liv · Redaktion', exact: true }).boundingBox(),
      page.getByRole('button', { name: 'Kommende', exact: true }).boundingBox(),
      page.getByRole('button', { name: 'Udgivet', exact: true }).boundingBox(),
      page.getByRole('button', { name: 'Luk Liv Redaktion', exact: true }).boundingBox(),
      card.boundingBox(), page.getByRole('heading', { name: 'Ugens historier', exact: true }).boundingBox(),
    ]);
    for (const x of [title.x, start.x, heading.x]) assert.ok(Math.abs(x - box.x) <= 1, 'Header, navigation and content share the left edge');
    for (const right of [end.x + end.width, close.x + close.width]) assert.ok(Math.abs(right - box.x - box.width) <= 1, 'Header, navigation and content share the right edge');
  }
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await checkColumnAlignment(first);
  }
  await page.setViewportSize({ width: 390, height: 844 });
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
  const nav = page.getByRole('navigation', { name: 'Redaktionens faner' });
  assert.equal(await nav.evaluate(el => el.scrollWidth <= el.clientWidth), true);
  for (const name of ['Kommende', 'Udgivet', 'Indstillinger og værktøjer', 'Luk Liv Redaktion']) {
    const box = await page.getByRole('button', { name, exact: true }).boundingBox();
    assert.ok(box.height >= 44 && box.width >= 44, `${name}: minimum 44px touch target`);
  }
  await page.screenshot({ path: 'tmp/liv-approval-visual/mobile-320.png' });
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.screenshot({ path: 'tmp/liv-approval-visual/desktop.png' });
  requests.length = 0;
  await page.getByRole('button', { name: 'Udgivet', exact: true }).click();
  await page.getByRole('heading', { name: 'En udgivet artikel', exact: true }).waitFor();
  assert.deepEqual(requests, ['GET /api/liv/status']);
  assert.equal(await page.getByText('Må ikke stå under Udgivet').count(), 0);
  assert.equal(await page.getByText('Fejlet kørsel', { exact: true }).count(), 0);
  assert.equal(await page.getByRole('link', { name: 'Læs på Apropos' }).getAttribute('href'), 'https://aproposmagazine.com/articles/en-udgivet-artikel');
  await page.getByText('Dato ikke registreret').waitFor();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/liv-approval-visual/published-mobile.png' });
  for (const mode of ['error', 'malformed', 'empty']) {
    historyMode = mode;
    await page.getByRole('button', { name: 'Opdater', exact: true }).click();
    if (mode === 'empty') {
      await page.getByText('Ingen udgivne artikler i den seneste historik.').waitFor();
      assert.equal(await page.getByRole('alert').count(), 0);
    } else await page.getByRole('alert').waitFor();
  }
  requests.length = 0;
  await page.getByRole('button', { name: 'Indstillinger og værktøjer', exact: true }).click();
  await page.getByRole('heading', { name: 'Indstillinger og værktøjer' }).waitFor();
  assert.deepEqual(requests, []);
  await page.screenshot({ path: 'tmp/liv-approval-visual/settings-mobile.png' });
  await page.getByRole('button', { name: 'Research og kilder' }).click();
  await page.getByRole('heading', { name: draft.signal.title }).waitFor();
  assert.deepEqual(requests, ['GET /api/editorial/desk']);
  await page.getByRole('button', { name: draft.signal.title }).click();
  await page.getByRole('button', { name: 'Åbn i Writer · tekst og billeder' }).click();
  assert.equal(await page.locator('body').getAttribute('data-writer'), draft.id);
  await page.getByRole('button', { name: 'Til indstillinger' }).click();
  await page.getByRole('button', { name: 'Avanceret drift' }).click();
  await page.getByText('Manuel drift — lokal teststub').waitFor();
  await page.getByRole('button', { name: 'Til indstillinger' }).click();
  emptyFeed = true;
  await page.getByRole('button', { name: 'Til historierne' }).click();
  await page.getByRole('heading', { name: 'Ingen færdige forslag endnu' }).waitFor();
  await page.getByText('Automatisk udgivelse er ikke aktiveret.', { exact: false }).waitFor();
  const emptyCard = page.getByRole('heading', { name: 'Ingen færdige forslag endnu' }).locator('..');
  const inactive = page.getByText('Automatisk udgivelse er ikke aktiveret.', { exact: false });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await checkColumnAlignment(emptyCard);
    const [emptyBox, statusBox] = await Promise.all([emptyCard.boundingBox(), inactive.boundingBox()]);
    assert.ok(Math.abs(emptyBox.x - statusBox.x) <= 1 && Math.abs(emptyBox.width - statusBox.width) <= 1, 'Empty-state and status borders align');
  }
  await page.screenshot({ path: 'tmp/liv-approval-visual/aligned-desktop.png' });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: 'tmp/liv-approval-visual/empty-mobile.png' });
  assert.equal(requests.some(req => /preview|plan|trending/.test(req)), false);
  await page.getByRole('button', { name: 'Luk Liv Redaktion' }).click();
  assert.equal(await page.locator('body').getAttribute('data-closed'), 'true');
  assert.deepEqual(errors, []);
  console.log('PASS: aligned header/navigation/cards/status/empty-state edges at 320/390/768/1280px; two-tab desk; 44px targets; approve/reject/reload; details; pagination; conflict recovery; read-only published history; errors/empty states; settings/back; retained research-to-Writer action; no eager research/preview/plan requests; close; no page errors. Offline fixtures; legacy manual posting stubbed.');
} finally { await browser.close(); server.close(); }
