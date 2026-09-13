// Real shelf component; fake auth/data only. No production credentials or writes.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const source = await readFile('components/DraftsShelf.tsx', 'utf8');
const css = (await postcss([tailwind({content:[{raw:source,extension:'tsx'}]})]).process('@tailwind base; @tailwind utilities;', {from:undefined})).css;
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
 import Shelf from './components/DraftsShelf';import {FixtureProvider} from '@/lib/auth-context';
 window.fixture={pending:[],requests:[],errors:[],actions:[],fail:false};
 window.addEventListener('error',e=>window.fixture.errors.push(e.message));
 window.addEventListener('unhandledrejection',e=>window.fixture.errors.push(String(e.reason)));
 createRoot(document.getElementById('root')).render(<StrictMode><FixtureProvider><Shelf
 onSelect={draft=>window.fixture.actions.push('open:'+draft.id)}
 onOpenVersions={()=>window.fixture.actions.push('versions')}
 onOpenShares={()=>window.fixture.actions.push('shares')}
 /></FixtureProvider></StrictMode>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixtures',setup(b){
 b.onResolve({filter:/^@\/lib\/(auth-context|firebase-service)$/},args=>({path:args.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({resolveDir:process.cwd(),contents:args.path.endsWith('auth-context')?`
 import React,{createContext,useContext,useState} from 'react';const Context=createContext({user:null});
 export const useAuth=()=>useContext(Context);export function FixtureProvider({children}){
 const [uid,setUid]=useState('a');window.switchUser=setUid;
 return React.createElement(Context.Provider,{value:{user:uid?{uid}:null}},children);}
 `:`
 export async function getUserDrafts(uid){window.fixture.requests.push(uid);
 if(uid==='a')await new Promise(resolve=>window.fixture.pending.push(resolve));
 if(window.fixture.fail)throw new Error('fixture unavailable');
 return [{id:'draft-'+uid,title:'PRIVATE-'+uid,messages:[],articleData:{},createdAt:new Date('2026-09-13')}];}
 export async function deleteDraft(id){window.fixture.actions.push('delete:'+id);}
 export async function updateDraft(id){window.fixture.actions.push('rename:'+id);}
 `}));
 }}]});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Draft shelf fixture</title><style>'+css+'</style><body style="background:#080808;color:white;margin:0"><main style="height:100dvh;max-width:400px"><div id="root" style="height:100%"></div></main><script src="/bundle.js"></script></body></html>');
}).listen(4321,'127.0.0.1',()=>console.log('Draft shelf fixture http://127.0.0.1:4321'));
