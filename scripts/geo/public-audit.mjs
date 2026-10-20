/** Bounded, public GET-only audit. No CMS writes or model calls. */
import { load } from 'cheerio';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
const origin = 'https://www.aproposmagazine.com';
const output = resolve(process.argv[2] || `tmp/geo/public-${new Date().toISOString().replaceAll(':', '-')}.json`);
const limit = Number(process.argv[3] || 100);
if (!Number.isInteger(limit) || limit < 1 || limit > 500) throw Error('Limit must be 1–500');
async function get(path) {
 const url = new URL(path, origin);
 if (url.origin !== origin || url.username || url.password) throw Error('Outside audit origin');
 const response = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'AproposPublicSEOAudit/2.0' } });
 return { url: url.href, status: response.status, headers: { robots: response.headers.get('x-robots-tag') }, text: await response.text() };
}
const controls = {};
for (const path of ['/robots.txt', '/sitemap.xml', '/llms.txt']) {
 try { controls[path] = await get(path); } catch (e) { controls[path] = { error: e.message }; }
}
if (controls['/robots.txt'].status !== 200) throw Error('Robots unavailable; crawl stopped');
// Conservative: any nonempty Disallow stops the crawl for review. Never bypass robots.
if (/^Disallow:\s*\S+/mi.test(controls['/robots.txt'].text)) throw Error('Robots restrictions require review; crawl stopped');
if (controls['/sitemap.xml'].status !== 200) throw Error('Sitemap unavailable');
const sitemap = load(controls['/sitemap.xml'].text, { xmlMode: true });
const locations = sitemap('url > loc').map((_, e) => sitemap(e).text()).get();
for (const child of sitemap('sitemap > loc').map((_, e) => sitemap(e).text()).get().slice(0, 10)) {
 const response = await get(child); if (response.status !== 200) throw Error('Child sitemap unavailable');
 const xml = load(response.text, { xmlMode: true }); locations.push(...xml('url > loc').map((_, e) => xml(e).text()).get());
}
const all = [...new Set(locations)].filter(url => new URL(url).origin === origin);
const articles = all.filter(url => new URL(url).pathname.includes('/articles/'));
// Evenly spaced deterministic sample across sitemap order, plus up to 100 non-article sitemap pages.
const selected = [...new Set([origin + '/', origin + '/om', ...all.filter(url => !new URL(url).pathname.includes('/articles/')).slice(0, 100), ...Array.from({length: Math.min(limit, articles.length)}, (_, i) => articles[Math.floor(i * articles.length / Math.min(limit, articles.length))])])];
function flatten(value) { return Array.isArray(value) ? value.flatMap(flatten) : value && typeof value === 'object' ? [value, ...flatten(value['@graph'] || [])] : []; }
const pages = [];
for (const url of selected) {
 try {
  const r = await get(url); const $ = load(r.text); const schemas = []; let invalidJson = 0;
  $('script[type="application/ld+json"]').each((_, e) => { try { schemas.push(...flatten(JSON.parse($(e).text()))); } catch { invalidJson++; } });
  const types = schemas.flatMap(s => Array.isArray(s['@type']) ? s['@type'] : [s['@type']]).filter(Boolean);
  const title = $('title').text().trim(); const description = $('meta[name="description"]').attr('content') || '';
  const h1 = $('h1').map((_, e) => $(e).text().trim()).get(); const canonical = $('link[rel="canonical"]').attr('href') || null;
  const robots = [r.headers.robots, ...$('meta[name="robots"],meta[name="googlebot"]').map((_,e)=>$(e).attr('content')).get()].filter(Boolean);
  const issues = [];
  if (r.status !== 200) issues.push('http-status'); if (!title) issues.push('missing-title'); if (!description) issues.push('missing-description');
  if (h1.length !== 1) issues.push('h1-count-review'); if (!canonical) issues.push('missing-canonical'); else { try { if (new URL(canonical).href !== new URL(url).href) issues.push('canonical-differs-review'); } catch { issues.push('invalid-canonical'); } }
  if (robots.some(r=>/noindex|nosnippet|max-snippet\s*:\s*0\b/i.test(r))) issues.push('index-or-snippet-restriction');
  if (invalidJson) issues.push('invalid-json-ld');
  if (new URL(url).pathname.includes('/articles/') && !types.some(t=>['Article','NewsArticle','BlogPosting'].includes(t))) issues.push('missing-article-schema');
  if (new URL(url).pathname.startsWith('/author/') && !types.includes('Person')) issues.push('author-person-schema-opportunity');
  pages.push({url,status:r.status,title,description,h1,canonical,robots,schemaTypes:types,invalidJson,issues,
   articleSchemas:schemas.filter(s=>['Article','NewsArticle','BlogPosting'].includes(s['@type'])).map(s=>({headline:s.headline,author:s.author,publisher:s.publisher,datePublished:s.datePublished,dateModified:s.dateModified,image:s.image,inLanguage:s.inLanguage}))});
 } catch(e) { pages.push({url,error:e.message}); }
}
const counts={}; for(const page of pages) for(const issue of page.issues||[]) counts[issue]=(counts[issue]||0)+1;
const result={checkedAt:new Date().toISOString(),scope:'Server HTML only; bounded deterministic sitemap sample. Not ranking, citation, rendering or Google indexing verification.',discovered:all.length,articleSampleLimit:limit,attempted:pages.length,errors:pages.filter(p=>p.error).length,issuePages:counts,controls,pages};
await mkdir(dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,discovered:all.length,attempted:pages.length,errors:result.errors,issuePages:counts}));
