const{test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const recipe=require('./functions-20261102/narrationAudioRecipe.cjs');
const{providerSignal,confirmedQuota}=require('./functions-20261102/normalAudioReliability.cjs');
const source=fs.readFileSync(__dirname+'/functions-20261102/narration.js','utf8');
function definition(name){const a=source.indexOf('async function '+name+'(');return source.slice(a,source.indexOf('\n}\n',a)+3);}
function fixture(fetch){const files=new Map(),context={fetch,Buffer,audioRecipe:recipe,providerSignal,VOICE_NAME:'Ellen',OUTPUT_FORMAT:'mp3_44100_192',fs:{writeFileSync:(p,b)=>files.set(p,b)},logger:{warn(){}},setTimeout};
 vm.createContext(context);vm.runInContext(['resolveVoiceId','synthesizeChunk','elevenLabsUsage'].map(definition).join('\n')+'\nglobalThis.api={resolveVoiceId,synthesizeChunk,elevenLabsUsage};',context);return{...context.api,files};}
test('actual TTS request keeps v4 and voice settings, disallows redirects and has a deadline',async()=>{let calls=0;const f=fixture(async(url,options)=>{calls++;assert.ok(url.includes('/retained-ellen?'));assert.equal(options.redirect,'error');assert.ok(options.signal instanceof AbortSignal);
 const body=JSON.parse(options.body);assert.equal(body.model_id,'eleven_v4');assert.equal(body.voice_settings.stability,1);assert.equal(body.text,'An approved article.');return{ok:true,arrayBuffer:async()=>Buffer.from('fixture mp3')};});
 await f.synthesizeChunk('fixture-only','retained-ellen','An approved article.','/fixture/output','An approved article.',{singleAttempt:true,deadlineAt:Date.now()+1000});assert.equal(calls,1);assert.ok(f.files.get('/fixture/output').length>0);
});
for(const status of [429,503])test('provider HTTP '+status+' is not a paid blind retry',async()=>{let calls=0;const f=fixture(async()=>{calls++;return{ok:false,status};});await assert.rejects(f.synthesizeChunk('fixture','ellen','text','/fixture','text',{singleAttempt:true,deadlineAt:Date.now()+1000}));assert.equal(calls,1);assert.equal(f.files.size,0);});
test('a hanging TTS request aborts with no output or second attempt',async()=>{let calls=0;
 const f=fixture(async(_,options)=>{calls++;return new Promise((resolve,reject)=>{const timer=setTimeout(()=>resolve({ok:true,arrayBuffer:async()=>Buffer.from('too late')}),1000);options.signal.addEventListener('abort',()=>{clearTimeout(timer);reject(Error('provider aborted'));},{once:true});});});
 await assert.rejects(f.synthesizeChunk('fixture','ellen','text','/fixture','text',{singleAttempt:true,deadlineAt:Date.now()+15}),/aborted/);assert.equal(calls,1);assert.equal(f.files.size,0);
});
test('usage without confirmed numeric fields cannot pass paid admission',async()=>{
 for(const data of [{},{character_count:'0',character_limit:1000},{character_count:null,character_limit:1000}]){const f=fixture(async()=>({ok:true,json:async()=>data})),usage=await f.elevenLabsUsage('fixture',Date.now()+1000);assert.throws(()=>confirmedQuota(usage,100,.8));}
});
test('known zero usage is preserved as a confirmed zero',async()=>{const f=fixture(async()=>({ok:true,json:async()=>({character_count:0,character_limit:1000})}));const usage=await f.elevenLabsUsage('fixture',Date.now()+1000);assert.equal(usage.confirmed,true);assert.equal(usage.count,0);assert.equal(confirmedQuota(usage,100,.8).exceeded,false);});
