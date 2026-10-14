// Actual external-preview component, isolated network/auth and synthetic pixels.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const raw = await readFile('app/connect/chatgpt/submission.tsx', 'utf8');
const css = (await postcss([tailwind({ content: [{ raw, extension: 'tsx' }] })]).process('@tailwind base; @tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React,{StrictMode} from 'react';import {createRoot} from 'react-dom/client';
import Submission from './app/connect/chatgpt/submission';
const assetId='b'.repeat(64),originalHash='c'.repeat(64),mode=location.search;
window.fixture={calls:[],reads:0};
fixture.state={row:{revision:2,status:'awaiting_preparation',executionPolicy:'chatgpt-first-v1',article:{title:'Privat billedforslag',content:'<p>Uændret tekst.</p>'},questions:[],missingMetadata:[],missingMedia:['cover','body-1','body-2'],
imageCandidates:[{assetId,originalHash,role:'cover',alt:'Testmotiv',revision:2,current:!mode.includes('stale'),selected:mode.includes('selected')}]},
reading:{title:'Privat billedforslag',blocks:[{kind:'text',text:'Uændret tekst.'}]},
candidatePreviews:mode.includes('missing')?{}:{[assetId]:'/image.svg'},consent:null,quote:null,preview:null};
window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('/api/editorial/submissions'))throw Error('Unexpected network');
 if(options.method==='POST'){
  fixture.calls.push(JSON.parse(options.body));
  fixture.state.row.imageCandidates=[];fixture.state.row.imageDeclines=[{assetId,originalHash}];
  if(mode.includes('lost'))throw Error('Fixture lost acknowledgement');
  return Response.json({imageDeclined:true});
 }
 fixture.reads++;return Response.json(fixture.state);
};
createRoot(document.getElementById('root')).render(<StrictMode><Submission id={'a'.repeat(64)}/></StrictMode>);
` }, bundle: true, write: false, jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixture', setup(b) {
  b.onResolve({ filter: /auth-context$|^next\/(image|link)$/ }, a => ({ path: a.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ resolveDir: process.cwd(), contents: a.path === 'next/image'
    ? `import React from 'react';export default function Image({unoptimized,...props}){return React.createElement('img',props);}`
    : a.path === 'next/link' ? `import React from 'react';export default function Link(props){return React.createElement('a',props);}`
    : `const user={uid:'fixture',getIdToken:async()=> 'fixture-only'};export function useAuth(){return {user};}` }));
} }] });
const server = createServer((req,res) => {
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(req.url==='/image.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="800"><rect width="1200" height="800" fill="#334477"/></svg>');return;}
  res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'</style><body style="background:black;color:white;padding:16px"><main id="root" style="max-width:680px;margin:auto"></main><script src="/bundle.js"></script>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const browser=await chromium.launch({channel:'chrome',headless:true});
try {
  await mkdir('output/image-decline-v33',{recursive:true});
  for(const width of [390,1200])for(const mode of ['decline','lost','stale','missing','selected']){
    const page=await browser.newPage({viewport:{width,height:900}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'?'+mode);
    const decline=page.getByRole('button',{name:'Fravælg billedforslag'});
    await page.getByRole('heading',{name:'Privat billedforslag'}).waitFor();
    if(mode==='selected')assert.equal(await decline.count(),0);
    else if(['stale','missing'].includes(mode))assert.equal(await decline.isDisabled(),true);
    else {
      await decline.scrollIntoViewIfNeeded();
      if(mode==='decline')await page.screenshot({path:'output/image-decline-v33/external-'+width+'.png',fullPage:true});
      await decline.evaluate(el=>{el.click();el.click();});
      await page.getByText('Det fravalgte billedforslag er bevaret i historikken.',{exact:false}).waitFor();
      const result=await page.evaluate(()=>fixture);
      assert.equal(result.calls.length,1);assert.equal(result.calls[0].action,'decline_image_candidate');
      assert.equal(result.calls[0].originalHash,'c'.repeat(64));assert.equal(result.state.row.revision,2);
      assert.equal(await page.getByRole('alert').count(),0);assert(result.reads>=2);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify({cases:10,result:'passed',realComponent:true,network:'isolated',generation:0,cms:0,personalProductionChoices:0}));
} finally {await browser.close();await new Promise(r=>server.close(r));}
