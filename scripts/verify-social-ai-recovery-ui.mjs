// Isolated real React hooks/controls; fake authenticated API, no network AI or CMS writes.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baselineCommit = 'e8dac3ab5de939c6650aebcf5e743469f8150954';
const original = execFileSync('git', ['show', `${baselineCommit}:app/design-editor/useCardSubtitle.ts`], { encoding: 'utf8' });
const bundles = {};
for (const baseline of [false, true]) {
 const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode,useState} from 'react';import{createRoot}from'react-dom/client';
import{useCardSubtitle}from'./app/design-editor/useCardSubtitle';import Controls from'./app/design-editor/SubtitleControls';
const source='A24 og Matt Johnson skildrer Anthony Bourdains formative sommer i Provincetown, hvor Dominic Sessa og Antonio Banderas bærer historien. En præcis anmeldelse af filmens fortælling, skuespil og blik på hovedpersonen.';
window.fixture={generation:1,blocked:true,offline:false,calls:[],errors:[]};
window.addEventListener('error',e=>fixture.errors.push(e.message));window.addEventListener('unhandledrejection',e=>fixture.errors.push(String(e.reason)));
window.fetch=async(url,options={})=>{
 if(options.headers?.Authorization!=='Bearer fixture-only')throw Error('Missing verified fixture token');
 const body=options.body?JSON.parse(options.body):null;fixture.calls.push({url,body});
 if(url==='/api/design-editor/subtitle-status')return fixture.offline?Response.json({error:'offline'},{status:503}):Response.json({generation:fixture.generation,blocked:fixture.blocked});
 if(url==='/api/design-editor/resume-subtitle')return Response.json({error:'Already resumed elsewhere'},{status:409});
 if(url!=='/api/design-editor/shorten-subtitle')throw Error('Unexpected request');
 if(fixture.blocked)return Response.json({code:'quota_exhausted',generation:fixture.generation,error:'Gemt kvoteafvisning'},{status:502});
 return Response.json({candidates:['Bourdains formative sommer får liv på film.','En sommer før berømmelsen.'],source:'ai'});
};
function App(){const[id,setId]=useState('6ae474fd88698245425a7ddc');const[size,setSize]=useState('square');
 const subtitle=useCardSubtitle(id,id.endsWith('c')?'TONY':'Bog',source,size,'Georgia');
 return <><nav><button onClick={()=>setId('6ae474fd88698245425a7ddc')}>TONY</button><button onClick={()=>setId('6ae1f9da0e01d3d2ff34859f')}>Bog</button><button onClick={()=>setSize('square')}>1:1</button><button onClick={()=>setSize('story')}>9:16</button></nav><p data-result>{subtitle.text}</p><Controls subtitle={subtitle}/></>}
createRoot(document.getElementById('root')).render(<StrictMode><App/></StrictMode>);
` }, bundle:true,write:false,jsx:'automatic',format:'iife',define:{'process.env.NODE_ENV':'"development"'},plugins:[{name:'fixture',setup(b){
 b.onResolve({filter:/^@\/lib\/firebase$/},()=>({path:'firebase',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export const auth={authStateReady:async()=>{},currentUser:{getIdToken:async()=>"fixture-only"}};'}));
 if(baseline)b.onLoad({filter:/app\/design-editor\/useCardSubtitle\.ts$/},()=>({contents:original,loader:'ts',resolveDir:process.cwd()+'/app/design-editor'}));
 }}] });
 bundles[baseline?'baseline':'fixed']=result.outputFiles[0].text;
}
const server=createServer((req,res)=>{
 if(req.url.startsWith('/bundle-')){res.setHeader('Content-Type','text/javascript');res.end(bundles[req.url.includes('baseline')?'baseline':'fixed']);return;}
 res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><html lang="da"><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{margin:16px;background:#111;color:#fff;font:16px/1.5 system-ui}button,textarea{font:inherit;color:inherit;background:#222;border:1px solid #777;border-radius:8px;padding:8px;max-width:100%;box-sizing:border-box}textarea{width:100%}nav{display:flex;gap:8px}details{margin-top:20px}</style><div id="root"></div><script src="/bundle-'+(req.url.includes('baseline')?'baseline':'fixed')+'.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({channel:'chrome',headless:true});const reports=[];
await mkdir('output/some-recovery-20261030',{recursive:true});
const titleId='6ae474fd88698245425a7ddc';
async function open(width=390,baseline=false){const p=await browser.newPage({viewport:{width,height:900}});
 await p.route('**/*',r=>new URL(r.request().url()).origin===origin?r.continue():r.abort());
 await p.goto(origin+(baseline?'/?baseline=1':''));await p.locator('summary').click();await p.getByRole('alert').waitFor();return p;}
const ready=async p=>{await p.waitForFunction(()=>document.querySelector('[data-result]').textContent==='Bourdains formative sommer får liv på film.'&&!document.querySelector('[role="alert"]'));};
try{
 // Reproduce the exact broken boundary in the committed old hook.
 const old=await open(390,true);await old.evaluate(()=>{fixture.generation=2;fixture.blocked=false;});
 await old.getByRole('button',{name:'Bog',exact:true}).click();await ready(old);
 await old.getByRole('button',{name:'TONY',exact:true}).click();await old.getByRole('alert').waitFor();
 assert.equal(await old.getByRole('alert').textContent(),'Gemt kvoteafvisning');
 await old.close();reports.push({baselineStaleFailureReproduced:true});
 for(const width of[320,390,1440]){
  const p=await open(width);await p.evaluate(()=>{fixture.generation=2;fixture.blocked=false;});
  await p.getByRole('button',{name:'Bog',exact:true}).click();await ready(p);
  await p.getByRole('button',{name:'TONY',exact:true}).click();await ready(p);
  const state=await p.evaluate(()=>({calls:fixture.calls,errors:fixture.errors}));
  assert.deepEqual(state.errors,[]);
  assert.equal(state.calls.filter(c=>c.body?.articleId===titleId).length,2); // one old failure lookup + one new-generation request
  assert(state.calls.some(c=>c.url.endsWith('subtitle-status')));
  await p.screenshot({path:'output/some-recovery-20261030/'+width+'-recovered.png'});
  reports.push({width,staleCardRecovers:true,oldRequestNotReplayed:true,aiRequestsForCard:2});await p.close();
 }
 const twoFailures=await open();
 await twoFailures.getByRole('button',{name:'Bog',exact:true}).click();await twoFailures.getByRole('alert').waitFor();
 await twoFailures.evaluate(()=>{fixture.generation=2;fixture.blocked=false;});
 await twoFailures.getByRole('button',{name:'TONY',exact:true}).click();await ready(twoFailures);
 reports.push({switchBetweenTwoStaleCardsRecovers:true});await twoFailures.close();
 for(const mode of['same-generation','still-blocked','offline']){
  const p=await open();
  await p.evaluate(mode=>{fixture.generation=mode==='same-generation'?1:2;fixture.blocked=mode==='still-blocked';fixture.offline=mode==='offline';window.dispatchEvent(new Event('focus'));},mode);
  await p.waitForTimeout(150);
  assert.equal(await p.getByRole('alert').textContent(),'Gemt kvoteafvisning');
  assert.equal(await p.evaluate(()=>fixture.calls.filter(c=>c.body).length),1);
  reports.push({mode,noAutomaticRetry:true});await p.close();
 }
 const manual=await open();const field=manual.getByRole('textbox',{name:'Undertekst på billedet',exact:true});
 await field.fill('Min egen tekst om TONY.');
 await manual.evaluate(()=>{fixture.generation=2;fixture.blocked=false;window.dispatchEvent(new Event('focus'));});
 await manual.waitForFunction(()=>!document.querySelector('[role="alert"]'));
 assert.equal(await field.inputValue(),'Min egen tekst om TONY.');
 await manual.getByRole('button',{name:'9:16',exact:true}).click();
 await manual.waitForFunction(()=>document.querySelector('[data-result]').textContent==='Min egen tekst om TONY.');
 assert.equal(await manual.evaluate(()=>fixture.calls.filter(c=>c.body).length),1);
 reports.push({manualCopyAndFormatSwitchPreserved:true,noNewAiForManualCopy:true});await manual.close();
 // Another open card learns about the explicit resumption without a full reload.
 const event=await open();await event.evaluate(()=>{fixture.generation=2;fixture.blocked=false;window.dispatchEvent(new Event('apropos-social-ai-resumed'));});await ready(event);
 reports.push({resumptionEventRecoversOpenCard:true});await event.close();
 const conflict=await open();await conflict.evaluate(()=>{fixture.generation=2;fixture.blocked=false;});
 await conflict.getByRole('button',{name:'Genoptag AI',exact:true}).click();await ready(conflict);
 assert.equal(await conflict.evaluate(()=>fixture.calls.filter(c=>c.url.endsWith('resume-subtitle')).length),1);
 reports.push({externalResumptionConflictRechecksWithoutNewBudgetWrite:true});await conflict.close();
 const report={fixture:true,baselineCommit,realHooksAndControls:true,paidCalls:0,productionWrites:0,reports};
 await writeFile('output/some-recovery-20261030/browser-report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
}finally{await browser.close();await new Promise(r=>server.close(r));}
