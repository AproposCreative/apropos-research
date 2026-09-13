// Real component, isolated auth and API transport. No production/AI requests.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const source = await readFile('components/SourcesPanel.tsx', 'utf8');
const css = (await postcss([tailwind({content:[{raw:source,extension:'tsx'}]})]).process('@tailwind base; @tailwind utilities;', {from:undefined})).css;
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import Panel from './components/SourcesPanel';import {FixtureProvider} from '@/lib/auth-context';
import {MediaProvider,useMedia} from './lib/media-context';
function Observer(){const m=useMedia();window.mediaObserved={sources:m.mediaSources,enabled:m.getEnabledMedias(),error:m.error};window.refreshObserved=m.refreshMediaSources;return null;}
window.fixture={requests:[],pending:[],errors:[],failRead:false,failWrite:false,holdRead:false};
window.addEventListener('error',e=>window.fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.fixture.errors.push(String(e.reason)));
window.fetch=async(input,init={})=>{
 if(input!=='/api/article-counts'&&input!=='/api/media-sources'&&!String(input).startsWith('/api/media-sources?'))throw new Error('unexpected fixture network');
 const uid=new Headers(init.headers).get('Authorization')?.replace('Bearer token-','');
 if(!['a','b'].includes(uid))return Response.json({error:'unauthorized'},{status:401});
 if(input==='/api/article-counts')return Response.json({data:{counts:{soundvenue:12,total:12}}});
 const key='sources-'+uid;let sources=JSON.parse(sessionStorage.getItem(key)||'[]');
 const method=init.method||'GET';window.fixture.requests.push({uid,method,url:input});
 if(method==='GET'){
  if(window.fixture.holdRead)await new Promise(r=>window.fixture.pending.push(r));
  return window.fixture.failRead?Response.json({error:'offline'},{status:503}):Response.json({data:{sources}});
 }
 if(window.fixture.failWrite)return Response.json({error:'unavailable'},{status:503});
 const body=JSON.parse(init.body);const id=method==='POST'?uid+'_'+body.name.toLowerCase():new URL(input,location.origin).searchParams.get('id');
 const saved={...body,id,createdAt:'2026-09-14'};sources=[...sources.filter(s=>s.id!==id),saved];
 sessionStorage.setItem(key,JSON.stringify(sources));return Response.json({data:{source:saved}});
};
createRoot(document.getElementById('root')).render(<StrictMode><FixtureProvider><MediaProvider><Observer/><Panel isOpen onClose={()=>{}}/></MediaProvider></FixtureProvider></StrictMode>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/auth-context$/},()=>({path:'auth-context',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:process.cwd(),contents:`
 import React,{createContext,useContext,useState,useMemo} from 'react';const C=createContext({user:null});
 export const useAuth=()=>useContext(C);export function FixtureProvider({children}){
 const [uid,setUid]=useState('a');window.switchUser=setUid;const user=useMemo(()=>uid?{uid,getIdToken:async()=> 'token-'+uid}:null,[uid]);
 return React.createElement(C.Provider,{value:{user}},children);}
 `}));
}}]});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Personal sources fixture</title><style>'+css+'</style><body style="background:#080808;color:white;margin:0"><div id="root" style="height:100dvh"></div><script src="/bundle.js"></script></body></html>');
}).listen(4322,'127.0.0.1',()=>console.log('Personal sources fixture http://127.0.0.1:4322'));
