// Read-only, bounded GET verification for the 2026-10-21 Review footer release.
// No CMS, Designer, publishing, authentication, or write API operations.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import * as cheerio from 'cheerio';

const origins = { production: 'https://www.aproposmagazine.com', staging: 'https://apropos-magazine.webflow.io' };
const root = process.cwd();
const receiptDir = resolve(root, 'docs/seo');
const rawDir = resolve(root, 'tmp/review-type-release-2026-10-21');
const hash = value => createHash('sha256').update(typeof value === 'string' ? value : JSON.stringify(value)).digest('hex');
const norm = value => String(value ?? '').replaceAll(origins.production, 'https://OWN-SITE').replaceAll(origins.staging, 'https://OWN-SITE');
const compact = value => norm(value).replace(/\s+/g, ' ').trim();
const scriptSource = html => {
  const $ = cheerio.load(html);
  return $('script').toArray().map(n => $(n).html()).find(s => s?.includes('function aproposReviewedWorkName('));
};
const oldSource = scriptSource(JSON.parse(await readFile(resolve(receiptDir, 'REVIEW-FOOTER-BEFORE-2026-10-21.json'), 'utf8')).content).trim();
const newSource = scriptSource(await readFile(resolve(root, 'docs/webflow-embeds/article-review-footer.html'), 'utf8')).trim();
const ratingToken = /\{\{wf [^\n]*?\}\}/;
const token = source => source.match(ratingToken)?.[0];
function approvedScript(actual, expected) {
  const marker = token(expected);
  if (!marker) throw Error('Expected one CMS rating token in approved script');
  const parts = expected.split(marker);
  if (parts.length !== 2) throw Error('Expected exactly one CMS rating token');
  const value = actual.slice(parts[0].length, actual.length - parts[1].length);
  const ratingValid = /^(?:-?\d+(?:\.\d+)?)?$/.test(value);
  return { exact: ratingValid && actual === parts[0] + value + parts[1], rating: ratingValid ? value : null };
}
function snapshot(html, path, environment) {
  const $ = cheerio.load(html);
  const ownScripts = $('script').toArray().filter(n => ($(n).html() || '').includes('function aproposReviewedWorkName('));
  const expectedSource = environment === 'production-before' ? oldSource : newSource;
  const ownReview = ownScripts.map(n => {
    const source = $(n).html().trim();
    return { sha256: hash(source), ...approvedScript(source, expectedSource) };
  });
  const metadataScope = $('[data-apropos-review-metadata]');
  const scope = {
    count: metadataScope.length,
    topics: metadataScope.find('[data-review-topic-slug]').toArray().map(n => compact($(n).text())),
    attributes: metadataScope.toArray().map(n => n.attribs),
    primaryTopic: compact($('template[data-apropos-primary-topic]').text()),
  };
  const metadata = $('meta,link[rel="canonical"],link[rel="alternate"]').toArray().map(n => Object.fromEntries(Object.entries(n.attribs).map(([k,v]) => [k,norm(v)])));
  const jsonld = $('script[type="application/ld+json"]').toArray().map(n => {
    try { return JSON.parse(norm($(n).html())); } catch { return { invalid: norm($(n).html()) }; }
  });
  const articleLinks = $('a[href]').toArray().filter(n => /\/articles\//.test($(n).attr('href'))).map(n => [norm($(n).attr('href')), compact($(n).text())]);
  const images = $('img').toArray().map(n => Object.fromEntries(Object.entries(n.attribs).map(([k,v]) => [k,norm(v)])));
  const customInlineJS = $('script:not([src])').toArray().filter(n => !ownScripts.includes(n) && $(n).attr('type') !== 'application/ld+json').map(n => norm($(n).html()).trim());
  const externalScripts = $('script[src]').toArray().map(n => norm($(n).attr('src')));
  const stylesheets = $('link[rel="stylesheet"]').toArray().map(n => norm($(n).attr('href')));
  // Remove only the agreed inert metadata additions before comparing UI content.
  $('[data-apropos-review-metadata],template[data-apropos-primary-topic],template[data-apropos-book-metadata]').remove();
  $('script,style,noscript').remove();
  const visibleText = compact($('body').text());
  const structure = $('body *').toArray().map(n => ({ tag: n.tagName, class: n.attribs.class || '', style: n.attribs.style || '', hidden: n.attribs.hidden ?? null, id: n.attribs.id || '', animation: n.attribs['data-w-id'] || '' }));
  const data = { visibleText, metadata, jsonld, articleLinks, images, customInlineJS, structure };
  return { path, hashes: Object.fromEntries(Object.entries(data).map(([k,v]) => [k, hash(v)])), ownReview, scope, externalScripts, stylesheets, data };
}
async function get(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'Apropos release verification (read-only)' } });
  const html = await response.text();
  if (!response.ok) throw Error(`${response.status} ${url}`);
  return { html, status: response.status, finalUrl: response.url };
}
async function sitemap(origin) {
  const { html } = await get(origin + '/sitemap.xml');
  const $ = cheerio.load(html, { xml: true });
  return [...new Set($('loc').toArray().map(n => new URL($(n).text()).pathname))].sort();
}
const controls = ['/','/en','/topics/film','/topics/koncerter','/topics/kultur-mening','/topics/anmeldelser','/en/topics/movies','/en/topics/Concerts','/en/topics/culture-opinion','/en/topics/reviews','/featured-articles','/en/featured-articles'];
const [command, environment, comparePath] = process.argv.slice(2);
if (command === 'details') {
  const current = JSON.parse(await readFile(resolve(receiptDir, `REVIEW-TYPE-${environment.toUpperCase()}-2026-10-21.json`), 'utf8'));
  const before = JSON.parse(await readFile(resolve(root, comparePath), 'utf8'));
  const details = { checkedAt: new Date().toISOString(), environment, baseline: comparePath, imageChanges: {}, responsiveCandidates: {}, otherImageChanges: [], textChanges: [], bookMetadataChanges: [], articleScopeErrors: [], articleCount: 0, streetFighter: [] };
  for (const page of current.results) {
    const b = cheerio.load(await readFile(resolve(rawDir, before.environment, encodeURIComponent(page.path) + '.html'), 'utf8'));
    const a = cheerio.load(await readFile(resolve(rawDir, environment, encodeURIComponent(page.path) + '.html'), 'utf8'));
    const images = $ => $('img').toArray().map(n => Object.fromEntries(Object.entries(n.attribs).map(([k,v]) => [k,norm(v)])));
    const bi = images(b), ai = images(a);
    if (bi.length !== ai.length) details.otherImageChanges.push({path:page.path,beforeCount:bi.length,afterCount:ai.length});
    for (let i=0; i<Math.min(bi.length,ai.length); i++) {
      for (const key of new Set([...Object.keys(bi[i]),...Object.keys(ai[i])])) {
        if (bi[i][key] === ai[i][key]) continue;
        if (key !== 'sizes') details.otherImageChanges.push({path:page.path,index:i,key,before:bi[i][key],after:ai[i][key]});
        const signature = JSON.stringify({key,before:bi[i][key],after:ai[i][key],src:bi[i].src,class:bi[i].class});
        details.imageChanges[signature] = (details.imageChanges[signature] || 0)+1;
        if (key === 'sizes' && !details.responsiveCandidates[signature]) {
          const cap = bi[i][key]?.match(/^\(max-width: (\d+)px\) 100vw, (\d+)px$/);
          const widths = [...(bi[i].srcset || '').matchAll(/(?:^|,)\s*[^,]+?\s+(\d+)w(?=,|$)/g)].map(m=>Number(m[1])).sort((a,b)=>a-b);
          const exactCap = !!cap && cap[1] === cap[2] && widths.length > 0 && widths.at(-1) === Number(cap[1]) && ai[i][key] === '100vw';
          const choose = request => widths.find(width=>width>=request) || widths.at(-1);
          const viewportWidths = [...Array.from({length:1601},(_,n)=>n+320),3840,5120,7680];
          let cases=0; const mismatches=[];
          if (cap && widths.length) for (const viewport of viewportWidths) for (const dpr of [1,2,3]) {
            cases++; const beforeChoice=choose(Math.min(viewport,Number(cap[1]))*dpr), afterChoice=choose(viewport*dpr);
            if (beforeChoice!==afterChoice) mismatches.push({viewport,dpr,beforeChoice,afterChoice});
          }
          details.responsiveCandidates[signature]={src:bi[i].src,widths,oldCap:cap?Number(cap[1]):null,maxSourceEqualsOldCap:exactCap,cases,mismatches};
        }
      }
    }
    const book = $ => compact($('template[data-apropos-book-metadata]').text());
    if (book(b) !== book(a)) details.bookMetadataChanges.push(page.path);
    const texts = $ => {
      $('[data-apropos-review-metadata],template,script,style,noscript').remove();
      return $('body *').contents().toArray().filter(n=>n.type==='text').map(n=>compact($(n).text())).filter(Boolean);
    };
    const bt=texts(b), at=texts(a);
    if (JSON.stringify(bt)!==JSON.stringify(at)) {
      details.textChanges.push({path:page.path,beforeCount:bt.length,afterCount:at.length,changes:bt.map((text,index)=>text===at[index]?null:{index,before:text,after:at[index]}).filter(Boolean)});
    }
    if (/\/articles\//.test(page.path)) {
      details.articleCount++;
      if (page.scope.count!==1 || !page.scope.attributes.every(attrs=>Object.hasOwn(attrs,'hidden')) || /\{\{\s*wf/.test(page.scope.primaryTopic) || page.scope.topics.some(value=>/\{\{\s*wf/.test(value))) details.articleScopeErrors.push(page.path);
      if (page.path.endsWith('/street-fighter-2026')) details.streetFighter.push({path:page.path,scope:page.scope,ownReview:page.ownReview});
    }
  }
  details.responsiveCandidates=Object.values(details.responsiveCandidates);
  details.responsiveCandidateModel='Width-descriptor target: first source >= slot-width * DPR, otherwise largest available. Viewports every integer 320–1920 plus 3840/5120/7680; DPR 1/2/3. With max-source equal to old cap, targets saturate at the same source above the cap for DPR >= 1. This does not model cache/network heuristics or DPR < 1.';
  details.imageChanges=Object.entries(details.imageChanges).map(([change,count])=>({...JSON.parse(change),count}));
  const output=resolve(receiptDir,`REVIEW-TYPE-${environment.toUpperCase()}-DETAILS-2026-10-21.json`);
  await writeFile(output,JSON.stringify(details,null,2)+'\n');
  console.log(JSON.stringify({...details,output},null,2));
  process.exit(0);
}
if (command !== 'capture' || !['production-before','staging','production-after'].includes(environment)) {
  throw Error('Usage: node scripts/verify-webflow-review-release.mjs capture production-before|staging|production-after [baseline-receipt-path]');
}
const origin = origins[environment === 'staging' ? 'staging' : 'production'];
const startedAt = new Date().toISOString();
const sitemapPaths = await sitemap(origin);
const paths = [...controls, ...sitemapPaths.filter(p => !controls.includes(p))];
const result = { startedAt, environment, origin, concurrency: 8, readOnly: true, sitemapPaths, approvedSourceSha256: hash(environment === 'production-before' ? oldSource : newSource), results: [], errors: [] };
await mkdir(resolve(rawDir, environment), { recursive: true });
let cursor = 0;
await Promise.all(Array.from({length: 8}, async () => {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    try {
      const response = await get(origin + path);
      await writeFile(resolve(rawDir, environment, encodeURIComponent(path) + '.html'), response.html);
      const full = snapshot(response.html, path, environment);
      delete full.data;
      result.results.push({ ...full, status: response.status, finalUrl: response.finalUrl });
    } catch (error) { result.errors.push({ path, error: String(error) }); }
  }
}));
result.results.sort((a,b) => a.path.localeCompare(b.path));
result.completedAt = new Date().toISOString();
if (comparePath) {
  const before = JSON.parse(await readFile(resolve(root, comparePath), 'utf8'));
  const byPath = new Map(before.results.map(v => [v.path,v]));
  result.comparison = { baseline: comparePath, sitemapEqual: JSON.stringify(before.sitemapPaths) === JSON.stringify(sitemapPaths), diffs: [], assetChanges: [], exactFooterErrors: [] };
  for (const page of result.results) {
    const prior = byPath.get(page.path);
    if (!prior) { result.comparison.diffs.push({ path: page.path, fields: ['missing-baseline'] }); continue; }
    const fields = Object.keys(page.hashes).filter(k => page.hashes[k] !== prior.hashes[k]);
    if (fields.length) result.comparison.diffs.push({ path: page.path, fields });
    if (JSON.stringify(page.externalScripts) !== JSON.stringify(prior.externalScripts) || JSON.stringify(page.stylesheets) !== JSON.stringify(prior.stylesheets)) {
      result.comparison.assetChanges.push({ path: page.path, scriptsBefore: prior.externalScripts, scriptsAfter: page.externalScripts, stylesBefore: prior.stylesheets, stylesAfter: page.stylesheets });
    }
    const article = /\/articles\//.test(page.path);
    if (article && (page.ownReview.length !== 1 || !page.ownReview[0].exact)) result.comparison.exactFooterErrors.push(page.path);
  }
  result.comparison.controlsUnchanged = controls.every(path => !result.comparison.diffs.some(d => d.path === path));
}
const receipt = resolve(receiptDir, `REVIEW-TYPE-${environment.toUpperCase()}-2026-10-21.json`);
await writeFile(receipt, JSON.stringify(result, null, 2) + '\n');
console.log(JSON.stringify({ receipt, fetched: result.results.length, errors: result.errors, sourceErrors: result.results.filter(p => p.ownReview.some(s => !s.exact)).map(p=>p.path), comparison: result.comparison ? { sitemapEqual: result.comparison.sitemapEqual, diffCount: result.comparison.diffs.length, firstDiffs: result.comparison.diffs.slice(0,12), assetChanges: result.comparison.assetChanges.length, exactFooterErrors: result.comparison.exactFooterErrors, controlsUnchanged: result.comparison.controlsUnchanged } : undefined }, null, 2));
