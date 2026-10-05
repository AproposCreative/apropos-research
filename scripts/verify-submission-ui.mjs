// Real component, isolated fixtures. No Firebase, provider or CMS requests.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const raw = await readFile('app/connect/chatgpt/submission.tsx', 'utf8');
const css = (await postcss([tailwind({ content: [{ raw, extension: 'tsx' }] })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import Submission from './app/connect/chatgpt/submission';
window.fixture={calls:[],errors:[]};
window.addEventListener('error',e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
const article={title:'En koncert, man tager med hjem',subtitle:'En konkret anmeldelse af aftenen.',intro:'Det første afsnit forklarer koncerten.',content:'<p>Artikeltekst.</p>',author:'author-id',category:'category-id',articleFormat:'research-review',rating:5,ratingReason:'Bandets samspil og sangene bærer aftenen.',slug:'koncerten',seoTitle:'Koncertanmeldelse',seoDescription:'En direkte vurdering af koncerten.'};
const prepared=location.search.includes('prepared');
fixture.state={row:{revision:1,status:prepared?'prepared':'awaiting_preparation',article,questions:[],missingMetadata:[],displayNames:{author:'Frederik Kragh',category:'Musik'}},
quote:prepared?null:{quoteId:'b'.repeat(64),canAccept:true,estimateDkk:4.2,ceilingDkkMicros:10000000,lines:[{step:'Kontroller og billeder (testdata)',estimateDkk:4.2}],provider:{blocked:false}},
preview:prepared?{ready:true,preparedHash:'c'.repeat(64),article,assets:[{url:'https://fixture.test/cover.svg',alt:'Testcover',caption:'Fixture',credit:'Testdata'}],blocks:[{kind:'text',text:'En konkret observation før billedet.'},{kind:'image',url:'https://fixture.test/body.svg',alt:'Testbillede',caption:'Testdata, ikke en virkelig artikel.'},{kind:'text',text:'Et afsluttende afsnit efter billedet.'}]}:null};
window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('/api/editorial/submissions'))throw Error('Unexpected network');
 if(options.method==='POST'){fixture.calls.push(JSON.parse(options.body));fixture.state.row.status=prepared?'scheduled':'processing';fixture.state.preview=null;return Response.json({accepted:true});}
 return Response.json(fixture.state);
};
createRoot(document.getElementById('root')).render(<StrictMode><Submission id={'a'.repeat(64)}/></StrictMode>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture', setup(b) {
  b.onResolve({ filter: /auth-context$|^next\/image$/ }, args => ({ path: args.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, args => ({ resolveDir: process.cwd(), contents: args.path === 'next/image'
    ? `import React from 'react';export default function Image({unoptimized,src,...props}){return React.createElement('img',{...props,src:'/image.svg'});}`
    : `const user={uid:'fixture',getIdToken:async()=> 'fixture-only'};export function useAuth(){return {user};}` }));
} }] });
createServer((req, res) => {
  if (req.url === '/bundle.js') { res.setHeader('Content-Type', 'text/javascript'); res.end(bundle.outputFiles[0].text); return; }
  if (req.url === '/image.svg') { res.setHeader('Content-Type', 'image/svg+xml'); res.end('<svg xmlns="http://www.w3.org/2000/svg" width="960" height="540"><rect width="960" height="540" fill="#242424"/><text x="80" y="280" fill="white" font-size="40">Billedplacering · testdata</text></svg>'); return; }
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Apropos submission fixture</title><style>'+css+'</style><body style="background:black;color:white;margin:0;padding:20px"><main id="root" style="max-width:620px;margin:auto"></main><script src="/bundle.js"></script></body></html>');
}).listen(4338, '127.0.0.1', () => console.log('Submission fixture http://127.0.0.1:4338'));
