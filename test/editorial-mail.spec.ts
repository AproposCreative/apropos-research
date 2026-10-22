import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, read: vi.fn(), search: vi.fn(), smtp: vi.fn(), send: vi.fn(),writeDraft:vi.fn(),checkDraft:vi.fn(),cleanup:vi.fn() }));
vi.mock('@/lib/editorial-mail/draft-copy',async original=>({...await original<any>(),writeDraftCopy:mock.writeDraft,checkDraftCopy:mock.checkDraft,cleanupSentDraft:mock.cleanup}));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/editorial-mail/mailbox', async original => ({ ...await original<any>(), readMailboxMessage: mock.read, searchMailbox: mock.search }));
vi.mock('@/lib/editorial-mail/transport', () => ({ smtpConfig: mock.smtp, sendApprovedReply: mock.send, assertReplyRecipient: vi.fn() }));
vi.mock('@/lib/liv-inbox/settings-store', () => ({ getLivInboxSettings: async () => ({ guidelines: 'Skriv konkret.', signature: 'Liv Brandt' }) }));
import { readEditorialMail, searchEditorialMail, saveEditorialReply, getEditorialReply, previewEditorialReply, confirmEditorialReply,composeEditorialMail,syncEditorialDraft } from '@/lib/editorial-mail/service';
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
beforeEach(()=>{mock.writeDraft.mockImplementation(async(_:string,raw:Buffer,messageId:string,revision:number)=>({folder:'Drafts',uid:revision,uidValidity:'44',sha256:'c'.repeat(64),messageId,revision,checkedAt:new Date().toISOString()}));mock.checkDraft.mockResolvedValue({verified:true});mock.cleanup.mockResolvedValue({status:'removed',checkedAt:new Date().toISOString()});});
async function draft() { await readEditorialMail(owner, {}); return saveEditorialReply(owner, input); }
async function preview() { const d = await draft(); return previewEditorialReply(owner, { draftId: d.draftId }); }
const approve = (p: Awaited<ReturnType<typeof preview>>) => confirmEditorialReply(owner, { token: p.confirmation!.token, displayedHash: p.data.contentHash });

it('search/read and previews never send; source identity fixes sender and recipient', async () => {
  await searchEditorialMail(owner, {}); const p = await preview();
  expect(p.data.from).toBe('frederik@aproposmagazine.com'); expect(p.data.to).toBe(source.replyTo); expect(p.data.subject).toBe('Re: Pressehenvendelse');
  expect(p.data.bodyText).toBe(input.body); expect(p.data.body).toContain('Frederik Emil Kragh'); expect(p.data.cc).toEqual([]); expect(p.data.attachments).toEqual([]);
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
  for (const field of ['from', 'cc', 'bcc', 'attachments', 'uid']) await expect(saveEditorialReply(owner, { ...input, [field]: 'attacker@example.test' })).rejects.toThrow();
});
it.each([{ folder: 'sent' }, { replyBlocked: true }, { bodyTruncated: true }])('does not reply to blocked source %j', async patch => {
  mock.read.mockResolvedValue({ ...source, ...patch }); await readEditorialMail(owner, {}); await expect(saveEditorialReply(owner, input)).rejects.toThrow('mcp_mail_reply_blocked');
});
it('private draft replay is idempotent, conflicting replay and old revisions fail', async () => {
  const d = await draft(); expect((await saveEditorialReply(owner, input)).revision).toBe(1);
  await expect(saveEditorialReply(owner, { ...input, body: 'different' })).rejects.toThrow('mcp_mail_request_conflict');
  await expect(saveEditorialReply(owner, { ...input, requestId: 'other-request-001' })).rejects.toThrow('mcp_mail_revision_conflict');
  expect((await getEditorialReply(owner, { draftId: d.draftId })).bodyText).toBe(input.body);
  await expect(getEditorialReply({ ...owner, uid: 'other' }, { draftId: d.draftId })).rejects.toThrow('mcp_mail_reply_not_found');
});
it('consumes personal consent once even with simultaneous previews/clicks; SMTP receipt remains honest', async () => {
  const first = await preview(), second = await previewEditorialReply(owner, { draftId: first.data.draftId });
  await Promise.all([approve(first), approve(second), approve(first)]);
  expect(mock.send).toHaveBeenCalledTimes(1); expect(mock.send.mock.calls[0][0]).toMatchObject({ mailbox: 'frederik', to: source.replyTo, body: first.data.body, inReplyTo: source.messageId });
  const result = await getEditorialReply(owner, { draftId: first.data.draftId }); expect(result.status).toBe('accepted'); expect(result.receipt?.recipientDeliveryVerified).toBe(false);
  expect((await previewEditorialReply(owner, { draftId: first.data.draftId })).confirmation).toBeNull();
  await expect(saveEditorialReply(owner, { ...input, expectedRevision: 1, requestId: 'new-request-002' })).rejects.toThrow('mcp_mail_already_attempted');
});
it('a changed draft invalidates the old token and requires new exact approval', async () => {
  const old = await preview(); await saveEditorialReply(owner, { ...input, expectedRevision: 1, requestId: 'revision-two-001', body: 'Nyt svar' });
  await expect(approve(old)).rejects.toThrow('mcp_mail_reply_changed'); expect(mock.send).not.toHaveBeenCalled();
  const fresh = await previewEditorialReply(owner, { draftId: old.data.draftId }); await approve(fresh); expect(mock.send.mock.calls[0][0].body).toBe(fresh.data.body);
});
it('CC/BCC and recipient changes invalidate approval, preserve selection on edit, and never change sender',async()=>{
 const p=await preview();const next=await saveEditorialReply(owner,{...input,expectedRevision:1,requestId:'bcc-revision-002',to:'chosen@example.test',cc:['copy@example.test'],bcc:['private@example.test']});
 expect(next.from).toBe('frederik@aproposmagazine.com');expect(next.bcc).toEqual(['private@example.test']);await expect(approve(p)).rejects.toThrow('mcp_mail_reply_changed');
 const edited=await saveEditorialReply(owner,{...input,body:next.body,expectedRevision:2,requestId:'bcc-revision-003'});expect(edited.bcc).toEqual(next.bcc);expect(edited.to).toBe('chosen@example.test');expect(edited.body.match(/Frederik Emil Kragh/g)).toHaveLength(1);
 const fresh=await previewEditorialReply(owner,{draftId:next.draftId});await approve(fresh);expect(mock.send.mock.calls[0][0]).toMatchObject({to:'chosen@example.test',bcc:['private@example.test'],html:fresh.data.html});
});
it('keeps persisted SMTP acceptance when later archive/save fails',async()=>{
 const p=await preview();mock.send.mockImplementation(async(_:unknown,persist:(r:unknown)=>Promise<void>)=>{await persist({acceptedBySmtp:true,recipientDeliveryVerified:false,sentCopyArchived:false});throw Error('archive timeout');});
 expect((await approve(p)).status).toBe('accepted');await approve(p);expect(mock.send).toHaveBeenCalledOnce();
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
it('composes a new owner-only draft without fabricating a received mail or sending',async()=>{
 const args={mailbox:'frederik',compositionId:'93f8bd10-cc88-4002-a928-9d4476e4f4a1',to:'frederik@aproposmagazine.com',subject:'Test to own address',body:'Test',expectedRevision:0,requestId:'compose-fixture-001'};
 const d=await composeEditorialMail(owner,args);expect(d.source.kind).toBe('compose');expect(d.source.messageId).toBe('');expect(d.subject).toBe(args.subject);expect(d.body).toContain('Frederik Emil Kragh');expect((await composeEditorialMail(owner,args)).draftId).toBe(d.draftId);expect(mock.send).not.toHaveBeenCalled();await expect(composeEditorialMail({...owner,owner:false},args)).rejects.toThrow('owner_required');
});
it('draft sync preserves versions, invalidates stale approval after editing and cleans only after accepted send',async()=>{
 const d=await draft();await syncEditorialDraft(owner,{draftId:d.draftId,expectedRevision:d.revision,expectedHash:d.contentHash});
 const p=await previewEditorialReply(owner,{draftId:d.draftId});const next=await saveEditorialReply(owner,{...input,expectedRevision:1,requestId:'changed-export-002',body:'Changed'});expect(next.draftCopy?.revision).toBe(1);
 await expect(approve(p)).rejects.toThrow('reply_changed');expect((await previewEditorialReply(owner,{draftId:d.draftId})).confirmation).toBeNull();
 await syncEditorialDraft(owner,{draftId:d.draftId,expectedRevision:next.revision,expectedHash:next.contentHash});await approve(await previewEditorialReply(owner,{draftId:d.draftId}));expect(mock.cleanup).toHaveBeenCalledOnce();expect((await getEditorialReply(owner,{draftId:d.draftId})).draftCleanup?.status).toBe('removed');
});
it('external draft conflict blocks personal send without consuming it; uncertain export cannot reappend',async()=>{
 const d=await draft();mock.writeDraft.mockRejectedValueOnce(Error('mcp_mail_draft_sync_unconfirmed'));const args={draftId:d.draftId,expectedRevision:d.revision,expectedHash:d.contentHash};
 await expect(syncEditorialDraft(owner,args)).rejects.toThrow('sync_unconfirmed');expect((await previewEditorialReply(owner,{draftId:d.draftId})).confirmation).toBeNull();
 await syncEditorialDraft(owner,args);expect(mock.writeDraft.mock.calls[1][5]).toBe(false);
 const p=await previewEditorialReply(owner,{draftId:d.draftId});mock.checkDraft.mockRejectedValue(Error('mcp_mail_draft_conflict'));await expect(approve(p)).rejects.toThrow('draft_conflict');expect(mock.send).not.toHaveBeenCalled();
});
