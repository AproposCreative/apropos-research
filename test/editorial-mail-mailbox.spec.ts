import { beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ options: null as any, client: null as any, config: vi.fn() }));
vi.mock('imapflow', () => ({ ImapFlow: class { constructor(options: unknown) { mock.options = options; return mock.client; } } }));
vi.mock('@/lib/accreditation/imap/config', () => ({ getMailboxSecrets: mock.config }));
import { readMailboxMessage, searchMailbox } from '@/lib/editorial-mail/mailbox';
beforeEach(() => {
  vi.clearAllMocks(); mock.config.mockReturnValue({ user: 'frederik@aproposmagazine.com', password: 'FAKE-TEST-NOT-SECRET', host: 'imap.example.test', port: 993 });
  mock.client = { on: vi.fn(), connect: vi.fn(), logout: vi.fn(), close: vi.fn(), mailbox: { uidValidity: BigInt(99) },
    getMailboxLock: vi.fn().mockResolvedValue({ release: vi.fn() }), list: vi.fn().mockResolvedValue([{ path: 'Sendt', name: 'Sendt', specialUse: '\\Sent' }, {path:'Sent Messages',name:'Sent Messages'}]),
    search: vi.fn().mockResolvedValue([5, 8, 12]), fetch: vi.fn().mockImplementation(async function* () { yield { uid: 12, envelope: { from: [{ address: 'press@example.test' }], subject: 'Rockstar' }, flags: new Set(), size: 200 }; }),
    fetchOne: vi.fn().mockResolvedValueOnce({ size: 500 }).mockResolvedValueOnce({ source: Buffer.from('From: Press <press@example.test>\r\nTo: frederik@aproposmagazine.com\r\nReply-To: reply@example.test\r\nSubject: Hello\r\nMessage-ID: <123@example.test>\r\nContent-Type: text/html; charset=utf-8\r\n\r\n<p>Hello</p><script>steal()</script><img src="https://example.test/track"><p>World</p>') }) };
});
it('searches bounded metadata on EXAMINE/readOnly with TLS and no provider logs', async () => {
  const result = await searchMailbox({ mailbox: 'frederik', query: 'rockstar', limit: 1 });
  expect(mock.options).toMatchObject({ secure: true, logger: false, emitLogs: false }); expect(mock.client.getMailboxLock).toHaveBeenCalledWith('INBOX', { readOnly: true });
  expect(mock.client.fetch.mock.calls[0][0]).toEqual([12]); expect(mock.client.fetch.mock.calls[0][1].source).toBeUndefined();
  expect(result.nextBeforeUid).toBe(12); expect(result.messages[0].uidValidity).toBe('99'); expect(result.markedRead).toBe(false); expect(mock.client.logout).toHaveBeenCalledTimes(1);
});
it('searches actual Sent folder without reusing a Liv ingestion cursor', async () => {
  await searchMailbox({ mailbox: 'frederik', folder: 'sent' }); expect(mock.client.getMailboxLock).toHaveBeenCalledWith('Sent Messages', { readOnly: true });
});
it('does not produce an invalid UID range at pagination boundary', async () => {
  expect((await searchMailbox({ mailbox: 'frederik', beforeUid: 1 })).messages).toEqual([]); expect(mock.client.search).not.toHaveBeenCalled(); expect(mock.client.fetch).not.toHaveBeenCalled();
});
it('reads bounded source without Seen writes, strips active HTML and warns on Reply-To', async () => {
  const result = await readMailboxMessage({ mailbox: 'frederik', uid: 12, uidValidity: '99' });
  expect(result.body).toBe('Hello\nWorld'); expect(result.body).not.toMatch(/script|track|steal/); expect(result.replyToDiffers).toBe(true);
  expect(result.replyTo).toBe('reply@example.test'); expect(result.replyBlocked).toBe(false); expect(result.sourceHash).toHaveLength(64);
  expect(mock.client.fetchOne).toHaveBeenLastCalledWith(12, { source: { maxLength: 3000001 }, internalDate: true }, { uid: true });
});
it('stops at changed UIDVALIDITY before fetching a different mail', async () => {
  await expect(readMailboxMessage({ mailbox: 'frederik', uid: 12, uidValidity: '98' })).rejects.toThrow('mcp_mail_uid_validity_changed'); expect(mock.client.fetchOne).not.toHaveBeenCalled();
});
it('rejects oversized MIME without fetching the attachment body', async () => {
  mock.client.fetchOne.mockReset().mockResolvedValue({ size: 5000000 });
  await expect(readMailboxMessage({ mailbox: 'frederik', uid: 12, uidValidity: '99' })).rejects.toThrow('mcp_mail_message_too_large'); expect(mock.client.fetchOne).toHaveBeenCalledTimes(1);
});
it('sanitizes provider failures and rejects wrong mailbox credentials', async () => {
  mock.client.connect.mockRejectedValue(Error('LOGIN password FAKE-TEST-NOT-SECRET failed'));
  await expect(searchMailbox({ mailbox: 'frederik' })).rejects.toThrow(/^mcp_mail_connection_unavailable$/);
  mock.config.mockReturnValue({ user: 'liv@aproposmagazine.com' }); await expect(searchMailbox({ mailbox: 'frederik' })).rejects.toThrow('mcp_mail_identity_mismatch');
});
it.each(['Auto-Submitted: auto-replied\r\n', 'Reply-To: a@example.test, b@example.test\r\n', 'From: noreply@example.test\r\n'])('blocks automatic or ambiguous reply source %s', async header => {
  mock.client.fetchOne.mockReset().mockResolvedValueOnce({ size: 300 }).mockResolvedValueOnce({ source: Buffer.from((header.startsWith('From:') ? '' : 'From: press@example.test\r\n') + header + 'Subject: Example\r\n\r\nBody') });
  expect((await readMailboxMessage({ mailbox: 'frederik', uid: 12, uidValidity: '99' })).replyBlocked).toBe(true);
});
