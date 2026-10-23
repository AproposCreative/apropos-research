import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mock = vi.hoisted(() => ({ send: vi.fn(), create: vi.fn(), close: vi.fn(), build: vi.fn(), compose: vi.fn(), archive: vi.fn() }));
vi.mock('nodemailer', () => ({ default: { createTransport: mock.create } }));
vi.mock('nodemailer/lib/mail-composer', () => ({ default: class { constructor(options: unknown) { mock.compose(options); } compile() { return { build: mock.build }; } } }));
vi.mock('@/lib/editorial-mail/imap', async original => ({ ...await original<any>(), archiveExactMessage: mock.archive }));
import { sendApprovedReply, smtpConfig, assertReplyRecipient } from '@/lib/editorial-mail/transport';
const reply = { mailbox: 'frederik' as const, to: 'press@example.test', body: 'Exact text', subject: 'Re: Example', messageId: '<id@aproposmagazine.com>', inReplyTo: '<original@example.test>', references: ['<older@example.test>'] };
beforeEach(() => {
  vi.clearAllMocks(); for (const key of ['EDITORIAL_MAIL_SENDING_ENABLED', 'EDITORIAL_MAIL_TEST_REDIRECT_TO', 'LIV_INBOX_TEST_REDIRECT_TO', 'ACCREDITATION_TEST_REDIRECT_TO', 'FREDERIK_SMTP_USER', 'FREDERIK_SMTP_PASSWORD', 'LIV_INBOX_OUTBOUND_ALLOWLIST', 'ACCREDITATION_OUTBOUND_ALLOWLIST', 'LIV_INBOX_ALLOWED_DOMAINS', 'LIV_INBOX_ALLOW_ALL_RECIPIENTS']) vi.stubEnv(key, '');
  vi.stubEnv('FREDERIK_IMAP_USER', 'frederik@aproposmagazine.com'); vi.stubEnv('FREDERIK_IMAP_PASSWORD', 'TEST-ONLY-PASSWORD');
  vi.stubEnv('LIV_IMAP_PASSWORD', 'TEST-ONLY-LIV'); vi.stubEnv('LIV_INBOX_SENDING_ENABLED', 'true');
  mock.create.mockReturnValue({ sendMail: mock.send, close: mock.close }); mock.send.mockResolvedValue({ accepted: ['press@example.test'], rejected: [] }); mock.build.mockResolvedValue(Buffer.from('fake MIME'));
  mock.archive.mockResolvedValue({ status: 'verified', folder: 'Sent Messages', uid: 123 });
});
afterEach(() => vi.unstubAllEnvs());
it('uses selected account, TLS and fixed reply threading, no HTML/files/URL loading', async () => {
  const receipt = await sendApprovedReply(reply); expect(mock.create.mock.calls[0][0]).toMatchObject({ secure: true, logger: false, debug: false, auth: { user: 'frederik@aproposmagazine.com', pass: 'TEST-ONLY-PASSWORD' } });
  expect(mock.compose).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ from: { name: 'Frederik Kragh', address: 'frederik@aproposmagazine.com' }, to: reply.to, text: reply.body, messageId: reply.messageId, inReplyTo: reply.inReplyTo, newline:'windows',disableFileAccess: true, disableUrlAccess: true }));
  expect(mock.send).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({raw: Buffer.from('fake MIME'), envelope: { from: 'frederik@aproposmagazine.com', to: [reply.to] }}));
  expect(mock.archive).toHaveBeenCalledWith('frederik', mock.send.mock.calls[0][0].raw, reply.messageId, expect.any(String)); expect(receipt.sentCopyArchived).toBe(true); expect(receipt.recipientDeliveryVerified).toBe(false);
});
it('archive failure never retries SMTP or discards accepted receipt', async () => {
  mock.archive.mockResolvedValue({status:'unconfirmed',error:'mcp_mail_imap_unavailable'}); const receipt = await sendApprovedReply(reply);
  expect(receipt.acceptedBySmtp).toBe(true); expect(receipt.sentCopyArchived).toBe(false); expect(mock.send).toHaveBeenCalledTimes(1);
});
it('SMTP failure never retries and transport is closed', async () => {
  mock.send.mockRejectedValue(Error('timeout')); await expect(sendApprovedReply(reply)).rejects.toThrow('timeout'); expect(mock.send).toHaveBeenCalledTimes(1); expect(mock.archive).not.toHaveBeenCalled(); expect(mock.close).toHaveBeenCalledTimes(1);
});
it('BCC is envelope only; acceptance is persisted before IMAP', async () => {
  mock.send.mockResolvedValue({accepted:[reply.to,'private@example.test'],rejected:[]});
  const persist=vi.fn().mockImplementation(async()=>{expect(mock.archive).not.toHaveBeenCalled();});
  const r=await sendApprovedReply({...reply,bcc:['private@example.test']},persist);
  expect(mock.compose.mock.calls[0][0]).not.toHaveProperty('bcc');
  expect(mock.send.mock.calls[0][0].envelope.to).toEqual([reply.to,'private@example.test']); expect(persist).toHaveBeenCalledOnce(); expect(r.bcc).toEqual(['private@example.test']);
});
it('preserves all sending stops, never silently redirects and rejects wrong sender', () => {
  vi.stubEnv('LIV_INBOX_SENDING_ENABLED', 'false'); expect(() => smtpConfig('liv')).toThrow('mcp_mail_sending_disabled');
  vi.stubEnv('EDITORIAL_MAIL_SENDING_ENABLED', 'false'); expect(() => smtpConfig('frederik')).toThrow('mcp_mail_sending_disabled'); vi.stubEnv('EDITORIAL_MAIL_SENDING_ENABLED', '');
  vi.stubEnv('EDITORIAL_MAIL_TEST_REDIRECT_TO', 'test@example.test'); expect(() => smtpConfig('frederik')).toThrow('mcp_mail_test_redirect_active'); vi.stubEnv('EDITORIAL_MAIL_TEST_REDIRECT_TO', '');
  vi.stubEnv('FREDERIK_SMTP_USER', 'wrong@example.test'); expect(() => smtpConfig('frederik')).toThrow('mcp_mail_identity_mismatch');
});
it('respects effective Liv routing without changing separate accreditation policy or Frederik identity', () => {
  vi.stubEnv('ACCREDITATION_TEST_REDIRECT_TO', 'test@example.test');
  expect(smtpConfig('frederik').auth.user).toBe('frederik@aproposmagazine.com');
  expect(() => smtpConfig('liv')).toThrow('mcp_mail_test_redirect_active');
  vi.stubEnv('LIV_INBOX_ALLOW_ALL_RECIPIENTS', 'true'); expect(() => smtpConfig('liv')).not.toThrow(); expect(() => assertReplyRecipient('liv','press@example.test')).not.toThrow();
  vi.stubEnv('LIV_INBOX_TEST_REDIRECT_TO', 'own-test@example.test'); expect(() => smtpConfig('liv')).toThrow('mcp_mail_test_redirect_active');
  vi.stubEnv('LIV_INBOX_TEST_REDIRECT_TO', ''); vi.stubEnv('LIV_INBOX_ALLOW_ALL_RECIPIENTS', ''); vi.stubEnv('ACCREDITATION_TEST_REDIRECT_TO', 'off');
  expect(() => assertReplyRecipient('liv','press@example.test')).toThrow('mcp_mail_recipient_blocked');
  vi.stubEnv('LIV_INBOX_OUTBOUND_ALLOWLIST', 'press@example.test'); expect(() => assertReplyRecipient('liv','press@example.test')).not.toThrow();
});
