import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
const m=vi.hoisted(()=>({draft:vi.fn(),claim:vi.fn(),finish:vi.fn(),send:vi.fn(),save:vi.fn()}));
vi.mock('@/lib/cron/cron-auth',()=>({requireCronBearer:()=>null}));
vi.mock('@/lib/newsletter/weekly-auto-settings',()=>({getWeeklyAutoSettings:async()=>({enabled:true,weekdayIso:5,hour:13,minute:45})}));
vi.mock('@/lib/newsletter/build-draft',()=>({buildWeeklyNewsletterDraft:m.draft}));
vi.mock('@/lib/newsletter/get-recipients',()=>({getNewsletterRecipients:async()=>({emails:['fixture@example.invalid']})}));
vi.mock('@/lib/newsletter/send-resend',()=>({sendNewsletterToMany:m.send}));
vi.mock('@/lib/newsletter/draft-cache',()=>({buildWeeklyDraftInputHash:()=> 'fixture-hash',saveWeeklyDraftCache:m.save}));
vi.mock('@/lib/newsletter/weekly-send-history',()=>({claimWeeklyAutoSend:m.claim,finishWeeklyAutoSend:m.finish}));
vi.mock('@/lib/newsletter/send-selection-history',()=>({getRecentNewsletterExclusionSets:async()=>({excludeFull:new Set(),excludeRelax:new Set()})}));
import { GET } from '@/app/api/cron/newsletter-weekly/route';
beforeEach(()=>{vi.clearAllMocks();vi.useFakeTimers();vi.setSystemTime(new Date('2026-10-30T12:45:00Z'));
  m.claim.mockResolvedValue({ok:true});m.finish.mockResolvedValue(undefined);
  m.draft.mockResolvedValue({week:{},subject:'Bøger og serier',headline:'Bøger og serier',intro:'Gemte AI-tekst',introSource:'ai',html:'<p>AI</p>',articles:[],warnings:[]});});
afterEach(()=>vi.useRealTimers());
it('prepares or reads a real dry-run without claiming/sending/saving a broadcast',async()=>{
  const r=await GET(new NextRequest('https://example.invalid/api/cron/newsletter-weekly?dryRun=1&withAi=1'));
  expect(r.status).toBe(200);expect((await r.json()).introSource).toBe('ai');
  expect(m.draft).toHaveBeenCalledWith(expect.objectContaining({scheduledAiMode:'prepare'}));
  expect(m.claim).not.toHaveBeenCalled();expect(m.send).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();
});
it('the normal cron fails visibly instead of sending an excerpt substitute if AI fails',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  m.draft.mockRejectedValue(new Error('newsletter_ai_provider_credit_exhausted'));
  const r=await GET(new NextRequest('https://example.invalid/api/cron/newsletter-weekly'));
  expect(r.status).toBe(500);expect(m.finish).toHaveBeenCalledWith('2026-W44',expect.objectContaining({status:'failed',error:'newsletter_ai_provider_credit_exhausted'}));
  expect(m.send).not.toHaveBeenCalled();expect(m.save).not.toHaveBeenCalled();vi.restoreAllMocks();
});
it('refuses a non-AI substitute even if a draft accidentally supplies one',async()=>{
  vi.spyOn(console,'error').mockImplementation(()=>{});
  m.draft.mockResolvedValue({introSource:'article_excerpts',intro:'A source-based substitute'});
  const r=await GET(new NextRequest('https://example.invalid/api/cron/newsletter-weekly'));
  expect(r.status).toBe(500);expect(m.send).not.toHaveBeenCalled();vi.restoreAllMocks();
});
