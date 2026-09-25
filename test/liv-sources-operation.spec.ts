import {beforeEach,afterEach,it,expect,vi} from 'vitest';
import {NextRequest,NextResponse} from 'next/server';
const s=vi.hoisted(()=>({rows:new Map<string,any>(),auth:vi.fn(),claim:vi.fn(),release:vi.fn(),retrieve:vi.fn(),writes:vi.fn()}));
vi.mock('@/lib/cron/cron-auth',()=>({requireCronBearer:s.auth}));
vi.mock('@/lib/liv/delivery-store',()=>({claimPreparation:s.claim,releasePreparation:s.release}));
vi.mock('@/lib/factcheck/source-reader',async original=>({...await original<typeof import('@/lib/factcheck/source-reader')>(),retrieveSource:s.retrieve}));
vi.mock('@/lib/firebase-admin',()=>{const ref=(p:string):any=>({path:p,id:p.split('/').at(-1),get:async()=>({exists:s.rows.has(p),data:()=>structuredClone(s.rows.get(p))}),collection:(n:string)=>({doc:(id:string)=>ref(`${p}/${n}/${id}`)})});return {getAdminDb:()=>({collection:(n:string)=>({doc:(id:string)=>ref(`${n}/${id}`)}),runTransaction:async(fn:any)=>fn({get:(r:any)=>r.get(),create:(r:any,d:any)=>{s.rows.set(r.path,d);s.writes(r.path)},update:(r:any,d:any)=>{s.rows.set(r.path,{...s.rows.get(r.path),...d});s.writes(r.path)}})})};});
import {POST} from '@/app/api/liv/operations/sources/route';
import {livImageArticleHash} from '@/lib/liv/article-image-hash';
import {cmsFieldHash} from '@/lib/liv/cms-field-hash';
import {readReadingDossier,readingDossierKey,readingDossierFields} from '@/lib/liv/reading-dossier';
const path='livDailyArticles/reserve-editorial-2026-09-20';
const article:any={title:'Review',intro:'Intro',content:'Original saved text',researchSources:[{url:'https://first.example/a'}]};
const input={dayKey:'2026-09-20',requestId:'append-official-source',expectedCheckpointHash:cmsFieldHash(article),reason:'Add missing official evidence',urls:['https://www.20thcenturystudios.com.au/movies/die-hard-2']};
const req=(body:any=input)=>new NextRequest('https://app.test/api/liv/operations/sources',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();s.rows.clear();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-20T20:00:00Z'));s.claim.mockResolvedValue('lease');s.release.mockResolvedValue(undefined);
 s.rows.set(path,{status:'failed',articleCheckpoint:structuredClone(article),articleCheckpointHash:livImageArticleHash(article)});
 s.rows.set('livDelivery/manifest',{preparation:{token:'lease',leaseUntil:Date.now()+60000}});
 s.retrieve.mockImplementation(async(url:string)=>({url,title:'Official source',text:'Fetched body text',contentHash:'a'.repeat(64),retrievedAt:new Date().toISOString(),publishedAt:null}));});
afterEach(()=>vi.useRealTimers());
it('requires service auth before reads or writes',async()=>{s.auth.mockReturnValue(NextResponse.json({},{status:401}));expect((await POST(req())).status).toBe(401);expect(s.claim).not.toHaveBeenCalled()});
it('stores reading notes as attributed evidence for exact copy, not an approval or public source',async()=>{
 const dossier={title:'Redaktionens læsenoter',text:'Et konkret læsenotat om romanens scener. '.repeat(20),attachmentHash:'c'.repeat(64)};
 const body={...input,urls:[],dossier};
 expect((await POST(req(body))).status).toBe(200);
 const runId=path.split('/')[1],fields=readingDossierFields(article);
 const notes=await readReadingDossier(runId,fields);
 expect(notes).toHaveLength(1);expect(notes[0].publishedAt).toBeNull();expect(notes[0].text).toBe(dossier.text.trim());
 expect(s.rows.get(path).status).toBe('failed');expect(s.rows.get(path).articleCheckpoint).toEqual(article);
 expect(await readReadingDossier(runId,{...fields,content:'Changed'})).toEqual([]);
 expect(await readReadingDossier('writer-random',fields)).toEqual([]);
 expect((await POST(req(body))).status).toBe(200);
 s.rows.get(`livReadingDossiers/${readingDossierKey(runId,fields)}`).dossier.text+=' changed';
 await expect(readReadingDossier(runId,fields)).rejects.toThrow('liv_dossier_mismatch');
});
it('appends retrieved evidence only and makes replay idempotent',async()=>{
 expect((await POST(req())).status).toBe(200);const a=s.rows.get(path).articleCheckpoint;
 expect(a.content).toBe(article.content);expect(a.researchSources).toHaveLength(2);expect(s.rows.get(path).status).toBe('failed');
 expect((await POST(req())).status).toBe(200);expect(s.retrieve).toHaveBeenCalledOnce();expect(s.writes).toHaveBeenCalledTimes(2);
});
it('repairs tomorrow’s saved scheduled evidence with the same audit/CAS, without changing copy or granting retry',async()=>{
 const future='livDailyArticles/prepare-2026-09-21';s.rows.set(future,structuredClone(s.rows.get(path)));
 const body={...input,dayKey:'2026-09-21',scope:'prepare'};
 expect((await POST(req(body))).status).toBe(200);
 expect(s.rows.get(future).articleCheckpoint.content).toBe(article.content);
 expect(s.rows.get(future).articleCheckpoint.researchSources).toHaveLength(2);
 expect(s.rows.get(future).retryAuthorization).toBeUndefined();
 expect(s.rows.get(path).articleCheckpoint.researchSources).toHaveLength(1);
 expect((await POST(req(body))).status).toBe(200);expect(s.retrieve).toHaveBeenCalledOnce();
});
it.each(['2026-09-19','2026-09-28','2026-02-30'])('rejects out-of-window scheduled repair %s',async dayKey=>{
 expect((await POST(req({...input,dayKey,scope:'prepare'}))).status).toBe(400);expect(s.writes).not.toHaveBeenCalled();
});
it.each([{...input,force:true},{...input,dayKey:'2026-09-21'},{...input,urls:['http://localhost/a']}])('rejects unsafe inputs',async body=>{expect((await POST(req(body))).status).toBe(400);expect(s.writes).not.toHaveBeenCalled()});
it.each(['processing','draft','published'])('cannot modify an active or delivered %s run',async status=>{s.rows.get(path).status=status;expect((await POST(req())).status).toBe(409);expect(s.retrieve).not.toHaveBeenCalled()});
it('preserves work on source failure or stale checkpoints',async()=>{s.retrieve.mockRejectedValue(Error('private error'));const r=await POST(req());expect(r.status).toBe(409);expect(JSON.stringify(await r.json())).not.toContain('private');expect(s.writes).not.toHaveBeenCalled();expect(s.release).toHaveBeenCalledWith('lease');});
it('rejects an article changed while fetching sources',async()=>{s.retrieve.mockImplementation(async()=>{s.rows.get(path).reason='concurrent edit';return {url:input.urls[0],title:'Source',text:'Text',contentHash:'a'.repeat(64),retrievedAt:new Date().toISOString(),publishedAt:null}});expect((await POST(req())).status).toBe(409);expect(s.writes).not.toHaveBeenCalled()});
it.each(['ok','available','one-host'])('audits unavailable-source retirement without approving facts: %s',async mode=>{
 const a={...article,researchSources:[...article.researchSources,{url:'https://second.example/b'},{url:'https://third.example/c'}]};
 s.rows.set(path,{status:'failed',articleCheckpoint:a,articleCheckpointHash:livImageArticleHash(a)});
 s.retrieve.mockImplementation(async(url:string)=>{
  if(url===article.researchSources[0].url && mode!=='available')throw Error('HTTP 403');
  return {url,title:'Source',text:'Actual source content',contentHash:'a'.repeat(64),retrievedAt:new Date().toISOString(),publishedAt:mode==='one-host'?null:'2026-09-19T10:00:00Z'};
 });
 const body={...input,urls:[],unavailableUrls:[article.researchSources[0].url],expectedCheckpointHash:cmsFieldHash(a)};
 expect((await POST(req(body))).status).toBe(mode==='ok'?200:409);
 if(mode==='ok'){
  expect(s.rows.get(path).articleCheckpoint.researchSources).toHaveLength(2);
  expect(s.rows.get(path).articleCheckpoint.content).toBe(article.content);
  expect(s.rows.get(path).status).toBe('failed');
  expect(s.rows.get(`${path}/sourceSupplements/${input.requestId}`).previousRun.articleCheckpoint).toEqual(a);
  expect((await POST(req(body))).status).toBe(200);
 }else expect(s.writes).not.toHaveBeenCalled();
});
