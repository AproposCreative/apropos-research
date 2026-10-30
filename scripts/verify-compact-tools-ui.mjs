// Real tool clients and shared chrome, with isolated auth and service responses.
// No credentials, provider calls, SMTP, CMS writes, publication or configuration changes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const require=createRequire(import.meta.url);
const config=require('../tailwind.config.cjs');
const css=(await postcss([tailwind({...config,content:['./app/**/*.tsx','./components/**/*.tsx']})]).process('@tailwind base;@tailwind utilities;',{from:undefined})).css;
const cases={
 liv:['./app/ai/liv/LivDeskClient','Liv · Redaktion'],
 inbox:['./app/ai/liv-inbox/LivInboxClient','Liv Indbakke'],
 press:['./app/ai/akkreditering/AkkrediteringClient','Akkreditering'],
 seo:['./app/ai/seo/SeoEngineClient','SEO & Google'],
 newsletter:['./app/ai/newsletter/NewsletterClient','Nyhedsbrev'],
 podcast:['./app/ai/podcast/PodcastClient','Podcast'],
 push:['./app/push/PushDeskClient','Pushbeskeder'],
 dashboard:['./app/dashboard/DashboardClient','Trafik & overblik'],
 images:['./app/ai/image-gen/workshop','Image-gen'],
 settings:['./app/settings/page','Indstillinger'],
 editorial:['./app/ai/editorial/EditorialCockpitClient','AI-redaktionschef'],
 connection:['./app/connect/chatgpt/connection','Apropos i ChatGPT'],
 profile:['./app/profile/page','Profil'],
};
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React from 'react';import {createRoot} from 'react-dom/client';
import {QueryClient,QueryClientProvider} from '@tanstack/react-query';
${Object.entries(cases).map(([id,[path]])=>`import ${id} from '${path}';`).join('\n')}
const tools={${Object.keys(cases).join(',')}};
window.fixture={calls:[],errors:[],closed:false};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.confirm=()=>{throw Error('Unexpected confirmation')};
window.fetch=async(url,options={})=>{
 const path=String(url).split('?')[0];const method=options.method||'GET';fixture.calls.push({path,method});
 if(method!=='GET'){if(path==='/api/image-gen/workspace'&&method==='POST')return Response.json({revision:1});if(path==='/api/editorial/signals'&&method==='POST')return Response.json({data:{signals:[]}});throw Error('Forbidden write '+path);}
 const responses={
  '/api/liv/delivery/feed':{stories:[],total:0,nextOffset:null,work:{items:[],complete:true,retained:[]},ideas:{items:[],retained:[],complete:true},week:[]},
  '/api/liv/status':{entries:[]},'/api/liv/publications':{entries:[]},
  '/api/liv-inbox/items':{data:{items:[]}},'/api/liv-inbox/activity':{data:{entries:[]}},
  '/api/liv-inbox/settings':{data:{settings:{enabled:false,guidelines:'Private guidelines',signature:'Liv Brandt',confidenceThreshold:0.8,editorialFacts:''},sending:{enabled:false}}},
  '/api/liv-inbox/sync':{data:{mailbox:{configured:true,user:'liv@example.test',host:'imap.one.com'},state:{lastSyncedAt:null}}},
  '/api/accreditation/tickets':{tickets:[],counts:{}},'/api/accreditation/approvals':{approvals:[]},
  '/api/accreditation/status':{connections:{imap:{configured:true},smtp:{configured:true}},outboundSafety:{mode:'personal-approval-only'}},
  '/api/accreditation/liv-profile':{},
  '/api/newsletter/schedule':{items:[]},'/api/newsletter/weekly-auto/settings':{enabled:false,weekdayIso:5,timeHHMM:'13:45',testRecipients:[]},
  '/api/newsletter/draft':{found:true,html:'<h1>Bevaret nyhedsbrev</h1>',subject:'Ugens kultur',articleIds:[],articles:[]},
  '/api/podcast/manifest':{episodes:[]},'/api/push/history':{items:[]},
  '/api/dashboard':{data:{period:'28d',generatedAt:'2026-10-30T12:00:00Z',overview:{activeUsers:450,pageViews:900,sessions:600},articles:{published:100,drafts:5},topArticles:[],viewsTrend:[],trafficSources:[],google:{searchConsoleLinked:false},authorLeaderboard:[],recommendations:[]}},
  '/api/image-gen/articles':{articles:[],nextCursor:null},'/api/image-gen/jobs':{jobs:[]},
  '/api/image-gen/budget':{remainingDkk:10},'/api/image-gen/quotes':{quotes:[]},'/api/image-gen/workspace':{revision:0,state:null},
  '/api/webflow/status':{connected:true,hasToken:true,hasSiteId:true,hasArticlesCollectionId:true,hasAuthorsCollectionId:true},
  '/api/webflow/config':{siteId:'fixture',articlesCollectionId:'fixture',authorsCollectionId:'fixture'},
  '/api/webflow/article-fields':{fields:[]},'/api/webflow/mapping':{entries:[]},
  '/api/ai-cost/actions':{actions:[]},'/api/editorial/desk':{stories:[]},
 };
 if(!(path in responses))return Response.json({data:{items:[],entries:[]},items:[],entries:[],jobs:[],settings:{},complete:true});
 return Response.json(responses[path]);
};
const id=new URLSearchParams(location.search).get('tool');const Tool=tools[id];
createRoot(document.getElementById('root')).render(<QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><Tool embedded onClose={()=>fixture.closed=true} onOpenWriter={()=>{throw Error('Writer should not open')}} requestId="" publicationId=""/></QueryClientProvider>);
`},bundle:true,write:false,outdir:'/virtual',jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/auth-context$|^next\/link$|^next\/image$|^next\/navigation$|^@\/lib\/firebase$|AuthModal$|resumable-client$/},a=>({path:a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),loader:'tsx',contents:
  a.path.endsWith('auth-context')?`const user={uid:'fixture',email:'owner@example.test',displayName:'Test owner',getIdToken:async()=> 'fixture-not-real'};export const useAuth=()=>({user,loading:false,capabilities:{owner:true},signIn:()=>{},signInWithGoogle:()=>{}});`:
  a.path==='next/link'?`export default function Link(p){return <a {...p}/>}`:
  a.path==='next/image'?`export default function Image({unoptimized,fill,...p}){return <img {...p}/>;}`:
  a.path==='next/navigation'?`const params=new URLSearchParams();export const useSearchParams=()=>params;export const usePathname=()=>'/ai';export const useRouter=()=>({push:()=>{},replace:()=>{},refresh:()=>{}});`:
  a.path.endsWith('AuthModal')?`export default function Modal(){return null;}`:
  a.path.endsWith('resumable-client')?`export const uploadAudioToFirebaseStorage=()=>{throw Error('Forbidden upload')};`:
  `export const auth={currentUser:null};export const storage=null;export const db=null;`
 }));
}}]});
const server=createServer(async(req,res)=>{
 if(req.url==='/bundle.js'||req.url==='/bundle.css'){res.setHeader('Content-Type',req.url.endsWith('.js')?'text/javascript':'text/css');res.end(bundle.outputFiles.find(f=>f.path.endsWith(req.url.endsWith('.js')?'.js':'.css')).text);return;}
 if(req.url.startsWith('/images/')){try{res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('public'+req.url));}catch{res.statusCode=404;res.end();}return;}
 res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html lang="da" class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;background:#000;color:#fff}#root{height:100dvh}</style><link rel="stylesheet" href="/bundle.css"><body><div id="root"></div><script>window.process={env:{}}</script><script src="/bundle.js"></script></body></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const out='output/compact-tools-20261030';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'chrome'});const results=[];
try{
 for(const width of [320,390,768,1440])for(const [id,[,title]] of Object.entries(cases)){
  const page=await browser.newPage({viewport:{width,height:960}});
  page.on('pageerror',e=>console.error(id+' JS '+e.message));
  await page.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
  await page.goto(origin+'/?tool='+id);
  await page.getByRole('heading',{name:title,exact:true}).waitFor({timeout:15000}).catch(async e=>{console.error(id,await page.evaluate(()=>({errors:window.fixture?.errors,text:document.body.innerText.slice(0,1200)})));await page.screenshot({path:out+'/failure.png'});throw e;});
  await page.waitForTimeout(300);
  const state=await page.evaluate(()=>{
   const header=document.querySelector('header');const h=header.getBoundingClientRect();
   const controls=[...header.querySelectorAll('button,select,a,summary')].filter(e=>e.getBoundingClientRect().width&&e.getBoundingClientRect().height);
   return {...fixture,overflow:document.documentElement.scrollWidth>innerWidth,headerHeight:h.height,
    touch:controls.map(e=>({label:e.getAttribute('aria-label')||e.textContent.trim(),height:e.getBoundingClientRect().height,top:e.getBoundingClientRect().top})),font:getComputedStyle(header).fontFamily};
  });
  await page.screenshot({path:out+'/'+id+'-'+width+'.png'});
  assert.deepEqual(state.errors,[],id+' browser errors');assert(!state.overflow,id+' horizontal page overflow at '+width);
  assert(state.headerHeight<=64,id+' single-row header '+state.headerHeight);
  assert(state.touch.every(e=>e.height>=43.5),id+' minimum touch height '+JSON.stringify(state.touch));
  assert(state.font.includes('-apple-system'),id+' system font');
  assert(state.calls.every(c=>c.method==='GET'||['/api/image-gen/workspace','/api/editorial/signals'].includes(c.path)),id+' no unexpected operations');
  const selectTab = async (buttonName, value) => {
   const header = page.locator('header').first();const button=header.getByRole('button',{name:buttonName,exact:true});
   if(await button.isVisible())await button.click();else await header.getByRole('combobox').selectOption(value);
  };
  if(id==='liv'){
   await page.getByRole('button',{name:'Udgivet',exact:true}).click();
   assert.equal(await page.getByRole('button',{name:'Udgivet',exact:true}).getAttribute('aria-current'),'page');
   await page.getByRole('button',{name:'Kommende',exact:true}).click();
  }
  if(id==='seo'){
   await selectTab('Artikel','artikel');
   await page.locator('input').first().fill('Bevaret redigering');
   await selectTab('Arkiv','arkiv');
   await selectTab('Artikel','artikel');
   assert.equal(await page.locator('input').first().inputValue(),'Bevaret redigering');
  }
  if(id==='settings'){
   await selectTab('Profil','profile');
   await page.getByText('Konto & profil',{exact:true}).waitFor();
   await selectTab('Webflow','webflow');
  }
  if(id==='newsletter'){
   await page.getByRole('button',{name:'Vis mørkt preview',exact:true}).click();
   await page.getByRole('button',{name:'Vis lyst preview',exact:true}).click();
   await page.getByRole('button',{name:'Vis på mobil',exact:true}).click();
   await page.getByRole('button',{name:'Vis på computer',exact:true}).click();
  }
  if(id==='images'){
   await page.getByRole('button',{name:'Budget og indstillinger',exact:true}).click();
   await page.getByRole('button',{name:'Luk budget og indstillinger',exact:true}).click();
  }
  const close=page.getByRole('button',{name:'Luk',exact:true});
  if(await close.count()){await close.click();assert(await page.evaluate(()=>fixture.closed));}
  assert.deepEqual(await page.evaluate(()=>fixture.errors),[]);
  assert((await page.evaluate(()=>fixture.calls)).every(c=>c.method==='GET'||['/api/image-gen/workspace','/api/editorial/signals'].includes(c.path)));
  results.push({id,width,...state});await page.close();
 }
 await writeFile(out+'/verification.json',JSON.stringify({verifiedAt:new Date().toISOString(),cases:results},null,2));
 console.log('Compact tools: '+results.length+' real-client mobile/desktop cases; one-row headers, touch controls, navigation and editing preserved. No service writes.');
}finally{await browser.close();await new Promise(r=>server.close(r));}
