import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import type { MailboxId } from '@/lib/accreditation/imap/config';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const CURSOR_FILE = 'accreditation_imap_cursors.json';
const DEDUPE_FILE = 'accreditation_imap_dedupe.json';

export type ImapCursor = {
  mailboxId: MailboxId;
  lastUid: number;
  updatedAt: string;
};

type CursorState = Record<string, ImapCursor>;
type DedupeState = { messageIds: string[]; updatedAt: string };

const MAX_DEDUPE = 5000;

const memoryCursors: CursorState = {};
const memoryDedupe = new Set<string>();

function safeDedupeDocId(id: string): string {
  return id.replace(/[/#[\]]/g, '_').slice(0, 700);
}

export async function getCursor(mailboxId: MailboxId): Promise<ImapCursor> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    return (
      memoryCursors[mailboxId] || {
        mailboxId,
        lastUid: 0,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }
  if (kind === 'json') {
    const all = readJsonFile<CursorState>(CURSOR_FILE, {});
    return (
      all[mailboxId] || {
        mailboxId,
        lastUid: 0,
        updatedAt: new Date(0).toISOString(),
      }
    );
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.imapCursors).doc(mailboxId).get();
  if (!snap.exists) {
    return { mailboxId, lastUid: 0, updatedAt: new Date(0).toISOString() };
  }
  const data = snap.data() || {};
  return {
    mailboxId,
    lastUid: Number(data.lastUid || 0),
    updatedAt: String(data.updatedAt || new Date(0).toISOString()),
  };
}

export async function setCursor(mailboxId: MailboxId, lastUid: number): Promise<ImapCursor> {
  const next: ImapCursor = {
    mailboxId,
    lastUid,
    updatedAt: new Date().toISOString(),
  };
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryCursors[mailboxId] = next;
    return next;
  }
  if (kind === 'json') {
    const all = readJsonFile<CursorState>(CURSOR_FILE, {});
    all[mailboxId] = next;
    writeJsonFile(CURSOR_FILE, all);
    return next;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.imapCursors)
    .doc(mailboxId)
    .set(stripUndefined({ ...next }), { merge: true });
  return next;
}

export function normalizeMessageId(id: string | undefined | null): string | null {
  if (!id) return null;
  const t = id.trim().replace(/^<|>$/g, '').toLowerCase();
  return t || null;
}

export async function hasProcessedMessageId(
  messageId: string | undefined | null
): Promise<boolean> {
  const id = normalizeMessageId(messageId);
  if (!id) return false;
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return memoryDedupe.has(id);
  if (kind === 'json') {
    const state = readJsonFile<DedupeState>(DEDUPE_FILE, { messageIds: [], updatedAt: '' });
    return state.messageIds.includes(id);
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.imapDedupe).doc(safeDedupeDocId(id)).get();
  return snap.exists;
}

/**
 * Atomically mark message processed. Returns false if already processed (duplicate inbound).
 */
export async function markProcessedMessageId(
  messageId: string | undefined | null
): Promise<{ firstTime: boolean }> {
  const id = normalizeMessageId(messageId);
  if (!id) return { firstTime: false };
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    if (memoryDedupe.has(id)) return { firstTime: false };
    memoryDedupe.add(id);
    return { firstTime: true };
  }
  if (kind === 'json') {
    const state = readJsonFile<DedupeState>(DEDUPE_FILE, { messageIds: [], updatedAt: '' });
    if (state.messageIds.includes(id)) return { firstTime: false };
    state.messageIds.push(id);
    if (state.messageIds.length > MAX_DEDUPE) {
      state.messageIds = state.messageIds.slice(-MAX_DEDUPE);
    }
    state.updatedAt = new Date().toISOString();
    writeJsonFile(DEDUPE_FILE, state);
    return { firstTime: true };
  }

  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.imapDedupe).doc(safeDedupeDocId(id));
  try {
    await ref.create({
      messageId: id,
      processedAt: new Date().toISOString(),
    });
    return { firstTime: true };
  } catch {
    return { firstTime: false };
  }
}

export function dedupeKeyForUid(mailboxId: MailboxId, uid: number): string {
  return `uid:${mailboxId}:${uid}`;
}

export async function hasProcessedUid(mailboxId: MailboxId, uid: number): Promise<boolean> {
  return hasProcessedMessageId(dedupeKeyForUid(mailboxId, uid));
}

export async function markProcessedUid(
  mailboxId: MailboxId,
  uid: number
): Promise<{ firstTime: boolean }> {
  return markProcessedMessageId(dedupeKeyForUid(mailboxId, uid));
}

registerAccreditationStoreReset({
  __resetForTests() {
    for (const k of Object.keys(memoryCursors)) delete memoryCursors[k];
    memoryDedupe.clear();
  },
});
