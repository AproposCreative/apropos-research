// Real SoMe view/hook/canvas/export; isolated CMS, font and Firebase fixtures.
// No credentials, remote services, CMS writes, real model calls or social publishing.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const outputDir = process.env.APROPOS_SOCIAL_OUTPUT_DIR || 'output/social-delivery-20261030';
const title = 'TONY';
const subtitle = 'A24 og Matt Johnson skildrer Anthony Bourdains formative sommer i Provincetown, hvor Dominic Sessa og Antonio Banderas bærer historien.';
const first = 'En sommer i Provincetown former Bourdain.';
const lanternsTitle = 'Anmeldelse: Lanterns, sæson 1. Hvornår bliver det sejt?';
const lanternsSubtitle = 'Aaron Pierre og Kyle Chandler efterforsker en kosmisk forbrydelse, men HBO-serien giver mig hverken nok superhelt eller nok menneske.';
const lanternsShort = 'HBO-serien mangler både superhelt og menneske.';
// Optional real bundled fonts; never downloads fonts during verification.
const buildDir = process.env.APROPOS_BUILD_DIR;
let fontCss = '';
if (buildDir) for (const file of (await readdir(buildDir + '/static/chunks')).filter(file => file.endsWith('.css'))) {
  const source = await readFile(buildDir + '/static/chunks/' + file, 'utf8');
  fontCss += (source.match(/@font-face\{[^}]*font-family:(Amiri|Poppins|Inter);[^}]*\}/g) || []).join('\n').replaceAll('../media/', '/media/');
}
if (buildDir) assert(fontCss.includes('font-family:Amiri;'), 'Build must include the real Amiri font');
const raw = await Promise.all(['app/design-editor/DesignEditorView.tsx', 'app/design-editor/SubtitleControls.tsx', 'app/design-editor/TitleControls.tsx', 'app/design-editor/SocialEditorToolbar.tsx', 'app/design-editor/CopyControlParts.tsx', 'components/embedded-app/EmbeddedAppHeader.tsx'].map(file => readFile(file, 'utf8')));
const css = (await postcss([tailwind({ content: raw.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import View from './app/design-editor/DesignEditorView';
import {exportCardToJpegBlob} from './app/design-editor/exportCardToPng';
window.fixture={calls:[],errors:[],closed:false,frames:[],uploads:[]}; const nativeFetch=window.fetch.bind(window); let dropped=false;
const draws=new WeakMap();
fixture.jpeg=async(data,size)=>{const blob=await exportCardToJpegBlob(data,size,0.92,{amiriFontFamily:${JSON.stringify(buildDir ? 'Amiri' : 'Georgia')}});return {type:blob.type,size:blob.size};};
const fillText=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(text,...args){const lines=draws.get(this.canvas)||[];const metrics=this.measureText(text);lines.push({text,font:this.font,y:args[1],ascent:metrics.actualBoundingBoxAscent,descent:metrics.actualBoundingBoxDescent});draws.set(this.canvas,lines);return fillText.call(this,text,...args);};
const toDataURL=HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL=function(...args){const src=toDataURL.apply(this,args);fixture.frames.push({src,width:this.width,height:this.height,draws:draws.get(this)||[]});if(fixture.frames.length>50)fixture.frames.shift();return src;};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 fixture.calls.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
 if(String(url).startsWith('/api/design-editor/draft') || (String(url).startsWith('/api/instagram/publish') && (options.method==='POST'||String(url).includes('?')))){const r=await nativeFetch(url,options);if(options.method==='POST'&&location.search.includes('lost=1')&&!dropped){dropped=true;throw Error('Simulated lost response');}return r;}
 if(url==='/api/design-editor/shorten-subtitle'&&options.method==='POST'){
  const body=JSON.parse(options.body);
  if(!options.headers?.Authorization?.startsWith('Bearer '))throw Error('Missing editor token');
  const candidate=body.field==='title'?(body.variant?'Sommeren der formede Bourdain':'Bourdain før berømmelsen'):body.variant?'Bourdains historie begynder i Provincetown.':${JSON.stringify(first)};
  return Response.json({candidates:[candidate,body.variant?'Historien starter før berømmelsen.':'En sommer før berømmelsen.'],source:'ai'});
 }
 if(options.method&&options.method!=='GET')throw Error('Unexpected mutation');
 if(url==='/api/webflow/sample-articles')return Response.json({items:[
  {id:'6ae474fd88698245425a7ddc',fieldData:{name:${JSON.stringify(title)},subtitle:${JSON.stringify(subtitle)},slug:'kontrapunkt',section:'Kultur',topic:'Kultur & Mening','post-body':'<p>Uændret artikel.</p>','mobile-image':'/fixture.svg'}},
  {id:'other',fieldData:{name:'Anden artikel',subtitle:'En helt anden artikel.',section:'Kultur','mobile-image':'/fixture.svg'},socialSubtitles:{square:'En gemt kort SoMe-tekst.',story:'En gemt længere SoMe-tekst til story.'}},
  {id:'6accb9d4a4cfa06c22daba32',fieldData:{name:${JSON.stringify(lanternsTitle)},subtitle:${JSON.stringify(lanternsSubtitle)},section:'Serier & Film','mobile-image':'/fixture.svg'}}]});
 if(['/api/webflow/authors','/api/webflow/sections','/api/webflow/topics'].includes(url))return Response.json({items:[]});
 if(url==='/api/instagram/publish')return Response.json({configured:true,facebookConfigured:true});
 throw Error('Unexpected request '+url);
};
const embedded=new URLSearchParams(location.search).get('embed')==='1';createRoot(document.getElementById('root')).render(<StrictMode><View embedMode={embedded} onBack={embedded?()=>fixture.closed=true:undefined}/></StrictMode>);
` }, bundle: true, write: false, outdir: '/virtual', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /^next\/font\/google$|^next\/link$|^@\/lib\/firebase$|^@\/lib\/auth-context$|^firebase\/storage$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents:
    args.path === 'next/font/google' ? `export const Amiri=()=>({style:{fontFamily:${JSON.stringify(buildDir ? 'Amiri' : 'Georgia')}},variable:'fixture-font'});` :
    args.path === 'next/link' ? `import React from 'react';export default function Link(p){return React.createElement('a',p);}` :
    args.path === '@/lib/auth-context' ? `const user={uid:'fixture-owner'};export const useAuth=()=>({user});` :
    args.path === 'firebase/storage' ? `export const ref=(_storage,path)=>path;export const uploadBytes=async(path,blob)=>window.fixture.uploads.push({path,size:blob.size});export const getDownloadURL=async path=>'https://example.test/'+path;` : `export const storage={};export const auth={authStateReady:async()=>{},currentUser:{uid:'fixture-owner',getIdToken:async()=> 'fixture-token'}};` }));
} }] });
const drafts=new Map(),receipts=new Map(),attempts=new Map();let lastArticleId=null,publishCalls=0;
const server=createServer(async(req,res)=>{
 const url=new URL(req.url,'http://fixture');
 const json=(data,status=200)=>{res.writeHead(status,{'Content-Type':'application/json'});res.end(JSON.stringify(data));};
 if(url.pathname==='/api/design-editor/draft'){
  if(req.method==='GET'){
   if(!url.searchParams.has('articleId'))return json({lastArticleId});
   return json(drafts.get(url.search)||{revision:0,draft:null,updatedAt:null});
  }
  let raw='';for await(const chunk of req)raw+=chunk;
  const body=JSON.parse(raw),key='?'+new URLSearchParams({articleId:body.articleId,sourceHash:body.sourceHash});
  const prior=drafts.get(key)||{revision:0,draft:null,updatedAt:null};
  if(JSON.stringify(prior.draft)===JSON.stringify(body.draft))return json(prior);
  if(prior.revision!==body.expectedRevision)return json(prior,409);
  const next={revision:prior.revision+1,draft:body.draft,updatedAt:new Date().toISOString()};drafts.set(key,next);lastArticleId=body.articleId;return json(next);
 }
 if(url.pathname==='/api/instagram/publish'){
  if(req.method==='GET'){
   if(url.searchParams.has('requestId')){const receipt=attempts.get(url.searchParams.get('requestId'));return receipt?json({receipt}):json({error:'Not recorded'},404);}
   return json({receipts:[...receipts.values()].filter(row=>row.articleId===url.searchParams.get('articleId'))});
  }
  let raw='';for await(const chunk of req)raw+=chunk;const body=JSON.parse(raw);
  assert.equal(body.channels.instagram,true);assert.equal(typeof body.channels.facebook,'boolean');assert(body.imageSha256);assert(body.requestId);
  const key=JSON.stringify([body.articleId,body.card,body.caption,body.isStory]);
  if(receipts.has(key)){const receipt=receipts.get(key);attempts.set(body.requestId,receipt);return json({receipt,replay:true});}
  publishCalls++;
  const receipt={id:'receipt-'+publishCalls,ownerUid:'fixture-owner',articleId:body.articleId,requestId:body.requestId,createdAt:new Date().toISOString(),updatedAt:new Date().toISOString(),complete:true,phase:body.channels.facebook?'stopped':'done',channels:body.channels,
   instagram:{status:'published',id:'123',url:'https://www.instagram.com/p/fixture/'},facebook:{status:body.channels.facebook?'published':'skipped',...(body.channels.facebook?{id:'123_456',url:'https://www.facebook.com/fixture/posts/456'}:{})},comment:body.channels.facebook?{status:'failed',error:'Meta afviste handlingen (kode 200).'}:{status:'skipped'}};
  receipts.set(key,receipt);attempts.set(body.requestId,receipt);return json({receipt});
 }
 if(buildDir && /^\/media\/[a-zA-Z0-9._-]+\.woff2$/.test(req.url)){res.setHeader('Content-Type','font/woff2');return res.end(await readFile(buildDir+'/static'+req.url));}
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);}
 if(req.url==='/bundle.css'){res.setHeader('Content-Type','text/css');return res.end(bundle.outputFiles.find(f=>f.path.endsWith('.css')).text);}
 if(req.url==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#bbb"/></svg>');}
 if(['/images/AproposMagazineLogoInstagram.svg','/images/star-filled.svg','/images/star-outline.svg'].includes(req.url)){res.setHeader('Content-Type','image/svg+xml');return res.end(await readFile('public'+req.url));}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+fontCss+'</style><link rel="stylesheet" href="/bundle.css"><body style="background:black;color:white;margin:0"><div id="root" style="height:100dvh"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const report=[];
async function open(context,path=''){
 const page=await context.newPage();page.setDefaultTimeout(10000);page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin+path);
 if(page.viewportSize().width<768)await page.getByRole('button',{name:'Luk',exact:true}).first().click();
 await page.locator('fieldset').waitFor();await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);
 return page;
}
async function expand(page,field){const control=page.locator(`[data-copy-control="${field}"]`);if(await control.getAttribute('open')===null)await control.locator(':scope > summary').click();return control;}
async function saved(page){await page.waitForFunction(()=>Array.from(document.querySelectorAll('[role="status"]')).some(el=>el.textContent==='Gemt'));}
try{
 const context=await browser.newContext({viewport:{width:390,height:844},permissions:['clipboard-read','clipboard-write'],acceptDownloads:true});
 const page=await open(context);
 await expand(page,'subtitle');await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Undertekst på billedet"]')?.value==='En sommer i Provincetown former Bourdain.');
 await expand(page,'title');await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).fill('Bourdain før berømmelsen');
 await expand(page,'subtitle');await page.getByRole('textbox',{name:'Undertekst på billedet',exact:true}).fill('En sommer former Bourdain.');
 await page.getByRole('button',{name:'Mindre afstand til underteksten'}).click();
 await page.waitForFunction(()=>{const f=fixture.frames.at(-1),i=f?.draws.findIndex(d=>d.font.includes('italic'));if(!(i>0))return false;const a=f.draws[i],b=f.draws[i-1];return Math.abs(a.y-a.ascent-b.y-b.descent-16)<.01;});
 await page.getByRole('button',{name:'Gør overskriften større'}).click();
 await page.getByLabel('Opslagstekst',{exact:true}).fill('Min redigerede opslagstekst.');
 await page.reload();await page.getByRole('button',{name:'Luk',exact:true}).first().click();await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);
 assert.equal(await page.getByLabel('Opslagstekst',{exact:true}).inputValue(),'Min redigerede opslagstekst.');await saved(page);
 await expand(page,'title');await page.getByRole('button',{name:'Gendan normal afstand'}).waitFor();
 await page.waitForFunction(()=>{const f=fixture.frames.at(-1),i=f?.draws.findIndex(d=>d.font.includes('italic'));if(!(i>0))return false;const a=f.draws[i],b=f.draws[i-1];return Math.abs(a.y-a.ascent-b.y-b.descent-16)<.01;});
 report.push('custom title/subtitle ink spacing remains 16px after text enlargement and reload');
 await page.screenshot({path:outputDir+'/390-spacing-controls.png'});
 report.push('automatic AI fitting still works; immediate reload restores unsaved local journal');
 await page.getByRole('button',{name:'9:16',exact:true}).click();await page.getByRole('button',{name:'Skift til mørkt design'}).click();await saved(page);
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).find(b=>b.textContent==='Download Story')?.disabled);
 const download=page.waitForEvent('download');await page.getByRole('button',{name:'Download Story',exact:true}).click();await(await download).saveAs(outputDir+'/story.png');
 await page.getByRole('button',{name:'Kopiér artikellink',exact:true}).click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/\/articles\/kontrapunkt$/);
 await page.screenshot({path:outputDir+'/390-story-export.png'});
 await page.reload();await page.getByRole('button',{name:'Luk',exact:true}).first().click();await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);
 await expand(page,'title');assert.equal(await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).inputValue(),'Bourdain før berømmelsen');
 await expand(page,'subtitle');assert.equal(await page.getByRole('textbox',{name:'Undertekst på billedet',exact:true}).inputValue(),'En sommer former Bourdain.');
 assert.equal(await page.getByRole('button',{name:'9:16',exact:true}).getAttribute('aria-pressed'),'true');
 report.push('manual title/subtitle/caption/design/format survive reload; Story PNG and clipboard work');
 const secondContext=await browser.newContext({viewport:{width:1440,height:1000}}), second=await open(secondContext);
 await expand(second,'title');assert.equal(await second.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).inputValue(),'Bourdain før berømmelsen');
 await second.getByRole('button',{name:'Gendan normal afstand'}).waitFor();
 await second.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).fill('En ny titel fra en anden enhed');await saved(second);
 await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).fill('Mine lokale ændringer');
 await page.getByText('En anden enhed har gemt en nyere version.',{exact:true}).waitFor();
 await page.getByRole('button',{name:'Brug gemt version',exact:true}).click();
 await page.waitForFunction(()=>document.querySelector('textarea[aria-label="Overskrift på billedet"]')?.value==='En ny titel fra en anden enhed');
 report.push('fresh device restores server draft; stale edit requires explicit conflict resolution');
 await page.getByRole('button',{name:'1:1',exact:true}).click();await saved(page);
 await page.getByRole('button',{name:'Post til Instagram',exact:true}).click();
 assert.equal(await page.getByRole('checkbox',{name:'Facebook',exact:true}).isChecked(),false);
 await page.screenshot({path:outputDir+'/390-explicit-channels.png'});
 await page.getByRole('button',{name:'Udgiv nu',exact:true}).evaluate(button=>{button.click();button.click();});
 await page.getByRole('link',{name:'Se opslag',exact:true}).first().waitFor();assert.equal(publishCalls,1);
 assert.equal(await page.getByRole('link',{name:'Se opslag',exact:true}).count(),1);
 await page.getByRole('button',{name:'Kontrollér status',exact:true}).click();assert.equal(publishCalls,1);
 report.push('Instagram-only default; double-click creates one receipt; readback never posts');
 // Explicit Facebook choice with a changed, approved caption creates a different post version.
 await page.getByLabel('Opslagstekst',{exact:true}).fill('En ny godkendt version til begge kanaler.');
 await page.getByRole('button',{name:'Post til Instagram',exact:true}).click();await page.getByRole('checkbox',{name:'Facebook',exact:true}).check();
 await page.getByRole('button',{name:'Udgiv nu',exact:true}).click();
 await page.waitForFunction(()=>document.querySelectorAll('a[href*="facebook.com/fixture/posts"]').length===1);
 await page.getByText('Artikellinket blev ikke tilføjet som Facebook-kommentar. Facebook mangler adgang til kommentarer.',{exact:false}).waitFor();
 assert.equal(await page.getByText('Meta afviste handlingen (kode 200).',{exact:true}).count(),0);
 assert.equal(publishCalls,2);report.push('Facebook only receives an explicitly checked version; independent post links retained');
 await page.screenshot({path:outputDir+'/390-publication-receipts.png'});
 await page.reload();await page.getByRole('button',{name:'Luk',exact:true}).first().click();await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);
 await page.getByText('Tidligere udgivelser (1)',{exact:true}).click();assert.equal(await page.getByRole('link',{name:'Se opslag',exact:true}).count(),3);assert.equal(publishCalls,2);
 const latestTime=await page.locator('section[aria-label="Udgivelseskvittering"] time').first().getAttribute('datetime');
 await page.getByRole('button',{name:'Kontrollér status',exact:true}).last().click();
 await page.waitForFunction(()=>!Array.from(document.querySelectorAll('button')).some(b=>b.textContent==='Kontrollerer…'));
 assert.equal(await page.locator('section[aria-label="Udgivelseskvittering"] time').first().getAttribute('datetime'),latestTime);
 report.push('old permission error is explained specifically; checking older receipt preserves latest-publication order');
 report.push('receipt history survives reload');
 await page.getByLabel('Opslagstekst',{exact:true}).fill('Et forsøg med tabt kvittering.');await saved(page);
 await page.goto(origin+'/?lost=1');await page.getByRole('button',{name:'Luk',exact:true}).first().click();await page.waitForFunction(()=>!document.querySelector('fieldset')?.disabled);
 await page.getByRole('button',{name:'Post til Instagram',exact:true}).click();await page.getByRole('button',{name:'Udgiv nu',exact:true}).click();
 await page.waitForFunction(()=>window.fixture.calls.some(call=>call.url.includes('requestId=')));
 await page.waitForFunction(()=>document.querySelectorAll('section[aria-label="Udgivelseskvittering"]').length===3);
 assert.equal(publishCalls,3);report.push('lost response is recovered via GET; no duplicate publication');
 for(const width of [320,390,768,1440]){
  await page.setViewportSize({width,height:1000});await page.screenshot({path:outputDir+'/'+width+'-overview.png'});
  assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'horizontal overflow at '+width);
 }
 assert.deepEqual(await page.evaluate(()=>fixture.errors),[]);
 console.log(JSON.stringify({checks:report,fixturePublications:publishCalls,realSocialPosts:0,realPaidCalls:0},null,2));
 await (await import('node:fs/promises')).writeFile(outputDir+'/report.json',JSON.stringify({checkedAt:new Date().toISOString(),checks:report,fixturePublications:publishCalls,realSocialPosts:0,realPaidCalls:0},null,2));
 await secondContext.close();await context.close();
}catch(error){for(const context of browser.contexts())for(const page of context.pages())await page.screenshot({path:outputDir+'/failure-'+page.viewportSize().width+'.png'}).catch(()=>{});throw error;}finally{await browser.close();await new Promise(resolve=>server.close(resolve));}
