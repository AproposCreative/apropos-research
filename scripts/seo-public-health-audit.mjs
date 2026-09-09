/** Credential-free, bounded GET-only audit of Apropos public sitemap pages. */
import { load } from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
const origin = 'https://www.aproposmagazine.com';
const target = new URL('../docs/audits/2026-09-09-morningscore/', import.meta.url);
async function get(url, depth = 0) {
  const u = new URL(url);
  if (u.origin !== origin || u.username || u.password || depth > 4) throw Error('Outside public audit scope');
  const r = await fetch(u, { redirect: 'manual', signal: AbortSignal.timeout(25000), headers: { 'User-Agent': 'AproposPublicSEOAudit/1.0' } });
  if ([301,302,303,307,308].includes(r.status)) return get(new URL(r.headers.get('location'), u).href, depth + 1);
  if (!r.ok) throw Error(`HTTP ${r.status}`);
  const text = await r.text();
  if (text.length > 5_000_000) throw Error('Page exceeds audit size limit');
  return { text, finalUrl: r.url };
}
const robots = await get(`${origin}/robots.txt`);
// Conservative handling: do not crawl if robots contains any broad restriction.
const blocked = [...robots.text.matchAll(/^Disallow:\s*(\S+)/gmi)].map(m => m[1]);
const allowed = url => !blocked.some(p => new URL(url).pathname.startsWith(p.split('*')[0]));
const sitemap = await get(`${origin}/sitemap.xml`);
const $xml = load(sitemap.text, { xmlMode: true });
let urls = $xml('url > loc').map((_,e) => $xml(e).text()).get();
for (const loc of $xml('sitemap > loc').map((_,e) => $xml(e).text()).get().slice(0,10)) {
  const nested = load((await get(loc)).text, { xmlMode: true });
  urls.push(...nested('url > loc').map((_,e) => nested(e).text()).get());
}
urls = [...new Set([origin + '/', ...urls].map(u => new URL(u).href))].filter(u => new URL(u).origin === origin && allowed(u));
const discovered = urls.length;
urls = urls.slice(0,500);
const rows = [];
let cursor = 0;
async function worker() {
  while (cursor < urls.length) {
    const url = urls[cursor++];
    try {
      const { text, finalUrl } = await get(url); const $ = load(text);
      const title = $('title').first().text().trim();
      const description = $('meta[name="description"]').attr('content') || '';
      const h1 = $('h1').map((_,e) => $(e).text().trim()).get();
      const images = $('img').map((_,e) => {
        const i=$(e);return {src:i.attr('src')||'',class:i.attr('class')||'',alt:i.attr('alt')??null,
          missingDimensions: !(/^\d+$/.test(i.attr('width')||'') && Number(i.attr('width'))>0 && /^\d+$/.test(i.attr('height')||'') && Number(i.attr('height'))>0)};
      }).get();
      const issues=[];
      if(!title)issues.push('missing-title');if(!description)issues.push('missing-description');
      if(h1.length===0)issues.push('missing-h1');if(h1.length>1)issues.push('multiple-h1');
      if(images.some(i=>i.missingDimensions))issues.push('image-dimensions');
      if(images.some(i=>i.alt===null))issues.push('missing-alt-attribute');
      if(images.some(i=>i.alt===''))issues.push('empty-alt-review');
      const headings=$('h1,h2,h3,h4,h5,h6');
      if(h1.length && headings.first()[0]?.tagName!=='h1')issues.push('h1-not-first-review');
      rows.push({url,finalUrl,title,description,h1,canonical:$('link[rel="canonical"]').attr('href')||null,
        robots:$('meta[name="robots"]').attr('content')||null,htmlBytes:Buffer.byteLength(text),issues,images});
    } catch(e) {rows.push({url,error:String(e.message)});}
    if(rows.length%25===0)console.log(`${rows.length}/${urls.length}`);
  }
}
await Promise.all([worker(),worker(),worker()]);
rows.sort((a,b)=>a.url.localeCompare(b.url));
const duplicates={};
for(const field of ['title','description']) {
  const groups=new Map();for(const row of rows){if(!row[field])continue;const value=row[field].trim().toLowerCase();groups.set(value,[...(groups.get(value)||[]),row.url]);}
  duplicates[field]=[...groups].filter(([,u])=>u.length>1).map(([value,urls])=>({value,urls}));
}
const summary={generatedAt:new Date().toISOString(),source:'Public sitemap + server HTML; no browser rendering or CMS access',discovered,attempted:urls.length,success:rows.filter(r=>!r.error).length,errors:rows.filter(r=>r.error),issuePages:{},duplicateGroups:{title:duplicates.title.length,description:duplicates.description.length}};
for(const row of rows)for(const issue of row.issues||[])summary.issuePages[issue]=(summary.issuePages[issue]||0)+1;
await mkdir(target,{recursive:true});
await writeFile(new URL('public-health.json',target),JSON.stringify({summary,duplicates,pages:rows})+'\n');
const csv = [['url','issues','h1_count','images','missing_dimensions','missing_alt_attribute','empty_alt_review','title','description'],...rows.map(r=>[r.url,r.error||r.issues.join(';'),r.h1?.length,r.images?.length,r.images?.filter(i=>i.missingDimensions).length,r.images?.filter(i=>i.alt===null).length,r.images?.filter(i=>i.alt==='').length,r.title,r.description])].map(row=>row.map(v=>'"'+String(v??'').replaceAll('"','""')+'"').join(',')).join('\n');
await writeFile(new URL('url-actions.csv',target),csv+'\n');
console.log(JSON.stringify(summary,null,2));
