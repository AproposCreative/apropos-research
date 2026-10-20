/** Read-only GA4 baseline. Supply existing production service-account env securely. */
import { GoogleAuth } from 'google-auth-library';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { summarize } from './ai-referrals.mjs';
const output=resolve(process.argv[2] || `tmp/geo/ga4-${new Date().toISOString().replaceAll(':','-')}.json`);
// Leave three calendar days for processing; explicit date makes historical reruns comparable.
const end=process.argv[3] || new Date(Date.now()-3*86400000).toISOString().slice(0,10);
if(!/^\d{4}-\d{2}-\d{2}$/.test(end) || new Date(end).toISOString().slice(0,10)!==end) throw Error('Expected valid YYYY-MM-DD');
const shift=(date,days)=>new Date(new Date(`${date}T00:00:00Z`).getTime()+days*86400000).toISOString().slice(0,10);
const property=process.env.GA4_PROPERTY_ID?.trim();
if(!property || !/^\d+$/.test(property) || !process.env.FIREBASE_ADMIN_CLIENT_EMAIL || !process.env.FIREBASE_ADMIN_PRIVATE_KEY) throw Error('Existing GA4/service-account configuration required');
const auth=new GoogleAuth({credentials:{client_email:process.env.FIREBASE_ADMIN_CLIENT_EMAIL,private_key:process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g,'\n')},scopes:['https://www.googleapis.com/auth/analytics.readonly']});
const client=await auth.getClient(); const {token}=await client.getAccessToken(); if(!token) throw Error('No GA4 access token');
const periods=[];
for(const [startDate,endDate] of [[shift(end,-27),end],[shift(end,-55),shift(end,-28)]]) {
 const rows=[]; let total; let metadata;
 do {
  const response=await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${property}:runReport`,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({dateRanges:[{startDate,endDate}],dimensions:[{name:'sessionSource'},{name:'sessionMedium'}],metrics:[{name:'sessions'},{name:'engagedSessions'}],orderBys:[{dimension:{dimensionName:'sessionSource'}},{dimension:{dimensionName:'sessionMedium'}}],offset:rows.length,limit:10000})});
  if(!response.ok) throw Error(`GA4 request failed (${response.status}); no baseline saved`);
  const data=await response.json(); total=data.rowCount || 0; metadata=data.metadata || {};
  if(total>100000) throw Error('Report exceeds bounded row limit; no partial baseline saved');
  if(total>rows.length && !data.rows?.length) throw Error('Incomplete GA4 pagination');
  rows.push(...(data.rows||[]));
 } while(rows.length<total);
 periods.push({startDate,endDate,rowCount:rows.length,metadata,...summarize(rows)});
}
const result={checkedAt:new Date().toISOString(),property,definition:'GA4 sessions attributed to known AI service hostnames; 28 completed days versus preceding 28 days. Dates use property reporting timezone.',limitations:['AI referrals are a lower bound: stripped referrers and unknown sources are not classified.','Google AI Overviews/AI Mode are not separable from ordinary Google Search here.','Visits do not measure citations, impressions, recommendations or causal impact.','GA4 thresholding/sampling/data-loss flags are retained in each period metadata.'],periods};
await mkdir(dirname(output),{recursive:true}); await writeFile(output,JSON.stringify(result,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({output,periods}));
