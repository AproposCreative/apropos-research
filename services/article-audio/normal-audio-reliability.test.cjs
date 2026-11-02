const{test}=require('node:test'),assert=require('node:assert/strict');
const{startNormalAudioDeadline,providerSignal,confirmedQuota}=require('./functions-20261102/normalAudioReliability.cjs');
test('a hung attempt becomes a retained error without taking a new claim',async()=>{
 let timer,writes=[];const close=startNormalAudioDeadline({finish:async fields=>{writes.push(fields);return true;},now:()=>123,
 schedule:fn=>{timer=fn;return 7;},cancel:()=>{}});
 timer();await new Promise(setImmediate);assert.equal(writes.length,1);assert.equal(writes[0].status,'error');assert.equal(writes[0].failureStage,'deadline');assert.equal(writes[0].deadlineExceededAt,123);close();
});
test('completed attempts cancel the deadline and a late timer cannot rewrite them',async()=>{
 let timer,canceled=false,writes=0;const close=startNormalAudioDeadline({finish:async()=>writes++,schedule:fn=>{timer=fn;return 8;},cancel:id=>{assert.equal(id,8);canceled=true;}});
 close();timer();await new Promise(setImmediate);assert.equal(canceled,true);assert.equal(writes,0);
});
test('deadline loses safely if another owner already finished',async()=>{let timer,attempts=0;
 startNormalAudioDeadline({finish:async()=>{attempts++;return false;},schedule:fn=>{timer=fn;return 1;},cancel:()=>{}});
 timer();await new Promise(setImmediate);assert.equal(attempts,1);
});
test('receipt-storage failure is surfaced without an unhandled timer rejection',async()=>{let timer,errors=0;
 startNormalAudioDeadline({finish:async()=>{throw Error('storage unavailable');},schedule:fn=>{timer=fn;return 1;},cancel:()=>{},onError:()=>errors++});
 timer();await new Promise(setImmediate);assert.equal(errors,1);
});
test('provider work cannot start after the shared episode deadline',()=>{assert.throws(()=>providerSignal(Date.now()-1,100),/deadline/);assert.ok(providerSignal(Date.now()+5000,10)instanceof AbortSignal);});
test('existing 80 percent cap includes the complete requested text',()=>{
 assert.deepEqual(confirmedQuota({confirmed:true,count:790,limit:1000},10,.8),{projected:800,exceeded:false});
 assert.equal(confirmedQuota({confirmed:true,count:790,limit:1000},11,.8).exceeded,true);
});
test('unknown or malformed usage never authorizes paid synthesis',()=>{
 for(const usage of [null,{confirmed:false,count:0,limit:1000},{confirmed:true,count:null,limit:1000},{confirmed:true,count:-1,limit:1000},{confirmed:true,count:1,limit:0}])assert.throws(()=>confirmedQuota(usage,100,.8),/could not be confirmed/);
});
