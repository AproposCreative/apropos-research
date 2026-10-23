import { beforeEach, expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ client: null as any }));
vi.mock('@/lib/accreditation/imap/client', () => ({ createImapClient: async () => mock.client }));
vi.mock('@/lib/accreditation/imap/config', () => ({ getMailboxSecrets: () => ({ password: 'fixture-secret' }), sanitizeImapError: () => 'sanitized' }));
import { appendLivSentCopy } from '@/lib/accreditation/imap/sent-copy';

beforeEach(() => {
  vi.unstubAllEnvs();
  mock.client = { list: vi.fn().mockResolvedValue([
    { path: 'Sent', name: 'Sent', specialUse: '\\Sent' },
    { path: 'Sent Messages', name: 'Sent Messages' },
  ]), append: vi.fn().mockResolvedValue({ uid: 1 }), logout: vi.fn() };
});

it('archives Liv mail only in the server folder selected by Apple Mail', async () => {
  const raw = Buffer.from('Message-ID: <fixture@example.test>\r\n\r\nBody');
  expect(await appendLivSentCopy(raw)).toMatchObject({ ok: true, mailboxPath: 'Sent Messages' });
  expect(mock.client.append).toHaveBeenCalledWith('Sent Messages', raw, ['\\Seen'], expect.any(Date));
});

it('does not fall back to the separate Sent folder when Apple Mail folder is absent', async () => {
  mock.client.list.mockResolvedValue([{ path: 'Sent', name: 'Sent', specialUse: '\\Sent' }]);
  expect(await appendLivSentCopy(Buffer.from('fixture'))).toMatchObject({ ok: false });
  expect(mock.client.append).not.toHaveBeenCalled();
});
