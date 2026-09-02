/**
 * Dedicated UID cursor for Liv Indbakke IMAP intake.
 *
 * Must not share accreditation's `liv` cursor: that poll marks the same
 * mailbox \\Seen and would otherwise steal or skip intern mail.
 */
import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import { requireFirestore, stripUndefined } from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILENAME = 'liv_inbox_imap_cursor.json';
const COLLECTION = 'livInboxImapCursor';
const DOC_ID = 'liv';

export type LivInboxImapCursor = {
  lastUid: number;
  updatedAt: string;
};

const emptyCursor = (): LivInboxImapCursor => ({
  lastUid: 0,
  updatedAt: new Date(0).toISOString(),
});

let memoryCursor: LivInboxImapCursor = emptyCursor();

export async function getLivInboxImapCursor(): Promise<LivInboxImapCursor> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return { ...memoryCursor };
  if (kind === 'json') {
    return readJsonFile<LivInboxImapCursor>(FILENAME, emptyCursor());
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTION).doc(DOC_ID).get();
  if (!snap.exists) return emptyCursor();
  const data = snap.data() || {};
  return {
    lastUid: Number(data.lastUid || 0),
    updatedAt: String(data.updatedAt || new Date(0).toISOString()),
  };
}

export async function setLivInboxImapCursor(lastUid: number): Promise<LivInboxImapCursor> {
  const next: LivInboxImapCursor = {
    lastUid: Math.max(0, Math.floor(lastUid)),
    updatedAt: new Date().toISOString(),
  };
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryCursor = next;
    return next;
  }
  if (kind === 'json') {
    writeJsonFile(FILENAME, next);
    return next;
  }
  const db = requireFirestore();
  await db.collection(COLLECTION).doc(DOC_ID).set(stripUndefined({ ...next }), { merge: true });
  return next;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryCursor = emptyCursor();
  },
});
