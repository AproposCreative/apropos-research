"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const {mkdtempSync, readFileSync, writeFileSync, cpSync, rmSync} = require("node:fs");
const path = require("node:path");
const os = require("node:os");
const {spawnSync} = require("node:child_process");
const vm = require("node:vm");
const recipe = require("./recipe.cjs");
const root = path.resolve(process.env.NARRATION_CANDIDATE_DIR || "output/narration-v2-release-20261031/candidate-final-fixture");
const ffmpeg = path.resolve("node_modules/ffmpeg-static/ffmpeg");
function command(exe, args) { const r=spawnSync(exe,args,{encoding:"utf8",timeout:60000,maxBuffer:8e6});assert.equal(r.status,0,r.stderr);return r; }
function probe(p) {
 const r=spawnSync(ffmpeg,["-hide_banner","-i",p],{encoding:"utf8",timeout:15000});
 const duration=r.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/),stream=r.stderr.match(/Audio: (\w+).*?, (\d+) Hz, (stereo|mono|2 channels|1 channels)/);
 assert.ok(duration&&stream,r.stderr);
 return {format:{duration:Number(duration[1])*3600+Number(duration[2])*60+Number(duration[3])},streams:[{codec_name:stream[1],sample_rate:stream[2],channels:["stereo","2 channels"].includes(stream[3])?2:1}]};
}
function tone(p, seconds, volume="0.2") {command(ffmpeg,["-hide_banner","-loglevel","error","-y","-f","lavfi","-i",`sine=frequency=270:sample_rate=44100:duration=${seconds}`,"-af",`volume=${volume}`,"-ac","2",p]);}
const normalized = t => t.replace(/\s+/g," ").trim();
test("Prospective selector defaults to V2, preserves V1 and rejects unknown choices",()=>{
 assert.equal(recipe.selectJingle(),"v2");assert.equal(recipe.selectJingle("V1"),"v1");assert.throws(()=>recipe.selectJingle("v3"));
});
function settingsStore(initial) {
 const documents=new Map(initial?[["podcastFeedOperations/narration-jingle",initial]]:[]);
 let writes=0;
 const read=ref=>({exists:documents.has(ref.key),data:()=>documents.get(ref.key)});
 const db={collection:name=>({doc:id=>({key:name+"/"+id,get:async()=>read({key:name+"/"+id})})}),runTransaction:async fn=>{
  const staged=[];const result=await fn({get:async ref=>read(ref),set:(ref,value)=>staged.push([ref.key,value])});
  for(const [key,value] of staged){documents.set(key,value);writes++;}return result;
 }};
 return {db,documents,writes:()=>writes};
}
test("Read-only default and version selection never create a setting",async()=>{
 const store=settingsStore();assert.deepEqual(await recipe.readJingleSelection(store.db),{version:"v2",revision:0});assert.equal(store.writes(),0);
 assert.deepEqual(await recipe.readJingleSelection(store.db,"v1"),{version:"v1",revision:0});
});
test("Owner selection is revision-bound, audited and idempotent",async()=>{
 const store=settingsStore(),actor={uid:"fixture-owner",ownerVerified:true};
 assert.deepEqual(await recipe.setJingleSelection(store.db,"v2",0,actor),{version:"v2",revision:1,changed:true});assert.equal(store.writes(),2);
 assert.equal((await recipe.setJingleSelection(store.db,"v2",1,actor)).changed,false);assert.equal(store.writes(),2);
 await assert.rejects(recipe.setJingleSelection(store.db,"v1",0,actor),/revision_changed/);assert.equal(store.writes(),2);
 await recipe.setJingleSelection(store.db,"v1",1,actor);assert.equal(store.documents.get("podcastNarrationSettingsAudit/jingle-2").previousVersion,"v2");
 assert.deepEqual(await recipe.readJingleSelection(store.db),{version:"v1",revision:2});
});
test("Invalid settings and unverified owner cannot change the jingle",async()=>{
 const store=settingsStore({schemaVersion:1,revision:1,jingleVersion:"v3"});await assert.rejects(recipe.readJingleSelection(store.db));
 await assert.rejects(recipe.setJingleSelection(store.db,"v1",1,{uid:"fixture",ownerVerified:true}),/version_invalid/);assert.equal(store.writes(),0);
 const clean=settingsStore();await assert.rejects(recipe.setJingleSelection(clean.db,"v1",0,{uid:"fixture",ownerVerified:false}));assert.equal(clean.writes(),0);
});
test("An existing setting must explicitly name its jingle; an undefined setter cannot activate V2",async()=>{
 const store=settingsStore({schemaVersion:1,revision:1});await assert.rejects(recipe.readJingleSelection(store.db),/setting_invalid/);
 await assert.rejects(recipe.setJingleSelection(store.db,"v1",1,{uid:"fixture",ownerVerified:true}),/setting_invalid/);
 const empty=settingsStore();await assert.rejects(recipe.setJingleSelection(empty.db,undefined,0,{uid:"fixture",ownerVerified:true}),/change_invalid/);assert.equal(empty.writes(),0);
});
for(const [name,body] of [["short","En bog om at finde hjem."],["long",("Et konkret afsnit om kultur og hjem. ").repeat(600)],["unpunctuated",("ord ").repeat(1800)],["single word","ø".repeat(12000)],["unicode","😀 ".repeat(2200)]]) test(`Bounded speech retains all text and the complete closing: ${name}`,()=>{
 const script={bodyText:body,ratingLine:"Det blev til fire ud af seks stjerner.",outroLine:recipe.OUTRO};
 const chunks=recipe.narrationChunks(script);
 assert.ok(chunks.every(t=>t.length>0&&t.length<=2800));
 const expected=[body,script.ratingLine,script.outroLine].join(" ");
 if(name==="single word")assert.ok(chunks.join("").replace(/\s/g,"")===expected.replace(/\s/g,""),"All unbroken source characters retained");
 else assert.equal(normalized(chunks.join(" ")),normalized(expected));
 assert.ok(chunks.at(-1).endsWith(script.ratingLine+"\n\n"+recipe.OUTRO));
 if(body.length>1000)assert.ok(chunks.at(-1).length>500);
});
test("No-rating articles have no invented rating; new outro is identical in both jingles",()=>{
 const chunks=recipe.narrationChunks({bodyText:"En kulturguide om byen.",outroLine:recipe.OUTRO});
 assert.equal(chunks.length,1);assert.ok(!chunks[0].includes("stjerner"));assert.ok(chunks[0].endsWith(recipe.OUTRO));
});
test("Every chunk uses the approved Danish V4 demo settings and the same episode seed",()=>{
 const a=recipe.speechRequest("Første del.","Samme artikel"),b=recipe.speechRequest(recipe.OUTRO,"Samme artikel");
 assert.deepEqual({...a,text:""},{...b,text:""});assert.equal(a.language_code,"da");assert.equal(a.voice_settings.stability,1);assert.equal(a.model_id,"eleven_v4");
 assert.ok(!("previous_text" in a));assert.ok(!("previous_request_ids" in a));assert.ok(!("speed" in a));assert.notEqual(a.seed,recipe.speechRequest("tekst","Anden artikel").seed);
});
test("Missing or changed assets stop before synthesis; original V1 stays byte-identical",()=>{
 assert.equal(recipe.verifyAssets(root,"v1").v1[0].sha256,"ba2545a42cca7a90822340c2908c5a1d8681800211eaad9b402ee16c7f67f82d");recipe.verifyAssets(root,"v2");
 const tmp=mkdtempSync(path.join(os.tmpdir(),"jingle-assets-"));try{
  cpSync(path.join(root,"assets"),path.join(tmp,"assets"),{recursive:true});
  const manifestPath=path.join(tmp,"assets/narration-v2-assets.json"),manifest=JSON.parse(readFileSync(manifestPath));
  writeFileSync(manifestPath,JSON.stringify({...manifest,version:"old-recipe"}));assert.throws(()=>recipe.verifyAssets(tmp,"v2"),/manifest_invalid/);
  writeFileSync(manifestPath,JSON.stringify(manifest));writeFileSync(path.join(tmp,"assets/narration-v2-loop.wav"),"changed");assert.throws(()=>recipe.verifyAssets(tmp,"v2"),/asset_changed/);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
for(const version of ["v1","v2"]) for(const seconds of [2,46,117]) test(`Real FFmpeg mix ${version}, ${seconds}s speech`,()=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),"jingle-mix-"));try{
  const voice=path.join(tmp,"voice.wav"),out=path.join(tmp,"episode.m4a");tone(voice,seconds);
  command(ffmpeg,recipe.mixArgs(root,version,voice,out,seconds));const p=probe(out);
  assert.ok(Math.abs(Number(p.format.duration)-(seconds+12.5))<.07);assert.equal(p.streams[0].codec_name,"aac");assert.equal(p.streams[0].sample_rate,"44100");assert.equal(p.streams[0].channels,2);
  command(ffmpeg,["-v","error","-i",out,"-f","null","-"]);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test("Invalid duration is rejected without starting an encoder",()=>{
 for(const value of [0,-1,NaN,Infinity,3601])assert.throws(()=>recipe.mixArgs(root,"v2","voice.wav","out.m4a",value));
});

function worker(hooks={}) {
 const uploads=[],saves=[],calls=[];let manifestCalls=0;
 const bucket={getFiles:async()=>[[]],file:name=>({getMetadata:async()=>{const e=Error("absent");e.code=404;throw e;},save:async bytes=>saves.push({name,payload:JSON.parse(bytes)})}),upload:async(p,options)=>uploads.push({path:p,options,bytes:readFileSync(p)})};
 const sandbox={module:{exports:{}},exports:{},__dirname:root,process:{env:{}},Buffer,console,setTimeout:cb=>cb(),fetch:async(url,options)=>{
  calls.push({url,options});
  if(url.endsWith("/subscription"))return {ok:true,json:async()=>({character_count:0,character_limit:100000,...hooks.usage})};
  if(url.endsWith("/voices"))return {ok:true,json:async()=>({voices:[{name:"Ellen",voice_id:"fixture-ellen"}]})};
  if(hooks.failTts)return {ok:false,status:400,text:async()=>"fixture rejected"};
  return {ok:true,arrayBuffer:async()=>hooks.voiceBytes};
 },require:id=>{
  if(id==="firebase-admin")return {firestore:()=>({collection:()=>({doc:()=>({get:async()=>({exists:Boolean(hooks.selection),data:()=>hooks.selection})})})}),storage:()=>({bucket:()=>bucket})};
  if(id==="firebase-functions/logger")return {info(){},warn(){},error(){}};
  if(id==="ffmpeg-static")return ffmpeg;if(id==="ffprobe-static")return {path:"hermetic-probe"};
  if(id==="node:child_process")return {...require(id),execFileSync:(_exe,args)=>Buffer.from(String(probe(args.at(-1)).format.duration))};
  if(id==="./narrationAudioRecipe.cjs")return recipe;
  if(id.startsWith("node:"))return require(id);throw Error("Unexpected module "+id);
 }};
 vm.createContext(sandbox);vm.runInContext(readFileSync(path.join(root,"narration.js"),"utf8"),sandbox);
 sandbox.__hooks={
  articleHasAudio:async()=>Boolean(hooks.exists),
  loadArticle:async()=>({fieldData:{name:"Testartikel",slug:"testartikel",content:"<p>"+(hooks.text||"En kort konkret artikel om kultur.")+"</p>",author:"fixture-author",stjerne:4}}),
  resolveAuthorName:async()=>"Testforfatter",loadStarsMapping:async()=>({}),
  syncManifest:async()=>{manifestCalls++;},recordAdminAlert:async()=>{},
 };
 vm.runInContext("articleHasAudio=__hooks.articleHasAudio;loadArticle=__hooks.loadArticle;resolveAuthorName=__hooks.resolveAuthorName;loadStarsMapping=__hooks.loadStarsMapping;syncManifest=__hooks.syncManifest;recordAdminAlert=__hooks.recordAdminAlert;",sandbox);
 return {run:()=>sandbox.module.exports.generateAndPublishNarration({slug:"testartikel",articleId:"fixture-article",apiKey:"fixture-not-a-secret"}),uploads,saves,calls,manifestCalls:()=>manifestCalls};
}
test("Actual patched worker includes new closing, uses one Ellen ID and emits version receipt",async()=>{
 const tmp=mkdtempSync(path.join(os.tmpdir(),"jingle-worker-"));try{
  const clip=path.join(tmp,"tone.mp3");tone(clip,1);
  const w=worker({voiceBytes:readFileSync(clip),text:("En konkret passage om bogen. ").repeat(110)});const result=await w.run();
  assert.equal(result.status,"published");assert.equal(w.uploads.length,1);assert.equal(w.manifestCalls(),1);
  const requests=w.calls.filter(c=>c.options?.method==="POST").map(c=>({url:c.url,body:JSON.parse(c.options.body)}));
  assert.ok(requests.length>=2);assert.ok(requests.every(r=>r.url.includes("/fixture-ellen?")));
  assert.ok(requests.at(-1).body.text.endsWith(recipe.OUTRO));assert.ok(requests.at(-1).body.text.includes("En konkret passage"));
 assert.ok(requests.every(r=>r.body.voice_settings.stability===1&&r.body.model_id==="eleven_v4"));assert.equal(new Set(requests.map(r=>r.body.seed)).size,1);
  const receipt=w.saves.find(s=>s.name.endsWith("narration.json")).payload.audioRecipe;
 assert.equal(receipt.jingleVersion,"v2");assert.equal(receipt.insertedPauseSeconds,0);assert.equal(receipt.voiceId,"fixture-ellen");assert.equal(receipt.modelId,"eleven_v4");
  assert.equal(receipt.outroCopy,"free-ad-free-v1");assert.ok(w.uploads[0].bytes.length>0);
 }finally{rmSync(tmp,{recursive:true,force:true});}
});
test("Already recorded article is reused before quota, TTS or uploads",async()=>{
 const w=worker({exists:true});assert.equal((await w.run()).status,"exists");assert.equal(w.calls.length,0);assert.equal(w.uploads.length,0);
});
test("Existing quota guard stops paid generation and publication",async()=>{
 const w=worker({usage:{character_count:85000}});assert.equal((await w.run()).status,"deferred_quota");assert.equal(w.calls.length,1);assert.equal(w.uploads.length,0);
});
test("An invalid live jingle setting stops before quota or TTS",async()=>{
 const w=worker({selection:{schemaVersion:1,revision:1}});await assert.rejects(w.run(),/setting_invalid/);assert.equal(w.calls.length,0);assert.equal(w.uploads.length,0);
});
test("A provider 4xx never retries or publishes a partial episode",async()=>{
 const w=worker({failTts:true});await assert.rejects(w.run(),/TTS 400/);assert.equal(w.calls.filter(c=>c.options?.method==="POST").length,1);assert.equal(w.uploads.length,0);assert.equal(w.saves.length,0);
});
