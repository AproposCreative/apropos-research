// Isolated host fixture. No real consent, production request, generation or CMS.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { articleWidgetHtml } from '../lib/mcp/article-widget';
const thumb = 'data:image/webp;base64,' + (await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#334477' } }).webp().toBuffer()).toString('base64');
const id = 'a'.repeat(64), assetId = 'b'.repeat(64);
const payload = { structuredContent: { submissionId: id, revision: 2, previewReadAt: '2026-10-14T16:00:00Z', title: 'Privat billedtest',
  article: { title: 'Privat billedtest', content: '<p>Uændret tekst</p>' }, blocks: [{ kind: 'text', text: 'Uændret tekst' }],
  status: 'awaiting_preparation', questions: [], missing: ['cover', 'body-1', 'body-2'], savedSteps: [], handoff: {},
  imageCandidates: [{ assetId, originalHash: 'c'.repeat(64), role: 'cover', alt: 'Isoleret fixture', current: true, selected: false }],
  fallbackUrl: 'https://ai.aproposmagazine.com/connect/chatgpt' },
  _meta: { candidatePreviews: { [assetId]: thumb }, confirmation: { token: 'x'.repeat(43), action: 'image_candidate', expiresAt: Date.now() + 600000 } } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:1800px;border:0}</style><iframe src="/widget"></iframe><script>
window.result=${JSON.stringify(payload)};window.calls=[];
if(location.search.includes('missing')) result._meta.candidatePreviews={};
addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');
if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_submission_action'){result.structuredContent.revision=3;result.structuredContent.imageCandidates=[];result._meta.confirmation=null;}
e.source.postMessage({jsonrpc:'2.0',id:m.id,result:m.params.name==='preview_submission'?result:{content:[{type:'text',text:'{}'}]}},'*');}});
</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/widget' ? articleWidgetHtml : host); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  for (const mode of ['normal', 'missing']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\//, r => r.fulfill({ status: 404, body: '' }));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}?${mode}`);
    const frame = page.frameLocator('iframe');
    await frame.getByText('Privat coverforslag · ikke tilknyttet artiklen.').waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
    assert.equal(await frame.locator('#cover img').count(), 0);
    assert.equal(await frame.locator('#scheduleLabel').isHidden(), true);
    assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    if (mode === 'missing') assert.equal(await frame.locator('#confirm').isHidden(), true);
    else {
      await page.screenshot({ path: 'tmp/image-candidate-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.screenshot({ path: 'tmp/image-candidate-desktop.png', fullPage: true });
      await frame.getByRole('button', { name: 'Brug dette billede' }).evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
      await frame.getByText('Version 3 · Klar til gennemlæsning').waitFor();
      assert.deepEqual(await page.evaluate(() => (window as any).calls.map((c: any) => c.name)), ['confirm_submission_action', 'preview_submission']);
      assert.equal(await frame.locator('#confirm').isHidden(), true);
    }
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(JSON.stringify({ mobile: 'passed', desktop: 'passed', missingPixelsBlocked: true, doubleClickWrites: 1,
    actualApprovals: 0, actualCmsWrites: 0, actualGenerations: 0, host: 'isolated simulation' }));
} finally { await browser.close(); await new Promise<void>(resolve => server.close(() => resolve())); }
