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
imageCandidates:[{assetId,originalHash,role:'cover',alt:'Sokken',revision:2,current:!mode.includes('stale'),selected:mode.includes('selected')},
{assetId:'d'.repeat(64),originalHash:'e'.repeat(64),role:'body',alt:'Middagsluren',revision:2,current:true,selected:false},
{assetId:'f'.repeat(64),originalHash:'1'.repeat(64),role:'body',alt:'Gammelt caféforslag',revision:2,current:true,selected:false}],
imageSelection:{items:[],warnings:[],required:true,accepted:false}},
reading:{title:'Privat billedforslag',blocks:[{kind:'text',text:'Uændret tekst.'}]},
candidatePreviews:{[assetId]:mode.includes('missing')?'':'/image.svg',['d'.repeat(64)]:'/image.svg',['f'.repeat(64)]:'/image.svg'},consent:null,quote:null,preview:null};
window.fetch=async(url,options={})=>{
 if(!String(url).startsWith('/api/editorial/submissions'))throw Error('Unexpected network');
 if(options.method==='POST'){
  const input=JSON.parse(options.body);fixture.calls.push(input);
  const chosen=fixture.state.row.imageCandidates.find(c=>c.assetId===input.assetId);
  if(!chosen||input.originalHash!==chosen.originalHash||input.revision!==fixture.state.row.revision)throw Error('Wrong image identity');
  fixture.state.row.imageCandidates=fixture.state.row.imageCandidates.filter(c=>c.assetId!==input.assetId);
  if(input.action==='decline_image_candidate')fixture.state.row.imageDeclines=[{assetId:input.assetId,originalHash:input.originalHash}];
  else {
    fixture.state.row.revision++;
    fixture.state.row.imageSelection.items.push({assetId:chosen.assetId,hash:chosen.originalHash,role:chosen.role,url:'/image.svg'});
    if(chosen.role==='cover')fixture.state.reading.featuredImage='/image.svg';
    else fixture.state.reading.blocks.push({kind:'image',url:'/image.svg',alt:chosen.alt});
    fixture.state.row.imageCandidates.forEach(c=>c.revision=fixture.state.row.revision);
  }
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
  await mkdir('output/individual-image-review',{recursive:true});
  for(const width of [390,1200])for(const mode of ['decline','lost','stale','missing','selected','sequence','select-lost']){
    console.log('Checking external preview:',width,mode);
    const page=await browser.newPage({viewport:{width,height:900}}), errors=[];
    page.on('pageerror',e=>errors.push(e.message));
    await page.goto('http://127.0.0.1:'+server.address().port+'?'+mode);
    const firstCard=page.getByRole('figure',{name:'Sokken',exact:true});
    const decline=firstCard.getByRole('button',{name:'Fravælg billede'});
    await page.getByRole('heading',{name:'Vælg billeder til artiklen'}).waitFor();
    assert.equal(await page.getByRole('article',{name:'Artikelpreview'}).count(),0);
    assert.equal(await page.evaluate(()=>fixture.calls.length),0);
    if(mode==='selected')assert.equal(await decline.count(),0);
    else if(['stale','missing'].includes(mode))assert.equal(await decline.isDisabled(),true);
    else if(mode==='sequence'||mode==='select-lost'){
      // Pick the middle card first, not the first candidate in the response.
      const middle=page.getByRole('figure',{name:'Middagsluren',exact:true}).getByRole('button',{name:'Godkend billede'});
      await middle.click();
      await page.getByText('Billedet er godkendt og sat ind i artiklen. Artiklen er ikke udgivet.',{exact:true}).waitFor();
      assert.equal(await page.evaluate(()=>fixture.calls[0].assetId),'d'.repeat(64));
      assert.equal(await page.getByRole('alert').count(),0);
      if(mode==='sequence'){
        await firstCard.getByRole('button',{name:'Godkend billede'}).click();
        await page.getByRole('figure',{name:'Gammelt caféforslag',exact:true}).getByRole('button',{name:'Fravælg billede'}).click();
        await page.getByText('Ingen forslag afventer dit valg.',{exact:false}).waitFor();
        const result=await page.evaluate(()=>fixture);
        assert.deepEqual(result.calls.map(c=>c.assetId),['d'.repeat(64),'b'.repeat(64),'f'.repeat(64)]);
        assert.deepEqual(result.calls.map(c=>c.revision),[2,3,4]);
        await page.getByRole('button',{name:'Læs artiklen med valgte billeder'}).click();
        await page.getByRole('article',{name:'Artikelpreview'}).waitFor();
        assert.equal(await page.getByRole('article',{name:'Artikelpreview'}).locator('img').count(),2);
        assert.equal(result.calls.some(c=>/publish|quote/.test(c.action)),false);
      }
    } else {
      await decline.scrollIntoViewIfNeeded();
      if(mode==='decline')await page.screenshot({path:'output/individual-image-review/external-'+width+'.png',fullPage:true});
      await decline.evaluate(el=>{el.click();el.click();});
      await page.getByText('Billedet er fravalgt. Originalen er bevaret i historikken.',{exact:true}).waitFor();
      const result=await page.evaluate(()=>fixture);
      assert.equal(result.calls.length,1);assert.equal(result.calls[0].action,'decline_image_candidate');
      assert.equal(result.calls[0].originalHash,'c'.repeat(64));assert.equal(result.state.row.revision,2);
      assert.equal(await page.getByRole('alert').count(),0);assert(result.reads>=2);
    }
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    assert.deepEqual(errors,[]);await page.close();
  }
  console.log(JSON.stringify({cases:14,result:'passed',realComponent:true,nonFirstSelection:true,sequentialChoice:true,network:'isolated',generation:0,cms:0,personalProductionChoices:0}));
} finally {await browser.close();server.closeAllConnections();await new Promise(r=>server.close(r));}
