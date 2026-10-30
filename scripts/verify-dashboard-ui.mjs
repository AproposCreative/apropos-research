// Actual dashboard clients, isolated read-only fixtures; no logged-in browser or real services.
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { chromium } from 'playwright';
import postcss from 'postcss';
import tailwind from 'tailwindcss';
const require = createRequire(import.meta.url);
const config = require('../tailwind.config.cjs');
const css = (await postcss([tailwind({ ...config, content: ['./app/dashboard/**/*.tsx', './components/**/*.tsx'] })]).process('@tailwind base;@tailwind utilities;', { from: undefined })).css;
const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
import React from 'react';import {createRoot} from 'react-dom/client';
import Dashboard from './app/dashboard/DashboardClient';
window.fixture={calls:[],errors:[],stale:false};
window.addEventListener('error', e=>fixture.errors.push(e.message));
window.addEventListener('unhandledrejection', e=>fixture.errors.push(String(e.reason)));
const mode=new URLSearchParams(location.search).get('mode');
const base={period:'28d',generatedAt:'2026-10-30T15:00:00Z',range:{startDate:'2026-10-03',endDate:'2026-10-30'},availability:{overview:true,authors:true,articles:true,viewsTrend:true,topArticles:true},
overview:{activeUsers:2062,pageViews:3099,sessions:2301},articles:{published:242,drafts:7},
newsletter:{signups:18,totalSignups:18},viewsTrend:Array.from({length:28},(_,i)=>({date:'202610'+String(i+3).padStart(2,'0'),views:i===0?0:40+i*3})),
topArticles:[{path:'/articles/nogen-der-kender-nogen',slug:'nogen-der-kender-nogen',title:'Boganmeldelse: Nogen der kender nogen',views:102}],
trafficSources:[{channel:'Organic Search',sessions:667},{channel:'Direct',sessions:310}],
google:{searchConsoleLinked:true,clicks:501,impressions:21321,ctr:501/21321,organicSessions:667,searchQueriesNote:'Google kan være forsinket med de seneste dage.',googleSources:[],topLandingPages:[]},
authorLeaderboard:[{authorId:'liv',name:'Liv Brandt',views:501,articleCount:12}],recommendations:[]};
const audience=Array.from({length:18},(_,i)=>({email:(i===0?'a-very-long-address-to-test-wrapping-on-a-small-phone':('reader'+i))+'@example.test',signedUpAt:i===1?null:'2026-10-08T12:00:00Z',active:i!==2}));
const newsletters={audience,newSubscribers:17,unknownSignupDates:1,tracking:{openTracking:true,clickTracking:true,observedAt:'2026-10-30T15:00:00Z'},truncated:false,historyNote:null,
campaigns:[{id:'week44',subject:'Bøger, koncertlys og store serier',sentAt:'2026-10-30T12:45:00Z',sendType:'weekly_auto',audienceKnown:true,recipients:18,delivered:18,opened:null,clicked:null,failed:0,messages:audience.map(row=>({email:row.email,status:'delivered',opened:null,clicked:null}))},
{id:'future',subject:'Næste uges kultur',sentAt:'2026-11-06T12:45:00Z',sendType:'weekly_auto',audienceKnown:true,recipients:18,delivered:18,opened:4,clicked:2,failed:0,messages:audience.map((row,i)=>({email:row.email,status:i<2?'clicked':i<4?'opened':'delivered',opened:i<4,clicked:i<2}))}]};
window.fetch=async (url, options={})=>{
 const u=new URL(String(url),location.origin);fixture.calls.push(u.pathname+'?'+u.searchParams.toString());
 if(options.method&&options.method!=='GET')throw Error('Forbidden mutation');
 if(u.pathname==='/api/dashboard/newsletter')return Response.json({data:newsletters});
 if(u.pathname!=='/api/dashboard')throw Error('Unexpected endpoint '+u.pathname);
 const p=u.searchParams.get('period');const result={...base,period:p};
 if(p==='365d')result.topArticles=[
  {path:'/articles/another-brick-in-the-wall-part-5-royal-arena',slug:'another-brick-in-the-wall-part-5-royal-arena',title:'Another Brick in the Wall Part 5: Anmeldelse',views:941},
  {path:'/articles/monarch-legacy-of-monsters-season-2',slug:'monarch-legacy-of-monsters-season-2',title:'Monarch: Legacy of Monsters sæson 2 anmeldelse',views:427},
  {path:'/articles/deep-purple---58-ar-senere-er-der-stadig-ild-i-orgelet',slug:'deep-purple---58-ar-senere-er-der-stadig-ild-i-orgelet',title:'Anmeldelse: Deep Purple - Royal Arena',views:195},
 ];
 if(mode==='staff')delete result.newsletter;
 if(mode==='partial'){result.overview=null;result.availability={...base.availability,overview:false};}
 // Deliberately ignore AbortSignal to prove stale responses cannot overwrite the active period.
 if(fixture.stale){await new Promise(r=>setTimeout(r,p==='7d'?350:15));result.overview={...base.overview,pageViews:p==='7d'?777:30000};}
 return Response.json({data:result});
};
createRoot(document.getElementById('root')).render(<Dashboard embedded onClose={()=>{}}/>);
` }, bundle: true, write: false, outdir: '/virtual', jsx: 'automatic', format: 'iife', define: { 'process.env.NODE_ENV': '"development"' }, plugins: [{ name: 'fixtures', setup(b) {
  b.onResolve({ filter: /auth-context$|AuthModal$|^next\/link$|^next\/navigation$/ }, a => ({ path: a.path, namespace: 'fixture' }));
  b.onLoad({ filter: /.*/, namespace: 'fixture' }, a => ({ resolveDir: process.cwd(), loader: 'tsx', contents:
    a.path.endsWith('auth-context') ? `const user={uid:'fixture',getIdToken:async()=> 'fixture-only'};export const useAuth=()=>({user,loading:false});` :
    a.path.endsWith('AuthModal') ? 'export default function Modal(){return null;}' :
    a.path === 'next/link' ? 'export default function Link(p){return <a {...p}/>;}' :
    `export const usePathname=()=>'/ai';export const useRouter=()=>({push:()=>{}});export const useSearchParams=()=>new URLSearchParams();`
  }));
} }] });
const server = createServer((req, res) => {
  if (req.url === '/bundle.js' || req.url === '/bundle.css') {
    res.setHeader('Content-Type', req.url.endsWith('.js') ? 'text/javascript' : 'text/css');
    res.end(bundle.outputFiles.find(f => f.path.endsWith(req.url.endsWith('.js') ? '.js' : '.css')).text); return;
  }
  res.setHeader('Content-Type', 'text/html;charset=utf-8');
  res.end('<!doctype html><html lang="da" class="dark"><meta name="viewport" content="width=device-width,initial-scale=1"><style>'+css+'body{margin:0;background:#000;color:#fff}#root{height:100dvh}</style><link rel="stylesheet" href="/bundle.css"><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const origin = 'http://127.0.0.1:' + server.address().port, out = 'output/dashboard-20261030/ui';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chrome' }), results = [];
try {
  for (const width of [320, 390, 768, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(origin);
    await page.getByText('18 bevarede tilmeldinger i alt', { exact: true }).waitFor();
    assert(!(await page.evaluate(() => fixture.calls.some(p => p.startsWith('/api/dashboard/newsletter')))), 'private data remains lazy');
    await page.screenshot({ path: out + '/overview-' + width + '.png' });
    await page.locator('summary').filter({ hasText: 'Se overblik' }).click();
    await page.getByRole('searchbox').waitFor();
    assert.equal(await page.getByText('Ikke målt', { exact: true }).count(), 2);
    assert.equal(await page.getByRole('list', { name: 'Nyhedsbrevets modtagere' }).locator('li').count(), 18);
    await page.getByRole('searchbox').fill('reader1@');
    assert.equal(await page.getByRole('list', { name: 'Nyhedsbrevets modtagere' }).locator('li').count(), 1);
    await page.getByRole('searchbox').fill('');
    await page.getByRole('combobox', { name: 'Vælg nyhedsbrev' }).selectOption('future');
    await page.getByText('Klik registreret', { exact: true }).first().waitFor();
    await page.screenshot({ path: out + '/newsletter-' + width + '.png' });
    const state = await page.evaluate(() => ({ errors: fixture.errors, overflow: document.documentElement.scrollWidth > innerWidth,
      headerHeight: document.querySelector('header').getBoundingClientRect().height,
      shortTargets: [...document.querySelectorAll('header button, header select, summary, input, select')].filter(e=>e.getBoundingClientRect().width && e.getBoundingClientRect().height < 43.5).map(e=>e.textContent || e.getAttribute('aria-label')) }));
    assert.deepEqual(state.errors, []); assert(!state.overflow, 'no horizontal overflow at '+width);
    assert(state.headerHeight <= 64); assert.deepEqual(state.shortTargets, []);
    // Both responses arrive, but the slower seven-day response must be discarded.
    await page.evaluate(() => { fixture.stale = true; });
    await page.getByRole('combobox', { name: 'Periode' }).selectOption('7d');
    await page.waitForTimeout(25);
    await page.getByRole('combobox', { name: 'Periode' }).selectOption('90d');
    await page.getByText('30.000', { exact: true }).first().waitFor();
    await page.waitForTimeout(400);
    assert.equal(await page.getByText('777', { exact: true }).count(), 0);
    await page.getByRole('combobox', { name: 'Periode' }).selectOption('365d');
    await page.getByRole('link', { name: 'Anmeldelse: Deep Purple - Royal Arena', exact: true }).waitFor();
    const rankedRows=page.getByRole('heading',{name:'Mest læste artikler',exact:true}).locator('..').locator('ul > li');
    assert.equal(await rankedRows.count(),3);
    assert.deepEqual(await rankedRows.evaluateAll(rows=>rows.map(row=>Number(row.querySelector('span').textContent))),[1,2,3]);
    assert.deepEqual(await rankedRows.evaluateAll(rows=>rows.map(row=>Number(row.lastElementChild.textContent))),[941,427,195]);
    const hrefs=await rankedRows.locator('a').evaluateAll(links=>links.map(a=>a.href));
    assert.equal(new Set(hrefs).size,3);
    await page.screenshot({path:out+'/year-ranking-'+width+'.png'});
    await page.getByRole('combobox', { name: 'Periode' }).selectOption('7d');
    await page.getByRole('link', { name: 'Boganmeldelse: Nogen der kender nogen',exact:true }).waitFor();
    assert.equal(await rankedRows.count(),1);
    assert.equal(await page.getByRole('link', { name:'Anmeldelse: Deep Purple - Royal Arena',exact:true }).count(),0);
    results.push({ width, ...state, search: true, campaigns: true, staleResponseDiscarded: true, yearRankingUniqueAndSequential: true, oldRowsRemovedOnPeriodChange: true });
    await page.close();
  }
  for (const mode of ['staff', 'partial']) {
    const page = await browser.newPage({ viewport: { width: 390, height: 900 } });
    await page.route('**/*', r => new URL(r.request().url()).origin === origin ? r.continue() : r.abort());
    await page.goto(origin + '/?mode=' + mode);
    await page.getByText('7 kladder · samlet arkiv', { exact: true }).waitFor();
    if (mode === 'staff') {
      assert.equal(await page.getByText('Se overblik', { exact: false }).count(), 0);
      assert(!(await page.evaluate(()=>fixture.calls.some(p=>p.startsWith('/api/dashboard/newsletter')))));
    } else {
      await page.getByText('Nogle datakilder kunne ikke hentes.', { exact: false }).waitFor();
      assert.equal(await page.getByText('18 bevarede tilmeldinger i alt', { exact: true }).count(), 1);
    }
    assert.deepEqual(await page.evaluate(()=>fixture.errors), []); await page.close();
  }
  await writeFile(out + '/verification.json', JSON.stringify({ checkedAt: new Date().toISOString(), results, staffPrivacy: true, partialSources: true, externalRequests: 0, serviceWrites: 0 }, null, 2));
  console.log('Dashboard UI: four viewport sizes; search, campaigns, unknown history, stale-response protection, staff isolation and partial sources passed. No service calls.');
} finally { await browser.close(); await new Promise(r => server.close(r)); }
