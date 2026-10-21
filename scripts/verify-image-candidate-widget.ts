// Isolated host fixture. No real consent, production request, generation or CMS.
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import sharp from 'sharp';
import { articleWidgetHtml } from '../lib/mcp/article-widget';
import { EXISTING_COVER_AUTHORIZATION } from '../lib/editorial/existing-cover-authorization';
const thumb = 'data:image/webp;base64,' + (await sharp({ create: { width: 1200, height: 800, channels: 3, background: '#334477' } }).webp().toBuffer()).toString('base64');
const id = 'a'.repeat(64), assetId = 'b'.repeat(64);
const payload = { structuredContent: { submissionId: id, revision: 2, previewReadAt: '2026-10-14T16:00:00Z', title: 'Privat billedtest',
  article: { title: 'Privat billedtest', content: '<p>Uændret tekst</p>' }, blocks: [{ kind: 'text', text: 'Uændret tekst' }],
  status: 'awaiting_preparation', questions: [], missing: ['cover', 'body-1', 'body-2'], savedSteps: [], handoff: {},
  imageCandidates: [{ assetId, originalHash: 'c'.repeat(64), role: 'cover', alt: 'Isoleret fixture', current: true, selected: false,
    historyWarning: EXISTING_COVER_AUTHORIZATION.warning }],
  fallbackUrl: 'https://ai.aproposmagazine.com/connect/chatgpt' },
  _meta: { candidatePreviews: { [assetId]: thumb }, confirmation: { token: 'x'.repeat(43), action: 'image_candidate', canDecline: true, expiresAt: Date.now() + 600000 } } };
const host = `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:0}iframe{width:100%;height:1800px;border:0}</style><iframe src="/widget"></iframe><script>
window.result=${JSON.stringify(payload)};window.calls=[];
if(location.search.includes('multiple')){
 result.structuredContent.imageCandidates.push({assetId:'d'.repeat(64),originalHash:'e'.repeat(64),role:'body',alt:'Andet billede',current:true,selected:false},{assetId:'f'.repeat(64),originalHash:'1'.repeat(64),role:'body',alt:'Tredje billede',current:true,selected:false});
 result._meta.candidatePreviews['d'.repeat(64)]=result._meta.candidatePreviews['${assetId}'];result._meta.candidatePreviews['f'.repeat(64)]=result._meta.candidatePreviews['${assetId}'];
 result._meta.candidateConfirmations=Object.fromEntries(result.structuredContent.imageCandidates.map((c,i)=>[c.assetId,{token:String(i+1).repeat(43),action:'image_candidate',canDecline:true,expiresAt:Date.now()+600000}]));
}
if(location.search.includes('missing')) result._meta.candidatePreviews={};
if(location.search.includes('legacy')) delete result._meta.confirmation.canDecline;
addEventListener('message',e=>{if(e.source!==document.querySelector('iframe').contentWindow)return;const m=e.data;
if(m.method==='ui/initialize')e.source.postMessage({jsonrpc:'2.0',id:m.id,result:{}},'*');
if(m.method==='ui/notifications/initialized')e.source.postMessage({jsonrpc:'2.0',method:'ui/notifications/tool-result',params:result},'*');
if(m.method==='tools/call'){calls.push(m.params);if(m.params.name==='confirm_submission_action'){
const declined=m.params.arguments.imageDecision==='decline';
const chosen=result.structuredContent.imageCandidates.find(c=>(result._meta.candidateConfirmations?.[c.assetId]||result._meta.confirmation)?.token===m.params.arguments.token);
if(!chosen||chosen.originalHash!==m.params.arguments.displayedImageHash)throw Error('Wrong candidate receipt');
if(!declined)result.structuredContent.revision++;result.structuredContent.previewReadAt=new Date().toISOString();
if(declined)result.structuredContent.imageDeclines=[{assetId:chosen.assetId,originalHash:chosen.originalHash,originalPreserved:true,automaticRetryAllowed:false}];
else {result.structuredContent.imageSelection||={items:[]};result.structuredContent.imageSelection.items.push({assetId:chosen.assetId,hash:chosen.originalHash});}
result.structuredContent.imageCandidates=result.structuredContent.imageCandidates.filter(c=>c.assetId!==chosen.assetId);result._meta.confirmation=null;
if(location.search.includes('lost-reply')){e.source.postMessage({jsonrpc:'2.0',id:m.id,error:{code:-32603,message:'Lost response fixture'}},'*');return;}}
e.source.postMessage({jsonrpc:'2.0',id:m.id,result:m.params.name==='preview_submission'?result:{content:[{type:'text',text:'{}'}]}},'*');}});
</script>`;
const server = createServer((req, res) => { res.setHeader('Content-Type', 'text/html; charset=utf-8'); res.end(req.url === '/widget' ? articleWidgetHtml : host); });
await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
try {
  await mkdir('output/individual-image-review',{recursive:true});
  for (const mode of ['normal', 'missing', 'legacy', 'decline', 'decline-lost-reply', 'select-lost-reply', 'multiple']) {
    console.log('Checking widget:', mode);
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } }), errors: string[] = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.route(/^https:\/\//, r => r.fulfill({ status: 404, body: '' }));
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}?${mode}`);
    const frame = page.frameLocator('iframe');
    await frame.getByRole('heading',{name:'Vælg billeder til artiklen'}).waitFor();
    await frame.getByText(EXISTING_COVER_AUTHORIZATION.warning, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => (window as any).calls.length), 0);
    assert.equal(await frame.locator('#cover img').count(), 0);
    assert.equal(await frame.locator('#scheduleLabel').isHidden(), true);
    assert.equal(await frame.locator('body').evaluate(el => el.scrollWidth <= innerWidth), true);
    if (mode === 'missing') { assert.equal(await frame.getByRole('button',{name:'Godkend billede',exact:true}).isDisabled(), true); }
    else if(mode === 'multiple') {
      await page.screenshot({path:'output/individual-image-review/widget-390.png',fullPage:true});
      await page.setViewportSize({width:1200,height:900});
      await page.screenshot({path:'output/individual-image-review/widget-1200.png',fullPage:true});
      await frame.getByRole('figure',{name:'Andet billede',exact:true}).getByRole('button',{name:'Godkend billede',exact:true}).click();
      await frame.getByText('Version 3 · Klar til gennemlæsning').waitFor();
      assert.equal(await page.evaluate(() => (window as any).calls[0].arguments.displayedImageHash),'e'.repeat(64));
      await frame.getByRole('figure',{name:'Isoleret fixture',exact:true}).getByRole('button',{name:'Godkend billede',exact:true}).click();
      await frame.getByText('Version 4 · Klar til gennemlæsning').waitFor();
      await frame.getByRole('figure',{name:'Tredje billede',exact:true}).getByRole('button',{name:'Fravælg billede',exact:true}).click();
      await frame.getByText('Ingen forslag afventer dit valg.',{exact:false}).waitFor();
      assert.deepEqual(await page.evaluate(() => (window as any).calls.filter((c:any)=>c.name==='confirm_submission_action').map((c:any)=>c.arguments.displayedImageHash)),['e'.repeat(64),'c'.repeat(64),'1'.repeat(64)]);
    }
    else {
      await page.screenshot({ path: 'tmp/image-candidate-mobile.png', fullPage: true });
      await page.setViewportSize({ width: 1200, height: 900 });
      await page.screenshot({ path: 'tmp/image-candidate-desktop.png', fullPage: true });
      if (mode === 'legacy') assert.equal(await frame.getByRole('button',{name:'Fravælg billede',exact:true}).isDisabled(), true);
      const decline = mode.startsWith('decline');
      const choice=frame.getByRole('button', { name: decline ? 'Fravælg billede' : 'Godkend billede',exact:true });
      await choice.click({trial:true});
      await choice.evaluate((el: HTMLButtonElement) => { el.click(); el.click(); });
      if (decline) { await frame.getByText('Billedet er fravalgt. Originalen er bevaret i historikken.',{exact:true}).waitFor(); }
      else await frame.getByText('Version 3 · Klar til gennemlæsning').waitFor();
      assert.deepEqual(await page.evaluate(() => (window as any).calls.map((c: any) => c.name)), ['confirm_submission_action', 'preview_submission']);
      assert.equal(await page.evaluate(() => (window as any).calls[0].arguments.displayedImageHash), 'c'.repeat(64));
      if (decline) assert.equal(await page.evaluate(() => (window as any).calls[0].arguments.imageDecision), 'decline');
      assert.equal(await frame.locator('#confirm').isHidden(), true);
    }
    assert.deepEqual(errors, []); await page.close();
  }
  console.log(JSON.stringify({ mobile: 'passed', desktop: 'passed', missingPixelsBlocked: true, doubleClickWrites: 1,
    decline: 'passed', lostReplyReadback: 'passed', legacyTokenCannotDecline: true, exactFileExceptionWarningVisible: true,
    actualApprovals: 0, actualCmsWrites: 0, actualGenerations: 0, host: 'isolated simulation' }));
} finally { await browser.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); }
