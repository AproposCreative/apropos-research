// Actual auth provider, loader, GSAP, query cache and tool menu. All identity,
// access and HTTP transports are isolated fixtures. No production sessions.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';

const mocks = {
  'next/navigation': `export const usePathname=()=>'/ai';`,
  'next/link': `export default function Link(p){return <a {...p}/>}`,
  'firebase/auth': `export const onIdTokenChanged=(auth,cb)=>{window.authChange=cb;const timer=setTimeout(()=>cb(auth.currentUser),50);return()=>clearTimeout(timer)};
    export const signInWithEmailAndPassword=()=>{throw Error('Forbidden sign in')}; export const createUserWithEmailAndPassword=signInWithEmailAndPassword;export const signOut=signInWithEmailAndPassword;export const signInWithPopup=signInWithEmailAndPassword;export class GoogleAuthProvider {}`,
  './firebase': `export const getFirebaseAuth=()=>window.fixtureAuth;`,
  './email-verification': `export const createEmailVerificationActions=()=>({sendVerification:async()=>{},checkVerification:async()=>{}});`,
  './auth-mail-client': `export const requestAuthMail=()=>{throw Error('Forbidden mail')};`,
  './editorial-signup': `export const registerEditorialAccount=()=>{throw Error('Forbidden signup')};`,
  './auto-save-service': `export const autoSaveService={setOwner:()=>{}};`,
  './auth-access-client': `export const ACCESS_UNAVAILABLE_MESSAGE='Adgang kunne ikke bekræftes';export const requireAllowedUser=async(user)=>{if(location.search.includes('denied'))throw Error(ACCESS_UNAVAILABLE_MESSAGE);return {owner:user.uid==='owner'}};`,
};
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode,useState} from 'react';import {createRoot} from 'react-dom/client';
import {AuthProvider,useAuth} from './lib/auth-context';import {QueryProvider} from './lib/query-provider';
import Launcher from './components/MobileAppLauncher';import Panel from './components/WebAppsPanel';
import {describeTools} from './lib/tool-availability';
const mode=new URLSearchParams(location.search).get('mode');
window.fixture={calls:[],errors:[],readyAt:null,focusAt:null,started:performance.now()};
const account=uid=>({uid,emailVerified:true,email:uid+'@fixture.invalid',getIdToken:async()=> 'fixture-not-real'});
window.fixtureAuth={currentUser:mode==='signedout'?null:account('owner')};
window.changeAccount=()=>{fixtureAuth.currentUser=account('staff');window.authChange(fixtureAuth.currentUser)};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 fixture.calls.push({url:String(url),method:options.method||'GET',at:performance.now()});
 if(url!=='/api/editorial/tools'||options.method&&options.method!=='GET')throw Error('Unexpected request');
 if(mode==='timeout')return await new Promise(()=>{});
 await new Promise(r=>setTimeout(r,mode==='slow'?1200:120));
 if(mode==='error')return Response.json({}, {status:503});
 return Response.json({checkedAt:new Date().toISOString(),tools:describeTools({paidAiBlocked:true,accreditationPaused:true,inboxAutoRespond:false},{owner:fixtureAuth.currentUser.uid==='owner'})});
};
function App(){const {user,accessError}=useAuth();const[panel,setPanel]=useState(false);
 if(!user)return <main data-login>{accessError||'Log ind'}</main>;
 if(!fixture.readyAt)fixture.readyAt=performance.now();
 return panel?<Panel isOpen onClose={()=>setPanel(false)} onOpenShelf={()=>{}}/>:<Launcher onSelectApp={()=>setPanel(true)} onOpenShelf={()=>{}}/>;
}
createRoot(document.getElementById('root')).render(<StrictMode><QueryProvider><AuthProvider><App/></AuthProvider></QueryProvider></StrictMode>);
` }, bundle: true, write: false, outdir: '/virtual', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /./ }, args => Object.hasOwn(mocks,args.path)?({ path: args.path, namespace: 'fixture' }):undefined);
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), loader: 'tsx', contents: mocks[args.path] }));
} }] });
const server = createServer(async (req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);return;}
  if(req.url==='/bundle.css'){res.setHeader('Content-Type','text/css');res.end(bundle.outputFiles.find(f=>f.path.endsWith('.css')).text);return;}
  if(req.url.startsWith('/images/')){res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('public'+decodeURI(req.url)));return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Startup fixture</title><link rel="stylesheet" href="/bundle.css"><style>*{box-sizing:border-box}body{margin:0;background:black;color:white;font-family:Arial}button{font-family:inherit}#root{height:100vh}.contents{display:contents}</style><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const reports=[];
await mkdir('output/platform-polish',{recursive:true});
try {
  for(const [width,mode] of [[390,'normal'],[1440,'normal'],[320,'slow'],[390,'error'],[390,'timeout'],[390,'denied'],[390,'signedout'],[390,'reduced']]) {
    const page=await browser.newPage({viewport:{width,height:1000},reducedMotion:mode==='reduced'?'reduce':'no-preference'});
    await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
    await page.goto(origin+'/?mode='+mode);
    if(mode==='slow') {
      await page.locator('[data-apropos-boot]').waitFor();
      assert.equal(await page.locator('nav').count(),0); // No tools screen until catalogue ready.
      await page.waitForFunction(()=>document.querySelector('[data-boot-line]')?.getAttribute('style')?.includes('transform'));
      await page.screenshot({path:'output/platform-polish/boot.png'});
    }
    await page.locator('[data-apropos-boot]').waitFor({state:'detached',timeout:10000});
    assert.equal(await page.getByText('Henter værktøjer …',{exact:true}).count(),0);
    if(['denied','signedout'].includes(mode)) {
      assert.equal(await page.locator('nav').count(),0);
      assert.equal(await page.evaluate(()=>fixture.calls.length),0);
    } else {
      await page.getByRole('button',{name:/^Sociale medier/}).waitFor();
      if(['error','timeout'].includes(mode))assert(await page.getByText('Aktuel status kunne ikke hentes.',{exact:false}).isVisible());
      else assert(await page.locator('summary').isVisible());
      assert.equal(await page.evaluate(()=>fixture.calls.length),1);
      if(mode==='normal') {
        assert(await page.evaluate(()=>fixture.readyAt-fixture.started<1800)); // No forced 2s branding delay.
        await page.screenshot({path:'output/platform-polish/home-'+width+'.png'});
        await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
        await page.waitForTimeout(250);
        assert.equal(await page.locator('[data-apropos-boot]').count(),0);
        await page.getByRole('button',{name:/^Sociale medier/}).click();
        assert.equal(await page.evaluate(()=>fixture.calls.length),1); // Side menu reuses the same query.
        await page.getByRole('button',{name:'Luk værktøjer',exact:true}).click();
        await page.evaluate(()=>changeAccount());
        await page.getByRole('link',{name:/Redaktionen i ChatGPT/}).waitFor({state:'detached'});
        await page.locator('[data-apropos-boot]').waitFor({state:'detached'});
        assert.equal(await page.evaluate(()=>fixture.calls.length),2);
      }
    }
    const result=await page.evaluate(()=>({...fixture,overflow:document.documentElement.scrollWidth>innerWidth}));
    assert(!result.overflow); assert.deepEqual(result.errors,[]); assert(result.calls.every(c=>c.method==='GET'));
    reports.push({width,mode,requests:result.calls.length,readyMs:result.readyAt?Math.round(result.readyAt-result.started):null});
    await page.close();
  }
  console.log(JSON.stringify({fixture:true,productionCalls:0,reports},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
