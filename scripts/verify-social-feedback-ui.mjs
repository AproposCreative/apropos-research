// Real SoMe view/hook/canvas/export; isolated CMS, font and Firebase fixtures.
// POSTs below are local fixtures only. No real credentials or remote writes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
import { chromium } from 'playwright';

const title = 'Kontrapunkt har tegnet Danmark. Men er kundearbejde kunst?';
const subtitle = 'Kontrapunkt har formet DSB og TV 2. Nu undersøger Designmuseum Danmark bureauets arbejde og grænsen mellem designhistorie og reklame.';
const first = 'Kontrapunkt har formet DSB og TV 2.';
const raw = await Promise.all(['DesignEditorView.tsx', 'SubtitleControls.tsx'].map(file => readFile('app/design-editor/' + file, 'utf8')));
const css = (await postcss([tailwind({ content: raw.map(raw => ({ raw, extension: 'tsx' })) })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import View from './app/design-editor/DesignEditorView';
window.fixture={calls:[],errors:[]};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 fixture.calls.push({url:String(url),method:options.method||'GET'});
 if(options.method==='POST'&&url==='/api/instagram/publish'){
 const mode=new URLSearchParams(location.search).get('mode');
 if(mode==='lost')throw new TypeError('Load failed');
 if(mode==='invalid')return new Response('<html>proxy</html>',{status:200});
 if(mode==='timeout')return Response.json({error:'Connection lost'},{status:504});
 if(mode==='rejected')return Response.json({error:'Billedet blev afvist'},{status:400});
 return Response.json({success:true,mediaId:'fixture-ig',facebookPublished:mode!=='partial',facebookError:mode==='partial'?'Connection lost':null,facebookCommentPublished:true});
}
if(options.method&&options.method!=='GET')throw Error('Unexpected mutation');
 if(url==='/api/webflow/sample-articles')return Response.json({items:[
  {id:'kontrapunkt',fieldData:{name:${JSON.stringify(title)},subtitle:${JSON.stringify(subtitle)},slug:'kontrapunkt',section:'Kultur',topic:'Kultur & Mening','post-body':'<p>Uændret artikel.</p>','mobile-image':'/fixture.svg'}},
  {id:'other',fieldData:{name:'Anden artikel',subtitle:'En helt anden artikel.',section:'Kultur','mobile-image':'/fixture.svg'},socialSubtitles:{square:'En gemt kort SoMe-tekst.',story:'En gemt længere SoMe-tekst til story.'}}]});
 if(['/api/webflow/authors','/api/webflow/sections','/api/webflow/topics'].includes(url))return Response.json({items:[]});
 if(url==='/api/instagram/publish')return location.search.includes('unknown')?new Response('offline',{status:503}):Response.json({configured:true});
 throw Error('Unexpected request '+url);
};
createRoot(document.getElementById('root')).render(<StrictMode><View/></StrictMode>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /^next\/font\/google$|^@\/lib\/firebase$|^firebase\/storage$|^@\/components\/embedded-app$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents:
    args.path === 'next/font/google' ? `export const Amiri=()=>({style:{fontFamily:'Georgia'},variable:'fixture-font'});` :
    args.path.endsWith('embedded-app') ? `export const EmbeddedAppHeader=()=>null;` :
    args.path === 'firebase/storage' ? `export const ref=()=>({fixture:true});export const uploadBytes=async()=>({});export const getDownloadURL=async()=>location.origin+'/fixture.svg';` : `export const storage={fixture:true};` }));
} }] });
const server = createServer(async (req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(req.url==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="#bbb"/></svg>');return;}
  if(['/images/AproposMagazineLogoInstagram.svg','/images/star-filled.svg','/images/star-outline.svg'].includes(req.url)){
    res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('public'+req.url));return;
  }
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>SoMe fixture</title><style>'+css+'textarea{color:white;background:#141414}</style><body style="background:black;color:white;margin:0"><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});

await mkdir('output/social-feedback',{recursive:true});
try {
 for(const mode of ['success','partial','lost','invalid','timeout','rejected','unknown']){
  for(const size of ['square','story']){
   const page=await browser.newPage({viewport:{width:390,height:844}});
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await page.goto(origin+'/?mode='+mode);
   await page.getByRole('button',{name:'Luk',exact:true}).click();
   if(size==='story')await page.getByRole('button',{name:'9:16',exact:true}).click();
   await page.waitForFunction(()=>!document.querySelector('summary')?.textContent.includes('Tilpasser automatisk'));
   await page.getByRole('button',{name:size==='story'?'Post til Instagram Story':'Post til Instagram',exact:true}).filter({visible:true}).first().click();
   await page.getByRole('button',{name:'Post nu',exact:true}).click();
   const feedback=page.locator('[data-publish-feedback]').filter({visible:true}).first();
   await feedback.waitFor();
   const text=await feedback.innerText();
   if(['lost','invalid','timeout'].includes(mode)){
    assert(text.includes('Kvitteringen mangler'));assert(!text.includes('er publiceret'));assert.equal(await feedback.locator('[class*="text-red"]').count(),0);
   }else if(mode==='rejected')assert(text.includes('Billedet blev afvist'));
   else{
    assert(text.includes('publiceret')||text.includes('Publiceret'));
    assert.equal(await feedback.locator('[class*="text-red"]').count(),0);
   }
   const calls=await page.evaluate(()=>fixture.calls);
   assert.equal(calls.filter(x=>x.method==='POST').length,1); // No hidden retry.
   if(size==='square')await page.screenshot({path:'output/social-feedback/'+mode+'.png'});
   await page.close();
  }
 }
 console.log('Social feedback: 14 actual-view fixture cases passed, one simulated POST each, zero remote writes.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
