// Isolated browser regression of real components. All auth/API/media are fixtures;
// no account, CMS write, personal approval or AI call is made by this test.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import assert from 'node:assert/strict';
const root = process.cwd();
await mkdir('tmp/editorial-reading-ui', { recursive: true });
execFileSync('node_modules/.bin/tailwindcss', ['-i', 'app/globals.css', '-o', 'tmp/editorial-reading-ui/styles.css', '--content', 'app/connect/chatgpt/*.{tsx,ts}'], { stdio: 'pipe' });
const css = await readFile('tmp/editorial-reading-ui/styles.css');
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==', 'base64');
const article = { title: 'Somebody Somewhere: Venskab er ikke en trøstepræmie', subtitle: 'Venskabet skal ikke stå i skyggen.', author: 'Liv Brandt', category: 'Kultur', intro: 'Den gemte indledning.', featuredImage: 'https://fixture.test/cover.png', featuredImageAlt: 'Cover', fotoCredit: 'Foto: HBO', seoTitle: 'SEO-titel', seoDescription: 'Gemt beskrivelse', slug: 'somebody', articleFormat: 'Kommentar', rating: null,
  blocks: [{ kind: 'text', text: 'Dette afsnit skal kunne læses før godkendelse.' }, { kind: 'image', url: 'https://fixture.test/body1.png', alt: 'Første billede', caption: 'Foto: HBO' }, { kind: 'text', text: 'Et venskab', heading: 'h2' }, { kind: 'image', url: 'https://fixture.test/body2.png', alt: 'Andet billede', caption: 'Foto: HBO' }, { kind: 'text', text: 'Den sidste sætning er også bevaret.' }] };
const fixture = { reading: article, row: { status: 'awaiting_preparation', revision: 8, article, questions: [], missingMetadata: [], imageSelection: { required: false, warnings: [] } }, quote: { humanReview: true, canAccept: true, quoteId: 'quote', estimateDkk: 0, ceilingDkkMicros: 0, lines: [], provider: { blocked: true } }, preview: null };
const bundle = await build({ stdin: { contents: `import React from 'react';import{createRoot}from'react-dom/client';import Submission from './app/connect/chatgpt/submission';createRoot(document.getElementById('root')).render(<main style={{maxWidth:896,margin:'auto',padding:20}}><Submission id={'a'.repeat(64)}/></main>);`, resolveDir: root, loader: 'tsx' }, bundle: true, write: false, jsx: 'automatic', platform: 'browser', plugins: [{ name: 'fixture-only', setup(builder) {
  builder.onResolve({ filter: /^(next\/image|next\/link|@\/lib\/auth-context)$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ loader: 'tsx', contents: args.path.endsWith('auth-context') ? `const user={getIdToken:async()=>'fixture-not-a-token'};export const useAuth=()=>({user});` : args.path === 'next/image' ? `import React from 'react';export default function Image({unoptimized,...props}){return <img {...props}/>}` : `import React from 'react';export default function Link(props){return <a {...props}/>}` , resolveDir: root }));
} }] });
const server = createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'application/javascript'); res.end(bundle.outputFiles[0].contents); }
  else if (req.url === '/styles.css') { res.setHeader('Content-Type', 'text/css'); res.end(css); }
  else { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/styles.css"><body style="background:#000;color:white;font-family:Arial,sans-serif"><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, channel: 'chrome' });
try {
  for (const width of [390, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = []; page.on('pageerror', e => errors.push(e.message));
    let data = structuredClone(fixture), posts = 0;
    await page.route('https://fixture.test/**', route => route.fulfill({ contentType: 'image/png', body: png }));
    await page.route('**/api/editorial/submissions**', route => {
      if (route.request().method() !== 'GET') { posts++; return route.fulfill({ status: 409, json: { error: 'fixture_no_writes' } }); }
      return route.fulfill({ json: data });
    });
    await page.goto(origin);
    await page.getByRole('heading', { name: article.title }).waitFor();
    assert(await page.getByText('Den sidste sætning er også bevaret.').isVisible());
    assert.equal(await page.locator('article img').count(), 3);
    assert.equal(await page.locator('article details[open]').count(), 0);
    assert(await page.getByRole('button', { name: 'Godkend og klargør' }).isDisabled());
    await page.getByRole('checkbox').check();
    assert(await page.getByRole('button', { name: 'Godkend og klargør' }).isEnabled());
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
    await page.screenshot({ path: `tmp/editorial-reading-ui/preview-${width}.png`, fullPage: true });
    data = { ...data, dependencyError: 'Genindlæs før godkendelse.' };
    await page.getByRole('button', { name: 'Kontrollér status' }).click();
    await page.getByRole('alert').waitFor(); await page.getByRole('checkbox').check();
    assert(await page.getByRole('button', { name: 'Godkend og klargør' }).isDisabled());
    assert.equal(posts, 0); assert.deepEqual(errors, []);
    console.log(JSON.stringify({ width, fullArticleBeforeApproval: true, images: 3, noOverflow: true, dependencyBlocksApproval: true, writes: posts }));
    await page.close();
  }
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
