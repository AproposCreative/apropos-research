import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import type { MailboxId } from '@/lib/accreditation/imap/config';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILE = 'accreditation_imap_contact_overview.json';
const META_DOC_ID = '_meta';

export type DiscoveredContact = {
  email: string;
  name?: string;
  companyHint?: string;
  lastSubject?: string;
  lastSeenAt?: string;
  messageCount: number;
  mailboxes: MailboxId[];
  sampleSnippets: string[];
  /** Needs human review before treating as press contact. */
  reviewStatus: 'pending' | 'accepted' | 'rejected';
};

export type ContactOverviewState = {
  contacts: DiscoveredContact[];
  lastScanAt?: string;
  scannedMailboxes?: MailboxId[];
  messagesScanned?: number;
};

type OverviewMeta = {
  lastScanAt?: string;
  scannedMailboxes?: MailboxId[];
  messagesScanned?: number;
};

const memoryOverview: ContactOverviewState = { contacts: [] };

function safeEmailDocId(email: string): string {
  return email.trim().toLowerCase().replace(/[/#[\]]/g, '_').slice(0, 700);
}

export async function readContactOverview(): Promise<ContactOverviewState> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    return {
      ...memoryOverview,
      contacts: memoryOverview.contacts.map((c) => ({ ...c })),
    };
  }
  if (kind === 'json') {
    return readJsonFile<ContactOverviewState>(FILE, { contacts: [] });
  }

  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.contactOverview).get();
  const contacts: DiscoveredContact[] = [];
  let meta: OverviewMeta = {};
  for (const doc of snap.docs) {
    if (doc.id === META_DOC_ID) {
      meta = (doc.data() || {}) as OverviewMeta;
      continue;
    }
    contacts.push(doc.data() as DiscoveredContact);
  }
  return {
    contacts,
    lastScanAt: meta.lastScanAt,
    scannedMailboxes: meta.scannedMailboxes,
    messagesScanned: meta.messagesScanned,
  };
}

export async function writeContactOverview(state: ContactOverviewState): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryOverview.contacts = state.contacts.map((c) => ({ ...c }));
    memoryOverview.lastScanAt = state.lastScanAt;
    memoryOverview.scannedMailboxes = state.scannedMailboxes
      ? [...state.scannedMailboxes]
      : undefined;
    memoryOverview.messagesScanned = state.messagesScanned;
    return;
  }
  if (kind === 'json') {
    writeJsonFile(FILE, state);
    return;
  }

  const db = requireFirestore();
  const col = db.collection(COLLECTIONS.contactOverview);
  const existing = await col.get();
  const keepIds = new Set(state.contacts.map((c) => safeEmailDocId(c.email)));
  keepIds.add(META_DOC_ID);

  const BATCH_LIMIT = 450;
  let batch = db.batch();
  let ops = 0;

  const commitIfNeeded = async (force = false) => {
    if (ops >= BATCH_LIMIT || (force && ops > 0)) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  };

  for (const doc of existing.docs) {
    if (!keepIds.has(doc.id)) {
      batch.delete(doc.ref);
      ops += 1;
      await commitIfNeeded();
    }
  }

  batch.set(
    col.doc(META_DOC_ID),
    stripUndefined({
      lastScanAt: state.lastScanAt,
      scannedMailboxes: state.scannedMailboxes,
      messagesScanned: state.messagesScanned,
    } as Record<string, unknown>),
    { merge: true }
  );
  ops += 1;
  await commitIfNeeded();

  for (const contact of state.contacts) {
    const id = safeEmailDocId(contact.email);
    batch.set(col.doc(id), stripUndefined({ ...contact } as Record<string, unknown>), {
      merge: true,
    });
    ops += 1;
    await commitIfNeeded();
  }

  await commitIfNeeded(true);
}

/**
 * Mutates `state` in place (callers typically writeContactOverview after a scan batch).
 */
export async function upsertDiscoveredContact(
  state: ContactOverviewState,
  input: {
    email: string;
    name?: string;
    subject?: string;
    seenAt?: string;
    mailboxId: MailboxId;
    snippet?: string;
  }
): Promise<void> {
  const email = input.email.trim().toLowerCase();
  if (!email || !email.includes('@')) return;
  // Skip our own mailboxes
  if (email === 'liv@aproposmagazine.com' || email === 'frederik@aproposmagazine.com') return;
  if (email.endsWith('@aproposmagazine.com') && /noreply|news@/.test(email)) return;

  let row = state.contacts.find((c) => c.email === email);
  if (!row) {
    row = {
      email,
      name: input.name,
      lastSubject: input.subject,
      lastSeenAt: input.seenAt,
      messageCount: 0,
      mailboxes: [],
      sampleSnippets: [],
      reviewStatus: 'pending',
    };
    state.contacts.push(row);
  }
  row.messageCount += 1;
  if (input.name && !row.name) row.name = input.name;
  if (input.subject) row.lastSubject = input.subject;
  if (input.seenAt) row.lastSeenAt = input.seenAt;
  if (!row.mailboxes.includes(input.mailboxId)) row.mailboxes.push(input.mailboxId);
  if (input.snippet && row.sampleSnippets.length < 3) {
    row.sampleSnippets.push(input.snippet.slice(0, 180));
  }

  // Heuristic company from domain
  const domain = email.split('@')[1] || '';
  if (!row.companyHint && domain && !/gmail|hotmail|outlook|yahoo|icloud|me\.com/i.test(domain)) {
    row.companyHint = domain;
  }
}

export async function setContactReviewStatus(
  email: string,
  reviewStatus: DiscoveredContact['reviewStatus']
): Promise<ContactOverviewState> {
  const normalized = email.trim().toLowerCase();
  const kind = resolveAccreditationPersistenceKind();

  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.contactOverview).doc(safeEmailDocId(normalized));
    const snap = await ref.get();
    if (snap.exists) {
      const prev = snap.data() as DiscoveredContact;
      const next = { ...prev, reviewStatus };
      await ref.set(stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
    }
    return readContactOverview();
  }

  const state = await readContactOverview();
  const row = state.contacts.find((c) => c.email === normalized);
  if (row) row.reviewStatus = reviewStatus;
  await writeContactOverview(state);
  return state;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryOverview.contacts = [];
    memoryOverview.lastScanAt = undefined;
    memoryOverview.scannedMailboxes = undefined;
    memoryOverview.messagesScanned = undefined;
  },
});
