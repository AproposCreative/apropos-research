const{test}=require('node:test'),assert=require('node:assert/strict');
const{handleCatalogDateCorrection}=require('./functions-20261102/catalogDateCorrection.cjs');
const{digest}=require('./functions-20261102/episodePublication.cjs');
const{createHash}=require('node:crypto');
function fixture(changed=false){
 const row={id:'ai-old',guid:'ai-old',publishedAt:'2026-11-02T16:00:00Z',audioURL:'https://fixture.test/existing',extra:{original:true}};
 const prior={version:1,updatedAt:'prior',episodes:[row]},bytes=Buffer.from(JSON.stringify(prior));let body=bytes,writes=0;
 const actor='817066738308-compute@developer.gserviceaccount.com';
 let metadata={generation:'100',metageneration:'1',size:String(bytes.length),contentType:'application/json',acl:[{entity:'user-'+actor,role:'OWNER'},{entity:'allUsers',role:'READER'}],metadata:{firebaseStorageDownloadTokens:'fixture-only'}};
 const bucket={name:'fixture',storage:{authClient:{getCredentials:async()=>({client_email:actor})}},getMetadata:async()=>[{name:'fixture',iamConfiguration:{uniformBucketLevelAccess:{enabled:false}}}],
 file:()=>({getMetadata:async()=>[structuredClone(metadata)],download:async()=>[body],save:async(payload,options)=>{assert.equal(options.preconditionOpts.ifGenerationMatch,'100');body=Buffer.from(payload);metadata={...metadata,...options.metadata,generation:'101',metageneration:'1',size:String(body.length)};writes++;}})};
 let data={status:'pending',catalogDateCorrection:{version:'episode-dates-v1',expectedGeneration:changed?'99':'100',expectedMetageneration:'1',expectedManifestSHA256:createHash('sha256').update(bytes).digest('hex'),evidenceSHA256:'f'.repeat(64),corrections:[{id:row.id,guid:row.guid,expectedPublishedAt:row.publishedAt,originalPublishedAt:'2026-08-21T19:35:40.100Z',expectedRowSHA256:digest(row)}]}};
 const ref={get:async()=>({exists:true,data:()=>structuredClone(data)}),set:async fields=>{data={...data,...fields};}};
 const db={runTransaction:async fn=>fn({get:async()=>ref.get(),set:(_,fields)=>{data={...data,...fields};}})};
 return{snap:{ref},db,bucket,now:()=>123,read:()=>({body:JSON.parse(body.toString()),data,writes,metadata})};
}
test('date-only correction preserves media, GUID, full ACL and all other fields',async()=>{const f=fixture();await handleCatalogDateCorrection(f);const r=f.read();assert.equal(r.data.status,'done');assert.equal(r.writes,1);assert.equal(r.body.episodes[0].publishedAt,'2026-08-21T19:35:40.100Z');assert.equal(r.body.episodes[0].audioURL,'https://fixture.test/existing');assert.equal(r.body.episodes[0].guid,'ai-old');assert.deepEqual(r.body.episodes[0].extra,{original:true});assert.equal(r.metadata.acl.length,2);assert.equal(r.metadata.metadata.firebaseStorageDownloadTokens,'fixture-only');});
test('duplicate correction delivery never writes the catalog twice',async()=>{const f=fixture();await handleCatalogDateCorrection(f);await handleCatalogDateCorrection(f);assert.equal(f.read().writes,1);});
test('a changed catalog blocks correction and preserves its bytes',async()=>{const f=fixture(true);await handleCatalogDateCorrection(f);assert.equal(f.read().data.status,'blocked');assert.equal(f.read().writes,0);assert.equal(f.read().body.episodes[0].publishedAt,'2026-11-02T16:00:00Z');});
