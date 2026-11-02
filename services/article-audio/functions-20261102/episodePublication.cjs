const {createHash}=require('node:crypto');
const {canonicalJSON}=require('./offlineAudioSource.cjs');
const digest=value=>createHash('sha256').update(canonicalJSON(value)).digest('hex');
const validDate=value=>typeof value==='string'&&Number.isFinite(Date.parse(value));
function appendNormalEpisode(prior,episode){
 if(!Array.isArray(prior)||!episode||typeof episode.id!=='string'||episode.guid!==episode.id||!validDate(episode.publishedAt))throw Error('Exact normal episode identity required');
 const matches=prior.filter(row=>row.id===episode.id||(row.guid||row.id)===episode.guid||row.articleSlug===episode.articleSlug);
 if(matches.length){
  const row=matches[0];
  if(matches.length!==1||row.id!==episode.id||(row.guid||row.id)!==episode.guid||row.articleSlug!==episode.articleSlug||
   row.articleId!==episode.articleId||row.sourceContentRevision!==episode.sourceContentRevision||row.audioURL!==episode.audioURL)throw Error('Existing episode requires explicit repair');
  return prior.slice();
 }
 // Do not reconstruct unrelated recordings from their Storage timestamps.
 return [episode,...prior];
}
function correctEpisodeDates(prior,corrections){
 if(!Array.isArray(prior)||!Array.isArray(corrections)||corrections.length<1||corrections.length>5)throw Error('Bounded episode date correction required');
 const selected=new Set();const result=prior.slice();
 for(const c of corrections){
  if(!c||typeof c.id!=='string'||selected.has(c.id)||!validDate(c.originalPublishedAt)||!validDate(c.expectedPublishedAt)||
   Date.parse(c.originalPublishedAt)>=Date.parse(c.expectedPublishedAt)||!/^[a-f\d]{64}$/.test(c.expectedRowSHA256||''))throw Error('Original publication receipt required');
  selected.add(c.id);const positions=prior.flatMap((row,index)=>row.id===c.id?[index]:[]);
  if(positions.length!==1)throw Error('Episode date correction identity is ambiguous');
  const index=positions[0],row=prior[index];
  if((row.guid||row.id)!==c.guid||row.publishedAt!==c.expectedPublishedAt||digest(row)!==c.expectedRowSHA256)throw Error('Episode changed before date correction');
  result[index]={...row,publishedAt:c.originalPublishedAt};
 }
 return result;
}
module.exports={appendNormalEpisode,correctEpisodeDates,digest};
