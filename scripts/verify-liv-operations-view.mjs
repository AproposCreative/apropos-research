// Isolated real-component browser verification. Never connects to production.
import { build } from 'esbuild';
import { chromium } from 'playwright';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { resolve } from 'node:path';
import assert from 'node:assert/strict';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const root = process.cwd(), require = createRequire(import.meta.url);
const config = require('../tailwind.config.cjs');
const css = (await postcss([tailwind({ ...config, content: [resolve(root, 'app/ai/liv/LivOperations.tsx')] })])
  .process(await readFile('app/globals.css', 'utf8'), { from: resolve(root, 'app/globals.css') })).css;
const bundle = await build({ stdin: { contents: `import React from 'react';
import {createRoot} from 'react-dom/client';
import LivOperations from './app/ai/liv/LivOperations';
createRoot(document.getElementById('root')).render(<LivOperations/>);`,
  resolveDir: root, loader: 'tsx' }, bundle: true, write: false, platform: 'browser', jsx: 'automatic',
  define: { 'process.env.NODE_ENV': '"production"' },
  plugins: [{ name: 'isolated-auth', setup(b) {
    b.onResolve({ filter: /^@\/lib\/auth-context$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents:
      `const user={getIdToken:async()=>"not-a-real-token"};export const useAuth=()=>({user});` }));
  } }], alias: { '@': root } });
const html = `<!doctype html><html lang="da"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<link rel="stylesheet" href="/style.css"><style>body{background:#000;color:#fff;font-family:Arial,sans-serif;margin:0;padding:20px}main{max-width:720px;margin:auto}</style>
<main id="root"></main><script type="module" src="/bundle.js"></script></html>`;
const server = createServer((req, res) => {
  const assets = { '/': ['text/html', html], '/bundle.js': ['text/javascript', bundle.outputFiles[0].text], '/style.css': ['text/css', css] };
  const asset = assets[req.url];
  if (!asset) { res.writeHead(404); res.end(); return; }
  res.setHeader('Content-Type', asset[0]); res.end(asset[1]);
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
const directory = resolve(root, 'tmp/liv-operations-visual');
await mkdir(directory, { recursive: true });
let browser;
try {
  browser = await chromium.launch({ headless: true, channel: 'chrome' });
  for (const viewport of [{ width: 390, height: 844 }, { width: 1280, height: 900 }]) {
    for (const scenario of ['known', 'unknown', 'unavailable', 'error']) {
      const context = await browser.newContext({ viewport });
      let calls = 0; const errors = [], external = [];
      await context.route('**/*', async route => {
        const request = route.request();
        if (!request.url().startsWith(origin + '/')) { external.push(request.url()); await route.abort(); return; }
        if (new URL(request.url()).pathname !== '/api/editorial/operations') { await route.continue(); return; }
        assert.equal(request.method(), 'GET'); calls++;
        const value = { checkedAt: '2026-09-13T16:00:00Z',
          liv: { available: true, data: { autoPublishEnabled: true, published: true, overdue: false, blockedItems: [], needsReconciliation: false } },
          newsletter: { available: true, data: { enabled: true, status: 'sent', week: '2026-W37', sentCount: 14, failedCount: 0 } },
          budget: scenario === 'unavailable' ? { available: false } : { available: true,
            data: { usageBasedUpperDkk: scenario === 'unknown' ? null : 46.63, monthlyLimitDkk: 300, fullMonthlyCapVerified: false } } };
        await route.fulfill({ status: scenario === 'error' ? 503 : 200, contentType: 'application/json', body: JSON.stringify(value) });
      });
      const page = await context.newPage(); page.on('pageerror', error => errors.push(error.message));
      await page.goto(origin);
      const expected = scenario === 'error' ? 'Driftsstatus kunne ikke hentes.' : scenario === 'unknown'
        ? 'Registreret forbrug er endnu ukendt.' : scenario === 'unavailable' ? 'Status utilgængelig' : '46,63 kr. registreret af 300 kr.';
      await page.getByText(expected, { exact: true }).waitFor();
      assert.equal(calls, 1);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false);
      await page.getByRole('button', { name: 'Opdater', exact: true }).click();
      await page.getByText(expected, { exact: true }).waitFor();
      assert.equal(calls, 2); assert.deepEqual(errors, []); assert.deepEqual(external, []);
      const screenshot = `${directory}/${viewport.width}-${scenario}.png`;
      await page.screenshot({ path: screenshot, fullPage: true });
      console.log(JSON.stringify({ viewport: viewport.width, scenario, calls, errors: errors.length, horizontalOverflow: false, screenshot }));
      await context.close();
    }
  }
} finally {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
}
