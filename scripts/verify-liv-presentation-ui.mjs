// Isolated real React component; no Firebase, CMS, model or production requests.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const raw = await readFile('app/ai/liv/LivPresentationEditor.tsx', 'utf8');
const css = (await postcss([tailwind({ content: [{ raw, extension: 'tsx' }] })])
  .process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react'; import {createRoot} from 'react-dom/client';
import Editor from './app/ai/liv/LivPresentationEditor';
window.fixture={owner:true,bodies:[],errors:[],loseResponse:true,saved:0};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('/api/liv/revisions/presentation'))throw Error('Unexpected network');
 if(options.method==='POST'){
  fixture.bodies.push(options.body);
  if(fixture.loseResponse){fixture.loseResponse=false;throw Error('Lost response');}
  return Response.json({status:'presentation_staged',publicationVerified:false});
 }
 return Response.json({itemId:'a'.repeat(24),expectedCmsHash:'b'.repeat(64),expectedPayloadHash:'c'.repeat(64),
  title:'Anmeldelse: Klovn sæson 11',seoTitle:'Klovn sæson 11 anmeldelse',seoDescription:'En kritisk anmeldelse af den seneste sæson af Klovn.'});
};
createRoot(document.getElementById('root')).render(<StrictMode><h1>Liv · Redaktion</h1><Editor itemId={'a'.repeat(24)} onSaved={()=>fixture.saved++}/></StrictMode>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife',
  define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture-auth', setup(b) {
    b.onResolve({ filter: /auth-context$/ }, () => ({ path: 'auth', namespace: 'fixture' }));
    b.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ resolveDir: process.cwd(), contents: `
import {useSyncExternalStore} from 'react';
const subscribe=fn=>{window.addEventListener('fixture-auth',fn);return ()=>window.removeEventListener('fixture-auth',fn);};
const user={uid:'fixture-frederik',getIdToken:async()=> 'fixture-owner'};
export function useAuth(){const owner=useSyncExternalStore(subscribe,()=>window.fixture.owner);return {user:owner?user:{uid:'fixture-colleague'},capabilities:{owner}};}
` }));
  } }] });
createServer((req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Liv editor verification</title><style>'+css+'</style><body style="background:black;color:white;margin:0;padding:16px"><main id="root"></main><script src="/bundle.js"></script></body></html>');
}).listen(4331,'127.0.0.1',()=>console.log('Liv editor fixture http://127.0.0.1:4331'));
