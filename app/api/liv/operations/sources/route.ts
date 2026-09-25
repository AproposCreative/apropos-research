import {NextRequest,NextResponse} from 'next/server';
import {z} from 'zod';
import {requireCronBearer} from '@/lib/cron/cron-auth';
import {getAdminDb} from '@/lib/firebase-admin';
import {claimPreparation,releasePreparation} from '@/lib/liv/delivery-store';
import {cmsFieldHash} from '@/lib/liv/cms-field-hash';
import {livImageArticleHash} from '@/lib/liv/article-image-hash';
import {copenhagenClock} from '@/lib/liv/delivery-policy';
import {retrieveSource,sourceUrl} from '@/lib/factcheck/source-reader';
export const runtime='nodejs';
export const maxDuration=60;
const schema=z.object({dayKey:z.string(),requestId:z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),expectedCheckpointHash:z.string().regex(/^[a-f0-9]{64}$/),
 reason:z.string().trim().min(10).max(500),urls:z.array(z.string().url()).max(2),
 unavailableUrls:z.array(z.string().url()).min(1).max(2).optional()}).strict()
 .refine(input=>input.urls.length>0 || !!input.unavailableUrls?.length);
const json=(body:unknown,status=200)=>NextResponse.json(body,{status,headers:{'Cache-Control':'no-store'}});
/** Audited evidence repair. Unavailable sources may be retired only after a
 * fresh failed read and successful retrieval of at least two dated hosts.
 * Original sources remain in the immutable audit. No quality approval. */
export async function POST(req:NextRequest){
 const denied=requireCronBearer(req);if(denied)return denied;
 let input:z.infer<typeof schema>;
 try{if(req.nextUrl.search)throw Error();const raw=await req.text();if(raw.length>4000)throw Error();input=schema.parse(JSON.parse(raw));
  if(input.dayKey!==copenhagenClock().day)throw Error();[...input.urls,...input.unavailableUrls||[]].forEach(u=>sourceUrl(u));
 }catch{return json({error:'liv_sources_invalid'},400);}
 let lease:string|null=null;
 let stage='lease';
 try{
  lease=await claimPreparation();if(!lease)return json({error:'already_preparing'},409);
  stage='checkpoint';
  const db=getAdminDb();if(!db)throw Error();
  const run=db.collection('livDailyArticles').doc(`reserve-editorial-${input.dayKey}`),audit=run.collection('sourceSupplements').doc(input.requestId);
  const previous=(await audit.get()).data();
  if(previous){if(previous.inputHash!==cmsFieldHash(input))throw Error();return json({status:'already_added'});}
  const snapshot=(await run.get()).data(),article=snapshot?.articleCheckpoint;
  if(!article || cmsFieldHash(article)!==input.expectedCheckpointHash || snapshot?.articleCheckpointHash!==livImageArticleHash(article) ||
    !['failed','skipped_factcheck','skipped_moderation','skipped_tov'].includes(snapshot.status) || snapshot.continuationReady || snapshot.retryAuthorization ||
    snapshot.webflowItemId || snapshot.preparationProof || snapshot.cmsSaveStarted)throw Error();
  const existing=article.researchSources || [],urls=[...new Set(input.urls.map(u=>sourceUrl(u).href))];
  if(existing.length+urls.length>8 || urls.some(u=>existing.some((s:{url:string})=>s.url===u)))throw Error();
  stage='source_retrieval';
  const sources=await Promise.all(urls.map((u,i)=>retrieveSource(u,`operator-${i+1}`)));
  const unavailable=[...new Set(input.unavailableUrls?.map(u=>sourceUrl(u).href)||[])];
  if(unavailable.some(url=>!existing.some((s:{url:string})=>s.url===url)))throw Error();
  for(const url of unavailable){
   let available=false;
   try{await retrieveSource(url,'availability-check');available=true;}catch{/* A failed read is not factual evidence. */}
   if(available)throw Error();
  }
  let retained=existing.filter((s:{url:string})=>!unavailable.includes(s.url));
  if(unavailable.length){
   const refreshed=await Promise.all(retained.map((s:{url:string},i:number)=>retrieveSource(s.url,`retained-${i+1}`)));
   if(new Set([...refreshed,...sources].filter(s=>s.publishedAt).map(s=>new URL(s.url).hostname.replace(/^www\./,''))).size<2)throw Error();
   retained=retained.map((s:object,i:number)=>({...s,publishedAt:refreshed[i].publishedAt,
    snippet:refreshed[i].text.slice(0,240),contentHash:refreshed[i].contentHash,retrievedAt:refreshed[i].retrievedAt}));
  }
  const revised={...article,researchSources:[...retained,...sources.map(s=>({url:s.url,title:s.title,source:new URL(s.url).hostname,
    snippet:s.text.slice(0,240),contentHash:s.contentHash,retrievedAt:s.retrievedAt,publishedAt:s.publishedAt}))]};
  stage='transaction';
  await db.runTransaction(async tx=>{
   const current=(await tx.get(run)).data(),state=(await tx.get(db.collection('livDelivery').doc('manifest'))).data();
   const prior=await tx.get(audit);
   if(prior.exists || !current || cmsFieldHash(current)!==cmsFieldHash(snapshot!) || state?.preparation?.token!==lease || state.preparation.leaseUntil<=Date.now())throw Error();
   tx.create(audit,{inputHash:cmsFieldHash(input),input,previousRun:snapshot,sources,retiredUnavailableUrls:unavailable,checkpointHash:cmsFieldHash(revised),createdAt:new Date().toISOString(),authority:'cron-authenticated-operator'});
   tx.update(run,{articleCheckpoint:revised,articleCheckpointHash:livImageArticleHash(revised)});
  });
  return json({status:'sources_added',count:sources.length,checkpointHash:cmsFieldHash(revised)});
 }catch{
  console.error(JSON.stringify({event:'liv_source_supplement_failed',stage,requestId:input.requestId}));
  return json({error:'liv_sources_conflict_or_unavailable',stage},409);
 }
 finally{if(lease)await releasePreparation(lease).catch(()=>{});}
}
