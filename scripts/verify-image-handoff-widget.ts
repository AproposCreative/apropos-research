// Isolated UI/host simulation, not a real ChatGPT approval. No production calls.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { articleWidgetHtml } from '../lib/mcp/article-widget';
const payload = { structuredContent: { submissionId: 'a'.repeat(64), revision: 1, title: 'Illustration til gennemgang',
  article: { title: 'Illustration til gennemgang', featuredImage: 'https://cdn.prod.website-files.com/fixture.png', featuredImageAlt: 'Fixture, ikke redaktionelt billede' },
  status: 'awaiting_preparation', blocks: [{ kind: 'text', text: 'Denne tekst er udelukkende testdata.' }], questions: [], missing: [],
  imageSelection: { required: true, accepted: false, warnings: [{ message: 'Billedet er gemt, men promptoverleveringen er ikke dokumenteret.' }] },
  quote: { provider: { blocked: true }, canAccept: false }, savedSteps: [], handoff: {}, fallbackUrl: 'https://ai.aproposmagazine.com/connect/chatgpt' },
  _meta: { confirmation: { token: 'fixture'.padEnd(43, 'x'), action: 'media', expiresAt: Date.now() + 600000 } as object | null } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080808}iframe{border:0;width:100%;height:1500px}</style><iframe src="/widget"></iframe><script>
window.calls=[];window.result=${JSON.stringify(payload)};
addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'fixture',version:'1'}}},'*');
if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
if(m.method==='ui/notifications/size-changed')document.querySelector('iframe').style.height=m.params.height+'px';
if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_submission_action'){result.structuredContent.imageSelection.required=false;result.structuredContent.imageSelection.accepted=true;result._meta.confirmation=null;}
e.source.postMessage({jsonrpc:'2.0',id:m.id,result:m.params.name==='preview_submission'?result:{content:[{type:'text',text:'{"mediaSelected":true,"publicationApproval":false}'}]}},'*');}});</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/widget' ? articleWidgetHtml : host); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message));
  const png = await readFile('public/images/apropos-ai-icon.png');
  await page.route(/^https:\/\//, route => route.fulfill({ status: 200, contentType: 'image/png', body: png }));
  await page.goto(origin); const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Jeg vælger disse billeder' }).waitFor();
  assert.equal(await frame.locator('#scheduleLabel').isHidden(), true);
  assert.equal(await frame.locator('#imageWarnings').isVisible(), true);
  assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
  assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
  await page.screenshot({ path: 'tmp/image-handoff-mobile.png', fullPage: true });
  await frame.getByRole('button', { name: 'Jeg vælger disse billeder' }).click();
  await frame.getByText('Dit personlige billedvalg er gemt for denne version.', { exact: false }).waitFor();
  assert.equal(await frame.locator('#confirm').isHidden(), true);
  const calls = await page.evaluate(() => (window as any).calls);
  assert.deepEqual(calls.map((call: any) => call.name), ['confirm_submission_action', 'preview_submission']);
  assert.equal(calls[0].arguments.localTime, 'now');
  await page.setViewportSize({ width: 1200, height: 900 });
  await page.screenshot({ path: 'tmp/image-handoff-desktop.png', fullPage: true });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ mobile: 'passed', desktop: 'passed', simulatedMediaChoices: 1, actualApprovals: 0, actualPaidCalls: 0,
    evidence: 'isolated host only; not native ChatGPT or a production human click' }));
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
