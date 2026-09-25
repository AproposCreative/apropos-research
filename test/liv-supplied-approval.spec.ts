import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const s = vi.hoisted(()=>({rows:new Map<string,any>(),access:vi.fn(),claim:vi.fn(),release:vi.fn(),cover:vi.fn(),writes:vi.fn()}));
vi.mock('@/lib/editorial-access',()=>({editorialRequestAccess:s.access}));
vi.mock('@/lib/liv/delivery-store',()=>({claimPreparation:s.claim,releasePreparation:s.release}));
vi.mock('@/lib/liv/supplied-cover',()=>({attachSuppliedCover:s.cover}));
vi.mock('@/lib/firebase-admin',()=>{const ref=(p:string):any=>({path:p,get:async()=>({exists:s.rows.has(p),data:()=>structuredClone(s.rows.get(p))}),collection:(n:string)=>({doc:(id:string)=>ref(`${p}/${n}/${id}`)})});return {getAdminDb:()=>({collection:(n:string)=>({doc:(id:string)=>ref(`${n}/${id}`)}),runTransaction:async(fn:any)=>fn({get:(r:any)=>r.get(),create:(r:any,d:any)=>{s.rows.set(r.path,d);s.writes(r.path)},update:(r:any,d:any)=>{s.rows.set(r.path,{...s.rows.get(r.path),...d});s.writes(r.path)}})})};});
import { POST } from '@/app/api/liv/operations/approve-supplied/route';
import { readSuppliedApproval, suppliedApprovalGates } from '@/lib/liv/supplied-approval';
import { suppliedArticleCheckpoint } from '@/lib/liv/supplied-article';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { livImageArticleHash } from '@/lib/liv/article-image-hash';
const original = {title:'Boganmeldelse: Partybus',subtitle:'En bog om selvbedrag',intro:'En roman om at holde sammen på sin egen historie.',
  content:`<p>${'En konkret original læseoplevelse. '.repeat(160)}</p>`,slug:'boganmeldelse-partybus',excerpt:'En bog om selvbedrag',
  section:'Kultur',tags:['Bøger'],seoTitle:'Partybus anmeldelse',seoDescription:'En bog om selvbedrag',primaryKeyword:'Partybus',
  rating:5,ratingReason:'Fortællerstemmen er stærk, midten er lang.',researchSources:[{title:'Bog',source:'Forlag',url:'https://bog.dk/bog'},
    {title:'Bogdata',source:'Bibliotek',url:'https://bibliotek.dk/bog'}],imageSuggestions:[]};
const article:any={...suppliedArticleCheckpoint(original),preparedMedia:['hero','body-1','body-2'].map((role,i)=>({role,contentHash:String(i).repeat(64)}))};
article.selectedImage={articleHash:livImageArticleHash(article)};
const runId='reserve-editorial-2026-09-25', path=`livDailyArticles/${runId}`, reservation={input:{dayKey:'2026-09-25',suppliedArticle:original},inputHash:''};
reservation.inputHash=cmsFieldHash(reservation.input);
const input={dayKey:'2026-09-25',requestId:'owner-review-approval',expectedCheckpointHash:cmsFieldHash(article),reason:'Frederik har selv skrevet og godkendt anmeldelsen.',authority:'owner-approved-original-review'};
const req=(body:any=input)=>new NextRequest('https://app.test/api/liv/operations/approve-supplied',{method:'POST',body:JSON.stringify(body)});
beforeEach(()=>{vi.resetAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-09-25T09:00:00Z'));s.rows.clear();
  s.access.mockResolvedValue({owner:true,uid:'frederik'});s.claim.mockResolvedValue('lease');s.release.mockResolvedValue(undefined);
  s.rows.set(path,{status:'skipped_moderation',articleCheckpoint:structuredClone(article),articleCheckpointHash:livImageArticleHash(article),
    explicitPreparationInputHash:reservation.inputHash,gateResults:[{name:'verification-complete',pass:false,detail:'Timed out'}]});
  s.rows.set(`livExplicitPreparations/${runId}`,structuredClone(reservation));
  s.rows.set('livDelivery/manifest',{preparation:{token:'lease',leaseUntil:Date.now()+60000}});
});
afterEach(()=>vi.useRealTimers());
it.each([null,{uid:'casper',owner:false}])('requires verified owner, not service/body identity',async access=>{
  s.access.mockResolvedValue(access);expect((await POST(req())).status).toBe(access?403:401);expect(s.claim).not.toHaveBeenCalled();
});
it('records separate editorial authority, preserves failed checks, and exact replay is read-only',async()=>{
  const previous=structuredClone(s.rows.get(path));expect((await POST(req())).status).toBe(200);
  const row=s.rows.get(path);expect(row.gateResults).toEqual(previous.gateResults);expect(row.status).toBe(previous.status);
  expect(s.rows.get(`${path}/suppliedApprovals/${input.requestId}`).previousRun).toEqual(previous);
  const approval=await readSuppliedApproval(runId,article,reservation,row);expect(approval?.ownerUid).toBe('frederik');
  const gates=suppliedApprovalGates(approval!);expect(gates.pass).toBe(true);expect(gates.results.some(g=>g.name==='factcheck')).toBe(false);
  expect((await POST(req())).status).toBe(200);expect(s.writes).toHaveBeenCalledTimes(2);expect(s.cover).not.toHaveBeenCalled();
});
it.each(['generated','changed-copy','changed-metadata','missing-media','stale-hash','wrong-reservation','active','cms-started','retry','lease'])('rejects %s without writes',async mode=>{
  const row=s.rows.get(path),body={...input};
  if(mode==='generated')row.articleCheckpoint.aiModel='gpt';
  if(mode==='changed-copy')row.articleCheckpoint.content+='<p>Ny påstand.</p>';
  if(mode==='changed-metadata')row.articleCheckpoint.rating=6;
  if(mode==='missing-media')row.articleCheckpoint.preparedMedia.pop();
  if(mode==='wrong-reservation')row.explicitPreparationInputHash='x';
  if(mode==='active')row.status='processing';
  if(mode==='cms-started')row.cmsSaveStarted=true;
  if(mode==='retry')row.retryAuthorization='pending';
  if(mode==='lease')s.rows.get('livDelivery/manifest').preparation.token='other';
  if(mode!=='stale-hash'){body.expectedCheckpointHash=cmsFieldHash(row.articleCheckpoint);row.articleCheckpointHash=livImageArticleHash(row.articleCheckpoint);}
  else body.expectedCheckpointHash='a'.repeat(64);
  expect((await POST(req(body))).status).toBe(409);expect(s.writes).not.toHaveBeenCalled();
});
it('no stored approval means generated/supplied work uses normal gates; edited approved copy cannot inherit approval',async()=>{
  expect(await readSuppliedApproval(runId,article,reservation,s.rows.get(path))).toBeNull();
  await POST(req()); const row=s.rows.get(path);
  await expect(readSuppliedApproval(runId,{...article,seoTitle:'Changed'},reservation,row)).rejects.toThrow();
  const audit=s.rows.get(`${path}/suppliedApprovals/${input.requestId}`);audit.approval.reason='Tampered';
  await expect(readSuppliedApproval(runId,article,reservation,row)).rejects.toThrow('liv_supplied_approval_mismatch');
});
it('attaches a supplied cover only after authorization and binds approval to resulting checkpoint',async()=>{
  const changed={...article,selectedImage:{...article.selectedImage,contentHash:'b'.repeat(64),visualReview:'editorial'}};
  s.cover.mockResolvedValue(changed);
  const r=await POST(req({...input,cover:{base64:'a'.repeat(100),alt:'Bogen på et træbord',credit:'Brugerleveret billede',preservePrintedBookTitle:true}}));
  expect(r.status).toBe(200);expect(s.cover).toHaveBeenCalledOnce();
  expect(s.rows.get(path).articleCheckpoint).toEqual(changed);
  expect((await readSuppliedApproval(runId,changed,reservation,s.rows.get(path)))?.checkpointHash).toBe(cmsFieldHash(changed));
});
it.each([{...input,force:true},{...input,dayKey:'2026-09-24'},{...input,authority:'ai-verified'}])('rejects invalid approval inputs',async body=>{
  expect((await POST(req(body))).status).toBe(400);expect(s.writes).not.toHaveBeenCalled();
});
