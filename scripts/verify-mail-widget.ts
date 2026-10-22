/** Local fake-host browser tests. No real mailbox, approval token, API or SMTP. */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { chromium } from 'playwright';
import { mailWidgetHtml } from '../lib/mcp/mail-widget';
import {currentSignature,applySignature} from '../lib/editorial-mail/signature';
const signature=await currentSignature('frederik');
const signed=applySignature('Hej Alex,\n\nTak for din mail. Send gerne mere materiale.',signature);
const payload = { structuredContent: { draftId: 'a'.repeat(64), revision: 1, contentHash: 'b'.repeat(64), status: 'draft',
  fromName: 'Frederik Kragh', from: 'frederik@aproposmagazine.com', to: 'press@example.test', subject: 'Re: Pressehenvendelse',
  body: 'Hi Alex,\n\nThanks for getting in touch. Please send the details and we will take a look.\n\nBest,\nFrederik Kragh\nApropos Magazine',
  source: { fromName: 'Press', from: 'press@example.test', body: '<img src="https://example.test/track" onerror="alert(1)">\nUntrusted mail text', replyToDiffers: false },
  updatedAt: new Date(Date.now() - 2000).toISOString(), previewReadAt: new Date(Date.now() - 1000).toISOString() },
  _meta: { confirmation: { token: 'FIXTURE-NOT-REAL'.padEnd(43, 'x'), expiresAt: Date.now() + 600000 } } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{border:0;width:100%;height:1300px}</style><iframe src="/widget"></iframe><script>
window.calls=[];window.result=${JSON.stringify(payload)};const mode=new URL(location.href).searchParams.get('mode');
if(mode==='expired')result._meta.confirmation.expiresAt=1;if(mode==='missing-token')result._meta={};
if(mode==='v2')Object.assign(result.structuredContent,${JSON.stringify(signed)},{cc:[],bcc:[]});
window.addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{protocolVersion:'2026-01-26',hostCapabilities:{},hostInfo:{name:'fixture',version:'1'}}},'*');
if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
if(m.method==='ui/notifications/size-changed')document.querySelector('iframe').style.height=m.params.height+'px';
if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_editorial_reply'){
result._meta.confirmation=null;result.structuredContent.status=mode==='unknown'?'unconfirmed':'accepted';result.structuredContent.receipt={acceptedBySmtp:true,acceptedAt:new Date().toISOString(),sentCopyArchived:true,sentFolderSync:{status:'verified',folder:'INBOX.Sent Messages'}};
if(mode==='lost-ack')return;
if(mode==='rejected'){result.structuredContent.status='draft';e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{isError:true}},'*');return;}}
if(m.params.name==='preview_editorial_reply')result.structuredContent.previewReadAt=new Date().toISOString();
if(m.params.name==='save_editorial_reply'){Object.assign(result.structuredContent,m.params.arguments,{bodyText:m.params.arguments.body,revision:2,contentHash:'c'.repeat(64),updatedAt:new Date().toISOString(),previewReadAt:new Date().toISOString()});result._meta.confirmation={token:'fixture-new-token'.padEnd(43,'x'),expiresAt:Date.now()+600000};}
e.source.postMessage({jsonrpc:'2.0',id:m.id,result:result},'*');}});</script>`;
const csp = (html: string) => `default-src 'none'; script-src ${[...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map(m => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`).join(' ')}; style-src 'unsafe-inline'; frame-src 'self'; img-src https://ai.aproposmagazine.com; connect-src 'none'; base-uri 'none'; form-action 'none'`;
const server = createServer((req, res) => { const html = req.url === '/widget' ? mailWidgetHtml : host; res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.setHeader('Content-Security-Policy', csp(html)); res.end(html); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ ...(process.env.MCP_TEST_BROWSER_CHANNEL ? { channel: process.env.MCP_TEST_BROWSER_CHANNEL } : {}), headless: true });
try {
  for (const mode of ['normal', 'lost-ack', 'unknown', 'rejected', 'expired', 'missing-token','v2']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }); const errors: string[] = [], external: string[] = [];
    page.on('pageerror', e => errors.push(e.message)); page.on('request', r => { if (!r.url().startsWith('http://127.0.0.1')) external.push(r.url()); });
    await page.clock.install(); await page.goto(`http://127.0.0.1:${(server.address() as any).port}?mode=${mode}`);
    const frame = page.frameLocator('iframe'); await frame.locator('#body').getByText(mode==='v2'?'Tak for din mail.':'Thanks for getting in touch.', { exact: false }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
    assert.equal(await frame.locator('#body').textContent(), mode==='v2'?signed.bodyText:payload.structuredContent.body);
    assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= window.innerWidth), true);
    await frame.getByText('Se den oprindelige mail', { exact: true }).click(); assert.equal(await frame.locator('#source img').count(), 0);
    const send = frame.getByRole('button', { name: 'Godkend og send' });
    if(mode==='v2'){
      await frame.frameLocator('#signature').getByAltText('Apropos Magazine').waitFor();
      await frame.getByRole('button',{name:'Redigér',exact:true}).click();assert.equal(await send.isDisabled(),true);
      await frame.locator('#editBcc').fill('private@example.test');await frame.locator('#editCc').fill('copy@example.test');await frame.getByRole('button',{name:'Gem og vis nyt preview'}).click();
      await frame.locator('#bcc').getByText('private@example.test').waitFor();assert.equal(await frame.locator('#cc').textContent(),'copy@example.test');
      assert.equal(await frame.locator('#from').textContent(),'Frederik Kragh <frederik@aproposmagazine.com>');
      await page.screenshot({path:'/tmp/apropos-mail-v2-mobile.png',fullPage:true});
      await page.setViewportSize({width:1100,height:1000});await page.screenshot({path:'/tmp/apropos-mail-v2-desktop.png',fullPage:true});
    }
    if (mode === 'expired' || mode === 'missing-token') { assert.equal(await send.isDisabled(), true); await page.close(); continue; }
    if (mode === 'normal') { await page.screenshot({ path: '/tmp/apropos-mail-mobile.png', fullPage: true }); await page.setViewportSize({ width: 1100, height: 900 }); await page.screenshot({ path: '/tmp/apropos-mail-desktop.png', fullPage: true }); }
    await send.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
    if (mode === 'lost-ack') { await page.clock.runFor(94100); }
    if (['normal', 'lost-ack','v2'].includes(mode)) await frame.getByRole('heading', { name: 'Dit svar er afsendt' }).waitFor();
    if (mode === 'unknown') await frame.getByText('Afsendelsen kunne ikke bekræftes.', { exact: false }).waitFor();
    if (mode === 'rejected') await frame.getByText('Handlingen kunne ikke bekræftes.', { exact: false }).waitFor();
    assert.equal(await send.isDisabled(), true); assert.equal(await page.evaluate(() => (window as any).calls.filter((x: any) => x.name === 'confirm_editorial_reply').length), 1);
    if (mode !== 'rejected') { await page.evaluate(stale => document.querySelector('iframe')!.contentWindow!.postMessage({ jsonrpc: '2.0', method: 'ui/notifications/tool-result', params: stale }, '*'), payload); await page.clock.runFor(10); assert.equal(await send.isDisabled(), true); }
    assert.deepEqual(errors, []); assert.equal(external.every(url=>mode==='v2'&&url===signature.logoUrl),true); await page.close(); console.log('PASS mail widget: '+mode);
  }
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
