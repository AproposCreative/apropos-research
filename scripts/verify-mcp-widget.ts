// Isolated browser/host protocol fixture; never calls production, AI or CMS.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { articleWidgetHtml } from '../lib/mcp/article-widget';

const article = { title: 'En koncert, man tager med hjem', subtitle: 'En konkret vurdering af aftenen.',
  intro: 'Bandet spillede fredag. Her er vores anmeldelse.', author: 'Milo', category: 'Musik',
  featuredImage: 'https://cdn.prod.website-files.com/fixture/cover.png', featuredImageAlt: 'Testcover', fotoCredit: 'Fixture, ikke pressefoto' };
const payload = { structuredContent: { submissionId: 'a'.repeat(64), revision: 1, title: article.title, article,
  blocks: [{ kind: 'text', text: 'Første afsnit med en konkret observation.' }, { kind: 'image', url: 'https://cdn.prod.website-files.com/fixture/body.png', alt: 'Testbillede', caption: 'Testdata' }, { kind: 'text', text: 'Sidste afsnit skal også kunne læses på mobilen.' }],
  status: 'awaiting_preparation', questions: [], missing: [], handoff: { submissionId: 'a'.repeat(64) }, savedSteps: [],
  quote: { estimateDkk: 2.4, ceilingDkkMicros: 5_200_000, provider: { blocked: false } },
  fallbackUrl: 'https://ai.aproposmagazine.com/connect/chatgpt' },
  _meta: { confirmation: { token: 'a'.repeat(43), action: 'checks', expiresAt: Date.now() + 600_000 } } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080808}iframe{border:0;width:100%;height:1500px}</style><iframe src="/widget"></iframe><script>
window.calls=[];window.result=${JSON.stringify(payload)};
window.addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
 if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'fixture',version:'1'}}},'*');
 if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
 if(m.method==='ui/notifications/size-changed')document.querySelector('iframe').style.height=m.params.height+'px';
 if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_submission_action'){result.structuredContent.status='processing';result._meta.confirmation=null;}
 const answer=m.params.name==='preview_submission'?result:{content:[{type:'text',text:'{"ok":true}'}]};
 e.source.postMessage({jsonrpc:'2.0',id:m.id,result:answer},'*');}
});</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/widget' ? articleWidgetHtml : host); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  page.on('requestfailed', r => console.error('fixture_request_failed', r.url(), r.failure()?.errorText));
  const png = await readFile('public/images/apropos-ai-icon.png');
  await page.route(/^https:\/\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.goto(`http://127.0.0.1:${port}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: article.title }).waitFor();
  assert.equal(await frame.getByText('Sidste afsnit skal også kunne læses på mobilen.').count(), 1);
  assert.equal(await page.evaluate(() => (window as any).calls.length), 0, 'opening the preview must never accept or buy');
  assert.equal(await frame.locator('#settings').isHidden(), true);
  assert.equal(await frame.locator('#scheduleLabel').isHidden(), true);
  assert.equal(await frame.locator('#dateLabel').isHidden(), true);
  await frame.getByRole('button', { name: 'Detaljer og indstillinger' }).click();
  assert.equal(await frame.locator('#settings').isVisible(), true);
  await frame.getByRole('button', { name: 'Detaljer og indstillinger' }).click();
  await page.screenshot({ path: '/tmp/apropos-mcp-widget-mobile.png', fullPage: true });
  await frame.getByRole('button', { name: 'Acceptér pris og kør slutkontroller' }).click();
  await frame.getByText('Slutkontroller er sat i kø').waitFor();
  const calls = await page.evaluate(() => (window as any).calls);
  assert.deepEqual(calls.map((c: any) => c.name), ['confirm_submission_action', 'preview_submission']);
  assert.equal(await frame.locator('#confirm').isHidden(), true);
  assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.screenshot({ path: '/tmp/apropos-mcp-widget-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ mobile: 'passed', desktop: 'passed', approvalCalls: 1, publicationCalls: 0, actualPaidAiCalls: 0,
    evidence: 'isolated simulated host, not ChatGPT mobile acceptance', screenshots: ['/tmp/apropos-mcp-widget-mobile.png', '/tmp/apropos-mcp-widget-desktop.png'] }));
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
