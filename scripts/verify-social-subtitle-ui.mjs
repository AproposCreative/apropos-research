// Real SoMe view/hook/canvas/export; isolated CMS, font and Firebase fixtures.
// No credentials, remote services, CMS writes, model calls or social publishing.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, readdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const title = 'Kontrapunkt har tegnet Danmark. Men er kundearbejde kunst?';
const subtitle = 'Kontrapunkt har formet DSB og TV 2. Nu undersøger Designmuseum Danmark bureauets arbejde og grænsen mellem designhistorie og reklame.';
const first = 'Kontrapunkt har formet DSB og TV 2.';
// Optional real bundled fonts; never downloads fonts during verification.
const buildDir = process.env.APROPOS_BUILD_DIR;
let fontCss = '';
if (buildDir) for (const file of (await readdir(buildDir + '/static/chunks')).filter(file => file.endsWith('.css'))) {
  const source = await readFile(buildDir + '/static/chunks/' + file, 'utf8');
  fontCss += (source.match(/@font-face\{[^}]*font-family:(Amiri|Poppins|Inter);[^}]*\}/g) || []).join('\n').replaceAll('../media/', '/media/');
}
if (buildDir) assert(fontCss.includes('font-family:Amiri;'), 'Build must include the real Amiri font');
const raw = await Promise.all(['app/design-editor/DesignEditorView.tsx', 'app/design-editor/SubtitleControls.tsx', 'components/embedded-app/EmbeddedAppHeader.tsx'].map(file => readFile(file, 'utf8')));
const css = (await postcss([tailwind({ content: raw.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import View from './app/design-editor/DesignEditorView';
window.fixture={calls:[],errors:[]};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 fixture.calls.push({url:String(url),method:options.method||'GET'});
 if(options.method&&options.method!=='GET')throw Error('Unexpected mutation');
 if(url==='/api/webflow/sample-articles')return Response.json({items:[
  {id:'kontrapunkt',fieldData:{name:${JSON.stringify(title)},subtitle:${JSON.stringify(subtitle)},slug:'kontrapunkt',section:'Kultur',topic:'Kultur & Mening','post-body':'<p>Uændret artikel.</p>','mobile-image':'/fixture.svg'}},
  {id:'other',fieldData:{name:'Anden artikel',subtitle:'En helt anden artikel.',section:'Kultur','mobile-image':'/fixture.svg'},socialSubtitles:{square:'En gemt kort SoMe-tekst.',story:'En gemt længere SoMe-tekst til story.'}}]});
 if(['/api/webflow/authors','/api/webflow/sections','/api/webflow/topics'].includes(url))return Response.json({items:[]});
 if(url==='/api/instagram/publish')return Response.json({configured:false});
 throw Error('Unexpected request '+url);
};
createRoot(document.getElementById('root')).render(<StrictMode><View/></StrictMode>);
` }, bundle: true, write: false, outdir: '/virtual', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /^next\/font\/google$|^next\/link$|^@\/lib\/firebase$|^firebase\/storage$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents:
    args.path === 'next/font/google' ? `export const Amiri=()=>({style:{fontFamily:${JSON.stringify(buildDir ? 'Amiri' : 'Georgia')}},variable:'fixture-font'});` :
    args.path === 'next/link' ? `import React from 'react';export default function Link(p){return React.createElement('a',p);}` :
    args.path === 'firebase/storage' ? `export const ref=()=>{throw Error('Forbidden storage')};export const uploadBytes=ref;export const getDownloadURL=ref;` : `export const storage=null;` }));
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
  res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SoMe fixture</title><style>'+css+fontCss+'textarea{color:white;background:#141414}.fixture-font{--font-amiri:Amiri}</style><link rel="stylesheet" href="/bundle.css"><body style="background:black;color:white;margin:0"><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const reports=[];
await mkdir('output/social-subtitle',{recursive:true});
try {
  for(const viewport of [{width:320,height:844},{width:390,height:844},{width:1440,height:1000}]){
    const page=await browser.newPage({viewport,acceptDownloads:true});
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin);
    if(viewport.width<768){
      await page.getByRole('button',{name:'Luk',exact:true}).click();
      await page.waitForFunction(()=>document.querySelector('[class*="-translate-x-full"]')?.getBoundingClientRect().right<=0);
    }
    await page.getByRole('heading',{name:'Sociale medier',exact:true}).waitFor();
    const headerButtons=await page.locator('header button').evaluateAll(buttons=>buttons.map(button=>({label:button.getAttribute('aria-label')||button.textContent,height:button.getBoundingClientRect().height})));
    assert(headerButtons.every(button=>button.height>=44), JSON.stringify(headerButtons));
    const field=page.getByRole('textbox',{name:'Undertekst på billedet',exact:true});
    await page.locator('summary').click();
    await page.waitForFunction(()=>document.querySelector('summary')?.textContent.endsWith(' · Automatisk tilpasset'));
    assert.equal(await field.inputValue(),first); // Automatic, zero shortening clicks.
    assert.equal(await page.getByRole('button',{name:'Forkort med AI',exact:true}).count(),0);
    assert.equal(await page.getByRole('button',{name:'Kopiér til ChatGPT',exact:true}).count(),0);
    await page.screenshot({path:'output/social-subtitle/'+viewport.width+'-automatic.png'});
    const download=page.waitForEvent('download');
    await page.getByRole('button',{name:'Eksporter PNG',exact:true}).click();
    const file=await download;
    await file.saveAs('output/social-subtitle/'+viewport.width+'-card.png');
    assert.match(file.suggestedFilename(),/apropos-social-square-.*\.png$/);
    await page.getByRole('button',{name:'Gendan original',exact:true}).click();
    assert.equal(await field.inputValue(),subtitle);
    await page.waitForFunction(()=>document.querySelector('summary')?.textContent.endsWith(' · Kontrollér teksten'));
    await page.getByRole('button',{name:'Tilpas automatisk',exact:true}).click();
    await page.waitForFunction(()=>document.querySelector('summary')?.textContent.endsWith(' · Automatisk tilpasset'));
    assert.equal(await field.inputValue(),first);
    await field.fill('Kontrapunkt på Designmuseum: Mellem designhistorie og reklame.');
    await page.waitForFunction(()=>document.querySelector('summary')?.textContent.endsWith(' · Klar'));
    await page.getByRole('button',{name:'9:16',exact:true}).click();
    await page.locator('summary').click();
    await page.waitForFunction(()=>!document.querySelector('summary')?.textContent.includes('Tilpasser automatisk'));
    const storyText=await field.inputValue();
    assert.notEqual(storyText,'Kontrapunkt på Designmuseum: Mellem designhistorie og reklame.'); // Per-format isolation.
    assert(subtitle.startsWith(storyText));
    await page.getByRole('button',{name:'1:1',exact:true}).click();
    await page.locator('summary').click();
    assert.equal(await field.inputValue(),'Kontrapunkt på Designmuseum: Mellem designhistorie og reklame.');
    if(viewport.width<768)await page.getByRole('button',{name:'Artikler',exact:true}).click();
    await page.getByRole('button',{name:'Anden artikel',exact:true}).filter({visible:true}).click();
    await page.locator('summary').click();
    await page.waitForFunction(()=>document.querySelector('summary')?.textContent.endsWith(' · Automatisk tilpasset'));
    assert.equal(await field.inputValue(),'En gemt kort SoMe-tekst.');
    await page.getByRole('button',{name:'9:16',exact:true}).click();
    await page.locator('summary').click();
    await page.waitForFunction(()=>document.querySelector('summary')?.textContent.endsWith(' · Automatisk tilpasset'));
    assert.equal(await field.inputValue(),'En gemt længere SoMe-tekst til story.');
    await page.screenshot({path:'output/social-subtitle/'+viewport.width+'-prepared-story.png'});
    const state=await page.evaluate(()=>({calls:fixture.calls,errors:fixture.errors,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert.deepEqual(state.errors,[]);
    assert(!state.overflow);
    assert(state.calls.every(call=>call.method==='GET'&&!call.url.includes('design-editor')));
    reports.push({viewport,requests:state.calls.length,modelRequests:0,automaticFit:true,preparedCopy:true,shorteningClicks:0,manualEdit:true,restore:true,formatIsolation:true,export:true});
    await page.close();
  }
  console.log(JSON.stringify({fixture:true,realHeader:true,font:buildDir?'Production bundled Amiri':'Georgia (not production Amiri)',reports},null,2));
} finally { await browser.close(); await new Promise(resolve=>server.close(resolve)); }
