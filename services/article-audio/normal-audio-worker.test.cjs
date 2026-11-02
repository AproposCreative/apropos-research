// The deployed handler is evaluated as a definition with inert SDK boundaries.
// No SDK module, network, provider, Storage upload or FCM send is executed.
const{test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const{prepareNormalSource}=require('./functions-20261102/normalAudioAdmission.cjs');
const{startNormalAudioDeadline}=require('./functions-20261102/normalAudioReliability.cjs');
const{contentRevision}=require('./functions-20261102/webflowCatalog');
const source=fs.readFileSync(__dirname+'/functions-20261102/index.js','utf8');
const definition=source.slice(source.indexOf('exports.generateNarrationOnQueue ='),source.indexOf('\nfunction formatHostLine'));
async function run(scenario){
 const id='6ae8aff199edb6a5b1f8c9f9',slug='behemoth-og-dimmu-borgir-i-kb-hallen';
 const article={id,fieldData:{slug,name:'Published'},isDraft:false,isArchived:false,createdOn:null,lastPublished:'2026-11-02T16:31:32.090Z'};article.contentRevision=contentRevision(article);
 let state={slug,articleId:id,name:'Published',createdAt:123,status:'pending'},claims=0,renders=0,refreshes=0,alerts=0,timerClosed=false;
 const doc={exists:true,data:()=>article},db={collection:()=>({doc:()=>({get:async()=>doc})})};
 const claim={assertCurrent:async()=>{if(state.status!=='processing')throw Error('claim revoked');},assertFinished:async()=>{if(!['done','error'].includes(state.status))throw Error('not finished');},finish:async fields=>{if(state.status!=='processing')return false;state={...state,...fields};return true;}};
 const context={exports:{},onDocumentCreated:(_,fn)=>fn,NARRATION_QUEUE_COLLECTION:'narration_queue',NARRATION_BUCKET:'fixture',ARTICLES_COLLECTION_ID:'67dbf17ba540975b5b21c2a6',FIRESTORE_ARTICLES_COLLECTION:'articles',
 elevenLabsApiKey:{value:()=> 'fixture-not-a-credential'},webflowApiKey:{value:()=> 'fixture-not-a-credential'},
 admin:{firestore:Object.assign(()=>db,{FieldValue:{serverTimestamp:()=>1234}}),storage:()=>({bucket:()=>({})})},
 automaticOffline:()=>({onQueueCreated:async()=>({handled:scenario==='maintenance'})}),automaticOfflineRuntime:()=>({adapters:{readArticle:async()=>article}}),
 createNarrationOwnership:()=>({claimNormal:async()=>{claims++;if(scenario==='duplicate')return null;state.status='processing';return claim;}}),
 createPublishedCMSReader:()=>({one:async()=>scenario==='withdrawn'&&renders?null:article}),prepareNormalSource,fetch:()=>{throw Error('No network permitted');},
 createCatalogACLGuard:()=>({capture:async()=>{if(scenario==='preflight-error')throw Error('catalog unavailable');}}),
 startNormalAudioDeadline:options=>startNormalAudioDeadline({...options,schedule:()=>1,cancel:()=>{timerClosed=true;}}),
 generateAndPublishNarration:async options=>{renders++;await options.assertCurrent();await options.beforeSynthesis();await options.assertCurrent();
   if(scenario==='render-error')throw Error('provider outcome unknown');if(scenario==='late-result')state.status='error';return{status:'published',title:'Published'};},
 sendSilentRefreshPush:async()=>{refreshes++;},sendArticleNotificationOnce:async()=>{alerts++;return{sent:false,reason:'already_notified'};},
 isEnglishArticleContent:()=>false,logger:{info(){},warn(){},error(){}},Object,Promise};
 vm.createContext(context);vm.runInContext(definition,context);
 const event={params:{slug},data:{id:slug,data:()=>({slug,articleId:id,name:'Published',createdAt:123,status:'pending'})}};
 await context.exports.generateNarrationOnQueue(event);
 return{state,claims,renders,refreshes,alerts,timerClosed};
}
test('a completed normal episode refreshes the app once and retains its paid phase',async()=>{const r=await run('published');assert.equal(r.state.status,'done');assert.equal(r.state.stage,'complete');assert.equal(r.state.paidAttemptStartedAt,1234);assert.equal(r.refreshes,1);assert.equal(r.timerClosed,true);});
test('preflight failure records an error without synthesis or an audio-ready refresh',async()=>{const r=await run('preflight-error');assert.equal(r.state.status,'error');assert.equal(r.renders,0);assert.equal(r.refreshes,0);assert.equal(r.state.paidAttemptStartedAt,undefined);assert.equal(r.timerClosed,true);});
test('uncertain paid outcome is retained and never retried by the handler',async()=>{const r=await run('render-error');assert.equal(r.state.status,'error');assert.equal(r.renders,1);assert.equal(r.state.paidAttemptStartedAt,1234);assert.equal(r.refreshes,0);});
test('a late result cannot overwrite a deadline/ownership failure',async()=>{const r=await run('late-result');assert.equal(r.state.status,'error');assert.equal(r.refreshes,0);assert.equal(r.alerts,0);});
test('withdrawn publication does not send an app refresh or article announcement',async()=>{const r=await run('withdrawn');assert.equal(r.refreshes,0);assert.equal(r.alerts,0);});
for(const scenario of ['maintenance','duplicate'])test('no generation for '+scenario,async()=>{const r=await run(scenario);assert.equal(r.renders,0);assert.equal(r.refreshes,0);assert.equal(r.alerts,0);});
