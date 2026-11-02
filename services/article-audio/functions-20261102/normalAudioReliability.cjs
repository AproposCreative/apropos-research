// SDK-free lifetime fence. A timed-out attempt keeps its paid-outcome evidence
// and cannot become a second producer, even if an external call returns late.
function startNormalAudioDeadline({finish,now=Date.now,schedule=setTimeout,cancel=clearTimeout,timeoutMs=480000,onError=()=>{}}){
 if(typeof finish!=='function'||!Number.isSafeInteger(timeoutMs)||timeoutMs<1)throw Error('Owned normal audio lifetime required');
 let closed=false;
 const timer=schedule(()=>{
  if(closed)return;
  Promise.resolve().then(()=>finish({status:'error',error:'Narration timed out; readback required before any retry',
   failureStage:'deadline',deadlineExceededAt:now()})).catch(onError);
 },timeoutMs);
 timer?.unref?.();
 return()=>{closed=true;cancel(timer);};
}
function providerSignal(deadlineAt,maximumMs){
 const remaining=Math.floor(Math.min(maximumMs,deadlineAt-Date.now()));
 if(!Number.isSafeInteger(remaining)||remaining<1)throw Error('Narration provider deadline exceeded');
 return AbortSignal.timeout(remaining);
}
function confirmedQuota(usage,characters,threshold){
 if(!usage||usage.confirmed!==true||!Number.isSafeInteger(usage.count)||usage.count<0||
  !Number.isSafeInteger(usage.limit)||usage.limit<1||!Number.isSafeInteger(characters)||characters<1||
  !Number.isFinite(threshold)||threshold<=0||threshold>1)throw Error('Provider quota could not be confirmed before narration');
 return {projected:usage.count+characters,exceeded:usage.count+characters>Math.floor(usage.limit*threshold)};
}
module.exports={startNormalAudioDeadline,providerSignal,confirmedQuota};
