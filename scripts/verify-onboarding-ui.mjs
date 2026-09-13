// Real login/dialog components and signup orchestration; isolated fake auth/mail.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const content = await Promise.all(['app/login/page.tsx','components/AuthModal.tsx'].map(p=>readFile(p,'utf8')));
const css = (await postcss([tailwind({content:content.map(raw=>({raw,extension:'tsx'}))})]).process('@tailwind base; @tailwind utilities;',{from:undefined})).css;
const bundle = await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import Login from './app/login/page';import Modal from './components/AuthModal';import {FixtureProvider} from '@/lib/auth-context';
window.fixture={calls:[],errors:[],mode:'ok'};
window.process={env:{NODE_ENV:'development'}};
window.addEventListener('error',e=>window.fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>window.fixture.errors.push(String(e.reason)));
window.fetch=async()=>{throw new Error('Fixture network forbidden');};
createRoot(document.getElementById('root')).render(<StrictMode><FixtureProvider><Login/><Modal/></FixtureProvider></StrictMode>);
`},bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/auth-context$|^next\/navigation$|^next\/link$|SplineIframeEmbed$/},a=>({path:a.path.endsWith('auth-context')?'@/lib/auth-context':a.path,namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},a=>({resolveDir:process.cwd(),contents:
 a.path==='next/link'?`import React from 'react';export default function Link(p){return React.createElement('a',{...p,onClick:e=>{e.preventDefault();window.fixture.navigate(p.href);}},p.children);}`:
 a.path==='next/navigation'?`const router={replace:p=>window.fixture.navigate(p)};export const useRouter=()=>router;`:
 a.path.endsWith('SplineIframeEmbed')?`export default function Spline(){return null;}`:`
 import React,{createContext,useContext,useState} from 'react';
 import {registerEditorialAccount} from './lib/editorial-signup';
 const C=createContext({});export const useAuth=()=>useContext(C);
 export function FixtureProvider({children}){
 const [route,setRoute]=useState('/ai');const [verificationEmail,setEmail]=useState(null);
 window.fixture.navigate=p=>{window.fixture.calls.push('navigate:'+p);setRoute(p);};
 const value={user:null,verificationEmail,signIn:async()=>{},resetPassword:async()=>{},signInWithGoogle:async()=>{},sendVerification:async()=>{},checkVerification:async()=>{},
 signUp:async(email,password)=>{const user={uid:'fixture',getIdToken:async()=> 'fixture-token'};await registerEditorialAccount(email,password,{
 create:async address=>{window.fixture.calls.push('create');if(window.fixture.mode==='exists')throw Object.assign(new Error('exists'),{code:'auth/email-already-in-use'});setEmail(address);return {user};},
 current:()=>user,send:async()=>{window.fixture.calls.push('send');if(window.fixture.mode==='mail-fail')throw new Error('offline');}
 });}};
 return React.createElement(C.Provider,{value},React.Children.toArray(children)[route==='/ai'?1:0]);
 }
 `}));
}}]});
createServer((req,res)=>{
 if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
 if(req.url?.startsWith('/images/')){res.statusCode=204;res.end();return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Onboarding fixture</title><style>'+css+'</style><body style="background:black;color:white;margin:0"><div id="root"></div><script src="/bundle.js"></script></body></html>');
}).listen(4323,'127.0.0.1',()=>console.log('Onboarding fixture http://127.0.0.1:4323'));
