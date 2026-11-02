const {test}=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const source=fs.readFileSync(__dirname+'/webhook-20261102/index.js','utf8');
function receiptFixture(fail=false){let record=null,sends=0;
 const ref={set:async(v)=>{record={...record,...v};}};
 const db={collection:()=>({doc:()=>ref}),runTransaction:async fn=>fn({get:async()=>({exists:!!record}),set:(_,v)=>{record=v;}})};
 const context={admin:{firestore:{FieldValue:{serverTimestamp:()=>123}},messaging:()=>({send:async()=>{sends++;if(fail)throw Error('unknown delivery');return'accepted';}})},logger:{info(){},error(){}},richNotificationEnvelope:d=>({data:d})};
 const a=source.indexOf('async function sendArticleNotificationOnce('),b=source.indexOf('// Marks an article',a);
 vm.createContext(context);vm.runInContext(source.slice(a,b)+'\nglobalThis.send=sendArticleNotificationOnce;',context);
 return {db,send:context.send,record:()=>record,sends:()=>sends};
}
const request={articleId:'article',articleName:'Published article',notificationData:{article_id:'article',article_slug:'published-article',type:'new_article',click_action:'OPEN_ARTICLE'},topics:[],title:'Ny artikel',body:'Published article'};
test('one durable article receipt and no second push after audio completion',async()=>{const f=receiptFixture();assert.equal((await f.send(f.db,request)).sent,true);assert.equal((await f.send(f.db,request)).sent,false);assert.equal(f.sends(),1);assert.equal(f.record().notificationData.click_action,'OPEN_ARTICLE');assert.equal(f.record().deliveryStatus,'accepted_by_fcm');});
test('uncertain delivery keeps article target and duplicate lock',async()=>{const f=receiptFixture(true);await assert.rejects(f.send(f.db,request));assert.equal(f.record().deliveryStatus,'failed_or_unknown');assert.equal(f.record().notificationData.article_id,'article');assert.equal((await f.send(f.db,request)).sent,false);assert.equal(f.sends(),1);});
for(const scenario of ['queued','queue-error','notification-error'])test('article notification and narration are independent: '+scenario,async()=>{
 let sent=0,queued=0,payload;
 const collection='67dbf17ba540975b5b21c2a6';
 const context={exports:{},onRequest:(_,fn)=>fn,webflowApiKey:{value:()=> 'fixture'},ARTICLES_COLLECTION_ID:collection,METADATA_COLLECTIONS:{},admin:{firestore:()=>({})},
  extractItem:()=>({id:'article',fieldData:{name:'Title',slug:'title'}}),extractCollectionId:()=>collection,
  evaluateArticleNotificationPolicy:async()=>({send:true}),articleImageData:()=>({}),articleTopicIds:()=>[],topicIdentifier:()=>'',syncAllArticlesFromWebflow:async()=>1,sendSilentRefreshPush:async()=>{},
  sendArticleNotificationOnce:async()=>{sent++;if(scenario==='notification-error')throw Error('FCM');return{sent:true};},queueNarrationIfNeeded:async()=>{queued++;if(scenario==='queue-error')throw Error('queue');return{queued:true};},
  logger:{info(){},warn(){},error(){}},Promise};
 const a=source.indexOf('exports.webflowWebhook ='),b=source.indexOf('exports.generateNarrationOnQueue',a);
 vm.createContext(context);vm.runInContext(source.slice(a,b),context);
 const response={set(){},status(){return this;},json:v=>{payload=v;},send(){}};
 await context.exports.webflowWebhook({method:'POST',body:{trigger:'collection_item_published'}},response);
 assert.equal(sent,1);assert.equal(queued,1);assert.equal(payload.notification_deferred,undefined);assert.equal(payload.narration_queued,scenario!=='queue-error');
});
