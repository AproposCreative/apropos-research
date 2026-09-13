// Real LivTips, fake API/auth. Tests reload recovery without sending a real tip.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const source = await readFile('app/ai/liv/LivTips.tsx', 'utf8');
const css = (await postcss([tailwind({content:[{raw:source,extension:'tsx'}]})]).process('@tailwind base; @tailwind utilities;', {from:undefined})).css;
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
 import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
 import Tips from './app/ai/liv/LivTips';import {FixtureProvider} from '@/lib/auth-context';
 window.fixture={errors:[]};window.addEventListener('error',e=>window.fixture.errors.push(e.message));
 window.addEventListener('unhandledrejection',e=>window.fixture.errors.push(String(e.reason)));
 window.fetch=async(path,options)=>{
 if(options.method!=='POST')return Response.json({tips:[]});
 const posts=JSON.parse(sessionStorage.getItem('fixture-posts')||'[]');
 posts.push({body:JSON.parse(options.body),token:options.headers.Authorization});
 sessionStorage.setItem('fixture-posts',JSON.stringify(posts));
 return posts.length===1?Response.json({error:'Kvittering tabt. Prøv samme tip igen.'},{status:503}):Response.json({id:'fixture-tip',created:false});};
 createRoot(document.getElementById('root')).render(<StrictMode><FixtureProvider><Tips/></FixtureProvider></StrictMode>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'auth-fixture',setup(b){
 b.onResolve({filter:/^@\/lib\/auth-context$/},()=>({path:'auth',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({resolveDir:process.cwd(),contents:`
 import React,{createContext,useContext,useState} from 'react';const users={a:{uid:'a',getIdToken:async()=>'a'},b:{uid:'b',getIdToken:async()=>'b'}};
 const Context=createContext({user:null,capabilities:{owner:false}});export const useAuth=()=>useContext(Context);
 export function FixtureProvider({children}){const [uid,setUid]=useState('a');window.switchUser=setUid;
 return React.createElement(Context.Provider,{value:{user:users[uid]||null,capabilities:{owner:false}}},children);}` }));
 }}]});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Tip retry fixture</title><style>'+css+'</style><body style="background:#080808;color:white;margin:12px"><div id="root"></div><script src="/bundle.js"></script></body></html>');
}).listen(4322,'127.0.0.1',()=>console.log('Tip fixture http://127.0.0.1:4322'));
