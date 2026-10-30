import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const m=vi.hoisted(()=>({rows:new Map<string,any>(),tail:Promise.resolve() as Promise<unknown>,live:vi.fn(),transport:vi.fn()}));
vi.mock('@/lib/firebase-admin',()=>({getAdminDb:()=>{
  const ref=(key:string)=>({key,get:async()=>({data:()=>structuredClone(m.rows.get(key)),exists:m.rows.has(key)}),
    set:async(data:any,opts?:any)=>{m.rows.set(key,structuredClone(opts?.merge?{...m.rows.get(key),...data}:data));}});
  return {collection:(name:string)=>({doc:(id:string)=>ref(name+'/'+id)}),
    runTransaction:(run:any)=>{
      const r=m.tail.then(async()=>{const writes:(()=>void)[]=[];const value=await run({
        get:async(r:any)=>{if(writes.length)throw Error('read_after_write');return {data:()=>structuredClone(m.rows.get(r.key)),exists:m.rows.has(r.key)};},
        create:(r:any,d:any)=>{if(m.rows.has(r.key))throw Error('exists');writes.push(()=>m.rows.set(r.key,structuredClone(d)));},
        update:(r:any,d:any)=>writes.push(()=>m.rows.set(r.key,structuredClone({...m.rows.get(r.key),...d}))),
      });writes.forEach(w=>w());return value;});m.tail=r.catch(()=>{});return r;
    }};
}}));
vi.mock('@/lib/newsletter/webflow-sources',()=>({resolveLiveNewsletterFeature:m.live}));
import { getScheduledNewsletterSummary,validateNewsletterAiPolicy,parseScheduledSummary,NEWSLETTER_AI_POLICY_ID } from '@/lib/newsletter/scheduled-ai';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
import { providerHoldId } from '@/lib/ai/provider-hold';

const now=new Date('2026-10-30T10:00:00Z');
const week={start:new Date('2026-10-19T00:00:00Z'),end:new Date('2026-10-25T23:59:59Z'),isoWeek:43,labelDa:'Ugens artikler'};
const articles=['a','b'].map(id=>({id:id.repeat(24),title:id==='a'?'Boganmeldelse: Nogen der kender nogen':'Anmeldelse: The Terminal List',
  slug:id,excerpt:'En konkret anmeldelse med stof om litteratur og kultur.',thumbUrl:'https://example.com/'+id+'.webp',
  url:'https://www.aproposmagazine.com/articles/'+id,selectionDate:'2026-10-28T00:00:00Z',lastPublished:'2026-10-28T00:00:00Z'}));
const intro='Nogen der kender nogen tager fat på boligjagten og de liv, som skal kunne rummes mellem fire vægge. Laura Ringos bog er denne uges hovedhistorie på Apropos Magazine. Her følger vi anmeldelsens blik på litteraturen og på de spørgsmål, der bliver ved med at dukke op, når man leder efter et sted at høre til.\n\nSamtidig byder udvalget på The Terminal List, hvor actionserien kommer under behandling. Det giver anledning til at se på både de store forventninger og det, der faktisk ender på skærmen. Artiklerne nedenfor samler ugens læsning.';
const raw=JSON.stringify({headline:'Boligjagt og action på skærmen',intro});
const policy=()=>({id:NEWSLETTER_AI_POLICY_ID,enabled:true,blocked:false,model:'gpt-5.4-mini',limitUsdMicros:10_000_000,
  perCallLimitUsdMicros:100_000,resetsAutomatically:false,committedUsdMicros:0,reservedUsdMicros:0,calls:0});
const response=()=>new Response(JSON.stringify({model:'gpt-5.4-mini',choices:[{finish_reason:'stop',message:{content:raw}}],
  usage:{prompt_tokens:100,completion_tokens:100}}),{status:200,headers:{'content-type':'application/json','x-request-id':'req_fixture'}});
beforeEach(()=>{vi.clearAllMocks();m.rows.clear();m.tail=Promise.resolve();vi.stubEnv('OPENAI_API_KEY','fixture-not-a-real-key');
  m.rows.set('newsletterAiLedger/policy',policy());m.rows.set('aiExecutionPolicies/paid',{mode:'manual-writer-only-v1',committedDkkMicros:110120});
  m.rows.set('livCostLedger/month-2026-10',{reservedDkkMicros:1214400});
  m.live.mockImplementation((id)=>Promise.resolve(structuredClone(articles.find(a=>a.id===id))));m.transport.mockImplementation(async()=>response());vi.stubGlobal('fetch',m.transport);
});
afterEach(()=>{vi.unstubAllEnvs();vi.unstubAllGlobals();});
const run=(allow=true)=>getScheduledNewsletterSummary(week,articles,now,allow);
describe('bounded weekly newsletter AI',()=>{
  it('a read-only empty preview never calls or reserves',async()=>{
    expect(await run(false)).toBeNull();expect(m.transport).not.toHaveBeenCalled();expect(m.rows.get('newsletterAiLedger/policy').calls).toBe(0);
  });
  it('requires the dedicated policy and honors global provider holds',async()=>{
    m.rows.delete('newsletterAiLedger/policy');await expect(run()).rejects.toThrow('policy_unavailable');expect(m.transport).not.toHaveBeenCalled();
    m.rows.set('newsletterAiLedger/policy',policy());m.rows.set('aiProviderHolds/'+providerHoldId(),{blocked:true});
    await expect(run()).rejects.toThrow('provider_hold');expect(m.transport).not.toHaveBeenCalled();
  });
  it('does not refill or reset a spent lifetime allowance',async()=>{
    m.rows.set('newsletterAiLedger/policy',{...policy(),committedUsdMicros:10_000_000});
    await expect(run()).rejects.toThrow('budget_exhausted');expect(m.transport).not.toHaveBeenCalled();
  });
  it('pays once, accounts usage separately, and safely reuses Firestore-reordered maps',async()=>{
    const before=structuredClone(m.rows.get('aiExecutionPolicies/paid'));
    const first=await run();expect(first?.headline).toBe('Boligjagt og action på skærmen');
    const job=m.rows.get('newsletterAiLedger/week-2026-W44');
    job.articles=job.articles.map((a:any)=>Object.fromEntries(Object.entries(a).sort()));
    expect((await run())?.intro).toBe(intro);expect(m.transport).toHaveBeenCalledTimes(1);
    const p=m.rows.get('newsletterAiLedger/policy');expect(p.calls).toBe(1);expect(p.reservedUsdMicros).toBe(0);expect(p.committedUsdMicros).toBe(525);
    expect(m.rows.get('aiExecutionPolicies/paid')).toEqual(before);expect(m.rows.get('livCostLedger/month-2026-10')).toEqual({reservedDkkMicros:1214400});
    const request=m.transport.mock.calls[0];expect(request[0]).toBe('https://api.openai.com/v1/chat/completions');
    const body=JSON.parse(request[1].body);expect(body).toMatchObject({model:'gpt-5.4-mini',reasoning_effort:'none',max_completion_tokens:1000,service_tier:'default'});
    expect(body).not.toHaveProperty('tools');
  });
  it('concurrent requests cannot make a second provider call',async()=>{
    const results=await Promise.allSettled([run(),run()]);expect(results.some(r=>r.status==='fulfilled')).toBe(true);expect(m.transport).toHaveBeenCalledTimes(1);
  });
  it('retains an uncertain timeout reservation and never blindly retries it',async()=>{
    m.transport.mockRejectedValue(new Error('Timeout containing private transport details'));
    await expect(run()).rejects.toThrow('provider_outcome_unknown');await expect(run()).rejects.toThrow('previous_attempt_requires_review');
    expect(m.transport).toHaveBeenCalledTimes(1);expect(m.rows.get('newsletterAiLedger/policy').reservedUsdMicros).toBeGreaterThan(0);
    expect(JSON.stringify(m.rows.get('newsletterAiLedger/week-2026-W44'))).not.toContain('private transport details');
  });
  it('classifies provider quota without generic fallback or changes to the shared hold',async()=>{
    m.transport.mockResolvedValue(new Response(JSON.stringify({error:{code:'insufficient_quota'}}),{status:429}));
    await expect(run()).rejects.toThrow('provider_credit_exhausted');expect(m.rows.get('newsletterAiLedger/week-2026-W44').status).toBe('needs_review');
    expect(m.rows.has('aiProviderHolds/'+providerHoldId())).toBe(false);
  });
  it('retains the reservation if a successful response has unknown usage',async()=>{
    m.transport.mockResolvedValue(new Response(JSON.stringify({choices:[{finish_reason:'stop',message:{content:raw}}]}),{status:200}));
    await run();expect(m.rows.get('newsletterAiLedger/week-2026-W44').accounting).toBe('reservation_retained');
    expect(m.rows.get('newsletterAiLedger/policy').reservedUsdMicros).toBeGreaterThan(0);await run();expect(m.transport).toHaveBeenCalledTimes(1);
  });
  it('requires review if a cached article is withdrawn or source/feature changes',async()=>{
    await run();m.live.mockRejectedValueOnce(new Error('withdrawn'));await expect(run()).rejects.toThrow('withdrawn');
    m.live.mockImplementation((id)=>Promise.resolve({...articles.find(a=>a.id===id),title:'Changed source'}));
    await expect(run()).rejects.toThrow('saved_source_changed');
    await expect(getScheduledNewsletterSummary(week,[articles[1],articles[0]],now,true)).rejects.toThrow('saved_source_changed');
    expect(m.transport).toHaveBeenCalledTimes(1);
  });
  it('preserves the no-paid context while allowing cached reads in that context',async()=>{
    await expect(withoutPaidAi(()=>run())).rejects.toThrow('separate_approval');expect(m.transport).not.toHaveBeenCalled();
    await run();expect((await withoutPaidAi(()=>run(false)))?.intro).toBe(intro);expect(m.transport).toHaveBeenCalledTimes(1);
  });
  it('rejects generic or malformed prose and policy resets',()=>{
    expect(()=>parseScheduledSummary(JSON.stringify({headline:'Seneste fra Apropos',intro}))).toThrow('invalid_output');
    expect(()=>parseScheduledSummary('not json')).toThrow('invalid_output');
    expect(()=>validateNewsletterAiPolicy({...policy(),resetsAutomatically:true})).toThrow('policy_unavailable');
  });
});
