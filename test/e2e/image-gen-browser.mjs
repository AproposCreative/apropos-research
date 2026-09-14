/** Offline real-component test. No production authentication, AI or CMS writes. */
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const bundle = await build({ stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
  import Workshop from ${JSON.stringify(resolve('app/ai/image-gen/workshop.tsx'))}; createRoot(document.getElementById('root')).render(<Workshop/>);`,
  resolveDir: process.cwd(), loader: 'tsx' }, bundle: true, write: false, outdir: 'fixture-output', platform: 'browser', jsx: 'automatic',
  define: { 'process.env': '{}', 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'offline-auth', setup(builder) {
    builder.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    builder.onLoad({ filter: /^auth$/, namespace: 'fixture' }, () => ({ contents:
      `const user = {uid:'fixture-milo',getIdToken:async()=> 'offline-fixture-only'}; export const useAuth=()=>({user,loading:false});` }));
    builder.onResolve({ filter: /^next\/image$/ }, () => ({ path: 'image', namespace: 'fixture' }));
    builder.onLoad({ filter: /^image$/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents:
      `export {Image as default} from ${JSON.stringify(resolve('node_modules/next/dist/client/image-component.js'))};` }));
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: 'link', namespace: 'fixture' }));
    builder.onLoad({ filter: /^link$/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents:
      `import React from 'react'; export default function Link(props){return React.createElement('a',props);}` }));
  } }] });
const id = 'a'.repeat(24), version = 'b'.repeat(64), sectionId = 'c'.repeat(64);
const snapshot = { article: { id, version, title: 'Anmeldelse: Gobs på Wonder 26', content: '<p>Fixture.</p>',
  sections: [{ id: sectionId, index: 0, text: 'Koncertens festlige lys skabte kontrast til de mørke sange.' }] }, cover: null, isDraft: true };
let jobs = [], workspace = { revision: 0, state: null }, writes = 0;
const calls = [];
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); return res.end(bundle.outputFiles.find(f => f.path.endsWith('.js')).text); }
  if (url.pathname === '/bundle.css') { res.setHeader('Content-Type', 'text/css'); return res.end(bundle.outputFiles.find(f => f.path.endsWith('.css')).text); }
  if (url.pathname.startsWith('/api/')) {
    calls.push([req.method, url.pathname]);
    assert.equal(req.headers.authorization, 'Bearer offline-fixture-only');
    res.setHeader('Content-Type', 'application/json');
    let body = ''; for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : null;
    const json = value => res.end(JSON.stringify(value));
    if (url.pathname.endsWith('/workspace')) {
      if (input) { assert.equal(input.revision, workspace.revision); workspace = { revision: workspace.revision + 1, state: input.state }; }
      return json(workspace);
    }
    if (url.pathname.endsWith('/articles')) return json(url.searchParams.has('id') ? snapshot : { articles: [{ id, title: snapshot.article.title, cover: null, isDraft: true }], nextCursor: null });
    if (url.pathname.endsWith('/jobs')) return json({ jobs });
    if (url.pathname.endsWith('/budget')) return json({ status: 'ready', estimatedDkk: 0, reservedDkk: 0, monthlyLimitDkk: 150 });
    if (url.pathname.endsWith('/quotes')) return json({ quotes: Object.fromEntries(['ideas','generate','edit'].map(op => [op, { id: 'quote-fixture', estimateUpToDkk: 8 }])) });
    if (url.pathname.endsWith('/asset')) {
      res.setHeader('Content-Type', 'image/svg+xml');
      return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="640"><rect width="960" height="640" fill="#1032b8"/><circle cx="480" cy="320" r="160" fill="#f67bcc"/></svg>');
    }
    if (url.pathname.endsWith('/draft')) {
      assert.equal(input.selections.length, 1); assert.equal(input.articleVersion, version);
      if (input.action === 'preview') return json({ ...snapshot, selections: input.selections, previewId: 'e'.repeat(64) });
      assert.equal(input.action, 'save'); assert.equal(input.previewId, 'e'.repeat(64));
      const job = { id: 'f'.repeat(64), articleId: id, articleVersion: version, operation: 'save-draft', status: 'succeeded', createdAt: new Date().toISOString(), result: { publication: 'staged-only' } };
      jobs.unshift(job); return json({ job });
    }
    if (url.pathname.endsWith('/run')) {
      writes++;
      const job = { id: String(writes).padStart(64, 'd'), uid: 'fixture-milo', articleId: id, articleVersion: version, operation: input.operation,
        status: 'succeeded', createdAt: new Date().toISOString(), parameters: input.parameters,
        result: { motifs: ['Lyset og mørket', 'Fællessangen', 'En stille kontrast'].map(title => ({ title,
          description: 'En enkel sceneillustration med farverigt lys og en mørk baggrund.', sectionId, excerpt: snapshot.article.sections[0].text })),
          press: { candidates: [], status: 'searched' } } };
      if (input.operation !== 'ideas') {
        assert.ok(['generate', 'edit'].includes(input.operation));
        if (input.operation === 'edit') assert.ok(input.parameters.parentJobId);
        job.result = { provider: 'openai', credit: 'Illustration: Apropos Magazine / AI', style: 'expressive', styleVersion: 'fixture' };
      }
      jobs.unshift(job); return json({ job });
    }
    res.statusCode = 404; return json({ error: 'Unexpected fixture request' });
  }
  res.setHeader('Content-Type', 'text/html'); res.end(`<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial,sans-serif;background:#080808}a{color:inherit}</style><div id="root"></div><script src="/bundle.js"></script></html>`);
});
await new Promise(done => server.listen(0, '127.0.0.1', done));
const browser = await chromium.launch({ executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const origin = `http://127.0.0.1:${server.address().port}`, errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.route('**/*', route => route.request().url().startsWith(origin) ? route.continue() : route.abort());
  await page.goto(origin);
  await page.getByRole('heading', { name: 'Vælg en artikel' }).waitFor();
  await page.getByRole('button', { name: /Gobs/ }).click();
  await page.getByRole('heading', { name: snapshot.article.title }).waitFor();
  assert.equal(writes, 0, 'Opening an article never starts paid work');
  await page.getByRole('button', { name: /Find billedidéer/ }).click();
  await page.getByRole('heading', { name: 'Tre motivforslag' }).waitFor();
  assert.equal(writes, 1);
  await page.getByRole('button', { name: /Lyset og mørket/ }).click();
  await page.getByLabel('Motivbeskrivelse').fill('En enkel scene i koboltblåt og pink, med masser af luft.');
  await page.getByText('Arbejdsvalg gemt privat', { exact: true }).waitFor();
  // Wait for the exact persisted edit, not a stale "saved" label.
  await page.waitForFunction(() => document.querySelector('textarea')?.value.includes('koboltblåt'));
  await new Promise(resolve => setTimeout(resolve, 900));
  assert.match(workspace.state.motif.description, /koboltblåt/);
  await mkdir('tmp/image-gen-visual', { recursive: true });
  for (const width of [320, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, `No horizontal overflow at ${width}`);
    const button = await page.getByRole('button', { name: /Generér ét billede/ }).boundingBox();
    assert.ok(button.height >= 44);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: 'tmp/image-gen-visual/mobile.png', fullPage: true });
  await page.reload();
  await page.getByRole('heading', { name: snapshot.article.title }).waitFor();
  assert.match(await page.getByLabel('Motivbeskrivelse').inputValue(), /koboltblåt/);
  assert.equal(writes, 1, 'Reload reuses research and never starts another provider call');
  await page.getByRole('button', { name: /Generér ét billede/ }).click();
  await page.getByRole('heading', { name: 'Dine gemte billedversioner' }).waitFor();
  assert.equal(writes, 2);
  await page.getByRole('button', { name: 'Ret billedet', exact: true }).click();
  await page.getByLabel('Hvad skal ændres?').fill('Mere luft omkring hovedmotivet.');
  await page.getByRole('button', { name: /Lav rettelsen/ }).click();
  await page.getByLabel('Vælg til artikel').first().waitFor();
  await page.waitForFunction(() => document.querySelectorAll('input[type=checkbox]').length === 2);
  assert.equal(writes, 3);
  await page.getByLabel('Vælg til artikel').first().check();
  await page.getByLabel('Alt-tekst', { exact: true }).fill('En illustreret scene i blå og pink.');
  await page.getByRole('button', { name: 'Se og kontrollér preview', exact: true }).click();
  await page.getByRole('button', { name: 'Gem i Webflow-kladden', exact: true }).click();
  await page.getByText('Valgte billeder gemt og læst tilbage fra Webflow-kladden. Ikke publiceret.').waitFor();
  await page.getByRole('button', { name: 'Andet motiv', exact: true }).click();
  assert.equal(writes, 3);
  await page.getByRole('button', { name: /Alle artikler/ }).click();
  await page.getByRole('heading', { name: 'Vælg en artikel' }).waitFor();
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, widths: [320,390,768,1280], providerCalls: 0, cmsWrites: 0, fixtureResearchRequests: writes,
    checks: ['article navigation','no paid work on open','motif editing','private state restoration','research reused on reload','generate and edit selections','preview and draft save','no auto generation','mobile overflow','44px controls','no page errors'] }));
} finally { await browser.close(); await new Promise(done => server.close(done)); }
