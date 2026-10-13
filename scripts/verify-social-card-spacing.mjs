// Real browser/canvas/font geometry. Reads the pre-change renderer from Git;
// never touches an article, image asset, remote endpoint or approval.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const baseline = 'd3c263ec6889eb948db4c1ab5810825318471e4f';
const buildDir = process.env.APROPOS_BUILD_DIR || '.next';
let fontCss = '';
for (const file of (await readdir(buildDir + '/static/chunks')).filter(file => file.endsWith('.css'))) {
  const css = await readFile(buildDir + '/static/chunks/' + file, 'utf8');
  fontCss += (css.match(/@font-face\{[^}]*font-family:(Amiri|Inter);[^}]*\}/g) || []).join('\n').replaceAll('../media/', '/media/');
}
assert(fontCss.includes('font-family:Amiri;'), 'Run a production build first (bundled Amiri required)');
const oldRenderer = execFileSync('git', ['show', baseline + ':app/design-editor/exportCardToPng.ts'], { encoding: 'utf8' });
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import {exportCardToPng,exportCardToJpegBlob} from './app/design-editor/exportCardToPng';
import {exportCardToPng as before} from 'baseline-renderer';
const proto=CanvasRenderingContext2D.prototype;
const originalText=proto.fillText,originalImage=proto.drawImage;
window.events=[];
proto.fillText=function(text,x,y,...rest){events.push({kind:'text',text,x,y,font:this.font,bottom:y+this.measureText(text).actualBoundingBoxDescent});return originalText.call(this,text,x,y,...rest)};
proto.drawImage=function(image,...args){if(image.src?.endsWith('/fixture.svg'))events.push({kind:'photo',args});return originalImage.call(this,image,...args)};
window.run=async(data,size,version)=>{
 events=[];
 const output=await(version==='before'?before(data,size):version==='jpeg'?exportCardToJpegBlob(data,size):exportCardToPng(data,size));
 const url=typeof output==='string'?output:URL.createObjectURL(output);
 document.getElementById('card').src=url;
 return {events:[...events],url,fontReady:document.fonts.check('400 80px Amiri')&&document.fonts.check('italic 400 48px Amiri')};
};
` }, bundle:true,write:false,jsx:'automatic',format:'iife',plugins:[{name:'baseline',setup(b){
  b.onResolve({filter:/^baseline-renderer$/},()=>({path:'baseline',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:oldRenderer,loader:'ts',resolveDir:process.cwd()+'/app/design-editor'}));
}}]});
const server=createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');res.end(bundle.outputFiles[0].text);return;}
  if(/^\/media\/[a-zA-Z0-9._-]+\.woff2$/.test(req.url)){res.setHeader('Content-Type','font/woff2');res.end(await readFile(buildDir+'/static'+req.url));return;}
  if(req.url==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><defs><linearGradient id="g" x2="1" y2="1"><stop stop-color="#9bacb7"/><stop offset="1" stop-color="#19252f"/></linearGradient></defs><rect width="1080" height="1080" fill="url(#g)"/></svg>');return;}
  if(['/images/AproposMagazineLogoInstagram.svg','/images/star-filled.svg','/images/star-outline.svg'].includes(req.url)){res.setHeader('Content-Type','image/svg+xml');res.end(await readFile('public'+req.url));return;}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+fontCss+'body{margin:0;background:#111}img{width:100%;height:auto;display:block}</style><img id="card"><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
const reports=[];
await mkdir('output/platform-polish',{recursive:true});
try {
  const page=await browser.newPage({viewport:{width:540,height:960}});
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  await page.goto(origin);
  for(const size of ['square','story']) for(const theme of ['light','dark']) for(const variant of ['whisper','long','no-subtitle']) {
    const data={title:variant==='long'?'Kontrapunkt har tegnet Danmark. Men er kundearbejde kunst?':'The Whisper Man (Netflix)',
      excerpt:variant==='no-subtitle'?'':'Robert De Niro og Adam Scott løfter en effektiv seriemorderthriller, hvor uhyggen fungerer bedre end logikken.',
      category:'Serier & Film',categorySecondary:'Anmeldelser',rating:4,theme,imageUrl:'/fixture.svg'};
    const old=await page.evaluate(async({data,size})=>run(data,size,'before'),{data,size});
    const fresh=await page.evaluate(async({data,size})=>run(data,size,'after'),{data,size});
    const jpeg=await page.evaluate(async({data,size})=>run(data,size,'jpeg'),{data,size});
    assert(fresh.fontReady);
    assert.deepEqual(fresh.events,jpeg.events,'PNG/JPEG use identical layout');
    const copy=events=>events.filter(e=>e.kind==='text'&&!e.text.startsWith('Læs nu'));
    assert.deepEqual(copy(fresh.events),copy(old.events),'Visible prose, positions, fonts and sizes unchanged');
    const photo=events=>events.find(e=>e.kind==='photo').args;
    const beforePhoto=photo(old.events),afterPhoto=photo(fresh.events);
    // drawImage(..., source rectangle, x, y, width, height).
    const delta=afterPhoto[5]-beforePhoto[5];
    assert.equal(delta,variant==='no-subtitle'?0:32,'Exactly 32 canvas px extra below subtitle');
    assert(afterPhoto[7]>300,'Still a useful, positive photo area');
    const cta=fresh.events.find(e=>e.kind==='text'&&e.text.startsWith('Læs nu'));
    assert.equal(cta.y,afterPhoto[5]+10,'CTA remains on the white/photo seam');
    const lastSubtitle=copy(fresh.events).filter(e=>e.font.includes('italic')).at(-1);
    if(lastSubtitle)assert(cta.y-(size==='square'?46.7829:56.16)-lastSubtitle.bottom>20,'Readable whitespace before CTA');
    if(variant==='whisper') {
      for(const [label,result] of [['before',old],['after',fresh]]) {
        await page.evaluate(url=>{document.getElementById('card').src=url},result.url);
        await page.locator('#card').evaluate(img=>img.decode());
        await page.screenshot({path:'output/platform-polish/whisper-'+size+'-'+theme+'-'+label+'.png',fullPage:true});
      }
    }
    reports.push({size,theme,variant,photoTop:afterPhoto[5],photoHeight:afterPhoto[7],extraGap:delta,unchangedText:true,identicalPngJpegLayout:true});
  }
  await writeFile('output/platform-polish/card-spacing.json',JSON.stringify({baseline,font:'production Amiri',fixturePhoto:true,remoteCalls:0,reports},null,2));
  console.log(JSON.stringify({baseline,font:'production Amiri',cases:reports.length,remoteCalls:0,reports},null,2));
} finally {await browser.close();await new Promise(r=>server.close(r));}
