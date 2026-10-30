import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ forms: vi.fn(), cms: vi.fn(), filter: vi.fn(), remove: vi.fn() }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/newsletter/webflow-forms', () => ({ fetchNewsletterEmails: m.forms }));
vi.mock('@/lib/newsletter/webflow-sources', () => ({ fetchNewsletterSignupEmails: m.cms }));
vi.mock('@/lib/newsletter/unsubscribe-store', () => ({ filterUnsubscribedFromList: m.filter, removeUnsubscribeRecordsForEmails: m.remove }));
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { mergeSignups } from '@/lib/newsletter/signup-details';
beforeEach(() => { vi.clearAllMocks(); m.forms.mockResolvedValue({ emails: [' First@example.test ', 'first@example.test','stop@example.test'], subscribers: [{ email: 'first@example.test', signedUpAt: '2026-10-01T12:00:00Z' }] }); m.filter.mockResolvedValue(new Set(['stop@example.test'])); });
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
