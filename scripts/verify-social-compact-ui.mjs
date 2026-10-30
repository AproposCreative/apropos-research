// Real SoMe view/hook/canvas/export; isolated CMS, font and Firebase fixtures.
// No credentials, remote services, CMS writes, real model calls or social publishing.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const outputDir = process.env.APROPOS_SOCIAL_UI_OUTPUT || 'output/social-compact-20261030';
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
window.fixture={calls:[],errors:[],closed:false,frames:[]};
const draws=new WeakMap();
fixture.jpeg=async(data,size)=>{const blob=await exportCardToJpegBlob(data,size,0.92,{amiriFontFamily:${JSON.stringify(buildDir ? 'Amiri' : 'Georgia')}});return {type:blob.type,size:blob.size};};
const fillText=CanvasRenderingContext2D.prototype.fillText;
CanvasRenderingContext2D.prototype.fillText=function(text,...args){const lines=draws.get(this.canvas)||[];lines.push({text,font:this.font});draws.set(this.canvas,lines);return fillText.call(this,text,...args);};
const toDataURL=HTMLCanvasElement.prototype.toDataURL;
HTMLCanvasElement.prototype.toDataURL=function(...args){const src=toDataURL.apply(this,args);fixture.frames.push({src,width:this.width,height:this.height,draws:draws.get(this)||[]});if(fixture.frames.length>50)fixture.frames.shift();return src;};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 fixture.calls.push({url:String(url),method:options.method||'GET',body:options.body?JSON.parse(options.body):null});
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
 if(url==='/api/instagram/publish')return Response.json({configured:location.search.includes('publish=1')});
 throw Error('Unexpected request '+url);
};
const embedded=new URLSearchParams(location.search).get('embed')==='1';createRoot(document.getElementById('root')).render(<StrictMode><View embedMode={embedded} onBack={embedded?()=>fixture.closed=true:undefined}/></StrictMode>);
` }, bundle: true, write: false, outdir: '/virtual', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /^next\/font\/google$|^next\/link$|^@\/lib\/firebase$|^firebase\/storage$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents:
    args.path === 'next/font/google' ? `export const Amiri=()=>({style:{fontFamily:${JSON.stringify(buildDir ? 'Amiri' : 'Georgia')}},variable:'fixture-font'});` :
    args.path === 'next/link' ? `import React from 'react';export default function Link(p){return React.createElement('a',p);}` :
    args.path === 'firebase/storage' ? `export const ref=()=>{throw Error('Forbidden storage')};export const uploadBytes=ref;export const getDownloadURL=ref;` : `export const storage=null;export const auth={authStateReady:async()=>{},currentUser:{getIdToken:async()=> 'fixture-token'}};` }));
} }] });
const server = createServer(async (req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles.find(file=>file.path.endsWith('.js')).text);return;}
  if(req.url==='/bundle.css'){res.setHeader('Content-Type','text/css');res.end(bundle.outputFiles.find(file=>file.path.endsWith('.css')).text);return;}
  if(buildDir && /^\/media\/[a-zA-Z0-9._-]+\.woff2$/.test(req.url)){res.setHeader('Content-Type','font/woff2');res.end(await readFile(buildDir+'/static'+req.url));return;}
  if(req.url==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#bbb"/></svg>');return;}
  if(['/images/AproposMagazineLogoInstagram.svg','/images/star-filled.svg','/images/star-outline.svg'].includes(req.url)){
    res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('public'+req.url));return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SoMe fixture</title><style>'+css+fontCss+'textarea{color:white;background:#141414}.fixture-font{--font-amiri:Amiri}</style><link rel="stylesheet" href="/bundle.css"><body style="background:black;color:white;margin:0"><div id="root" style="height:100dvh"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const reports=[];
await mkdir(outputDir,{recursive:true});
try {
 for (const embedded of [false,true]) for(const width of [320,390,430,768,1440]){
  const page=await browser.newPage({viewport:{width,height:900},acceptDownloads:true});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin+'/?embed='+(embedded?'1':'0'));
  if(!embedded&&width<768){
   await page.locator('div.fixed').filter({has:page.getByRole('heading',{name:'Mine artikler',exact:true})}).getByRole('button',{name:'Luk',exact:true}).click();
   await page.waitForFunction(()=>document.querySelector('div.fixed[class*="-translate-x-full"]')?.getBoundingClientRect().right<=1);
  }
  await page.locator('[data-copy-control=subtitle]').waitFor();
  await page.waitForFunction(()=>fixture.calls.some(c=>c.url==='/api/design-editor/shorten-subtitle'));
  const header=page.locator('header');
  const toolbar=await header.evaluate(h=>({height:h.getBoundingClientRect().height,left:h.getBoundingClientRect().left,right:h.getBoundingClientRect().right,
   controls:[...h.querySelectorAll('button,a')].filter(x=>getComputedStyle(x).display!=='none').map(x=>({label:x.getAttribute('aria-label')||x.textContent,x:x.getBoundingClientRect().x,y:x.getBoundingClientRect().y,w:x.getBoundingClientRect().width,h:x.getBoundingClientRect().height}))}));
  assert(toolbar.height<=56,JSON.stringify(toolbar));
  assert(toolbar.controls.every(c=>c.h>=44&&c.w>=40),JSON.stringify(toolbar));
  assert(Math.max(...toolbar.controls.map(c=>c.y))-Math.min(...toolbar.controls.map(c=>c.y))<2,JSON.stringify(toolbar));
  assert(toolbar.controls.every(c=>c.x>=toolbar.left&&c.x+c.w<=toolbar.right+1),JSON.stringify(toolbar));
  assert.equal(await page.locator('[data-copy-control][open]').count(),0);
  await page.screenshot({path:`${outputDir}/${width}-${embedded?'embedded':'standalone'}-closed.png`});
  await page.locator('[data-copy-control=subtitle] > summary').click();
  const field=page.getByRole('textbox',{name:'Undertekst på billedet',exact:true});
  await page.waitForFunction(()=>document.querySelector('[data-copy-control=subtitle] textarea')?.value==='En sommer i Provincetown former Bourdain.');
  assert((await field.boundingBox()).height<80,'Short text must not have three empty rows');
  const suggestions=page.locator('[data-copy-control=subtitle] details').filter({has:page.locator('[aria-label="Forslag til undertekst"]')});
  assert.equal(await suggestions.getAttribute('open'),null);
  await page.screenshot({path:`${outputDir}/${width}-${embedded?'embedded':'standalone'}-open.png`});
  await suggestions.locator('summary').click();
  await page.getByRole('button',{name:'En sommer før berømmelsen.',exact:true}).click();
  assert.equal(await field.inputValue(),'En sommer før berømmelsen.');
  await page.getByRole('button',{name:'Nye forslag med AI',exact:true}).click();
  try { await page.waitForFunction(()=>fixture.calls.some(c=>c.body?.variant===1),null,{timeout:5000}); } catch(e) { console.log(JSON.stringify(await page.evaluate(()=>({calls:fixture.calls,errors:fixture.errors,text:document.body.innerText})),null,2)); throw e; }
  await page.waitForFunction(()=>document.querySelector('[data-copy-control=subtitle] textarea')?.value==='Bourdains historie begynder i Provincetown.');
  await page.getByRole('button',{name:'Gendan original',exact:true}).click();assert.equal(await field.inputValue(),subtitle);
  await page.getByRole('button',{name:'Tilpas automatisk',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('[data-copy-control=subtitle] textarea')?.value==='En sommer før berømmelsen.');
  await field.fill('Min egen korte tekst.');
  await page.locator('[data-copy-control=title] > summary').click();
  await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).fill('Min overskrift');
  const waitForTextSize = async (titlePx, subtitlePx) => {
   await page.waitForFunction(({titlePx,subtitlePx})=>{
    const src=document.querySelector('[data-social-preview] img')?.getAttribute('src');
    const frame=fixture.frames.findLast(f=>f.src===src);if(!frame)return false;
    const size=text=>Number(frame.draws.find(d=>d.text===text)?.font.match(/([0-9.]+)px/)?.[1]);
    return size('Min overskrift')===titlePx&&size('Min egen korte tekst.')===subtitlePx;
   },{titlePx,subtitlePx});
  };
  await waitForTextSize(80,48);
  const aiCallsBeforeSize=await page.evaluate(()=>fixture.calls.filter(c=>c.method==='POST').length);
  await page.getByRole('button',{name:'Gør overskriften større',exact:true}).click();
  await waitForTextSize(88,48);
  await page.getByRole('button',{name:'Gør underteksten mindre',exact:true}).click();
  await waitForTextSize(88,43);
  assert.equal(await field.inputValue(),'Min egen korte tekst.');
  assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.method==='POST').length),aiCallsBeforeSize,'Font sizing never calls AI');
  const controls=await page.locator('[data-copy-control] button').evaluateAll(elements=>elements.filter(e=>e.getBoundingClientRect().width).map(e=>{const r=e.getBoundingClientRect();return{left:r.left,right:r.right,height:r.height};}));
  assert(controls.every(r=>r.left>=0&&r.right<=width+1&&r.height>=44),'No clipped size actions');
  await page.screenshot({path:`${outputDir}/${width}-${embedded?'embedded':'standalone'}-sizes.png`});
  const download=page.waitForEvent('download');await page.getByRole('button',{name:'Eksporter PNG',exact:true}).click();
  const file=await download;await file.saveAs(`${outputDir}/${width}-${embedded?'embedded':'standalone'}.png`);
  const exportedSquare=await readFile(`${outputDir}/${width}-${embedded?'embedded':'standalone'}.png`);
  const squarePreview=await page.locator('[data-social-preview] img').getAttribute('src');
  assert(exportedSquare.equals(Buffer.from(squarePreview.split(',')[1],'base64')),'PNG is byte-identical to the preview');
  await page.getByRole('button',{name:'9:16',exact:true}).click();
  await page.locator('[data-copy-control=subtitle] > summary').click();assert.equal(await field.inputValue(),'Min egen korte tekst.');
  await page.locator('[data-copy-control=title] > summary').click();assert.equal(await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).inputValue(),'Min overskrift');
  await waitForTextSize(110,54);
  await page.getByRole('button',{name:'Skift til mørkt design',exact:true}).click();
  await page.getByRole('button',{name:'Skift til lyst design',exact:true}).waitFor();
  await waitForTextSize(110,54);
  const downloadStory=page.waitForEvent('download');await page.getByRole('button',{name:'Eksporter PNG',exact:true}).click();
  const story=await downloadStory;await story.saveAs(`${outputDir}/${width}-${embedded?'embedded':'standalone'}-story.png`);
  await page.getByRole('button',{name:'1:1',exact:true}).click();
  await waitForTextSize(88,43);
  if(width===390&&embedded){
   await page.locator('[data-copy-control=title] > summary').click();
   await page.locator('[data-copy-control=subtitle] > summary').click();
   for(let i=0;i<4;i++)await page.getByRole('button',{name:'Gør overskriften større',exact:true}).click();
   await waitForTextSize(120,43);
   assert(await page.getByRole('button',{name:'Gør overskriften større',exact:true}).isDisabled());
   for(let i=0;i<8;i++)await page.getByRole('button',{name:'Gør overskriften mindre',exact:true}).click();
   await waitForTextSize(56,43);
   assert(await page.getByRole('button',{name:'Gør overskriften mindre',exact:true}).isDisabled());
   await page.locator('[data-copy-control=title]').getByRole('button',{name:'Gendan original',exact:true}).click();
   await page.waitForFunction(()=>{const src=document.querySelector('[data-social-preview] img')?.getAttribute('src');return fixture.frames.findLast(f=>f.src===src)?.draws.some(d=>d.text==='TONY'&&d.font.includes('80px'));});
   await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).fill('Min overskrift');
   await page.getByRole('button',{name:'Gør overskriften større',exact:true}).click();
   await waitForTextSize(88,43);
   await page.getByRole('button',{name:'Artikler',exact:true}).click();
   await page.getByRole('button',{name:'Anden artikel',exact:true}).click();
   await page.waitForFunction(()=>{const src=document.querySelector('[data-social-preview] img')?.getAttribute('src');return fixture.frames.findLast(f=>f.src===src)?.draws.some(d=>d.text==='Anden artikel'&&d.font.includes('80px'));});
   await page.getByRole('button',{name:'Artikler',exact:true}).click();
   await page.getByRole('button',{name:'TONY',exact:true}).click();
   await waitForTextSize(88,43);
   await page.locator('[data-copy-control=title] > summary').click();
   await page.locator('[data-copy-control=subtitle] > summary').click();
   const jpeg=await page.evaluate(()=>fixture.jpeg({title:'Min overskrift',excerpt:'Min egen korte tekst.',titleSizePercent:110,subtitleSizePercent:90},'square'));
   const jpegStory=await page.evaluate(()=>fixture.jpeg({title:'Min overskrift',excerpt:'Min egen korte tekst.',titleSizePercent:110,subtitleSizePercent:90},'story'));
   assert(jpeg.type==='image/jpeg'&&jpeg.size>1000&&jpegStory.type==='image/jpeg'&&jpegStory.size>1000);
   const wideTitle=await page.evaluate(family=>{const ctx=document.createElement('canvas').getContext('2d');ctx.font='400 80px '+family;let word='M';while(ctx.measureText(word+'M').width<=880)word+='M';return word+' '+word;},buildDir?'Amiri':'Georgia');
   await page.getByRole('textbox',{name:'Overskrift på billedet',exact:true}).fill(wideTitle);
   await field.fill('M'.repeat(35)+' '+'M'.repeat(35));
   for(let i=0;i<4;i++)await page.getByRole('button',{name:'Gør overskriften større',exact:true}).click();
   for(let i=0;i<6;i++)await page.getByRole('button',{name:'Gør underteksten større',exact:true}).click();
   await page.locator('[data-layout-error]').waitFor();
   assert(await page.getByRole('button',{name:'Eksporter PNG',exact:true}).isDisabled());
   await page.locator('[data-copy-control=title]').getByRole('button',{name:'Gendan original',exact:true}).click();
   await page.locator('[data-copy-control=subtitle]').getByRole('button',{name:'Gendan original',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('[data-layout-error]'));
   reports.push({independentLimits:true,originalRestoresSize:true,perArticleSizes:true,jpegBothFormats:true,overflowBlockedAndRecoverable:true});
  }
  const state=await page.evaluate(()=>({calls:fixture.calls,errors:fixture.errors,overflow:document.documentElement.scrollWidth>innerWidth}));
  assert.deepEqual(state.errors,[]);assert.equal(state.overflow,false);
  assert(state.calls.filter(c=>c.method==='POST').every(c=>c.url==='/api/design-editor/shorten-subtitle'));
  reports.push({width,embedded,toolbarHeight:toolbar.height,singleToolbarRow:true,noClippedActions:true,manualEditsAcrossFormats:true,aiVariants:true,originalRestore:true,squareAndStoryDownloads:true,themeSwitch:true,textSizeChanges:true,sizesSurviveFormatSwitch:true,previewMatchesPng:true,noAiForSizing:true});
  await page.close();
 }
 const confirm=await browser.newPage({viewport:{width:390,height:844}});
 await confirm.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await confirm.goto(origin+'/?embed=1&publish=1');
 await confirm.waitForFunction(()=>document.querySelector('[data-copy-control=subtitle] [role=status]')?.textContent==='AI');
 await confirm.getByRole('button',{name:'Post til Instagram',exact:true}).click();
 await confirm.getByRole('dialog').waitFor();
 assert.equal(await confirm.evaluate(()=>fixture.calls.filter(c=>c.method==='POST'&&c.url!=='/api/design-editor/shorten-subtitle').length),0);
 await confirm.getByRole('button',{name:'Annuller',exact:true}).click();
 assert.equal(await confirm.getByRole('dialog').count(),0);
 await confirm.locator('header').getByRole('button',{name:'Luk',exact:true}).click();
 assert.equal(await confirm.evaluate(()=>fixture.closed),true);
 reports.push({publishStillRequiresConfirmation:true,noSocialPublish:true,closeWorks:true});await confirm.close();
 await import('node:fs/promises').then(fs=>fs.writeFile(outputDir+'/report.json',JSON.stringify({fixture:true,paidCalls:0,remoteWrites:0,reports},null,2)));
 console.log(JSON.stringify({fixture:true,paidCalls:0,remoteWrites:0,reports},null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
