import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifySource,summarize} from './ai-referrals.mjs';
test('recognises known hosts without classifying Google organic or lookalikes',()=>{
 assert.equal(classifySource('https://chatgpt.com/?q=x'),'ChatGPT');
 assert.equal(classifySource('WWW.PERPLEXITY.AI'),'Perplexity');
 for(const source of ['google','google.com','bing.com','chatgpt.com.attacker.com','notchatgpt.com','https://chatgpt.com@attacker.com','(direct)']) assert.equal(classifySource(source),null);
});
test('counts session metrics; unknown AI tagged sources remain explicit',()=>{
 const row=(s,m,a,b)=>({dimensionValues:[{value:s},{value:m}],metricValues:[{value:String(a)},{value:String(b)}]});
 const r=summarize([row('chatgpt.com','ai-assistant',24,11),row('google','organic',100,50),row('unknown.ai','ai-assistant',2,1)]);
 assert.equal(r.aiSessions,24); assert.equal(r.allSessions,126); assert.equal(r.aiEngagedSessions,11); assert.equal(r.unmatchedAiTaggedSources.length,1);
 assert.equal(summarize([]).aiEngagementRate,null);
});
