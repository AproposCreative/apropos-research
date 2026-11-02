// Administrative, metadata-only correction under the existing catalog actor.
// No provider, audio render, upload, CMS mutation or notification capability.
const {randomUUID}=require('node:crypto');
const {createHash}=require('node:crypto');
const {createCatalogACLGuard}=require('./catalogACL.cjs');
const {correctEpisodeDates,digest}=require('./episodePublication.cjs');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function handleCatalogDateCorrection({snap,db,bucket,now}){
 const current=await snap.ref.get(),data=current.data();if(!current.exists||data?.status!=='pending')return;
 const r=data.catalogDateCorrection;
 if(r?.version!=='episode-dates-v1'||!/^[1-9]\d*$/.test(r.expectedGeneration||'')||!/^[1-9]\d*$/.test(r.expectedMetageneration||'')||
  !/^[a-f\d]{64}$/.test(r.expectedManifestSHA256||'')||!/^[a-f\d]{64}$/.test(r.evidenceSHA256||'')){
  await snap.ref.set({status:'blocked',error:'Exact catalog date correction receipt required'},{merge:true});return;
 }
 const requestHash=digest(r),claim=randomUUID();
 const owned=job=>job?.status==='processing'&&job.catalogCorrectionClaim===claim&&digest(job.catalogDateCorrection)===requestHash;
 const accepted=await db.runTransaction(async tx=>{const latest=await tx.get(snap.ref);
  if(!latest.exists||latest.data()?.status!=='pending'||digest(latest.data().catalogDateCorrection)!==requestHash)return false;
  tx.set(snap.ref,{status:'processing',catalogCorrectionClaim:claim},{merge:true});return true;});
 if(!accepted)return;
 const assertCurrent=async()=>{const latest=await snap.ref.get();if(!latest.exists||!owned(latest.data()))throw Error('Catalog correction claim changed');};
 const finish=async fields=>db.runTransaction(async tx=>{const latest=await tx.get(snap.ref);if(!latest.exists||!owned(latest.data()))return false;tx.set(snap.ref,{...fields,processedAt:now()},{merge:true});return true;});
 try{
  const guard=createCatalogACLGuard({bucket}),snapshot=await guard.capture();
  if(String(snapshot.metadata.generation)!==r.expectedGeneration||String(snapshot.metadata.metageneration)!==r.expectedMetageneration)throw Error('Catalog changed before date correction');
  const [bytes]=await bucket.file('podcasts/manifest.json',{generation:r.expectedGeneration}).download();
  if(bytes.length>8*1024*1024||hash(bytes)!==r.expectedManifestSHA256)throw Error('Catalog bytes changed before date correction');
  await guard.assertCurrent(snapshot);const prior=JSON.parse(bytes.toString('utf8'));
  const episodes=correctEpisodeDates(prior.episodes,r.corrections);
  const manifest={...prior,updatedAt:new Date().toISOString(),episodes};
  const receipt=await guard.commit({snapshot,bytes:JSON.stringify(manifest,null,2),beforeCommit:assertCurrent});
  await finish({status:'done',result:'original_episode_dates_restored',changedEpisodes:r.corrections.length,
   previousGeneration:r.expectedGeneration,generation:receipt.generation,onlyPublicationDatesChanged:true});
 }catch(error){
  await finish({status:'blocked',error:String(error.message||error).slice(0,250)});
 }
}
module.exports={handleCatalogDateCorrection};
