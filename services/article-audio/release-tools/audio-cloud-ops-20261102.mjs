import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {createHash} from 'node:crypto';
export const project='apropos-magazine-6004a';
export const base=`https://cloudfunctions.googleapis.com/v2/projects/${project}/locations/us-central1`;
export const out='output/audio-repair-20261102';
mkdirSync(out,{recursive:true});
export const canonical=v=>JSON.stringify(v&&typeof v==='object'?Array.isArray(v)?v.map(x=>JSON.parse(canonical(x))):Object.fromEntries(Object.keys(v).sort().map(k=>[k,JSON.parse(canonical(v[k]))])):v);
export const sha=b=>createHash('sha256').update(b).digest('hex');
export const save=(name,data)=>writeFileSync(`${out}/${name}.json`,JSON.stringify(data,null,2)+'\n',{mode:0o600});
export function token(){
 const c=JSON.parse(readFileSync(homedir()+'/.config/configstore/firebase-tools.json','utf8'));
 if(c.user?.email!=='frederik@aproposcreative.com'||typeof c.tokens?.access_token!=='string'||c.tokens.expires_at<Date.now()+30000)throw Error('Existing Google identity expired or mismatched');
 return c.tokens.access_token;
}
export async function google(url,method='GET',body){
 const u=new URL(url);
 if(!['cloudfunctions.googleapis.com','storage.googleapis.com','firestore.googleapis.com','www.googleapis.com','logging.googleapis.com'].includes(u.hostname))throw Error('Unapproved Google destination');
 const r=await fetch(url,{method,headers:{Authorization:'Bearer '+token(),...(body?{'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined,redirect:'error',signal:AbortSignal.timeout(45000)});
 if(!r.ok)throw Error(`${u.hostname} ${method} HTTP ${r.status}`);
 return r;
}
export const getFunction=async name=>(await google(`${base}/functions/${name}`)).json();
export function configDigest(f){
 const clean=structuredClone(f); delete clean.name;delete clean.state;delete clean.updateTime;delete clean.createTime;delete clean.stateMessages;delete clean.buildConfig?.source;delete clean.buildConfig?.build;delete clean.buildConfig?.sourceProvenance;
 delete clean.serviceConfig?.revision; delete clean.serviceConfig?.uri; delete clean.url;
 return sha(canonical(clean));
}
export function safeFunction(f){return {name:f.name.split('/').at(-1),state:f.state,updateTime:f.updateTime,source:f.buildConfig?.source?.storageSource,revision:f.serviceConfig?.revision,configDigest:configDigest(f),maintenanceFlags:Object.fromEntries(['AUTOMATIC_OFFLINE_ENABLED','AUTOMATIC_OFFLINE_MAX_RENDERS','AUTOMATIC_OFFLINE_MAX_CHARACTERS','AUTOMATIC_OFFLINE_TOTAL_CHARACTERS'].map(k=>[k,f.serviceConfig?.environmentVariables?.[k]??null]))};}
if(process.argv[2]==='source'){
 const name=process.argv[3];
 if(!['syncArticles','webflowWebhook','syncArticlesScheduled','generateNarrationOnQueue'].includes(name))throw Error('Unknown source');
 const f=await getFunction(name),s=f.buildConfig.source.storageSource;
 const r=await google(`https://storage.googleapis.com/download/storage/v1/b/${encodeURIComponent(s.bucket)}/o/${encodeURIComponent(s.object)}?alt=media&generation=${s.generation}`);
 const bytes=Buffer.from(await r.arrayBuffer());
 const after=await getFunction(name);
 if(canonical(s)!==canonical(after.buildConfig.source.storageSource))throw Error('Source changed while downloading');
 const path=`${out}/${name}-original.zip`;writeFileSync(path,bytes,{mode:0o600});
 const result={checkedAt:new Date().toISOString(),...safeFunction(after),zip:path,sha256:sha(bytes),bytes:bytes.length};save(`${name}-baseline`,result);console.log(JSON.stringify(result));
}
if(process.argv[2]==='deploy'){
 const name=process.argv[3],path=process.argv[4],expected=process.argv[5];
 const bytes=readFileSync(path);if(sha(bytes)!==expected)throw Error('Exact source package hash mismatch');
 const baseline=await getFunction(name);if(baseline.state!=='ACTIVE')throw Error('Target not active');
 const allowed=JSON.parse(readFileSync(`${out}/${name}-baseline.json`,'utf8'));
 if(canonical(baseline.buildConfig.source.storageSource)!==canonical(allowed.source)||configDigest(baseline)!==allowed.configDigest)throw Error('Concurrent deployment/configuration changed');
 const upload=await(await google(`${base}/functions:generateUploadUrl`,'POST',{environment:'GEN_2'})).json();
 const u=new URL(upload.uploadUrl);if(u.protocol!=='https:'||!(u.hostname==='storage.googleapis.com'||u.hostname.endsWith('.storage.googleapis.com')))throw Error('Unexpected upload destination');
 const put=await fetch(u,{method:'PUT',headers:{'Content-Type':'application/zip'},body:bytes,redirect:'error',signal:AbortSignal.timeout(60000)});if(!put.ok)throw Error('Source upload HTTP '+put.status);
 const fresh=await getFunction(name);if(fresh.updateTime!==baseline.updateTime||configDigest(fresh)!==configDigest(baseline))throw Error('Concurrent function mutation');
 const operation=await(await google(`${base}/functions/${name}?updateMask=buildConfig.source`,'PATCH',{name:fresh.name,buildConfig:{source:{storageSource:upload.storageSource}}})).json();
 const result={startedAt:new Date().toISOString(),target:name,operation:operation.name,sourceSHA256:expected,baseline:safeFunction(baseline),uploadedSource:upload.storageSource,updateMask:'buildConfig.source'};
 save(`${name}-deployment`,result);console.log(JSON.stringify({target:name,operation:operation.name,sourceSHA256:expected}));
}
if(process.argv[2]==='poll'){
 const name=process.argv[3],d=JSON.parse(readFileSync(`${out}/${name}-deployment.json`,'utf8'));
 const op=await(await google('https://cloudfunctions.googleapis.com/v2/'+d.operation)).json();
 const f=await getFunction(name),safe=safeFunction(f);
 const result={checkedAt:new Date().toISOString(),target:name,done:op.done===true,error:op.error?{code:op.error.code,message:op.error.message}:null,function:safe,configPreserved:safe.configDigest===d.baseline.configDigest};
 save(`${name}-deployment-readback`,result);console.log(JSON.stringify(result));
}
