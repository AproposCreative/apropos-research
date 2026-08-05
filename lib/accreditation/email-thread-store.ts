import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { newEntityId } from '@/lib/accreditation/ids';
import type {
  AccreditationEmailMessage,
  AccreditationEmailThread,
  EmailDeliveryStatus,
  EmailThreadStatus,
} from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILENAME = 'accreditation_email_threads.json';

const memoryThreads = new Map<string, AccreditationEmailThread>();

async function loadAll(): Promise<AccreditationEmailThread[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryThreads.values()];
  if (kind === 'json') return readJsonFile<AccreditationEmailThread[]>(FILENAME, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.emailThreads).get();
  return snap.docs.map((d) => d.data() as AccreditationEmailThread);
}

async function saveOne(thread: AccreditationEmailThread): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryThreads.set(thread.id, thread);
    return;
  }
  if (kind === 'json') {
    const all = readJsonFile<AccreditationEmailThread[]>(FILENAME, []);
    const idx = all.findIndex((t) => t.id === thread.id);
    if (idx >= 0) all[idx] = thread;
    else all.push(thread);
    writeJsonFile(FILENAME, all);
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.emailThreads)
    .doc(thread.id)
    .set(stripUndefined({ ...thread } as Record<string, unknown>), { merge: true });
}

export async function readEmailThreads(): Promise<AccreditationEmailThread[]> {
  return loadAll();
}

export async function writeEmailThreads(threads: AccreditationEmailThread[]): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryThreads.clear();
    for (const t of threads) memoryThreads.set(t.id, t);
    return;
  }
  if (kind === 'json') {
    writeJsonFile(FILENAME, threads);
    return;
  }
  const db = requireFirestore();
  const batch = db.batch();
  for (const t of threads) {
    batch.set(
      db.collection(COLLECTIONS.emailThreads).doc(t.id),
      stripUndefined({ ...t } as Record<string, unknown>),
      { merge: true }
    );
  }
  await batch.commit();
}

export async function getThreadById(id: string): Promise<AccreditationEmailThread | undefined> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return memoryThreads.get(id);
  if (kind === 'json') {
    return readJsonFile<AccreditationEmailThread[]>(FILENAME, []).find((t) => t.id === id);
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.emailThreads).doc(id).get();
  if (!snap.exists) return undefined;
  return snap.data() as AccreditationEmailThread;
}

export async function getThreadsByRequestId(
  requestId: string
): Promise<AccreditationEmailThread[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    return [...memoryThreads.values()].filter((t) => t.requestId === requestId);
  }
  if (kind === 'json') {
    return readJsonFile<AccreditationEmailThread[]>(FILENAME, []).filter(
      (t) => t.requestId === requestId
    );
  }
  const db = requireFirestore();
  const snap = await db
    .collection(COLLECTIONS.emailThreads)
    .where('requestId', '==', requestId)
    .get();
  return snap.docs.map((d) => d.data() as AccreditationEmailThread);
}

export async function createEmailThread(input: {
  requestId: string;
  contactEmail: string;
  contactName?: string;
  subject: string;
}): Promise<AccreditationEmailThread> {
  const now = new Date().toISOString();
  const thread: AccreditationEmailThread = {
    id: newEntityId('thread'),
    requestId: input.requestId,
    contactEmail: input.contactEmail.trim().toLowerCase(),
    contactName: input.contactName,
    subject: input.subject.trim(),
    status: 'draft',
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  await saveOne(thread);
  return thread;
}

export async function updateThreadStatus(
  threadId: string,
  status: EmailThreadStatus
): Promise<AccreditationEmailThread | null> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.emailThreads).doc(threadId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const prev = snap.data() as AccreditationEmailThread;
      const next = { ...prev, status, updatedAt: new Date().toISOString() };
      tx.set(ref, stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  const existing = await getThreadById(threadId);
  if (!existing) return null;
  const next = { ...existing, status, updatedAt: new Date().toISOString() };
  await saveOne(next);
  return next;
}

/** Apply a human-reviewed recipient change to the thread reply allowlist. */
export async function updateThreadContact(
  threadId: string,
  contactEmail: string,
  contactName?: string
): Promise<AccreditationEmailThread | null> {
  const normalizedEmail = contactEmail.trim().toLowerCase();
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.emailThreads).doc(threadId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const prev = snap.data() as AccreditationEmailThread;
      const next = {
        ...prev,
        contactEmail: normalizedEmail,
        contactName: contactName || prev.contactName,
        updatedAt: new Date().toISOString(),
      };
      tx.set(ref, stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  const existing = await getThreadById(threadId);
  if (!existing) return null;
  const next = {
    ...existing,
    contactEmail: normalizedEmail,
    contactName: contactName || existing.contactName,
    updatedAt: new Date().toISOString(),
  };
  await saveOne(next);
  return next;
}

export async function appendOutboundMessage(
  threadId: string,
  message: Omit<AccreditationEmailMessage, 'id' | 'direction'>
): Promise<AccreditationEmailThread | null> {
  const kind = resolveAccreditationPersistenceKind();

  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.emailThreads).doc(threadId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const thread = snap.data() as AccreditationEmailThread;
      const messages = Array.isArray(thread.messages) ? [...thread.messages] : [];
      if (
        message.resendEmailId &&
        messages.some((m) => m.resendEmailId === message.resendEmailId)
      ) {
        return thread;
      }
      const msg: AccreditationEmailMessage = {
        ...message,
        id: newEntityId('msg-out'),
        direction: 'outbound',
      };
      messages.push(msg);
      const next: AccreditationEmailThread = {
        ...thread,
        messages,
        status: 'awaiting_reply',
        lastOutboundResendId: message.resendEmailId,
        updatedAt: new Date().toISOString(),
      };
      tx.set(ref, stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  const thread = await getThreadById(threadId);
  if (!thread) return null;

  // Idempotent: skip if same resend id already stored
  if (
    message.resendEmailId &&
    thread.messages.some((m) => m.resendEmailId === message.resendEmailId)
  ) {
    return thread;
  }

  const msg: AccreditationEmailMessage = {
    ...message,
    id: newEntityId('msg-out'),
    direction: 'outbound',
  };
  const next: AccreditationEmailThread = {
    ...thread,
    messages: [...thread.messages, msg],
    status: 'awaiting_reply',
    lastOutboundResendId: message.resendEmailId,
    updatedAt: new Date().toISOString(),
  };
  await saveOne(next);
  return next;
}

export async function appendInboundMessage(
  threadId: string,
  message: Omit<AccreditationEmailMessage, 'id' | 'direction'>,
  extras?: { aiSummary?: string; suggestedReply?: string; novelQuestion?: boolean }
): Promise<AccreditationEmailThread | null> {
  const kind = resolveAccreditationPersistenceKind();

  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.emailThreads).doc(threadId);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const thread = snap.data() as AccreditationEmailThread;
      const messages = Array.isArray(thread.messages) ? [...thread.messages] : [];
      if (
        message.resendEmailId &&
        messages.some((m) => m.resendEmailId === message.resendEmailId)
      ) {
        return thread;
      }
      const msg: AccreditationEmailMessage = {
        ...message,
        id: newEntityId('msg-in'),
        direction: 'inbound',
        aiSummary: extras?.aiSummary,
        suggestedReply: extras?.suggestedReply,
        novelQuestion: extras?.novelQuestion,
      };
      messages.push(msg);
      const next: AccreditationEmailThread = {
        ...thread,
        messages,
        status: 'replied',
        updatedAt: new Date().toISOString(),
      };
      tx.set(ref, stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  const thread = await getThreadById(threadId);
  if (!thread) return null;

  if (
    message.resendEmailId &&
    thread.messages.some((m) => m.resendEmailId === message.resendEmailId)
  ) {
    return thread;
  }

  const msg: AccreditationEmailMessage = {
    ...message,
    id: newEntityId('msg-in'),
    direction: 'inbound',
    aiSummary: extras?.aiSummary,
    suggestedReply: extras?.suggestedReply,
    novelQuestion: extras?.novelQuestion,
  };
  const next: AccreditationEmailThread = {
    ...thread,
    messages: [...thread.messages, msg],
    status: 'replied',
    updatedAt: new Date().toISOString(),
  };
  await saveOne(next);
  return next;
}

export async function updateMessageDelivery(
  resendEmailId: string,
  deliveryStatus: EmailDeliveryStatus
): Promise<boolean> {
  const kind = resolveAccreditationPersistenceKind();
  const all = await loadAll();
  let changed = false;
  const updated: AccreditationEmailThread[] = [];

  for (const thread of all) {
    let threadChanged = false;
    const messages = thread.messages.map((msg) => {
      if (msg.resendEmailId === resendEmailId && msg.direction === 'outbound') {
        threadChanged = true;
        changed = true;
        return { ...msg, deliveryStatus };
      }
      return msg;
    });
    if (threadChanged) {
      updated.push({ ...thread, messages, updatedAt: new Date().toISOString() });
    }
  }

  if (!changed) return false;

  if (kind === 'memory' || kind === 'json') {
    for (const t of updated) await saveOne(t);
    return true;
  }

  const db = requireFirestore();
  const batch = db.batch();
  for (const t of updated) {
    batch.set(
      db.collection(COLLECTIONS.emailThreads).doc(t.id),
      stripUndefined({ ...t } as Record<string, unknown>),
      { merge: true }
    );
  }
  await batch.commit();
  return true;
}

/** Match inbound only by the explicit reply-to alias liv+{threadId}@…. */
export async function findThreadForInbound(params: {
  toAddresses: string[];
  fromEmail: string;
}): Promise<AccreditationEmailThread | undefined> {
  const all = await loadAll();

  for (const addr of params.toAddresses) {
    const match = addr.match(/liv\+([a-z0-9-]+)@/i);
    if (match) {
      const needle = match[1];
      const thread = all.find((t) => t.id === needle || t.id.includes(needle));
      if (thread) return thread;
    }
  }

  return undefined;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryThreads.clear();
  },
});
