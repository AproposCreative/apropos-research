import { createHash } from 'node:crypto';
import { ImapFlow, type ListResponse } from 'imapflow';
import { simpleParser } from 'mailparser';
import { getMailboxSecrets, type MailboxId } from '@/lib/accreditation/imap/config';
import { findSentMailboxPath } from '@/lib/accreditation/imap/sent-copy';

export const mimeHash = (raw: Buffer) => createHash('sha256').update(raw).digest('hex');
/** RFC mail CRLF framing. Byte-preserving except inserting CR before bare LF. */
export function canonicalMailMime(raw:Buffer){
  const bytes:number[]=[];
  for(let i=0;i<raw.length;i++){if(raw[i]===10&&(i===0||raw[i-1]!==13))bytes.push(13);bytes.push(raw[i]);}
  return Buffer.from(bytes);
}
export type FolderKind = 'sent' | 'drafts';
type Folder = Pick<ListResponse, 'path' | 'name' | 'specialUse'>;
// Frederik supplied his Apple Mail mapping on 22 October. Never apply it to Liv.
export const mailboxFolders = { frederik: { sent: 'Sent Messages', drafts: 'Drafts' }, liv: { sent: null, drafts: null } } as const;
export function resolveMailFolder(mailbox: MailboxId, kind: FolderKind, folders: Folder[]) {
  const chosen = mailboxFolders[mailbox][kind];
  if (chosen) {
    const exact = folders.find(f => f.path === chosen);
    const named = folders.filter(f => f.name === chosen);
    if (exact) return exact.path;
    if (named.length === 1) return named[0].path;
    throw Error('mcp_mail_folder_mapping_missing'); // Do not silently archive to another folder.
  }
  const special = folders.filter(f => f.specialUse?.toLowerCase() === `\\${kind}`);
  if (special.length === 1) return special[0].path;
  const named = folders.filter(f => kind === 'sent' ? /^(sent|sent messages|sent mail|sendt|sendte mails)$/i.test(f.name) : /^(drafts|kladder|udkast)$/i.test(f.name));
  if (named.length !== 1) throw Error('mcp_mail_folder_mapping_ambiguous');
  return named[0].path;
}
export async function withImap<T>(mailbox: MailboxId, run: (client: ImapFlow) => Promise<T>): Promise<T> {
  const config = getMailboxSecrets(mailbox);
  if (config.user.toLowerCase() !== `${mailbox}@aproposmagazine.com`) throw Error('mcp_mail_identity_mismatch');
  const client = new ImapFlow({ host: config.host, port: config.port, secure: true,
    auth: { user: config.user, pass: config.password }, logger: false, emitLogs: false,
    connectionTimeout: 12000, greetingTimeout: 12000, socketTimeout: 20000 });
  client.on('error', () => { /* Never log credentials, MIME or provider response bodies. */ });
  try { await client.connect(); return await run(client); }
  catch (e) { if (e instanceof Error && /^mcp_mail_[a-z_]+$/.test(e.message)) throw e; throw Error('mcp_mail_imap_unavailable'); }
  finally { try { await client.logout(); } catch { client.close(); } }
}
export type StoredMessage = { folder: string; uid: number; uidValidity: string; sha256: string; raw: Buffer };
/** Exact RFC Message-ID, never a subject-only match. EXAMINE and BODY.PEEK preserve read state. */
export async function findExactMessage(client: ImapFlow, folder: string, messageId: string): Promise<StoredMessage[]> {
  const lock = await client.getMailboxLock(folder, { readOnly: true });
  try {
    const uids = await client.search({ header: { 'message-id': messageId }, deleted: false }, { uid: true });
    // ImapFlow returns false on command failure. It MUST NOT mean an empty folder.
    if(uids===false)throw Error('mcp_mail_search_unconfirmed');
    if ((uids || []).length > 10) throw Error('mcp_mail_duplicate_message_id');
    const result: StoredMessage[] = [];
    for (const uid of uids || []) {
      const head = await client.fetchOne(uid, { envelope: true, size: true }, { uid: true });
      if (!head) throw Error('mcp_mail_readback_failed');
      if (head.envelope?.messageId !== messageId) continue;
      if (!head.size || head.size > 250000) throw Error('mcp_mail_message_too_large');
      const fetched = await client.fetchOne(uid, { source: { maxLength: 250001 } }, { uid: true });
      if (!fetched || !fetched.source || fetched.source.length > 250000) throw Error('mcp_mail_readback_failed');
      result.push({ folder, uid, uidValidity: String(client.mailbox && client.mailbox.uidValidity), raw: fetched.source, sha256: mimeHash(fetched.source) });
    }
    return result;
  } finally { lock.release(); }
}
export type SentFolderSync = { status: 'verified' | 'missing' | 'unconfirmed'; folder: string | null; uid?: number; uidValidity?: string;
  sha256?: string; checkedAt: string; appendReceipt?: { uid: number | null; uidValidity: string | null };
  error?: string; appleMailMapping: 'owner_confirmed' | 'server_discovered'; deviceVisibilityVerified: false };
export async function archiveExactMessage(mailbox: MailboxId, raw: Buffer, messageId: string): Promise<SentFolderSync> {
  const base = { checkedAt: new Date().toISOString(), folder: null, appleMailMapping: mailbox === 'frederik' ? 'owner_confirmed' as const : 'server_discovered' as const, deviceVisibilityVerified: false as const };
  try {
    return await withImap(mailbox, async client => {
      const folder = resolveMailFolder(mailbox, 'sent', await client.list()), expected = mimeHash(raw);
      let found = await findExactMessage(client, folder, messageId);
      let appendReceipt: SentFolderSync['appendReceipt'];
      if (!found.length) {
        try {
          const ack = await client.append(folder, raw, ['\\Seen'], new Date());
          if (ack) appendReceipt = { uid: ack.uid || null, uidValidity: ack.uidValidity ? String(ack.uidValidity) : null };
        } catch { /* Still read back after a lost APPEND acknowledgment. Never blindly append twice. */ }
        found = await findExactMessage(client, folder, messageId);
      }
      if (found.length !== 1 || found[0].sha256 !== expected) return { ...base, folder, status: 'unconfirmed', error: 'mcp_mail_sent_readback_mismatch', ...(appendReceipt ? { appendReceipt } : {}) };
      const { uid, uidValidity, sha256 } = found[0];
      return { ...base, folder, uid, uidValidity, sha256, status: 'verified', ...(appendReceipt ? { appendReceipt } : {}) };
    });
  } catch (e) { return { ...base, status: 'unconfirmed', error: e instanceof Error ? e.message : 'mcp_mail_imap_unavailable' }; }
}
export type ExpectedSent = { mailbox: MailboxId; messageId: string; from: string; to: string; subject: string; body: string };
export async function inspectSentMessage(expected: ExpectedSent) {
  return withImap(expected.mailbox, async client => {
    const folders = await client.list(), target = resolveMailFolder(expected.mailbox, 'sent', folders);
    const candidates = folders.filter(f => !f.flags?.has('\\Noselect') &&
      (f.path === target || f.specialUse === '\\Sent' || /sent|sendt|sendte/i.test(f.name)));
    if (candidates.length > 20) throw Error('mcp_mail_too_many_sent_folders');
    const matches = [];
    for (const folder of candidates) for (const match of await findExactMessage(client, folder.path, expected.messageId)) {
      const parsed = await simpleParser(match.raw, { skipHtmlToText: true, skipTextToHtml: true });
      const addresses = (a: typeof parsed.to) => (Array.isArray(a) ? a : a ? [a] : []).flatMap(f => f.value.map(v => (v.address || '').toLowerCase()));
      const headers = { from: addresses(parsed.from), to: addresses(parsed.to), cc: addresses(parsed.cc),
        subject: parsed.subject, date: parsed.date?.toISOString() || null, messageId: parsed.messageId,
        inReplyTo: parsed.inReplyTo || null, references: parsed.references || [], bccHeaderPresent: parsed.headers.has('bcc') };
      const bodyMatches = (parsed.text || '').replace(/\r\n/g, '\n').trim() === expected.body.replace(/\r\n/g, '\n').trim();
      matches.push({ folder: match.folder, uid: match.uid, uidValidity: match.uidValidity, sha256: match.sha256, headers, bodyMatches,
        identityMatches: headers.from.length === 1 && headers.from[0] === expected.from && headers.to.includes(expected.to) && headers.subject === expected.subject && bodyMatches });
    }
    return { mailbox: expected.mailbox, targetFolder: target, priorResolverFolder: findSentMailboxPath(folders) || null,
      folders: candidates.map(f => ({ path: f.path, name: f.name, specialUse: f.specialUse || null, subscribed: f.subscribed })), matches,
      checkedAt: new Date().toISOString(), recipientDeliveryVerified: false, deviceVisibilityVerified: false };
  });
}
/** Explicit archive repair only. Does not import, call or depend on SMTP. Original is retained. */
export async function copyExistingSentMessage(expected: ExpectedSent, source: { folder: string; uid: number; uidValidity: string; sha256: string }) {
  return withImap(expected.mailbox, async client => {
    const folder = resolveMailFolder(expected.mailbox, 'sent', await client.list());
    const existing = await findExactMessage(client, folder, expected.messageId);
    if (existing.length) {
      if (existing.length !== 1 || existing[0].sha256 !== source.sha256) throw Error('mcp_mail_sent_readback_mismatch');
      const { uid, uidValidity, sha256 } = existing[0];
      return { folder, uid, uidValidity, sha256, copied: false };
    }
    const original = (await findExactMessage(client, source.folder, expected.messageId)).find(m => m.uid === source.uid && m.uidValidity === source.uidValidity && m.sha256 === source.sha256);
    if (!original) throw Error('mcp_mail_archive_source_changed');
    // One APPEND attempt; caller stores a durable claim, so timeout/replay only reads back.
    let ack;
    try { ack = await client.append(folder, original.raw, ['\\Seen'], new Date()); } catch { /* readback */ }
    const found = await findExactMessage(client, folder, expected.messageId);
    if (found.length !== 1 || found[0].sha256 !== original.sha256) throw Error('mcp_mail_sent_readback_mismatch');
    return { folder, uid: found[0].uid, uidValidity: found[0].uidValidity, sha256: found[0].sha256, copied: true,
      appendReceipt: ack ? { uid: ack.uid || null, uidValidity: ack.uidValidity ? String(ack.uidValidity) : null } : null };
  });
}
