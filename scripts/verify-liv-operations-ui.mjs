// Isolated rendering of the real component; no real auth, generation or publication.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import postcss from 'postcss';
import tailwind from 'tailwindcss';

const source = (await Promise.all(['LivOperations.tsx','LivAlertHistory.tsx'].map(name => readFile(new URL('../app/ai/liv/' + name, import.meta.url), 'utf8')))).join('\n');
const css = (await postcss([tailwind({ content: [{ raw: source, extension: 'tsx' }] })])
  .process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
  import React, { StrictMode } from 'react';
  import { createRoot } from 'react-dom/client';
  import LivOperations from './app/ai/liv/LivOperations';
  window.fixture = { calls: [], errors: [], fail: false };
  window.addEventListener('error', e => window.fixture.errors.push(e.message));
  window.addEventListener('unhandledrejection', e => window.fixture.errors.push(String(e.reason)));
  window.fetch = async (path, options = {}) => {
    window.fixture.calls.push({path,method:options.method||'GET'});
    await new Promise(r => setTimeout(r, 20)); options.signal?.throwIfAborted();
    if (window.fixture.fail) return Response.json({}, {status:503});
    if (path.startsWith('/api/editorial/operations/alerts')) return Response.json({records:[{day:path.includes('cursor=')?'2026-08-01':'2026-09-12',status:'reconciliation_required'}],nextCursor:path.includes('cursor=')?null:'2026-09-12'});
    if (path !== '/api/editorial/operations') throw new Error('Unexpected request');
    return Response.json({ checkedAt:'2026-09-13T12:00:00Z',
      liv:{available:true,data:{autoPublishEnabled:true,published:true,overdue:false,blockedItems:[],needsReconciliation:false,nextDay:'2026-09-14',nextStory:{title:'Anmeldelse: En usædvanligt lang titel der stadig skal kunne læses på en smal mobilskærm',state:'ready'}}},
      newsletter:{available:false},budget:{available:true,data:{usageBasedUpperDkk:47.45,monthlyLimitDkk:300,fullMonthlyCapVerified:false}},
      alerts:{available:true,data:{day:'2026-09-13',status:'unconfirmed'}} });
  };
  createRoot(document.getElementById('root')).render(<StrictMode><LivOperations /></StrictMode>);
` }, bundle:true, write:false, jsx:'automatic', format:'iife', define:{'process.env.NODE_ENV':'"development"'},
  plugins:[{name:'fixture-auth',setup(b){
    b.onResolve({filter:/^@\/lib\/auth-context$/},()=>({path:'auth',namespace:'fixture'}));
    b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'const user={uid:"fixture",getIdToken:async()=>"fixture"};export const useAuth=()=>({user});'}));
  }}] });
createServer((req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.end(`<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Isolated Liv operations</title><style>${css}</style><body style="background:#080808;color:white;padding:16px"><main id="root" style="max-width:800px;margin:auto"></main><script src="/bundle.js"></script></body></html>`);
}).listen(4319,'127.0.0.1',()=>console.log('Operations fixture http://127.0.0.1:4319'));
