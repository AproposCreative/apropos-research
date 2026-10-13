// Actual launcher/list/query hook, isolated authentication + read-only server fixture.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
import Launcher from './components/MobileAppLauncher';
import Panel from './components/WebAppsPanel';
import {describeTools} from './lib/tool-availability';
window.fixture={calls:[],selected:[],errors:[]};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.fetch=async(url,options={})=>{
 fixture.calls.push({url:String(url),method:options.method||'GET'});
 if(url!=='/api/editorial/tools'||options.method&&options.method!=='GET')throw Error('Unexpected request');
 if(location.search.includes('unavailable'))return Response.json({}, {status:503});
 return Response.json({checkedAt:new Date().toISOString(),tools:describeTools({paidAiBlocked:true,accreditationPaused:true,inboxAutoRespond:false},{owner:!location.search.includes('staff')})});
};
const select=id=>fixture.selected.push(id),shelf=()=>select('shelf');
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient()}>
 {location.search.includes('panel')?<Panel isOpen onClose={()=>select('close')} onSelectApp={select} onOpenShelf={shelf}/>:<Launcher onSelectApp={select} onOpenShelf={shelf}/>}</QueryClientProvider>);
` }, bundle: true, write: false, outdir: '/virtual', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /auth-context$|^next\/link$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), loader: 'tsx', contents: args.path==='next/link' ? `export default function Link(p){return <a {...p}/>}` : `const user={uid:'fixture',getIdToken:async()=> 'fixture-not-real'};export const useAuth=()=>({user,capabilities:{owner:!location.search.includes('staff')}});` }));
} }] });
const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);return;}
  if(req.url==='/bundle.css'){res.setHeader('Content-Type','text/css');res.end(bundle.outputFiles.find(f=>f.path.endsWith('.css')).text);return;}
  if(req.url.startsWith('/images/')){res.setHeader('Content-Type',req.url.endsWith('.svg')?'image/svg+xml':'image/png');res.end(await readFile('public'+decodeURI(req.url)));return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tools fixture</title><link rel="stylesheet" href="/bundle.css"><style>*{box-sizing:border-box}body{margin:0;background:black;color:white;font-family:Arial}button{font-family:inherit}#root{height:100vh}</style><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
await mkdir('output/tool-list',{recursive:true});
try{
 for(const width of [390,1440]){
  for(const mode of ['','panel','staff','unavailable']){
   const page=await browser.newPage({viewport:{width,height:1000}});
   await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
   await page.goto(origin+'/?'+mode);
   await page.getByRole('button',{name:/^Sociale medier/}).waitFor();
   await page.waitForFunction(()=>fixture.calls.length===1);
   if(mode!=='unavailable') await page.locator('summary').waitFor();
   assert.equal(await page.locator('nav img,nav svg').count(),0);
   const inbox=page.getByRole('button',{name:/^Livs indbakke/});
   if(mode==='staff')assert.equal(await inbox.count(),0);
   else{
    assert(await inbox.isVisible());
    assert.equal(await page.locator('nav > ul > li').nth(2).innerText(),await inbox.innerText());
    await inbox.click();
    assert((await page.evaluate(()=>fixture.selected)).includes('liv-inbox'));
   }
   if(mode==='unavailable')assert(await page.getByText('Aktuel status kunne ikke hentes.',{exact:false}).isVisible());
   else{
    assert.equal(await page.getByRole('button',{name:/^AI Writer/}).isVisible(),false);
    assert.equal(await page.getByRole('button',{name:/^Akkreditering/}).isVisible(),false);
    assert.equal(await page.getByRole('link',{name:/Redaktionen i ChatGPT/}).count(),mode==='staff'?0:1);
    await page.screenshot({path:'output/tool-list/'+width+'-'+(mode||'home')+'.png'});
    await page.locator('summary').click();
    assert(await page.getByRole('button',{name:/^AI Writer/}).isVisible());
   }
   await page.getByRole('button',{name:/^Sociale medier/}).click();
   await page.getByRole('button',{name:/^Mine artikler/}).click();
   const result=await page.evaluate(()=>({...fixture,overflow:document.documentElement.scrollWidth>innerWidth}));
   assert(result.selected.includes('design-editor')&&result.selected.includes('shelf'));
   assert(!result.overflow);assert.deepEqual(result.errors,[]);
   assert.equal(result.calls.length,1);assert(result.calls.every(c=>c.method==='GET'));
   await page.close();
  }
 }
 console.log('Tool list: 8 mobile/desktop + owner/staff/failure/panel cases passed; zero writes.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
