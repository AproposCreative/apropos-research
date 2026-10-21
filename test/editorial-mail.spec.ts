import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, read: vi.fn(), search: vi.fn(), smtp: vi.fn(), send: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/editorial-mail/mailbox', async original => ({ ...await original<any>(), readMailboxMessage: mock.read, searchMailbox: mock.search }));
vi.mock('@/lib/editorial-mail/transport', () => ({ smtpConfig: mock.smtp, sendApprovedReply: mock.send, assertReplyRecipient: vi.fn() }));
vi.mock('@/lib/liv-inbox/settings-store', () => ({ getLivInboxSettings: async () => ({ guidelines: 'Skriv konkret.', signature: 'Liv Brandt' }) }));
import { readEditorialMail, searchEditorialMail, saveEditorialReply, getEditorialReply, previewEditorialReply, confirmEditorialReply } from '@/lib/editorial-mail/service';
import { type McpIdentity, digest } from '@/lib/mcp/oauth';
import type { MailMessage } from '@/lib/editorial-mail/mailbox';
const owner: McpIdentity = { uid: 'owner', owner: true, role: 'admin', grantId: 'grant', scopes: ['apropos:read', 'apropos:draft', 'apropos:publish'] };
const source: MailMessage = { id: 'a'.repeat(64), sourceHash: 'b'.repeat(64), mailbox: 'frederik', folder: 'inbox', uid: 15, uidValidity: '122',
  from: 'press@example.test', fromName: 'Press', replyTo: 'press@example.test', replyToDiffers: false, to: ['frederik@aproposmagazine.com'], cc: [],
  subject: 'Pressehenvendelse', body: 'Har I lyst til mere materiale?', messageId: '<fixture@example.test>', references: [], receivedAt: '2026-10-21T09:00:00Z', attachments: [], replyBlocked: false, bodyTruncated: false };
const input = { messageId: source.id, expectedSourceHash: source.sourceHash, expectedRevision: 0, body: 'Tak for din mail. Send gerne mere materiale.\n\nFrederik', requestId: 'test-mail-reply-001' };
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => { vi.clearAllMocks(); memory = memoryFirestore(); mock.db = memory.db; mock.read.mockResolvedValue(structuredClone(source)); mock.search.mockResolvedValue({ messages: [] });
  mock.smtp.mockReturnValue({}); mock.send.mockResolvedValue({ status: 'accepted', messageId: '<sent@example.test>', acceptedBySmtp: true, recipientDeliveryVerified: false, sentCopyArchived: true, acceptedAt: new Date().toISOString() }); });
async function draft() { await readEditorialMail(owner, {}); return saveEditorialReply(owner, input); }
async function preview() { const d = await draft(); return previewEditorialReply(owner, { draftId: d.draftId }); }
const approve = (p: Awaited<ReturnType<typeof preview>>) => confirmEditorialReply(owner, { token: p.confirmation!.token, displayedHash: p.data.contentHash });

it('search/read and previews never send; source identity fixes sender and recipient', async () => {
  await searchEditorialMail(owner, {}); const p = await preview();
  expect(p.data.from).toBe('frederik@aproposmagazine.com'); expect(p.data.to).toBe(source.replyTo); expect(p.data.subject).toBe('Re: Pressehenvendelse');
  expect(p.data.body).toBe(input.body); expect(p.data.cc).toEqual([]); expect(p.data.attachments).toEqual([]);
  expect(p.confirmation!.token).toHaveLength(43); expect(JSON.stringify(p.data)).not.toContain(p.confirmation!.token); expect(mock.send).not.toHaveBeenCalled();
});
it('owner-only even if a colleague is admin and has all scopes', async () => {
  const colleague = { ...owner, uid: 'colleague', owner: false };
  for (const fn of [searchEditorialMail, readEditorialMail, saveEditorialReply, getEditorialReply, previewEditorialReply, confirmEditorialReply])
    await expect(fn(colleague, {})).rejects.toThrow('mcp_mail_owner_required');
  expect(mock.read).not.toHaveBeenCalled(); expect(mock.send).not.toHaveBeenCalled();
});
it('requires initial source read, exact source hash, and prohibits arbitrary recipients/attachments', async () => {
  await expect(saveEditorialReply(owner, input)).rejects.toThrow('mcp_mail_read_source_first'); await readEditorialMail(owner, {});
  await expect(saveEditorialReply(owner, { ...input, expectedSourceHash: 'e'.repeat(64) })).rejects.toThrow('mcp_mail_source_changed');
  for (const field of ['to', 'from', 'cc', 'attachments', 'uid']) await expect(saveEditorialReply(owner, { ...input, [field]: 'attacker@example.test' })).rejects.toThrow();
});
it.each([{ folder: 'sent' }, { replyBlocked: true }, { bodyTruncated: true }])('does not reply to blocked source %j', async patch => {
  mock.read.mockResolvedValue({ ...source, ...patch }); await readEditorialMail(owner, {}); await expect(saveEditorialReply(owner, input)).rejects.toThrow('mcp_mail_reply_blocked');
});
it('private draft replay is idempotent, conflicting replay and old revisions fail', async () => {
  const d = await draft(); expect((await saveEditorialReply(owner, input)).revision).toBe(1);
  await expect(saveEditorialReply(owner, { ...input, body: 'different' })).rejects.toThrow('mcp_mail_request_conflict');
  await expect(saveEditorialReply(owner, { ...input, requestId: 'other-request-001' })).rejects.toThrow('mcp_mail_revision_conflict');
  expect((await getEditorialReply(owner, { draftId: d.draftId })).body).toBe(input.body);
  await expect(getEditorialReply({ ...owner, uid: 'other' }, { draftId: d.draftId })).rejects.toThrow('mcp_mail_reply_not_found');
});
it('consumes personal consent once even with simultaneous previews/clicks; SMTP receipt remains honest', async () => {
  const first = await preview(), second = await previewEditorialReply(owner, { draftId: first.data.draftId });
  await Promise.all([approve(first), approve(second), approve(first)]);
  expect(mock.send).toHaveBeenCalledTimes(1); expect(mock.send.mock.calls[0][0]).toMatchObject({ mailbox: 'frederik', to: source.replyTo, body: input.body, inReplyTo: source.messageId });
  const result = await getEditorialReply(owner, { draftId: first.data.draftId }); expect(result.status).toBe('accepted'); expect(result.receipt?.recipientDeliveryVerified).toBe(false);
  expect((await previewEditorialReply(owner, { draftId: first.data.draftId })).confirmation).toBeNull();
  await expect(saveEditorialReply(owner, { ...input, expectedRevision: 1, requestId: 'new-request-002' })).rejects.toThrow('mcp_mail_already_attempted');
});
it('a changed draft invalidates the old token and requires new exact approval', async () => {
  const old = await preview(); await saveEditorialReply(owner, { ...input, expectedRevision: 1, requestId: 'revision-two-001', body: 'Nyt svar' });
  await expect(approve(old)).rejects.toThrow('mcp_mail_reply_changed'); expect(mock.send).not.toHaveBeenCalled();
  const fresh = await previewEditorialReply(owner, { draftId: old.data.draftId }); await approve(fresh); expect(mock.send.mock.calls[0][0].body).toBe('Nyt svar');
});
it('cannot replay consent from another owner, connection, hash or missing scopes', async () => {
  const p = await preview(), args = { token: p.confirmation!.token, displayedHash: p.data.contentHash };
  for (const identity of [{ ...owner, uid: 'other' }, { ...owner, grantId: 'other' }, { ...owner, scopes: ['apropos:read', 'apropos:draft'] }, { ...owner, scopes: ['apropos:read', 'apropos:publish'] }])
    await expect(confirmEditorialReply(identity, args)).rejects.toThrow();
  await expect(confirmEditorialReply(owner, { ...args, displayedHash: 'f'.repeat(64) })).rejects.toThrow('mcp_mail_confirmation_required');
  await expect(confirmEditorialReply(owner, { ...args, token: 'z'.repeat(43) })).rejects.toThrow('mcp_mail_confirmation_required'); expect(mock.send).not.toHaveBeenCalled();
});
it('expiry and missing SMTP configuration fail before attempted state', async () => {
  const p = await preview(); const key = `editorialMailConfirmations/${digest(p.confirmation!.token)}`;
  memory.rows.get(key).expiresAt = Date.now() - 1; await expect(approve(p)).rejects.toThrow('mcp_mail_confirmation_expired');
  const fresh = await previewEditorialReply(owner, { draftId: p.data.draftId }); mock.smtp.mockImplementation(() => { throw Error('mcp_mail_sending_disabled'); });
  await expect(approve(fresh)).rejects.toThrow('mcp_mail_sending_disabled');
  expect((await getEditorialReply(owner, { draftId: p.data.draftId })).status).toBe('draft');
  const blocked = await previewEditorialReply(owner, { draftId: p.data.draftId }); expect(blocked.confirmation).toBeNull(); expect(blocked.data.blocker).toBe('mcp_mail_sending_disabled'); expect(mock.send).not.toHaveBeenCalled();
});
it('an updated cached source blocks an old approval', async () => {
  const p = await preview(); mock.read.mockResolvedValue({ ...source, sourceHash: 'c'.repeat(64) }); await readEditorialMail(owner, {});
  await expect(approve(p)).rejects.toThrow('mcp_mail_source_changed'); expect(mock.send).not.toHaveBeenCalled();
});
it('SMTP timeout has uncertain result and NEVER retries through any replay/token', async () => {
  const p = await preview(), p2 = await previewEditorialReply(owner, { draftId: p.data.draftId }); mock.send.mockRejectedValue(Error('ETIMEDOUT with sensitive provider detail'));
  expect((await approve(p)).status).toBe('unconfirmed'); expect((await approve(p2)).status).toBe('unconfirmed'); expect((await approve(p)).status).toBe('unconfirmed');
  expect(mock.send).toHaveBeenCalledTimes(1); expect(JSON.stringify(await getEditorialReply(owner, { draftId: p.data.draftId }))).not.toContain('sensitive');
});
it('keeps Frederik and Liv identities separate even for the same RFC message-id', async () => {
  const d = await draft(); mock.read.mockResolvedValue({ ...source, mailbox: 'liv', id: 'c'.repeat(64) }); await readEditorialMail(owner, {});
  const liv = await saveEditorialReply(owner, { ...input, messageId: 'c'.repeat(64) }); expect(liv.draftId).not.toBe(d.draftId); expect(liv.from).toBe('liv@aproposmagazine.com');
});
