/** Local fake-host browser tests. No real mailbox, approval token, API or SMTP. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { accreditationWidgetHtml as mailWidgetHtml } from '../lib/mcp/accreditation-widget';
const payload = { structuredContent: { draftId: 'a'.repeat(64), revision: 1, contentHash: 'b'.repeat(64), status: 'draft',
  event: { artist: 'Fixture Band', venue: 'Koncertsal', date: '2027-05-20', ticketQuantity: 1, applicants: [{ name: 'Frederik' }], accessRequested: 'Presseadgang' }, attachments: [{ filename: 'Billet.pdf' }], fromName: 'Liv Brandt', from: 'liv@aproposmagazine.com', to: 'press@example.test', subject: 'Re: Pressehenvendelse',
  body: 'Hi Alex,\n\nThanks for getting in touch. Please send the details and we will take a look.\n\nBest,\nFrederik Kragh\nApropos Magazine',
  source: { fromName: 'Press', from: 'press@example.test', body: '<img src="https://example.test/track" onerror="alert(1)">\nUntrusted mail text', replyToDiffers: false },
  updatedAt: new Date(Date.now() - 2000).toISOString(), previewReadAt: new Date(Date.now() - 1000).toISOString() },
  _meta: { confirmation: { token: 'FIXTURE-NOT-REAL'.padEnd(43, 'x'), expiresAt: Date.now() + 600000 } } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:100%;height:1300px}</style><iframe src="/widget"></iframe><script>
window.calls=[];window.result=${JSON.stringify(payload)};const mode=new URL(location.href).searchParams.get('mode');
if(mode==='expired')result._meta.confirmation.expiresAt=1;if(mode==='missing-token')result._meta={};
window.addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'fixture',version:'1'}}},'*');
if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
if(m.method==='ui/notifications/size-changed')document.querySelector('iframe').style.height=m.params.height+'px';
if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_accreditation_draft'){
result._meta.confirmation=null;result.structuredContent.status=mode==='unknown'?'unconfirmed':'accepted';result.structuredContent.receipt={sentCopyArchived:true};
if(mode==='lost-ack')return;
if(mode==='rejected'){result.structuredContent.status='draft';e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{isError:true}},'*');return;}}
if(m.params.name==='preview_accreditation_draft')result.structuredContent.previewReadAt=new Date().toISOString();
e.source.postMessage({jsonrpc:'2.0',id:m.id,result:result},'*');}});</script>`;
const csp = (html: string) => `default-src 'none'; script-src ${[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ')}; style-src 'unsafe-inline'; frame-src 'self'; connect-src 'none'; base-uri 'none'; form-action 'none'`;
const server = createServer((req, res) => { const html = req.url === '/widget' ? mailWidgetHtml : host; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', csp(html)); res.end(html); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ ...(process.env.MCP_TEST_BROWSER_CHANNEL ? { channel: process.env.MCP_TEST_BROWSER_CHANNEL } : {}), headless: true });
try {
  for (const mode of ['normal', 'lost-ack', 'unknown', 'rejected', 'expired', 'missing-token']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors: string[] = [], external: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });
    await page.clock.install(); await page.goto(`http://127.0.0.1:${(server.address() as any).port}?mode=${mode}`);
    const frame = page.frameLocator('iframe'); await frame.locator('#body').getByText('Thanks for getting in touch.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
    assert.equal(await frame.locator('#body').textContent(), payload.structuredContent.body);
    assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
    assert.equal(await frame.locator('#event').textContent().then(x => x?.includes('Fixture Band')), true); assert.equal(await frame.locator('#assets').textContent().then(x => x?.includes('Billet.pdf')), true); assert.equal(await frame.locator('#source img').count(), 0);
    const send = frame.getByRole('button', { name: 'Godkend og send' });
    if (mode === 'expired' || mode === 'missing-token') { assert.equal(await send.isDisabled(), true); await page.close(); continue; }
    if (mode === 'normal') { await page.screenshot({ path: '/tmp/apropos-accreditation-mobile.png', fullPage: true }); await page.setViewportSize({ width: 1100, height: 900 }); await page.screenshot({ path: '/tmp/apropos-accreditation-desktop.png', fullPage: true }); }
    await send.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    if (mode === 'lost-ack') { await page.clock.runFor(90100); await frame.getByRole('button', { name: 'Opdatér status' }).click(); }
    if (['normal', 'lost-ack'].includes(mode)) await frame.getByRole('heading', { name: 'Din akkrediteringsmail er afsendt' }).waitFor();
    if (mode === 'unknown') await frame.getByText('Afsendelsen kunne ikke bekræftes.', { exact: false }).waitFor();
    if (mode === 'rejected') await frame.getByText('Handlingen kunne ikke bekræftes.', { exact: false }).waitFor();
    assert.equal(await send.isDisabled(), true); assert.equal(await page.evaluate(() => (window as any).calls.filter((x: any) => x.name === 'confirm_accreditation_draft').length), 1);
    if (mode !== 'rejected') { await page.evaluate(stale => document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: stale }, '*'), payload); await page.clock.runFor(10); assert.equal(await send.isDisabled(), true); }
    assert.deepEqual(errors, []); assert.deepEqual(external, []); await page.close(); console.log('PASS accreditation widget: '+mode);
  }
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
