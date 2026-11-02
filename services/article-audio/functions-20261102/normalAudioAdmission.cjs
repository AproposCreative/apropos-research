// Source readiness happens once BEFORE narration captures its immutable source.
// Later guards remain strict; a publication changing during paid work never retries.
const {contentRevision} = require('./webflowCatalog');
const KEYS=['id','fieldData','isDraft','isArchived','createdOn','lastPublished','contentRevision','syncedAt'];
function requireIdentity(article,id,slug){
 if(article?.id!==id||article.fieldData?.slug!==slug||article.isDraft!==false||article.isArchived===true||
   !Number.isFinite(Date.parse(article.lastPublished))||article.contentRevision!==contentRevision(article))throw Error('Published source identity is not qualified');
 return article;
}
async function prepareNormalSource({db,liveSource,articleId,slug,now,wait=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(!/^[a-f\d]{24}$/.test(articleId||'')||!/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(slug||''))throw Error('Canonical normal audio identity required');
 const ref=db.collection('articles').doc(articleId);
 for(let attempt=0;attempt<3;attempt++){
  const point=await liveSource.one(articleId);
  // Webflow can emit the webhook just before the live item is readable.
  // Wait only for definitive absence. Auth, quota and transport errors propagate.
  if(!point){if(attempt<2){await wait(1500*(attempt+1));continue;}throw Error('Publication was not visible before audio admission');}
  const live=requireIdentity(point,articleId,slug);
  const current=await ref.get();
  if(!current.exists||current.data().contentRevision!==live.contentRevision){
   const fields=Object.fromEntries(KEYS.map(k=>[k,k==='syncedAt'?now():k==='createdOn'?live.createdOn??null:live[k]]));
   const committed=await db.runTransaction(async tx=>{const latest=await tx.get(ref);
    if(latest.exists&&latest.data().id!==articleId)throw Error('Canonical mirror identity changed');
    if(current.exists!==latest.exists||(current.exists&&current.updateTime?.isEqual(latest.updateTime)!==true))return false;
    tx.set(ref,fields,{mergeFields:KEYS});
    return true;
   });
   if(!committed){if(attempt<2)await wait(1500*(attempt+1));continue;}
  }
  const next=await liveSource.one(articleId);
  if(!next){if(attempt<2)await wait(1500*(attempt+1));continue;}
  const confirmed=requireIdentity(next,articleId,slug),mirror=await ref.get();
  if(confirmed.contentRevision===live.contentRevision&&mirror.exists&&mirror.data().contentRevision===confirmed.contentRevision){
   requireIdentity(mirror.data(),articleId,slug);return confirmed;
  }
  if(attempt<2)await wait(1500*(attempt+1));
 }
 throw Error('Publication did not stabilize before audio admission');
}
function recoveryRequest(data,requestId){
 const r=data?.normalAudioRecovery;
 if(!r||r.version!=='first-audio-v1'||!['inspect','resume'].includes(r.mode)||data.status!=='pending'||
  !/^[a-f\d]{24}$/.test(data.articleId||'')||!/^[a-z0-9]+(?:-+[a-z0-9]+)*$/.test(data.slug||'')||requestId===data.slug||
  !/^cms-sha256-v1:[a-f\d]{64}$/.test(r.expectedSourceRevision||'')||
  !Number.isSafeInteger(r.expectedJobUpdate?.seconds)||!Number.isSafeInteger(r.expectedJobUpdate?.nanoseconds)||
  !/^[a-f\d]{64}$/.test(r.noEffectEvidenceSHA256||'')||r.expectedError!=='Current live CMS publication changed')throw Error('Version-bound administrative first-audio recovery required');
 return r;
}
function matchesFailedJob(snap,data){
 const r=data.normalAudioRecovery,job=snap.data();
 return snap.exists&&job.slug===data.slug&&job.articleId===data.articleId&&job.status==='error'&&job.error===r.expectedError&&
  !job.offlineMaintenance&&!job.offlineMaintenanceReservation&&!job.offlineRepair&&
  snap.updateTime.seconds===r.expectedJobUpdate.seconds&&snap.updateTime.nanoseconds===r.expectedJobUpdate.nanoseconds;
}
module.exports={prepareNormalSource,requireIdentity,recoveryRequest,matchesFailedJob};
