// Actual Writer parent, chat panel, shelf, versions and workspace hook/controller.
// Unrelated tools and external services are deliberately isolated. No AI/CMS calls.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const files=['app/ai/AIWriterClient.tsx','app/ai/MainChatPanel.tsx','components/DraftsShelf.tsx','app/ai/WorkspaceVersions.tsx','components/MobileAppLauncher.tsx','components/MiniMenu.tsx','components/ReviewPanel.tsx','components/WebflowPublishPanel.tsx'];
const content=await Promise.all(files.map(p=>readFile(p,'utf8')));
const css=(await postcss([tailwind({content:content.map(raw=>({raw,extension:'tsx'}))})]).process('@tailwind base; @tailwind utilities;',{from:undefined})).css;
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import Writer from './app/ai/AIWriterClient';import {autoSaveService} from './lib/auto-save-service';
window.fixture={errors:[],calls:[],offline:false,versions:[],receipts:{},restoreBodies:[],failVersions:false,loseRestoreResponse:false};
window.addEventListener('error',e=>window.fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.fixture.errors.push(String(e.reason)));
autoSaveService.setOwner('fixture-writer');
localStorage.setItem('ai-writer-setup-prefer-collapsed','1');
localStorage.setItem('ai-writer-draft:v2:fixture-writer',JSON.stringify({chatTitle:'OBSOLETE TITLE MUST NOT LOAD',messages:[{content:'old'}]}));
window.fixture.server={revision:1,updatedAt:new Date().toISOString(),data:{messages:[{id:'saved',role:'assistant',content:'Min bevarede artikeltekst fra en anden enhed.',timestamp:new Date().toISOString()}],chatTitle:'Min gemte kulturhistorie',articleData:{title:'Min gemte kulturhistorie',content:'Min bevarede artikeltekst fra en anden enhed.'},notes:'Mine private researchnoter',showWizard:false,currentDraftId:'fixture-draft'}};
window.fetch=async(url,options={})=>{
 const path=String(url);window.fixture.calls.push({path,method:options.method||'GET'});
 if(['/api/webflow/authors','/api/webflow/topics','/api/webflow/sections'].includes(path))return Response.json({items:[]});
 if(path==='/api/webflow/article-fields')return Response.json({fields:[]});
 if(path==='/api/webflow/analysis')return Response.json({guidance:[]});
 if(path==='/api/moderation/check')return Response.json({metrics:{plagiarismRisk:'low'}});
 if(path==='/api/critic/tov')return Response.json({tips:''});
 if(path==='/api/auth/me')return Response.json({uid:'fixture-writer'});
 if(path==='/api/training/optin')return Response.json({ok:true});
 if(path==='/api/writer/cms-save'){
  const envelope=JSON.parse(options.body);const input=envelope.article;(window.fixture.cmsBodies ||= []).push(input);
  const articleId=input.webflowId||'0123456789abcdef01234567';
  if(window.fixture.cmsReadbackFailure)return Response.json({articleId,saveState:'unverified',publicationVerified:false,error:'Test: CMS-ID bevaret, men readback fejlede.'},{status:502});
  return Response.json({data:{articleId,saveState:'draft',saveVerified:true,publicationVerified:false}});
 }
 if(path==='/api/writer/workspace'){
  if(window.fixture.offline)throw new Error('Fixture offline');
  if(options.method==='PUT'){const input=JSON.parse(options.body);if(input.revision!==window.fixture.server.revision){window.fixture.versions.push({id:'a'.repeat(64),kind:'conflicts',snapshot:{revision:input.revision,data:input.data,updatedAt:new Date().toISOString()}});return Response.json({error:'conflict'},{status:409});}window.fixture.server={revision:input.revision+1,data:input.data,updatedAt:new Date().toISOString()};return Response.json({revision:window.fixture.server.revision});}
  return Response.json({workspace:window.fixture.server});
 }
 if(path.startsWith('/api/writer/workspace/versions')){
  if(window.fixture.failVersions)return Response.json({error:'unavailable'},{status:503});
  const query=new URL(path,location.origin).searchParams;
  if(query.has('id'))return Response.json({snapshot:window.fixture.versions.find(v=>v.id===query.get('id')).snapshot});
  return Response.json({versions:window.fixture.versions.map(v=>({id:v.id,kind:v.kind,title:v.snapshot.data.chatTitle,updatedAt:v.snapshot.updatedAt,revision:v.snapshot.revision}))});
 }
 if(path==='/api/writer/workspace/restore'){
  const input=JSON.parse(options.body);window.fixture.restoreBodies.push(options.body);
  let restored=window.fixture.receipts[input.operationId];
  if(!restored){
   const selected=window.fixture.versions.find(v=>v.id===input.selection.id).snapshot;
   window.fixture.versions.push({id:'100',kind:'history',snapshot:structuredClone(window.fixture.server)},{id:'101',kind:'history',snapshot:{revision:input.revision,data:input.local,updatedAt:new Date().toISOString()}});
   restored={revision:window.fixture.server.revision+1,data:{...structuredClone(selected.data),currentDraftId:'restored-fixture-draft'},updatedAt:new Date().toISOString()};
   window.fixture.server=restored;window.fixture.receipts[input.operationId]=restored;
  }
  if(window.fixture.loseRestoreResponse){window.fixture.loseRestoreResponse=false;throw new Error('Response lost after fixture commit');}
  return Response.json({workspace:restored});
 }
 throw new Error('Unexpected fixture network: '+path);
};
createRoot(document.getElementById('root')).render(<StrictMode><Writer/></StrictMode>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"','process.env':'{}'},plugins:[{name:'isolated-services',setup(b){
 const omitted=/\/(SetupWizard|AccreditationSetupFlow|WebAppsPanel|DesignEditorView|AuthModal|ChatSearchModal|SourcesPanel|SettingsPanel|NewsletterClient|DashboardClient|PodcastClient|SeoEngineClient|PushDeskClient|LivDeskClient|AkkrediteringClient|LivInboxClient|SplineIframeEmbed|FileDropZone|ArticleTemplates|AuthorSelection|ArticleSuggestions|ArticlePicker|CategorySelection|PreflightRecommendations|PreflightStatus)$/;
 b.onResolve({filter:/.*/},a=>{
  if(omitted.test(a.path))return {path:'empty',namespace:'fixture'};
  if(/auth-context$|firebase-service$|file-upload-service$|^next\/navigation$|^next\/link$/.test(a.path))return {path:a.path.split('/').pop(),namespace:'fixture'};
 });
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:
 a.path==='empty'?`export default function Empty(){return null;}`:
 a.path==='auth-context'?`const user={uid:'fixture-writer',email:'fixture@example.invalid',getIdToken:async()=> 'fixture-token'};const state={user,logout:async()=>{},capabilities:{owner:true}};export const useAuth=()=>state;`:
 a.path==='firebase-service'?`export const getUserDrafts=async()=>[];export const getDraft=async()=>null;export const saveDraft=async()=>{throw new Error('Draft write outside test scope');};export const deleteDraft=saveDraft;export const updateDraft=saveDraft;`:
 a.path==='file-upload-service'?`export const isImageFile=()=>false;export const uploadImportImage=async()=>{throw new Error('Upload outside test scope');};`:
 a.path==='navigation'?`const params=new URLSearchParams('view=ai');const router={replace:()=>{},push:()=>{}};export const useRouter=()=>router;export const usePathname=()=>'/ai';export const useSearchParams=()=>params;`:
 `import React from 'react';export default function Link(p){return React.createElement('a',p,p.children);}`}));
}}]});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 if(req.url?.startsWith('/images/')){res.statusCode=204;res.end();return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Writer resume verification</title><style>'+css+'</style><body style="background:black;color:white;margin:0"><div id="root"></div><script src="/bundle.js"></script></body></html>');
}).listen(4325,'127.0.0.1',()=>console.log('Writer fixture http://127.0.0.1:4325'));
