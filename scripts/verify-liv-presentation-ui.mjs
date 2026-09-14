// Isolated real React component; no Firebase, CMS, model or production requests.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const raw = (await Promise.all(['LivPresentationEditor', 'LivCoverEditor', 'LivShorteningEditor', 'LivApprovalFeed', 'LivContentColumn', 'LivTips']
  .map(name => readFile(`app/ai/liv/${name}.tsx`, 'utf8')))).join('\n');
const css = (await postcss([tailwind({ content: [{ raw, extension: 'tsx' }] })])
  .process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react'; import {createRoot} from 'react-dom/client';
import Editor from './app/ai/liv/LivPresentationEditor';
import Shortening from './app/ai/liv/LivShorteningEditor';
import Feed from './app/ai/liv/LivApprovalFeed';
window.fixture={owner:true,bodies:[],errors:[],loseResponse:true,saved:0,conflict:false,started:false,cancelBodies:[]};
fixture.story={itemId:'a'.repeat(24),payloadHash:'c'.repeat(64),revision:0,title:'Anmeldelse: Klovn sæson 11',summary:'En kritisk og konkret vurdering af komediens seneste sæson.',paragraphs:['Artiklens bevarede indhold.'],category:'TV-serie',articleFormat:'research-review',formatLabel:'Researchanmeldelse',rating:2,ratingReason:'Gentagelser fylder mere end nye idéer.',feedback:null,image:null,imageAlt:'',credit:'',scheduledDay:'2026-09-15',kind:'scheduled',state:'ready',decision:'pending'};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 if(String(url).startsWith('/api/liv/revisions/shortening')){
  if(options.method!=='POST')return Response.json({itemId:fixture.story.itemId,expectedCmsHash:'b'.repeat(64),expectedPayloadHash:'c'.repeat(64),wordCount:600,minTargetWords:450,maxTargetWords:599,suggestedTargetWords:500});
  fixture.bodies.push({url:String(url),body:options.body});
  const body=JSON.parse(options.body);
  if(String(url).endsWith('/review'))return Response.json({status:'shortening_review_recorded'});
  if(String(url).endsWith('/accept')){
   if(fixture.loseResponse){fixture.loseResponse=false;throw Error('Lost response');}
   return Response.json({status:'shortening_staged',itemId:body.itemId,candidateHash:body.candidateHash,publicationVerified:false});
  }
  return Response.json({status:'preview',candidateHash:'d'.repeat(64),beforeWords:600,afterWords:500,content:'<h2>En komedie på gentagelse</h2><p>Klovn holder fast i sine kendte konflikter. Det er især pauserne mellem pinlighederne, der afslører, hvor lidt figurerne har flyttet sig.</p><p>Dedikationen er tydelig, men gentagelserne giver sæsonen mindre bid end forventet.</p><p>Det er vurderingen af sæsonens greb, ikke bare et resumé, der skal stå tilbage.</p>'});
 }
 if(String(url)==='/api/liv/delivery/feed')return Response.json({stories:[fixture.story],total:1,nextOffset:null,queueEnabled:true,preparationEnabled:true});
 if(String(url).startsWith('/api/liv/revisions/cover')){
  if(options.method==='DELETE'){
   fixture.cancelBodies.push(options.body);
   if(fixture.started)return Response.json({error:'liv_cover_patch_requires_reconciliation'},{status:409});
   fixture.story.publicationBlockers=[];
   return Response.json({status:'cover_cancelled',requestId:JSON.parse(options.body).requestId});
  }
  if(options.method==='POST'){
   fixture.bodies.push(options.body);
   fixture.story.publicationBlockers=['editorial_revision_pending'];
   if(fixture.conflict)return Response.json({error:'liv_cover_source_not_linked'},{status:409});
   fixture.started=true;
   if(fixture.loseResponse){fixture.loseResponse=false;throw Error('Lost response');}
   fixture.story.publicationBlockers=[];
   fixture.story.revision++;
   return Response.json({status:'cover_staged',itemId:fixture.story.itemId,publicationVerified:false});
  }
  return Response.json({itemId:fixture.story.itemId,dayKey:fixture.story.scheduledDay,
   expectedCmsHash:'b'.repeat(64),expectedPayloadHash:'c'.repeat(64)});
 }
 if(!String(url).startsWith('/api/liv/revisions/presentation'))throw Error('Unexpected network');
 if(options.method==='DELETE'){
  fixture.cancelBodies.push(options.body);
  if(fixture.started)return Response.json({error:'liv_presentation_already_started'},{status:409});
  return Response.json({status:'presentation_cancelled',requestId:JSON.parse(options.body).requestId});
 }
 if(options.method==='POST'){
  fixture.bodies.push(options.body);
  if(fixture.conflict)return Response.json({error:'liv_presentation_payload_changed'},{status:409});
  fixture.started=true;
  if(fixture.loseResponse){fixture.loseResponse=false;throw Error('Lost response');}
  fixture.story={...fixture.story,title:JSON.parse(options.body).patch.title,revision:fixture.story.revision+1};
  return Response.json({status:'presentation_staged',publicationVerified:false});
 }
 return Response.json({itemId:'a'.repeat(24),expectedCmsHash:'b'.repeat(64),expectedPayloadHash:'c'.repeat(64),
  title:'Anmeldelse: Klovn sæson 11',seoTitle:'Klovn sæson 11 anmeldelse',seoDescription:'En kritisk anmeldelse af den seneste sæson af Klovn.'});
};
createRoot(document.getElementById('root')).render(<StrictMode><h1>Liv · Redaktion</h1>{location.search.includes('shortening')?<Shortening itemId={'a'.repeat(24)} onSaved={()=>fixture.saved++}/>:location.search.includes('feed')?<Feed/>:<Editor itemId={'a'.repeat(24)} onSaved={()=>fixture.saved++}/>}</StrictMode>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture-auth', setup(b) {
    b.onResolve({ filter: /auth-context$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onResolve({filter:/^next\/image$/},()=>({path:'image',namespace:'fixture'}));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path==='image'?`import React from 'react';export default function Image({fill,unoptimized,...props}){return React.createElement('img',props);}`:`
import {useSyncExternalStore} from 'react';
const subscribe=fn=>{window.addEventListener('fixture-auth',fn);return ()=>window.removeEventListener('fixture-auth',fn);};
const user={uid:'fixture-frederik',getIdToken:async()=> 'fixture-owner'};
const colleague={uid:'fixture-colleague',getIdToken:async()=> 'fixture-colleague'};
export function useAuth(){const owner=useSyncExternalStore(subscribe,()=>window.fixture.owner);return {user:owner?user:colleague,capabilities:{owner}};}
` }));
  } }] });
createServer((req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Liv editor verification</title><style>'+css+'</style><body style="background:black;color:white;margin:0;padding:16px"><main id="root"></main><script src="/bundle.js"></script></body></html>');
}).listen(4331,'127.0.0.1',()=>console.log('Liv editor fixture http://127.0.0.1:4331'));
