// Real font/canvas geometry, isolated images and no service calls or publishing.
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { createServer } from 'node:http';
import { build } from 'esbuild';
import { chromium } from 'playwright';
const dir = 'output/social-spacing-meta-20261031/geometry';
const buildDir = process.env.APROPOS_BUILD_DIR || '.next';
let fonts = '';
for (const file of (await readdir(buildDir+'/static/chunks')).filter(f=>f.endsWith('.css'))) {
  const css = await readFile(buildDir+'/static/chunks/'+file, 'utf8');
  fonts += (css.match(/@font-face\{[^}]*font-family:(Amiri|Inter);[^}]*\}/g)||[]).join('\n').replaceAll('../media/', '/media/');
}
assert(fonts.includes('font-family:Amiri;'));
const baseline = execFileSync('git', ['show', '64ac3398002e9ef27fd3238594d27169e8c14126:app/design-editor/exportCardToPng.ts'], { encoding: 'utf8' });
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import {exportCardToPng,exportCardToJpegBlob} from './app/design-editor/exportCardToPng';
import {exportCardToPng as before} from 'baseline';
const text=CanvasRenderingContext2D.prototype.fillText,draw=CanvasRenderingContext2D.prototype.drawImage;
let events=[];
CanvasRenderingContext2D.prototype.fillText=function(value,x,y,...rest){const m=this.measureText(value);events.push({kind:'text',text:value,x,y,font:this.font,top:y-m.actualBoundingBoxAscent,bottom:y+m.actualBoundingBoxDescent});return text.call(this,value,x,y,...rest);};
CanvasRenderingContext2D.prototype.drawImage=function(img,...args){if(img.src?.endsWith('/fixture.svg'))events.push({kind:'photo',args});return draw.call(this,img,...args);};
window.renderCard=async(data,size,mode)=>{events=[];const r=await(mode==='before'?before(data,size):mode==='jpeg'?exportCardToJpegBlob(data,size):exportCardToPng(data,size));const src=typeof r==='string'?r:URL.createObjectURL(r);document.querySelector('img').src=src;return {events:[...events],src};};
` }, bundle:true, write:false, jsx:'automatic', format:'iife', plugins:[{name:'baseline',setup(b){
  b.onResolve({filter:/^baseline$/},()=>({path:'baseline',namespace:'fixture'}));
  b.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:baseline,loader:'ts',resolveDir:process.cwd()+'/app/design-editor'}));
}}]});
const server = createServer(async(req,res)=>{
  if(req.url==='/bundle.js'){res.setHeader('Content-Type','text/javascript');return res.end(bundle.outputFiles[0].text);}
  if(/^\/media\/[\w.-]+\.woff2$/.test(req.url)){res.setHeader('Content-Type','font/woff2');return res.end(await readFile(buildDir+'/static'+req.url));}
  if(req.url==='/fixture.svg'){res.setHeader('Content-Type','image/svg+xml');return res.end('<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1080"><rect width="1080" height="1080" fill="#9aa5ad"/></svg>');}
  if(['/images/AproposMagazineLogoInstagram.svg','/images/star-filled.svg','/images/star-outline.svg'].includes(req.url)){res.setHeader('Content-Type','image/svg+xml');return res.end(await readFile('public'+req.url));}
  res.setHeader('Content-Type','text/html;charset=utf-8');res.end('<!doctype html><html><style>'+fonts+'body{margin:0}img{display:block;width:100%;height:auto}</style><img><script src="/bundle.js"></script></html>');
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin='http://127.0.0.1:'+server.address().port;
const browser=await chromium.launch({headless:true,channel:'chrome'});
await mkdir(dir,{recursive:true}); const reports=[];
try {
 const page=await browser.newPage({viewport:{width:540,height:960}});
 await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 await page.goto(origin);
 for(const size of ['square','story'])for(const theme of ['light','dark'])for(const titleSizePercent of [70,100,150])for(const gap of [0,24,72]){
  const data={title:'TONY',excerpt:'Please, giv os noget mere Dar Salim.',titleSizePercent,titleSubtitleGap:gap,theme,category:'Serier & Film',categorySecondary:'Anmeldelser',rating:6,imageUrl:'/fixture.svg'};
  const png=await page.evaluate(async args=>renderCard(args.data,args.size,'png'),{data,size});
  const jpeg=await page.evaluate(async args=>renderCard(args.data,args.size,'jpeg'),{data,size});
  assert.deepEqual(png.events,jpeg.events,'Preview/download and publishing JPEG have identical geometry');
  const index=png.events.findIndex(e=>e.kind==='text'&&e.font.startsWith('italic'));
  const title=png.events.slice(0,index).filter(e=>e.kind==='text').at(-1),subtitle=png.events[index];
  assert(Math.abs(subtitle.top-title.bottom-gap)<.01, 'Actual ink gap tracks the chosen value even with large type');
  const photo=png.events.find(e=>e.kind==='photo'),cta=png.events.find(e=>e.kind==='text'&&e.text.startsWith('Læs nu'));
  assert(photo.args[7]>200);assert.equal(cta.y,photo.args[5]+10);
  if(gap===24){const before=await page.evaluate(async args=>renderCard(args.data,args.size,'before'),{data,size});assert.deepEqual(png.events,before.events,'Default leaves every old pixel position unchanged');}
  if(size==='square'&&theme==='light'&&titleSizePercent===150){await page.evaluate(src=>document.querySelector('img').src=src,png.src);await page.locator('img').evaluate(i=>i.decode());await page.screenshot({path:dir+'/large-title-gap-'+gap+'.png',fullPage:true});}
  reports.push({size,theme,titleSizePercent,requestedGap:gap,measuredGap:subtitle.top-title.bottom,pngJpegParity:true});
 }
 const report={checkedAt:new Date().toISOString(),cases:reports.length,font:'bundled production Amiri',reports,realSocialPosts:0,remoteCalls:0};
 await writeFile(dir+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify({cases:reports.length,allPassed:true,pngJpegParity:true,defaultUnchanged:true}));
} finally {await browser.close();await new Promise(r=>server.close(r));}
