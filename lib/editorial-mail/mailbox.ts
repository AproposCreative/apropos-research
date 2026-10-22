import { z } from 'zod';
import { simpleParser } from 'mailparser';
import { load } from 'cheerio';
import { ImapFlow, type SearchObject } from 'imapflow';
import { getMailboxSecrets, type MailboxId } from '@/lib/accreditation/imap/config';
import { resolveMailFolder } from './imap';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';

export const mailboxId = z.enum(['frederik', 'liv']);
export const folderId = z.enum(['inbox', 'sent']);
export const mailSearchInput = z.object({ mailbox: mailboxId, folder: folderId.default('inbox'),
  query: z.string().trim().max(160).default(''), beforeUid: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(20).default(10) }).strict();
export const mailReadInput = z.object({ mailbox: mailboxId, folder: folderId.default('inbox'),
  uid: z.number().int().positive(), uidValidity: z.string().regex(/^\d{1,24}$/) }).strict();
export type MailLocator = z.infer<typeof mailReadInput>;
export type MailMessage = MailLocator & { id: string; sourceHash: string; from: string; fromName: string;
  kind?: 'compose';
  replyTo: string; replyToDiffers: boolean; to: string[]; cc: string[]; subject: string; body: string;
  messageId: string; references: string[]; receivedAt: string; attachments: { name: string; type: string; bytes: number }[];
  replyBlocked: boolean; bodyTruncated: boolean };
export const mailboxAddress = (id: MailboxId) => `${id}@aproposmagazine.com`;
export const mailboxName = (id: MailboxId) => id === 'frederik' ? 'Frederik Kragh' : 'Liv Brandt';
const cleanHeader = (s: string) => s.replace(/[\r\n\x00]/g, ' ').slice(0, 500);
const address = (s: string) => z.string().email().max(254).safeParse(s).success ? s.toLowerCase() : '';

/** Separate read-only connections: never use Liv's ingestion cursor or processors. */
export async function withMailFolder<T>(mailbox: MailboxId, folder: 'inbox' | 'sent', run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const config = getMailboxSecrets(mailbox);
  if (config.user.toLowerCase() !== mailboxAddress(mailbox)) throw Error('mcp_mail_identity_mismatch');
  const client = new ImapFlow({ host: config.host, port: config.port, secure: true,
    auth: { user: config.user, pass: config.password }, logger: false, emitLogs: false,
    connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 25000 });
  client.on('error', () => { /* Pending operations fail safely; never log provider/auth data. */ });
  try {
    await client.connect();
    const path = folder === 'inbox' ? 'INBOX' : resolveMailFolder(mailbox, 'sent', await client.list());
    if (!path) throw Error('mcp_mail_folder_missing');
    const lock = await client.getMailboxLock(path, { readOnly: true });
    try { return await run(client); } finally { lock.release(); }
  } catch (e) {
    if (e instanceof Error && /^mcp_mail_[a-z_]+$/.test(e.message)) throw e;
    // Do not return provider errors, credentials, raw MIME or server auth blobs.
    throw Error('mcp_mail_connection_unavailable');
  } finally { try { await client.logout(); } catch { client.close(); } }
}

export async function searchMailbox(raw: unknown) {
  const input = mailSearchInput.parse(raw);
  return withMailFolder(input.mailbox, input.folder, async client => {
    const query: SearchObject = { deleted: false, ...(input.query ? { or: [{ from: input.query }, { subject: input.query }, { to: input.query }] } : { all: true }),
      ...(input.beforeUid ? { uid: `1:${input.beforeUid - 1}` } : {}) };
    const found = input.beforeUid === 1 ? [] : await client.search(query, { uid: true });
    const uids = (found || []).sort((a, b) => b - a), selected = uids.slice(0, input.limit);
    const uidValidity = String(client.mailbox && client.mailbox.uidValidity);
    const messages = [];
    if (selected.length) for await (const item of client.fetch(selected, { uid: true, envelope: true, flags: true, size: true, internalDate: true }, { uid: true })) {
      const e = item.envelope;
      messages.push({ mailbox: input.mailbox, folder: input.folder, uid: item.uid, uidValidity,
        from: cleanHeader(e?.from?.[0]?.address || ''), fromName: cleanHeader(e?.from?.[0]?.name || ''),
        to: (e?.to || []).map(a => cleanHeader(a.address || '')), subject: cleanHeader(e?.subject || '(uden emne)'),
        receivedAt: item.internalDate instanceof Date ? item.internalDate.toISOString() : '',
        messageId: cleanHeader(e?.messageId || ''), unread: !item.flags?.has('\\Seen'), bytes: item.size });
    }
    messages.sort((a, b) => b.uid - a.uid);
    return { messages, nextBeforeUid: uids.length > input.limit ? selected.at(-1) : null,
      folder: input.folder, mailbox: input.mailbox, checkedAt: new Date().toISOString(),
      untrustedContent: true, markedRead: false, paidAiCalls: 0 };
  });
}

export async function readMailboxMessage(raw: unknown): Promise<MailMessage> {
  const input = mailReadInput.parse(raw);
  return withMailFolder(input.mailbox, input.folder, async client => {
    if (String(client.mailbox && client.mailbox.uidValidity) !== input.uidValidity) throw Error('mcp_mail_uid_validity_changed');
    const head = await client.fetchOne(input.uid, { size: true }, { uid: true });
    if (!head) throw Error('mcp_mail_not_found');
    const maxBytes = 3_000_000;
    if (!head.size || head.size > maxBytes) throw Error('mcp_mail_message_too_large');
    // ImapFlow emits BODY.PEEK, and the folder is EXAMINE/read-only as a second guard.
    const fetched = await client.fetchOne(input.uid, { source: { maxLength: maxBytes + 1 }, internalDate: true }, { uid: true });
    if (!fetched || !fetched.source || fetched.source.length > maxBytes) throw Error('mcp_mail_not_found');
    const parsed = await simpleParser(fetched.source, { skipHtmlToText: true, skipTextToHtml: true });
    const addresses = (field: typeof parsed.to) => (Array.isArray(field) ? field : field ? [field] : []).flatMap(f => f.value.map(a => address(a.address || ''))).filter(Boolean);
    const froms = addresses(parsed.from), replies = addresses(parsed.replyTo), from = froms[0] || '', replyTo = replies[0] || from;
    const $ = load(typeof parsed.html === 'string' ? parsed.html : '');
    $('script,style,iframe,object,template').remove(); $('br').replaceWith('\n'); $('p,div,tr').append('\n');
    const text = (parsed.text || $.root().text()).replace(/\x00/g, '').trim();
    const messageId = cleanHeader(parsed.messageId || '');
    const references = (Array.isArray(parsed.references) ? parsed.references : parsed.references ? [parsed.references] : []).slice(-20).map(cleanHeader);
    const source = { ...input, from, fromName: cleanHeader(parsed.from?.value[0]?.name || ''), replyTo,
      replyToDiffers: !!replyTo && replyTo !== from, to: addresses(parsed.to), cc: addresses(parsed.cc),
      subject: cleanHeader(parsed.subject || '(uden emne)'), body: text.slice(0, 40000), messageId, references,
      receivedAt: fetched.internalDate instanceof Date ? fetched.internalDate.toISOString() : parsed.date?.toISOString() || '',
      attachments: parsed.attachments.map(a => ({ name: cleanHeader(a.filename || 'vedhæftning'), type: a.contentType, bytes: a.size })),
      replyBlocked: froms.length !== 1 || replies.length > 1 || !replyTo || /^(?:no-?reply|mailer-daemon|postmaster)@/i.test(replyTo) ||
        parsed.headers.get('auto-submitted') !== undefined && parsed.headers.get('auto-submitted') !== 'no', bodyTruncated: text.length > 40000 };
    return { ...source, id: cmsFieldHash(input), sourceHash: cmsFieldHash(source) };
  });
}
/** Bounded RFC-thread lookup, not a subject match and never an inbox-wide body scan. */
export async function readMailboxThread(source:MailMessage) {
  if(source.kind==='compose'||!source.messageId)return {messages:[],truncated:false};
  const ids=[...new Set([source.messageId,...source.references])].filter(s=>/^<[^\r\n<>]{1,490}>$/.test(s)).slice(-12);
  if(!ids.length)return {messages:[],truncated:false};
  const locators:MailLocator[]=[];let truncated=false;
  for(const folder of ['inbox','sent'] as const)await withMailFolder(source.mailbox,folder,async client=>{
    const found=await client.search({deleted:false,or:ids.flatMap(id=>[{header:{'message-id':id}},{header:{references:id}},{header:{'in-reply-to':id}}])},{uid:true});
    const uids=(found||[]).sort((a,b)=>b-a);if(uids.length>6)truncated=true;
    for(const uid of uids.slice(0,6))locators.push({mailbox:source.mailbox,folder,uid,uidValidity:String(client.mailbox&&client.mailbox.uidValidity)});
  });
  const messages:MailMessage[]=[];
  for(const locator of locators){const row=await readMailboxMessage(locator);if(!messages.some(m=>m.messageId===row.messageId&&m.sourceHash===row.sourceHash))messages.push(row);}
  messages.sort((a,b)=>a.receivedAt.localeCompare(b.receivedAt));
  return {messages,truncated,folders:['INBOX','configured Sent'],bccIncluded:false,externalContentUntrusted:true};
}
