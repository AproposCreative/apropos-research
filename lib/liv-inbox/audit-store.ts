import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { newEntityId } from '@/lib/accreditation/ids';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import { requireFirestore, stripUndefined } from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

export type LivInboxAuditType =
  | 'poll' // automatic inbox fetch ran
  | 'auto_prepared' // Liv auto-prepared a confident reply (shadow: not sent)
  | 'drafted' // reply drafted, awaiting review
  | 'escalated' // reached out to a human
  | 'sent' // human approved and sent
  | 'dismissed' // human dismissed
  | 'edited' // human edited the draft
  | 'asked_editor' // Liv emailed Frederik a question when in doubt
  | 'editor_guided'; // Frederik replied; Liv sent the answer to the sender

export interface LivInboxAuditEvent {
  id: string;
  at: string;
  type: LivInboxAuditType;
  itemId?: string;
  contactEmail?: string;
  subject?: string;
  detail?: string;
  meta?: Record<string, unknown>;
}

const FILENAME = 'liv_inbox_audit.json';
const COLLECTION = 'livInboxAudit';
const MAX = 500;

const memoryEvents: LivInboxAuditEvent[] = [];

export async function appendLivInboxAudit(
  input: Omit<LivInboxAuditEvent, 'id' | 'at'>
): Promise<LivInboxAuditEvent> {
  const event: LivInboxAuditEvent = { ...input, id: newEntityId('liv-audit'), at: new Date().toISOString() };
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryEvents.unshift(event);
    if (memoryEvents.length > MAX) memoryEvents.length = MAX;
    return event;
  }
  if (kind === 'json') {
    const all = readJsonFile<LivInboxAuditEvent[]>(FILENAME, []);
    all.unshift(event);
    writeJsonFile(FILENAME, all.slice(0, MAX));
    return event;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTION)
    .doc(event.id)
    .set(stripUndefined({ ...event } as Record<string, unknown>), { merge: true });
  return event;
}

export async function listLivInboxAudit(limit = 50): Promise<LivInboxAuditEvent[]> {
  const kind = resolveAccreditationPersistenceKind();
  const capped = Math.min(Math.max(1, limit), MAX);
  if (kind === 'memory') return memoryEvents.slice(0, capped);
  if (kind === 'json') {
    return readJsonFile<LivInboxAuditEvent[]>(FILENAME, [])
      .sort((a, b) => b.at.localeCompare(a.at))
      .slice(0, capped);
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTION).get();
  return snap.docs
    .map((d) => d.data() as LivInboxAuditEvent)
    .sort((a, b) => b.at.localeCompare(a.at))
    .slice(0, capped);
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryEvents.length = 0;
  },
});
