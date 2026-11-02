const {test}=require('node:test');const assert=require('node:assert/strict');
const {prepareNormalSource,recoveryRequest,matchesFailedJob}=require('./functions-20261102/normalAudioAdmission.cjs');
const {createNarrationOwnership}=require('./functions-20261102/offlineAudioQueueOwnership');
const {contentRevision}=require('./functions-20261102/webflowCatalog');
const id='6ae8aff199edb6a5b1f8c9f9',slug='behemoth-og-dimmu-borgir-i-kb-hallen';
const item=(text='live')=>{const a={id,fieldData:{slug,name:text},isDraft:false,isArchived:false,lastPublished:'2026-11-02T16:31:32.090Z',createdOn:null};return {...a,contentRevision:contentRevision(a)};};
function database(initial){const rows=new Map(Object.entries(initial)),versions=new Map([...rows.keys()].map(k=>[k,1]));let writes=0;
 const ref=k=>({id:k.split('/').at(-1),get:async()=>snapshot(k)});
 const snapshot=k=>({exists:rows.has(k),data:()=>rows.has(k)?JSON.parse(JSON.stringify(rows.get(k))):undefined,updateTime:{seconds:versions.get(k)||0,nanoseconds:100,isEqual:o=>o?.seconds===(versions.get(k)||0)}});
 const db={collection:c=>({doc:id=>ref(c+'/'+id)}),runTransaction:async fn=>fn({get:async r=>snapshot([...rows.keys()].find(k=>k.endsWith('/'+r.id))||'articles/'+r.id),
 set:(r,v)=>{const k=[...rows.keys()].find(k=>k.endsWith('/'+r.id))||'articles/'+r.id;rows.set(k,{...rows.get(k),...v});versions.set(k,(versions.get(k)||0)+1);writes++;}})};
 return {db,rows,writes:()=>writes};}
test('published point replaces stale CMS fields while retaining unrelated data',async()=>{const x=database({['articles/'+id]:{...item('staged'),humanApproval:'retained'}});
 const result=await prepareNormalSource({db:x.db,liveSource:{one:async()=>item()},articleId:id,slug,now:()=>123});
 assert.equal(result.contentRevision,item().contentRevision);assert.equal(x.rows.get('articles/'+id).humanApproval,'retained');assert.equal(x.writes(),1);
});
test('matching publication does not rewrite mirror',async()=>{const x=database({['articles/'+id]:item()});await prepareNormalSource({db:x.db,liveSource:{one:async()=>item()},articleId:id,slug,now:()=>123});assert.equal(x.writes(),0);});
test('webhook arriving before LIVE availability waits before admission',async()=>{const x=database({['articles/'+id]:item('staged')});let reads=0;const waits=[];
 await prepareNormalSource({db:x.db,liveSource:{one:async()=>++reads<3?null:item()},articleId:id,slug,now:()=>123,wait:async ms=>waits.push(ms)});
 assert.deepEqual(waits,[1500,3000]);assert.equal(x.rows.get('articles/'+id).contentRevision,item().contentRevision);
});
test('missing publication and provider read errors never lead to unbounded retries',async()=>{const x=database({['articles/'+id]:item()});let reads=0;
 await assert.rejects(prepareNormalSource({db:x.db,liveSource:{one:async()=>{reads++;return null;}},articleId:id,slug,now:()=>123,wait:async()=>{}}),/not visible/);assert.equal(reads,3);
 reads=0;await assert.rejects(prepareNormalSource({db:x.db,liveSource:{one:async()=>{reads++;throw Error('CMS publication could not be confirmed (429)');}},articleId:id,slug,now:()=>123,wait:async()=>{}}),/429/);assert.equal(reads,1);
});
for(const mutate of [a=>({...a,isDraft:true}),a=>({...a,fieldData:{slug:'other'}}),a=>({...a,contentRevision:'forged'})])test('unqualified source never admitted',async()=>{const x=database({['articles/'+id]:item()});await assert.rejects(prepareNormalSource({db:x.db,liveSource:{one:async()=>mutate(item())},articleId:id,slug,now:()=>123}));assert.equal(x.writes(),0);});
test('publication changing during admission is bounded and never returns stale source',async()=>{const x=database({['articles/'+id]:item()});let n=0;
 await assert.rejects(prepareNormalSource({db:x.db,liveSource:{one:async()=>item(String(n++))},articleId:id,slug,now:()=>123,wait:async()=>{}}),/stabilize/);assert.equal(n,6);
});
const failure={slug,articleId:id,name:'Behemoth',createdAt:'original',status:'error',error:'Current live CMS publication changed',narrationClaim:'private-old-claim',processedAt:'original-failure-time'};
const recovery={slug,articleId:id,status:'pending',normalAudioRecovery:{version:'first-audio-v1',mode:'resume',expectedSourceRevision:item().contentRevision,expectedError:failure.error,expectedJobUpdate:{seconds:1,nanoseconds:100},noEffectEvidenceSHA256:'f'.repeat(64)}};
test('recovery is version bound and rejects ambiguous original outcomes',()=>{
 assert.ok(recoveryRequest(recovery,'recovery-request'));
 assert.throws(()=>recoveryRequest(recovery,slug));
 assert.equal(matchesFailedJob({exists:true,data:()=>failure,updateTime:{seconds:2,nanoseconds:100}},recovery),false);
 assert.equal(matchesFailedJob({exists:true,data:()=>({...failure,status:'processing'}),updateTime:{seconds:1,nanoseconds:100}},recovery),false);
});
test('recovery retains original identity/failure and exactly one claim wins',async()=>{
 const x=database({['articles/'+id]:item(),['narration_queue/'+slug]:failure,'narration_queue/recovery-request':recovery});
 const owner=createNarrationOwnership({db:x.db,token:()=> 'new-private-claim'}),request={id:'recovery-request',ref:x.db.collection('narration_queue').doc('recovery-request')};
 const claim=await owner.claimNormal(slug,failure,request);assert.ok(claim);await claim.assertCurrent();
 const now=x.rows.get('narration_queue/'+slug);assert.equal(now.createdAt,'original');assert.equal(now.normalRecoveryHistory[0].narrationClaim,failure.narrationClaim);assert.equal(now.normalRecoveryHistory[0].error,failure.error);
 await assert.rejects(owner.claimNormal(slug,failure,request));
 assert.equal(await claim.finish({status:'done',result:'published'}),true);await claim.assertFinished();
});
test('ordinary jobs cannot take over an error or paid outcome',async()=>{const x=database({['narration_queue/'+slug]:failure});assert.equal(await createNarrationOwnership({db:x.db}).claimNormal(slug,failure),null);assert.equal(x.writes(),0);});
