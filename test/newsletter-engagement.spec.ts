import { beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { memoryFirestore } from './support/memory-firestore';
const m = vi.hoisted(() => ({ db: null as any, verify: vi.fn(), ga4: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => m.db }));
vi.mock('@/lib/config/env', () => ({ env: { RESEND_WEBHOOK_SECRET: 'fixture-only' } }));
vi.mock('svix', () => ({ Webhook: class { verify = m.verify; } }));
vi.mock('@/lib/accreditation/inbound-handler', () => ({ isAccreditationTaggedEvent: () => false, handleAccreditationResendEvent: async () => ({ handled: false }) }));
vi.mock('@/lib/newsletter/ga4-measurement', () => ({ ga4ClientIdFromEmail: () => 'anonymous', sendGa4MeasurementEvent: m.ga4 }));
import { newsletterMessage, newsletterTags, recordNewsletterEvent, recordNewsletterProviderSnapshot } from '@/lib/newsletter/engagement';
import { safeNewsletterClick } from '@/lib/newsletter/analytics-link';
import { POST } from '@/app/api/webhooks/resend/route';
const input = { email_id: 'provider-1', to: ['person@example.test'], subject: 'Ugens kultur', created_at: '2026-10-30T12:00:00Z', tags: { channel: 'newsletter', campaign: 'weekly-44', send_type: 'weekly_auto' } };
let rows: Map<string,any>;
beforeEach(() => { vi.clearAllMocks(); const store = memoryFirestore();m.db=store.db;rows=store.rows;m.ga4.mockResolvedValue(true); });
it('accepts explicit newsletter tags only and never assigns shared opens to individuals', () => {
  expect(newsletterTags([{name:'channel',value:'newsletter'}])).toEqual({channel:'newsletter'});
  expect(newsletterMessage({ id:'p', to:input.to, subject:input.subject, createdAt:input.created_at, tags:input.tags })?.recipient).toBe('person@example.test');
  expect(newsletterMessage({ id:'p', to:input.to, subject:input.subject, createdAt:input.created_at, tags:{category:'auth'} })).toBeNull();
  expect(newsletterMessage({ id:'p', to:['a@example.test','b@example.test'], subject:'x',createdAt:input.created_at,tags:input.tags })).toBeNull();
});
it('deduplicates event IDs and preserves independent out-of-order stages with their actual timestamps', async () => {
  expect(await recordNewsletterEvent('event1','email.clicked','2026-10-30T12:03:00Z',{...input,click:{ipAddress:'private',link:'https://example.test/private?token=secret',userAgent:'private'}})).toBe(true);
  expect(await recordNewsletterEvent('event1','email.clicked','2026-10-30T12:03:00Z',input)).toBe(false);
  await recordNewsletterEvent('event2','email.delivered','2026-10-30T12:00:01Z',input);
  await recordNewsletterEvent('event3','email.opened','2026-10-30T12:01:00Z',input);
  const row = rows.get('newsletterAnalyticsMessages/provider-1');
  expect(row.signals.clicked.at).toBe('2026-10-30T12:03:00.000Z'); expect(row.signals.opened.at).toBe('2026-10-30T12:01:00.000Z');
  expect(row.sentAt).toBe('2026-10-30T12:00:00.000Z'); expect(JSON.stringify([...rows.values()])).not.toMatch(/ipAddress|userAgent|private\?token|secret/);
});
it('imports only the provider last-event proof, without inventing event time, delivery or an open from a click', async () => {
  await recordNewsletterProviderSnapshot({id:'provider-1',to:input.to,subject:input.subject,created_at:input.created_at,tags:input.tags,last_event:'clicked',html:'PRIVATE BODY'});
  const row=rows.get('newsletterAnalyticsMessages/provider-1');
  expect(row.signals).toEqual({clicked:{at:null,source:'provider_snapshot'}}); expect(JSON.stringify(row)).not.toContain('PRIVATE BODY');
  await recordNewsletterEvent('open1','email.opened','2026-10-30T12:05:00Z',input);
  expect(rows.get('newsletterAnalyticsMessages/provider-1').signals.opened.at).toBe('2026-10-30T12:05:00.000Z');
});
it('stores nothing before a webhook signature has been verified', async () => {
  m.verify.mockImplementation(()=>{throw Error('invalid');});
  const response=await POST(new NextRequest('https://example.test/api/webhooks/resend',{method:'POST',headers:{'svix-id':'event1','svix-timestamp':'1','svix-signature':'bad'},body:'{}'}));
  expect(response.status).toBe(400);expect(rows.size).toBe(0);expect(m.ga4).not.toHaveBeenCalled();
});
it('retains an authenticated event, but requests delivery retry when durable storage is down', async () => {
  m.verify.mockReturnValue({type:'email.opened',created_at:'2026-10-30T12:05:00Z',data:input});
  const request=()=>new NextRequest('https://example.test/api/webhooks/resend',{method:'POST',headers:{'svix-id':'event1','svix-timestamp':'1','svix-signature':'fixture'},body:'{}'});
  expect((await POST(request())).status).toBe(200);expect(rows.has('newsletterAnalyticsMessages/provider-1')).toBe(true);
  m.db=null;expect((await POST(request())).status).toBe(503);
});
it('redacts unsubscribe tokens, personal query data and unsafe UTM values before GA4 forwarding', () => {
  expect(safeNewsletterClick('https://ai.aproposmagazine.com/api/newsletter/unsubscribe?token=secret&email=a@example.test')).toEqual({click_host:'ai.aproposmagazine.com',click_type:'other'});
  const clean=safeNewsletterClick('https://www.aproposmagazine.com/articles/bog?utm_campaign=weekly-44&utm_source=newsletter&email=a@example.test&token=secret#private');
  expect(clean.link).toBe('https://www.aproposmagazine.com/articles/bog?utm_source=newsletter&utm_campaign=weekly-44');expect(JSON.stringify(clean)).not.toMatch(/secret|@|private/);
});
