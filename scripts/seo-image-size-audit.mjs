/** GET-free image byte inventory: HEAD only on image URLs found in the public audit. */
import {readFile,writeFile} from 'node:fs/promises';
const dir=new URL('../docs/audits/2026-09-09-morningscore/',import.meta.url);
const source=JSON.parse(await readFile(new URL('public-health.json',dir),'utf8'));
const files=new Map();
for(const p of source.pages) for(const i of p.images||[]) {
 if(!i.src.startsWith('https://cdn.prod.website-files.com/'))continue;
 const entry=files.get(i.src)||{url:i.src,pages:[],classes:[],occurrences:0};
 entry.occurrences++;if(!entry.pages.includes(p.url))entry.pages.push(p.url);if(!entry.classes.includes(i.class))entry.classes.push(i.class);files.set(i.src,entry);
}
const entries=[...files.values()];let cursor=0;
async function worker(){while(cursor<entries.length){const e=entries[cursor++];try{const r=await fetch(e.url,{method:'HEAD',redirect:'error',signal:AbortSignal.timeout(15000)});e.status=r.status;e.bytes=r.headers.has('content-length')?Number(r.headers.get('content-length')):null;e.contentType=r.headers.get('content-type');}catch(err){e.error=err.message;}}}
await Promise.all([worker(),worker(),worker()]);entries.sort((a,b)=>(b.bytes||0)-(a.bytes||0));
const summary={generatedAt:new Date().toISOString(),method:'HEAD Content-Length; no rendered-size claim; CDN images only',uniqueChecked:entries.length,over500000:entries.filter(e=>e.bytes>500000).length,unknown:entries.filter(e=>!e.bytes||e.status!==200).length};
await writeFile(new URL('image-sizes.json',dir),JSON.stringify({summary,images:entries},null,2)+'\n');
console.log(JSON.stringify(summary));console.log(JSON.stringify(entries.slice(0,12).map(e=>({file:e.url.split('/').at(-1),bytes:e.bytes,pages:e.pages.length,classes:e.classes})),null,2));
