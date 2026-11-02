'use strict';
// Hermetic definition-only integration: index.js is read as data, never imported.
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const BASE = process.env.PRODUCER_TEST_ROOT || path.join(__dirname, 'candidate');
for (const TARGET of ['syncArticles','webflowWebhook','syncArticlesScheduled']) {
const ROOT = process.env.PRODUCER_TEST_ROOT ? path.join(BASE,TARGET) : path.join(__dirname, {syncArticles:'sync-20261102',webflowWebhook:'webhook-20261102',syncArticlesScheduled:'scheduled-sync-20261102'}[TARGET]);
const catalog = require(path.join(ROOT, 'webflowCatalog.js'));
const proof = require(path.join(ROOT, 'offlineAudioSource.cjs'));
const collection = '67dbf17ba540975b5b21c2a6';
const id = n => n.toString(16).padStart(24, '0');
const item = (n, extra={}) => ({id:id(n), fieldData:{slug:`story-${n}`,name:'Published',body:'Live body'},
  createdOn:'2026-11-01T10:00:00Z',lastPublished:'2026-11-02T16:31:32.090Z',isDraft:false,isArchived:false,...extra});
const clone = x => structuredClone(x);
const response = (items,total=items.length,offset=0,status=200) => ({ok:status===200,status,
  json:async()=>({items:clone(items),pagination:{total,offset,limit:100}}),text:async()=> 'PRIVATE BODY NEVER EXPORTED'});
function deepMerge(a,b) {
  const r=clone(a || {});
  for(const [k,v] of Object.entries(b)) r[k]=v && typeof v==='object' && !Array.isArray(v)
    ? deepMerge(r[k],v) : clone(v);
  return r;
}
function fixture(transport, existing=[]) {
  const docs = new Map(existing.map(([k,v])=>[k,clone(v)]));
  const calls=[],writes=[],commits=[];let canonical=0;
  const db={collection:name=>{assert.equal(name,'articles');return {doc:articleID=>({articleID})};},
    batch:()=>{const staged=[];return {
      set:(ref,value,options)=>staged.push({ref,value:clone(value),options:clone(options)}),
      commit:async()=>{for(const x of staged){const old=docs.get(x.ref.articleID);
        let next;
        if(x.options.merge===true) next=deepMerge(old,x.value);
        else {assert.ok(Array.isArray(x.options.mergeFields));next=clone(old || {});
          assert.deepEqual([...x.options.mergeFields].sort(),Object.keys(x.value).sort());
          for(const k of x.options.mergeFields) next[k]=clone(x.value[k]);}
        docs.set(x.ref.articleID,next);writes.push(x);
      }commits.push(staged.length);}
    };}};
  const source=fs.readFileSync(path.join(ROOT,'index.js'),'utf8');
  function exactDefinition(name) {
    const pos=source.indexOf('function '+name+'(');assert.ok(pos>=0,name);
    const lo=source.lastIndexOf('\n',pos)+1,hi=source.indexOf('\n}\n',pos)+3;
    assert.ok(hi>lo);return source.slice(lo,hi);
  }
  const definitions=['isPublishedArticle','fetchWebflowArticlesPage','fetchAllWebflowArticles','requestAutomaticOfflineInventory','writeArticlesToFirestore','syncAllArticlesFromWebflow'].map(exactDefinition).join('\n');
  const admin={firestore:Object.assign(()=>db,{FieldValue:{serverTimestamp:()=> 'SERVER_TIMESTAMP'}})};
  const context={ARTICLES_COLLECTION_ID:collection,FIRESTORE_ARTICLES_COLLECTION:'articles',WEBFLOW_PAGE_LIMIT:100,
    fetch:async(url,options)=>{calls.push(String(url));return transport(new URL(String(url)),options);},
    fetchLiveCatalog:catalog.fetchLiveCatalog,contentRevision:proof.contentRevision,admin,
    process:{env:{AUTOMATIC_OFFLINE_ENABLED:'false'}},
    createManifestJobStore:()=>{throw new Error('Disabled inventory must not create a job store');},
    requestInvocations:0,logger:{info:()=>{}},
  };
  vm.createContext(context);
  vm.runInContext(definitions+'\nconst originalRequest=requestAutomaticOfflineInventory; requestAutomaticOfflineInventory=async function(...args){globalThis.requestInvocations++;return originalRequest(...args);};globalThis.sync=syncAllArticlesFromWebflow;',context,{timeout:1000});
  return {docs,calls,writes,commits,sync:()=>context.sync('FAKE_NOT_A_CREDENTIAL'),canonical:()=>context.requestInvocations};
}
function readArticleGuard(article, live) {
  const source=fs.readFileSync(path.join(__dirname,'functions-20261102/offlineAudioRuntime.js'),'utf8');
  const a=source.indexOf('  async function readArticle(id) {'),b=source.indexOf('  async function exactBytes(',a);
  assert.ok(a>=0 && b>a);
  const db={collection:name=>{assert.equal(name,'articles');return {
    doc:articleID=>({get:async()=>({exists:articleID===article.id,data:()=>clone(article)})}),
    where:(field,op,value)=>{assert.equal(field,'fieldData.slug');assert.equal(op,'==');assert.equal(value,article.fieldData.slug);
      return {limit:n=>{assert.equal(n,10001);return {get:async()=>({docs:[{id:article.id,data:()=>clone(article)}]})};}};}
  };}};
  const context={db,englishEnabled:false,maintenance:{sourceOf:a=>proof.captureSource(a,a.id,a.fieldData.slug)},liveSource:{one:async()=>clone(live)}};
  vm.createContext(context);vm.runInContext(source.slice(a,b)+'\nglobalThis.read=readArticle;',context,{timeout:1000});
  return ()=>context.read(article.id);
}

test(TARGET+': ordinary sync takes LIVE publication and passes the unchanged exact current guard',async()=>{
  const live=item(1),staged=item(1,{fieldData:{slug:'story-1',name:'Staged',body:'Unpublished staged edits'}});
  const f=fixture(url=>response([url.pathname.endsWith('/items/live')?live:staged]));
  assert.equal(await f.sync(),1);
  assert.equal(f.docs.get(live.id).contentRevision,catalog.contentRevision(live));
  await readArticleGuard(f.docs.get(live.id),{...live,contentRevision:catalog.contentRevision(live)})();
  assert.equal(f.canonical(),1);
});

test(TARGET+': ordinary sync consumes a complete >100 raw inventory instead of a filtered short page',async()=>{
  const published=Array.from({length:101},(_,n)=>item(n+1));
  const f=fixture(url=>{const offset=Number(url.searchParams.get('offset'));
    if(url.pathname.endsWith('/items/live')) return response(published.slice(offset,offset+100),101,offset);
    const raw=published.slice(offset,offset+100);
    if(offset===0) raw[99]=item(100,{isDraft:true,lastPublished:null});
    return response(raw,101,offset);
  });
  assert.equal(await f.sync(),101);assert.equal(f.docs.has(id(101)),true);
  assert.equal(f.calls.length,2);assert.equal(f.canonical(),1);
});

test(TARGET+': ordinary mirror removes deleted CMS fields and retains every unrelated root field',async()=>{
  const live=item(1);const unrelated={owner:{account:'synthetic-owner'},publicationState:'live',source:'webflow',
    sourceCollectionId:collection,editorialExtension:{nested:[1,{x:true}]},unknown:null};
  const f=fixture(()=>response([live]),[[live.id,{...clone(unrelated),id:live.id,fieldData:{...live.fieldData,deletedCMS:'obsolete'}}]]);
  await f.sync();const got=f.docs.get(live.id);
  assert.equal(got.fieldData.deletedCMS,undefined);
  for(const [k,v] of Object.entries(unrelated)) assert.deepEqual(got[k],v,k);
  assert.equal(got.contentRevision,proof.contentRevision(got));
  assert.equal(f.writes[0].options.merge,undefined);
  assert.deepEqual([...f.writes[0].options.mergeFields].sort(),['contentRevision','createdOn','fieldData','id','isArchived','isDraft','lastPublished','syncedAt'].sort());
});

test(TARGET+': failed second LIVE page performs zero writes and no existing inventory callback or retry',async()=>{
  const f=fixture(url=>{const offset=Number(url.searchParams.get('offset'));return response(offset?[]:Array.from({length:100},(_,i)=>item(i+1)),101,offset,offset?503:200);});
  await assert.rejects(f.sync(),/HTTP 503/);assert.equal(f.calls.length,2);
  assert.equal(f.writes.length,0);assert.equal(f.commits.length,0);assert.equal(f.canonical(),0);
});

test(TARGET+': incomplete LIVE page performs zero writes and no callback',async()=>{
  const f=fixture(url=>{const offset=Number(url.searchParams.get('offset'));return response(offset?[]:Array.from({length:100},(_,i)=>item(i+1)),101,offset);});
  await assert.rejects(f.sync(),/before pagination total/);assert.equal(f.writes.length,0);assert.equal(f.canonical(),0);assert.equal(f.calls.length,2);
});

test(TARGET+': changing pagination total performs zero writes and no callback',async()=>{
  const f=fixture(url=>{const offset=Number(url.searchParams.get('offset'));return response(offset?[item(101)]:Array.from({length:100},(_,i)=>item(i+1)),offset?102:101,offset);});
  await assert.rejects(f.sync(),/changed during scan/);assert.equal(f.writes.length,0);assert.equal(f.canonical(),0);
});

test(TARGET+': duplicate LIVE identities perform zero writes and no callback',async()=>{
  const f=fixture(()=>response([item(1),item(1)]));
  await assert.rejects(f.sync(),/Duplicate live CMS item/);assert.equal(f.writes.length,0);assert.equal(f.canonical(),0);assert.equal(f.calls.length,1);
});

test(TARGET+': archived-only LIVE response writes no article and runs success inventory callback once',async()=>{
  const f=fixture(()=>response([item(1,{isArchived:true})]));
  assert.equal(await f.sync(),0);assert.equal(f.writes.length,0);assert.equal(f.commits.length,0);assert.equal(f.canonical(),1);
});

test(TARGET+': filtered archived LIVE row does not change the next raw offset',async()=>{
  const rows=Array.from({length:101},(_,n)=>item(n+1));rows[99].isArchived=true;
  const f=fixture(url=>{const offset=Number(url.searchParams.get('offset'));return response(rows.slice(offset,offset+100),101,offset);});
  assert.equal(await f.sync(),100);assert.equal(new URL(f.calls[1]).searchParams.get('offset'),'100');
  assert.equal(f.docs.has(id(100)),false);assert.equal(f.docs.has(id(101)),true);assert.equal(f.canonical(),1);
});

test(TARGET+': unchanged current guard still refuses a later LIVE publication revision',async()=>{
  const live=item(1),f=fixture(()=>response([live]));await f.sync();
  const changed=item(1,{lastPublished:'2026-11-02T16:31:33Z'});
  await assert.rejects(readArticleGuard(f.docs.get(live.id),{...changed,contentRevision:catalog.contentRevision(changed)})(),/Current live CMS publication changed/);
});

test(TARGET+': mirror writes never withdraw or acquire ownership of absent or foreign rows',async()=>{
  const live=item(1),old={id:id(2),owner:'keep',fieldData:{slug:'absent'},publicationState:'live'},en={id:'en_'+id(3),owner:'english',fieldData:{slug:'story-1'}};
  const f=fixture(()=>response([live]),[[old.id,old],[en.id,en]]);await f.sync();
  assert.deepEqual(f.docs.get(old.id),old);assert.deepEqual(f.docs.get(en.id),en);
  assert.equal(f.writes.length,1);assert.equal(f.writes[0].ref.articleID,live.id);assert.equal(f.canonical(),1);
});

test(TARGET+': invalid LIVE envelope performs zero writes and no callback',async()=>{
  const f=fixture(()=>({ok:true,status:200,json:async()=>({items:[item(1)]})}));
  await assert.rejects(f.sync(),/pagination envelope/);assert.equal(f.writes.length,0);assert.equal(f.canonical(),0);
});

}
