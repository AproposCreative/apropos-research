/** Public GET-only GEO pilot. No CMS writes, cookies or credentials. */
import { load } from 'cheerio';
import { writeFile } from 'node:fs/promises';
const origin='https://www.aproposmagazine.com';
const paths=['/om','/author/liv-brandt','/author/casper-fiil','/articles/untamed-netflix','/en/articles/justice-o-days-festival-total-release-in-mud-and-bass-drops'];
const results=[];
for(const path of paths){
 const r=await fetch(origin+path,{signal:AbortSignal.timeout(15000),redirect:'error'});
 const html=await r.text();const $=load(html);const schemas=[];let invalidJson=0;
 $('script[type="application/ld+json"]').each((_,e)=>{try{const j=JSON.parse($(e).text());schemas.push(...(j['@graph']||[j]));}catch{invalidJson++;}});
 results.push({path,status:r.status,title:$('title').text(),h1:$('h1').map((_,e)=>$(e).text()).get(),canonical:$('link[rel="canonical"]').attr('href'),robots:$('meta[name="robots"]').attr('content'),invalidJson,schemaTypes:schemas.map(x=>x['@type']),articleAuthors:schemas.filter(x=>['Article','NewsArticle'].includes(x['@type'])).map(x=>({name:x.author?.name,url:x.author?.url,language:x.inLanguage,datePublished:x.datePublished,dateModified:x.dateModified})),authorLinks:[...new Set($('a[href*="/author/"]').map((_,e)=>$(e).attr('href')).get())]});
}
await writeFile(new URL('../docs/audits/2026-09-09-morningscore/geo-pilot.json',import.meta.url),JSON.stringify({checkedAt:new Date().toISOString(),scope:'Five public pilot pages, not a whole-site or ranking audit',results},null,2)+'\n');
console.log(JSON.stringify(results.map(r=>({path:r.path,status:r.status,schemaTypes:r.schemaTypes,invalidJson:r.invalidJson}))));
