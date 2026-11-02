const{test}=require('node:test'),assert=require('node:assert/strict');
test('unordered Google event filters do not defeat the deployment concurrency fence',async()=>{
 const{configDigest}=await import('./release-tools/audio-cloud-ops-20261102.mjs');
 const f={name:'fixture',buildConfig:{runtime:'nodejs22',entryPoint:'generateNarrationOnQueue',source:{storageSource:{generation:'1'}}},serviceConfig:{timeoutSeconds:540,secretEnvironmentVariables:[{key:'A',version:'1'},{key:'B',version:'2'}]},eventTrigger:{eventType:'created',eventFilters:[{attribute:'database',value:'(default)'},{attribute:'document',value:'narration_queue/{slug}',operator:'match-path-pattern'}]}};
 const reordered=structuredClone(f);reordered.eventTrigger.eventFilters.reverse();reordered.serviceConfig.secretEnvironmentVariables.reverse();assert.equal(configDigest(f),configDigest(reordered));
 const changed=structuredClone(f);changed.eventTrigger.eventFilters[1].value='another_collection/{slug}';assert.notEqual(configDigest(f),configDigest(changed));
 const changedSecret=structuredClone(f);changedSecret.serviceConfig.secretEnvironmentVariables[1].version='3';assert.notEqual(configDigest(f),configDigest(changedSecret));
});
