// Real Prompt Architect component, isolated auth and deliberately late HTTP responses.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const source = await readFile(new URL('../app/ai/prompt-architect/PromptArchitectClient.tsx', import.meta.url), 'utf8');
const css = (await postcss([tailwind({content:[{raw:source,extension:'tsx'}]})]).process('@tailwind base; @tailwind utilities;', {from:undefined})).css;
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{StrictMode} from 'react';
 import {createRoot} from 'react-dom/client';
 import PromptArchitect from './app/ai/prompt-architect/PromptArchitectClient';
 import {FixtureProvider} from '@/lib/auth-context';
 import {PROMPT_ARCHITECT_CONTEXT_KEY,promptArchitectKey} from './lib/prompt-architect-constants';
 sessionStorage.setItem(PROMPT_ARCHITECT_CONTEXT_KEY,JSON.stringify({notes:'LEGACY-UNOWNED'}));
 for(const uid of ['a','b'])sessionStorage.setItem(promptArchitectKey(PROMPT_ARCHITECT_CONTEXT_KEY,uid),JSON.stringify({notes:'PRIVATE-'+uid}));
 window.fixture={requests:[],errors:[],pending:[]};
 window.addEventListener('error',e=>window.fixture.errors.push(e.message));
 window.addEventListener('unhandledrejection',e=>window.fixture.errors.push(String(e.reason)));
 window.fetch=async(path,options)=>{
   const body=JSON.parse(options.body);const token=options.headers.Authorization;
   window.fixture.requests.push({path,body,token});
   if(token==='Bearer fixture-a')await new Promise(resolve=>window.fixture.pending.push(resolve));
   // Intentionally ignore AbortSignal: a late successful response must still be ignored.
   const label=body.notes;
   return Response.json({nodes:[{id:'test',type:'promptModule',position:{x:40,y:40},data:{labelDa:label,included:true,kind:'system',charCount:label.length,excerpt:label}}],edges:[],segments:[{id:'test',labelDa:label,included:true,kind:'system',charCount:label.length}],segmentContents:{test:label},webContent:null});
 };
 createRoot(document.getElementById('root')).render(<StrictMode><FixtureProvider><PromptArchitect/></FixtureProvider></StrictMode>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',outdir:'out',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'auth-fixture',setup(b){
 b.onResolve({filter:/^@\/lib\/auth-context$/},()=>({path:'auth',namespace:'fixture'}));
 b.onResolve({filter:/^next\/link$/},()=>({path:'link',namespace:'link-fixture'}));
 b.onLoad({filter:/.*/,namespace:'link-fixture'},()=>({resolveDir:process.cwd(),contents:"import React from 'react';export default function Link(props){return React.createElement('a',props);}"}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:process.cwd(),contents:`import React,{createContext,useContext,useState} from 'react';const users={a:{uid:'a',getIdToken:async()=>'fixture-a'},b:{uid:'b',getIdToken:async()=>'fixture-b'}};const Context=createContext({user:null});export const useAuth=()=>useContext(Context);export function FixtureProvider({children}){const [id,setId]=useState('a');window.switchUser=setId;return React.createElement(Context.Provider,{value:{user:users[id]||null}},children);}`}));
 }}]});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles.find(f=>f.path.endsWith('.js')).text);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Prompt isolation fixture</title><style>'+css+'\n'+(bundle.outputFiles.find(f=>f.path.endsWith('.css'))?.text||'')+'</style><body style="background:#080808;color:white"><div id="root"></div><script src="/bundle.js"></script></body></html>');
}).listen(4320,'127.0.0.1',()=>console.log('Prompt fixture http://127.0.0.1:4320'));
