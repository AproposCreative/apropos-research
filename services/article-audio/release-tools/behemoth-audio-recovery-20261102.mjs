import {readFileSync} from 'node:fs';
import {google,save,sha} from './audio-cloud-ops-20261102.mjs';
const articleId='6ae8aff199edb6a5b1f8c9f9',slug='behemoth-og-dimmu-borgir-i-kb-hallen';
const root='projects/apropos-magazine-6004a/databases/(default)/documents';
const base='https://firestore.googleapis.com/v1/'+root;
const mode=process.argv[2];if(!['inspect','resume','read-inspect','read-resume','read-job'].includes(mode))throw Error('Explicit bounded mode required');
const revision='cms-sha256-v1:cbd912e4eeb2e606d08e7bc238c8a4f2d28acffa569bf4d4a8aaa08d7bffbf5c';
const expectedJobUpdate={seconds:Math.floor(Date.parse('2026-11-02T16:31:34Z')/1000),nanoseconds:653063000};
const id=kind=>'normal-audio-'+kind+'-'+articleId+'-cbd912e4eeb2';
function decode(v){if(v.mapValue)return Object.fromEntries(Object.entries(v.mapValue.fields||{}).map(([k,x])=>[k,decode(x)]));if(v.arrayValue)return(v.arrayValue.values||[]).map(decode);return v.stringValue??v.integerValue??v.timestampValue??v.booleanValue??v.nullValue;}
const read=async path=>(await google(base+'/'+path)).json();
function safe(d){return {name:d.name.split('/').at(-1),updateTime:d.updateTime,fields:Object.fromEntries(Object.entries(d.fields||{}).filter(([k])=>!['narrationClaim','normalRecoveryHistory','offlineRepairClaim'].includes(k)).map(([k,v])=>[k,decode(v)]))};}
function encode(v){if(typeof v==='string')return{stringValue:v};if(typeof v==='number')return{integerValue:String(v)};if(typeof v==='boolean')return{booleanValue:v};return{mapValue:{fields:Object.fromEntries(Object.entries(v).map(([k,x])=>[k,encode(x)]))}};}
if(mode.startsWith('read-')){const kind=mode.slice(5),d=await read('narration_queue/'+(kind==='job'?slug:id(kind)));const result=safe(d);save('recovery-'+kind+'-readback',result);console.log(JSON.stringify(result));}
else{
 let existing;try{existing=await read('narration_queue/'+id(mode));}catch(e){if(!e.message.endsWith('HTTP 404'))throw e;}
 if(existing){console.log(JSON.stringify({alreadyExists:true,...safe(existing)}));process.exit(0);}
 if(mode==='resume'){
  const inspection=safe(await read('narration_queue/'+id('inspect')));
  if(inspection.fields.status!=='inspected'||inspection.fields.sourceContentRevision!==revision||inspection.fields.noExistingAudio!==true)throw Error('Successful server inspection required before resume');
 }
 const original=await read('narration_queue/'+slug);
 if(original.updateTime!=='2026-11-02T16:31:34.653063Z'||original.fields.status.stringValue!=='error'||original.fields.error.stringValue!=='Current live CMS publication changed')throw Error('Historical failed job changed');
 const evidence=sha(readFileSync('output/behemoth-audio-diagnosis-20261102/observation.json'));
 const data={articleId,slug,status:'pending',normalAudioRecovery:{version:'first-audio-v1',mode,expectedSourceRevision:revision,expectedJobUpdate,expectedError:'Current live CMS publication changed',noEffectEvidenceSHA256:evidence}};
 const name=root+'/narration_queue/'+id(mode);
 const r=await(await google('https://firestore.googleapis.com/v1/projects/apropos-magazine-6004a/databases/(default)/documents:commit','POST',{writes:[{update:{name,fields:Object.fromEntries(Object.entries(data).map(([k,v])=>[k,encode(v)]))},currentDocument:{exists:false}}]})).json();
 save('recovery-'+mode+'-request',{createdAt:new Date().toISOString(),name,request:data,commitTime:r.commitTime,originalJobPreserved:true});console.log(JSON.stringify({created:name.split('/').at(-1),mode,commitTime:r.commitTime}));
}
