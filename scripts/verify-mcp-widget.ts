// Isolated browser/host protocol fixture; never calls production, AI or CMS.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { chromium } from 'playwright';
import { articleWidgetHtml } from '../lib/mcp/article-widget';
import { ARTICLE_WIDGET_CSP } from '../lib/mcp/widget-policy';

const article = { title: 'En koncert, man tager med hjem', subtitle: 'En konkret vurdering af aftenen.',
  intro: 'Bandet spillede fredag. Her er vores anmeldelse.', author: 'Milo', category: 'Musik',
  featuredImage: 'https://cdn.prod.website-files.com/fixture/cover.png', featuredImageAlt: 'Testcover', fotoCredit: 'Fixture, ikke pressefoto' };
const payload = { structuredContent: { submissionId: 'a'.repeat(64), revision: 1, title: article.title, article,
  blocks: [{ kind: 'text', text: 'Første afsnit med en konkret observation.' }, { kind: 'image', url: 'https://cdn.prod.website-files.com/fixture/body.png', alt: 'Testbillede', caption: 'Testdata' }, { kind: 'text', text: 'Sidste afsnit skal også kunne læses på mobilen.' }],
  status: 'awaiting_preparation', previewReadAt: '2026-10-13T10:00:00Z', questions: [], missing: [], handoff: { submissionId: 'a'.repeat(64) }, savedSteps: [],
  consent: { includesPersonalImageSelection: false },
  quote: { humanReview: true, estimateDkk: 0, ceilingDkkMicros: 0, provider: { blocked: true } },
  fallbackUrl: 'https://ai.aproposmagazine.com/connect/chatgpt' },
  _meta: { confirmation: { token: 'a'.repeat(43), action: 'approve_publish', expiresAt: Date.now() + 600_000 } } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0;background:#080808}iframe{border:0;width:100%;height:1500px}</style><iframe src="/widget"></iframe><script>
window.calls=[];window.result=${JSON.stringify(payload)};let readbacks=0;const mode=new URL(location.href).searchParams.get('mode');
window.addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
 if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'fixture',version:'1'}}},'*');
 if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
 if(m.method==='ui/notifications/size-changed')document.querySelector('iframe').style.height=m.params.height+'px';
 if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_submission_action'){
 result._meta.confirmation=null;
 if(mode==='rejected'){result.structuredContent.status='blocked';result.structuredContent.blocker='Versionen er ændret. Hent nyt preview.';e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{isError:true}},'*');return;}
 result.structuredContent.status='processing';result.structuredContent.singleApproval=true;if(mode==='lost-ack')return;}
 if(m.params.name==='preview_submission'){result.structuredContent.previewReadAt=new Date().toISOString();if(++readbacks>=2&&result.structuredContent.status==='processing'){result.structuredContent.status='published';result.structuredContent.publicationVerified=true;result.structuredContent.publicUrl='https://www.aproposmagazine.com/fixture-only';}}
 const answer=m.params.name==='preview_submission'?result:{content:[{type:'text',text:'{"ok":true}'}]};
 e.source.postMessage({jsonrpc:'2.0',id:m.id,result:answer},'*');}
});</script>`;
// Enforced local approximation of the host CSP using the real resource allowlist.
// Static script hashes only: no bypassCSP, unsafe-eval or remote API access.
function csp(html: string) {
  const hashes = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);
  return `default-src 'none'; script-src ${hashes.join(' ')}; style-src 'unsafe-inline'; img-src data: ${ARTICLE_WIDGET_CSP.resourceDomains.join(' ')}; connect-src ${ARTICLE_WIDGET_CSP.connectDomains.join(' ') || "'none'"}; frame-src 'self'; base-uri 'none'; form-action 'none'`;
}
const server = createServer((req, res) => { const html = req.url === '/widget' ? articleWidgetHtml : host;
  res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', csp(html)); res.end(html); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const port = (server.address() as { port: number }).port;
const browser = await chromium.launch({ ...(process.env.MCP_TEST_BROWSER_CHANNEL ? { channel: process.env.MCP_TEST_BROWSER_CHANNEL } : {}), headless: true });
const passed: string[] = [];
try {
 for (const mode of ['normal', 'lost-ack', 'rejected', 'broken-image']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message));
  const requests: string[] = [];
  await page.addInitScript(() => { (window as any).violations = []; document.addEventListener('securitypolicyviolation', e => (window as any).violations.push(e.effectiveDirective)); });
  const png = await readFile('public/images/apropos-ai-icon.png');
  await page.route(/^https:\/\//, route => { requests.push(route.request().url()); return route.fulfill({ status: mode === 'broken-image' ? 404 : 200, contentType: 'image/png', body: mode === 'broken-image' ? Buffer.alloc(0) : png }); });
  await page.clock.install();
  await page.goto(`http://127.0.0.1:${port}?mode=${mode}`);
  const frame = page.frameLocator('iframe');
  await frame.getByRole('heading', { name: article.title }).waitFor();
  const iframe = page.frames().find(f => f.url().endsWith('/widget'))!;
  assert.equal(await frame.getByText('Sidste afsnit skal også kunne læses på mobilen.').count(), 1);
  assert.equal(await page.evaluate(() => (window as any).calls.length), 0, 'opening the preview must never accept or buy');
  assert.equal(await frame.locator('#settings').isHidden(), true);
  if (mode !== 'broken-image') assert.equal(await frame.locator('#scheduleLabel').isVisible(), true);
  assert.equal(await frame.locator('#dateLabel').isHidden(), true);
  await frame.getByRole('button', { name: 'Detaljer og indstillinger' }).click();
  assert.equal(await frame.locator('#settings').isVisible(), true);
  await frame.getByRole('button', { name: 'Detaljer og indstillinger' }).click();
  if (mode === 'normal') await page.screenshot({ path: '/tmp/apropos-mcp-widget-mobile.png', fullPage: true });
  assert.equal(await frame.getByRole('link', { name: 'Åbn eksternt' }).isVisible(), true);
  assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
  await page.setViewportSize({ width: 1200, height: 900 });
  if (mode === 'normal') await page.screenshot({ path: '/tmp/apropos-mcp-widget-desktop.png', fullPage: true });
  if (mode === 'broken-image') {
    await frame.getByText('Et billede kunne ikke vises. Opdatér preview før godkendelse.').waitFor();
    assert.equal(await frame.locator('#confirm').isHidden(), true);
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
  } else {
  assert.deepEqual(await iframe.evaluate(() => (window as any).violations), []);
  // Synchronous double click proves the busy guard prevents a second write.
  await frame.locator('#approve').evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
  if (mode === 'lost-ack') await page.clock.runFor(20_100);
  if (mode === 'rejected') {
    await frame.getByText('Versionen er ændret. Hent nyt preview.', { exact: true }).waitFor();
    assert.equal(await frame.locator('#confirm').isHidden(), true);
    assert.equal(await frame.locator('#live').isHidden(), true);
  } else {
  await frame.getByText('Version 1 · Godkendelsen er gemt · serveren klargør artiklen', { exact: true }).waitFor();
  assert.equal(await frame.locator('#confirm').isHidden(), true);
  await page.clock.runFor(10_100);
  await frame.getByRole('link', { name: 'Læs den udgivne artikel' }).waitFor();
  await page.evaluate(stale => { document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: stale }, '*'); }, payload);
  await page.clock.runFor(10);
  assert.equal(await frame.locator('#confirm').isHidden(), true, 'stale notification must not restore approval');
  assert.equal(await frame.locator('#status').textContent(), 'Version 1 · Publiceret og verificeret på livesiden');
  }
  const calls = await page.evaluate(() => (window as any).calls);
  assert.equal(calls.filter((c: any) => c.name === 'confirm_submission_action').length, 1);
  assert.ok(calls.filter((c: any) => c.name === 'preview_submission').length >= (mode === 'rejected' ? 1 : 2), 'readback after write/timeout without a second click/message');
  }
  assert.deepEqual(errors, []);
  // Negative control demonstrates that CSP really is on; no network leaves fixture.
  assert.equal(await iframe.evaluate(async () => { try { await fetch('https://forbidden.example/private'); return false; } catch { return true; } }), true);
  await iframe.waitForFunction(() => (window as any).violations.includes('connect-src'));
  assert.ok((await iframe.evaluate(() => (window as any).violations)).includes('connect-src'));
  assert.ok(requests.every(url => ARTICLE_WIDGET_CSP.resourceDomains.some(origin => url.startsWith(origin + '/'))));
  passed.push(mode); await page.close();
 }
  console.log(JSON.stringify({ passed, cspEnforced: true, mobile: 'passed', desktop: 'passed', simulatedPublicReadback: true, actualExternalRequests: 0, actualPublicationCalls: 0, actualPaidAiCalls: 0,
    evidence: 'isolated simulated host, not ChatGPT mobile acceptance', screenshots: ['/tmp/apropos-mcp-widget-mobile.png', '/tmp/apropos-mcp-widget-desktop.png'] }));
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
