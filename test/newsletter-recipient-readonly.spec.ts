import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ forms: vi.fn(), cms: vi.fn(), filter: vi.fn(), remove: vi.fn(), native: vi.fn(), config: {} as Record<string, string> }));
vi.mock('@/lib/config/env', () => ({ env: m.config }));
vi.mock('@/lib/newsletter/webflow-forms', () => ({ fetchNewsletterEmails: m.forms }));
vi.mock('@/lib/newsletter/webflow-sources', () => ({ fetchNewsletterSignupEmails: m.cms }));
vi.mock('@/lib/newsletter/unsubscribe-store', () => ({ filterUnsubscribedFromList: m.filter, removeUnsubscribeRecordsForEmails: m.remove }));
vi.mock('@/lib/newsletter/native-audience', () => ({ readNativeNewsletterSignups: m.native }));
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { mergeSignups } from '@/lib/newsletter/signup-details';
beforeEach(() => { vi.clearAllMocks(); for (const key of Object.keys(m.config)) delete m.config[key]; m.native.mockResolvedValue({ enabled: false, signups: [] }); m.forms.mockResolvedValue({ emails: [' First@example.test ', 'first@example.test','stop@example.test'], subscribers: [{ email: 'first@example.test', signedUpAt: '2026-10-01T12:00:00Z' }] }); m.filter.mockResolvedValue(new Set(['stop@example.test'])); });
it('reads normalized unique subscribers without reviving or deleting any unsubscribe', async () => {
  const result = await getNewsletterRecipients();
  expect(result.emails).toEqual(['first@example.test']); expect(result.total).toBe(2); expect(result.unsubscribedCount).toBe(1);
  expect(result.subscribers).toContainEqual({ email: 'stop@example.test', signedUpAt: null, active: false });
  expect(m.remove).not.toHaveBeenCalled();
  await getNewsletterRecipients(); expect(m.remove).not.toHaveBeenCalled();
});
it('fails closed when unsubscribe status cannot be verified', async () => {
  m.filter.mockRejectedValue(Error('unavailable'));
  const result = await getNewsletterRecipients();
  expect(result.emails).toEqual([]); expect(result.verified).toBe(false); expect(result.error).toContain('Ingen modtagere');
  expect(result.subscribers?.every(row => row.active === null)).toBe(true); expect(m.remove).not.toHaveBeenCalled();
});
it('retains original signup dates, rejects invalid addresses and never guesses unknown dates', () => {
  expect(mergeSignups([{ email: ' A@b.test ', signedUpAt: '2026-10-01T12:00:00Z' }, { email: 'a@b.test', signedUpAt: '2026-10-10T12:00:00Z' }, { email: 'invalid', signedUpAt: 'today' }, { email: 'unknown@b.test', signedUpAt: null }]))
    .toEqual([{ email: 'a@b.test', signedUpAt: '2026-10-01T12:00:00.000Z' }, { email: 'unknown@b.test', signedUpAt: null }]);
});

it('unions authoritative native members before deduplication and applies the same suppression', async () => {
  m.forms.mockResolvedValue({ emails: ['first@example.test', 'stop@example.test'], complete: true });
  m.native.mockResolvedValue({ enabled: true, signups: [
    { email: 'native@example.test', signedUpAt: '2026-10-02T12:00:00.000Z' },
    { email: 'first@example.test', signedUpAt: '2026-09-01T12:00:00.000Z' },
    { email: 'stop@example.test', signedUpAt: '2026-09-01T12:00:00.000Z' }] });
  const result = await getNewsletterRecipients();
  expect(result.emails).toEqual(['first@example.test', 'native@example.test']);
  expect(result.total).toBe(3); expect(result.unsubscribedCount).toBe(1);
  expect(m.filter).toHaveBeenCalledWith(['first@example.test', 'stop@example.test', 'native@example.test']);
  expect(m.remove).not.toHaveBeenCalled();
});
it('never returns a partial audience when enabled native membership or Webflow reads fail', async () => {
  m.native.mockRejectedValue(Error('membership unavailable'));
  let result = await getNewsletterRecipients();
  expect(result.emails).toEqual([]); expect(result.verified).toBe(false); expect(m.remove).not.toHaveBeenCalled();
  m.native.mockResolvedValue({ enabled: true, signups: [{ email: 'native@example.test', signedUpAt: null }] });
  m.forms.mockResolvedValue({ emails: [], error: 'Webflow incomplete' });
  result = await getNewsletterRecipients();
  expect(result.emails).toEqual([]); expect(result.verified).toBe(false); expect(m.remove).not.toHaveBeenCalled();
});

it('enabled union rejects unproved capped/malformed/partial Webflow enumeration, without a completeness receipt', async () => {
  m.native.mockResolvedValue({ enabled: true, signups: [{ email: 'native@example.test', signedUpAt: null }] });
  for (const complete of [undefined, false]) {
    m.forms.mockResolvedValue({ emails: ['partial@example.test'], complete });
    const result = await getNewsletterRecipients();
    expect(result.emails).toEqual([]); expect(result.verified).toBe(false); expect(m.remove).not.toHaveBeenCalled();
  }
});

it('requires proven completion of a configured CMS source even when legacy fallback finds forms', async () => {
  m.config.WEBFLOW_NEWSLETTER_SIGNUPS_COLLECTION_ID = 'fixture-cms';
  m.cms.mockResolvedValue({ emails: [], complete: false, error: 'requested resource not found' });
  m.forms.mockResolvedValue({ emails: ['webflow@example.test'], complete: true });
  m.native.mockResolvedValue({ enabled: true, signups: [{ email: 'native@example.test', signedUpAt: null }] });
  const result = await getNewsletterRecipients();
  expect(result.emails).toEqual([]); expect(result.verified).toBe(false); expect(m.remove).not.toHaveBeenCalled();
  m.native.mockResolvedValue({ enabled: false, signups: [] });
  expect((await getNewsletterRecipients()).emails).toEqual(['webflow@example.test']);
});
