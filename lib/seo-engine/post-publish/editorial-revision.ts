import { createHash } from 'node:crypto';
import { z } from 'zod';
import { getAdminDb } from '@/lib/firebase-admin';
import { acquireCmsWriteLease } from '@/lib/seo-engine/cms-write-lease';
import { applyPublishedMetadata, readPublishedArticle, reconcilePublishedMetadata } from './cms';
import { reviewKey } from './policy';
import { checkLiveMetadataDuplicates } from './uniqueness';
const safeText=(max:number)=>z.string().trim().min(10).max(max).refine(v=>!/[<>\x00-\x1f]/.test(v));
export const editorialRevisionInput=z.object({itemId:z.string().regex(/^[a-f0-9]{24}$/),requestId:z.string().regex(/^[a-zA-Z0-9_-]{8,100}$/),
  expectedReviewKey:z.string().regex(/^[a-f0-9]{64}$/),reason:safeText(1000),
  patch:z.object({seoTitle:safeText(100).optional(),metaDescription:safeText(320).optional()}).strict().refine(v=>Object.keys(v).length>0),
}).strict();
const sha=(s:string)=>createHash('sha256').update(s).digest('hex');
/** Explicit editorial correction, with separate immutable audit from AI decisions. */
export async function reviseReviewedMetadata(value:unknown){
 const input=editorialRevisionInput.parse(value),db=getAdminDb();if(!db)throw new Error('seo_editorial_store_unavailable');
 const id=sha(JSON.stringify(['editorial',input.itemId,input.requestId])),inputHash=sha(JSON.stringify(input));
 const ref=db.collection('seoEditorialRevisions').doc(id),stateRef=db.collection('seoPostPublishArticles').doc(sha(`${input.itemId}:da`));
 const lease=await acquireCmsWriteLease('seo-quality-uniqueness','da');
 try{
  const old=(await ref.get()).data();if(old&&old.inputHash!==inputHash)throw new Error('seo_editorial_request_conflict');
  if(old?.receipt)return old.receipt;
  const fresh=await readPublishedArticle(input.itemId,'da');
  if(!old&&(reviewKey(fresh.snapshot)!==input.expectedReviewKey||fresh.snapshot.hasUnpublishedChanges||!fresh.snapshot.published))throw new Error('seo_editorial_article_changed');
  const before=old?.before||fresh.snapshot;
  if(!old){
   const duplicates=await checkLiveMetadataDuplicates({...before,metadata:{...before.metadata,...input.patch}});
   if(Object.keys(input.patch).some(k=>duplicates[k as keyof typeof duplicates].length))throw new Error('seo_editorial_duplicate');
  }
  const receipt=old?.writeStartedAt?await reconcilePublishedMetadata(before,input.patch):await applyPublishedMetadata({analyzed:before,patch:input.patch,beforeWrite:async()=>{
   await lease.assertOwned();
   await db.runTransaction(async tx=>{
    const current=(await tx.get(ref)).data(),state=(await tx.get(stateRef)).data();
    if(current||state?.pendingJobId||Object.keys(input.patch).some(k=>state?.lockedFields?.includes(k)))throw new Error('seo_editorial_conflict');
    tx.create(ref,{input,inputHash,before,writeStartedAt:new Date().toISOString(),review:{kind:'explicit-editorial-correction',reason:input.reason},status:'verify_pending'});
    tx.set(stateRef,{...(state||{lockedFields:[]}),pendingJobId:id});
   });
  }});
  await db.runTransaction(async tx=>{
   const current=(await tx.get(ref)).data(),state=(await tx.get(stateRef)).data();
   if(current?.inputHash!==inputHash||state?.pendingJobId!==id)throw new Error('seo_editorial_reconciliation_required');
   tx.set(ref,{...current,status:'applied',receipt,completedAt:new Date().toISOString()});
   tx.set(stateRef,{...state,pendingJobId:null,lastAppliedAt:new Date().toISOString()});
  });return receipt;
 }finally{await lease.release();}
}
