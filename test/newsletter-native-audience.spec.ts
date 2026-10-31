import { expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { nativeNewsletterDatabase, nativeNewsletterSignup, readNativeNewsletterAudience } from '@/lib/newsletter/native-audience';
const binding = { projectID: 'apropos-fixture-only', appID: '1:123456789012:ios:aabbccddeeff' };
const flags = { READER_NEWSLETTER_ENABLED: 'true', READER_NEWSLETTER_AUDIENCE_REVIEWED: 'true',
  READER_NEWSLETTER_SUPPRESSION_REVIEWED: 'true', READER_NEWSLETTER_SOURCE_KIND: 'research',
  READER_NEWSLETTER_APP_ID: binding.appID, READER_NEWSLETTER_AUDIENCE_PROJECT_ID: binding.projectID,
  READER_NEWSLETTER_SUPPRESSION_PROJECT_ID: binding.projectID };
const row = { schemaVersion: 1, email: 'reader@example.test', source: 'ios-onboarding',
  consentVersion: 'apropos-newsletter-v1', requestID: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', subscribedAtMs: 1793300000000 };
const id = createHash('sha256').update(row.email).digest('hex');
const db = (docs = [{ id, data: () => row }]) => ({ projectId: binding.projectID,
  collection: (name: string) => { expect(name).toBe('reader_newsletter_subscribers');
    return { limit: (count: number) => { expect(count).toBe(10001); return { get: async () => ({ docs }) }; } }; } });
it('validates actual SDK database identity before querying, including unavailable getters', async () => {
  let queries = 0;
  const collection = () => { queries++; return db().collection('reader_newsletter_subscribers'); };
  expect(nativeNewsletterDatabase(null)).toBe(null);
  for (const value of [undefined, 123, null]) {
    expect(() => nativeNewsletterDatabase({ projectId: value, collection } as Parameters<typeof nativeNewsletterDatabase>[0])).toThrow('unavailable');
  }
  const notReady = { collection, get projectId(): string { throw Error('SDK not ready'); } };
  expect(() => nativeNewsletterDatabase(notReady)).toThrow('unavailable');
  await expect(readNativeNewsletterAudience(flags, binding,
    () => nativeNewsletterDatabase({ projectId: 'wrong-project', collection } as Parameters<typeof nativeNewsletterDatabase>[0]))).rejects.toThrow('unavailable');
  expect(queries).toBe(0);
  const selected = { collection, get projectId() { return binding.projectID; } };
  expect(await readNativeNewsletterAudience(flags, binding, () => nativeNewsletterDatabase(selected))).toEqual({ enabled: true,
    signups: [{ email: row.email, signedUpAt: new Date(row.subscribedAtMs).toISOString() }] });
  expect(queries).toBe(1);
});
it('stays off without initializing Admin and rejects incomplete/mismatched enabled bindings', async () => {
  const forbidden = () => { throw Error('must not construct Admin'); };
  expect(await readNativeNewsletterAudience({}, null, forbidden)).toEqual({ enabled: false, signups: [] });
  await expect(readNativeNewsletterAudience(flags, null, forbidden)).rejects.toThrow('unavailable');
  for (const key of Object.keys(flags)) {
    if (key === 'READER_NEWSLETTER_ENABLED') continue;
    await expect(readNativeNewsletterAudience({ ...flags, [key]: 'mismatch' }, binding, forbidden)).rejects.toThrow('unavailable');
  }
  await expect(readNativeNewsletterAudience(flags, binding, () => ({ ...db(), projectId: 'wrong-project' }))).rejects.toThrow('unavailable');
});
it('accepts only canonical persisted membership and fails closed on invalid/overflow/failed reads', async () => {
  expect(await readNativeNewsletterAudience(flags, binding, db)).toEqual({ enabled: true,
    signups: [{ email: row.email, signedUpAt: new Date(row.subscribedAtMs).toISOString() }] });
  for (const value of [{ ...row, schemaVersion: 2 }, { ...row, email: 'Reader@example.test' },
    { ...row, source: 'webflow' }, { ...row, consentVersion: 'other' }, { ...row, requestID: 'invalid' },
    { ...row, subscribedAtMs: 0 }, { ...row, uid: 'must-not-be-stored' }]) {
    expect(() => nativeNewsletterSignup(id, value)).toThrow('unavailable');
  }
  expect(() => nativeNewsletterSignup('0'.repeat(64), row)).toThrow('unavailable');
  await expect(readNativeNewsletterAudience(flags, binding, () => db(Array(10001).fill({ id, data: () => row })))).rejects.toThrow('unavailable');
  await expect(readNativeNewsletterAudience(flags, binding, () => { throw Error('offline'); })).rejects.toThrow('unavailable');
});
