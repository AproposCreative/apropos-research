import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { newEntityId } from '@/lib/accreditation/ids';
import { canAutoSend, computeAutoEligible } from '@/lib/accreditation/policy';
import type {
  ApprovalItem,
  ApprovalKind,
  ApprovalPolicyFlag,
  ApprovalStatus,
} from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILENAME = 'accreditation_approvals.json';
const memoryApprovals = new Map<string, ApprovalItem>();

async function loadAll(): Promise<ApprovalItem[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryApprovals.values()];
  if (kind === 'json') return readJsonFile<ApprovalItem[]>(FILENAME, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.approvals).get();
  return snap.docs.map((d) => d.data() as ApprovalItem);
}

async function saveOne(item: ApprovalItem): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryApprovals.set(item.id, item);
    return;
  }
  if (kind === 'json') {
    const all = readJsonFile<ApprovalItem[]>(FILENAME, []);
    const idx = all.findIndex((a) => a.id === item.id);
    if (idx >= 0) all[idx] = item;
    else all.push(item);
    writeJsonFile(FILENAME, all);
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.approvals)
    .doc(item.id)
    .set(stripUndefined({ ...item } as Record<string, unknown>), { merge: true });
}

export async function readApprovals(): Promise<ApprovalItem[]> {
  return loadAll();
}

export async function writeApprovals(items: ApprovalItem[]): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryApprovals.clear();
    for (const i of items) memoryApprovals.set(i.id, i);
    return;
  }
  if (kind === 'json') {
    writeJsonFile(FILENAME, items);
    return;
  }
  const db = requireFirestore();
  const batch = db.batch();
  for (const i of items) {
    batch.set(
      db.collection(COLLECTIONS.approvals).doc(i.id),
      stripUndefined({ ...i } as Record<string, unknown>),
      { merge: true }
    );
  }
  await batch.commit();
}

export async function getApprovalById(id: string): Promise<ApprovalItem | undefined> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return memoryApprovals.get(id);
  if (kind === 'json') {
    return readJsonFile<ApprovalItem[]>(FILENAME, []).find((a) => a.id === id);
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.approvals).doc(id).get();
  if (!snap.exists) return undefined;
  return snap.data() as ApprovalItem;
}

export async function listQueuedApprovals(): Promise<ApprovalItem[]> {
  return (await loadAll())
    .filter((a) => a.status === 'queued' || a.status === 'approved')
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function listEscalations(): Promise<ApprovalItem[]> {
  return (await loadAll())
    .filter((a) => a.status === 'queued' && !computeAutoEligible(a.policyFlags))
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function enqueueApproval(input: {
  requestId: string;
  threadId?: string;
  kind: ApprovalKind;
  to: string;
  subject: string;
  text: string;
  html?: string;
  draftHash: string;
  policyFlags: ApprovalPolicyFlag[];
}): Promise<ApprovalItem> {
  const now = new Date().toISOString();
  const all = await loadAll();

  for (let i = 0; i < all.length; i++) {
    if (
      all[i].requestId === input.requestId &&
      all[i].kind === input.kind &&
      all[i].status === 'queued'
    ) {
      all[i] = { ...all[i], status: 'superseded', updatedAt: now };
      await saveOne(all[i]);
    }
  }

  const autoEligible = computeAutoEligible(input.policyFlags);
  const item: ApprovalItem = {
    id: newEntityId('appr'),
    requestId: input.requestId,
    threadId: input.threadId,
    kind: input.kind,
    to: input.to.trim(),
    subject: input.subject.trim(),
    text: input.text,
    html: input.html,
    draftHash: input.draftHash,
    policyFlags: input.policyFlags,
    status: 'queued',
    autoEligible,
    escalateReason: autoEligible ? undefined : input.policyFlags.join(', '),
    createdAt: now,
    updatedAt: now,
  };

  void canAutoSend(item);
  await saveOne(item);
  return item;
}

/**
 * Transition approval status. Uses transaction in Firestore so concurrent
 * send paths cannot both mark the same draft as sent.
 */
export async function setApprovalStatus(
  id: string,
  status: ApprovalStatus,
  extras?: { rejectReason?: string }
): Promise<ApprovalItem | null> {
  const kind = resolveAccreditationPersistenceKind();
  const now = new Date().toISOString();
  const buildPatch = (prev: ApprovalItem): ApprovalItem => {
    const patch: Partial<ApprovalItem> = { status, updatedAt: now };
    if (status === 'approved') patch.approvedAt = now;
    if (status === 'rejected') {
      patch.rejectedAt = now;
      patch.rejectReason = extras?.rejectReason?.trim() || 'Afvist';
    }
    if (status === 'sent' || status === 'auto_sent') patch.sentAt = now;
    return { ...prev, ...patch };
  };

  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.approvals).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const prev = snap.data() as ApprovalItem;
      // Idempotent: already terminal send status
      if (
        (status === 'sent' || status === 'auto_sent') &&
        (prev.status === 'sent' || prev.status === 'auto_sent')
      ) {
        return prev;
      }
      const next = buildPatch(prev);
      tx.set(ref, stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  const prev = await getApprovalById(id);
  if (!prev) return null;
  if (
    (status === 'sent' || status === 'auto_sent') &&
    (prev.status === 'sent' || prev.status === 'auto_sent')
  ) {
    return prev;
  }
  const next = buildPatch(prev);
  await saveOne(next);
  return next;
}

export async function updateApprovalDraft(
  id: string,
  patch: { to?: string; subject?: string; text?: string; html?: string; draftHash?: string }
): Promise<ApprovalItem | null> {
  const prev = await getApprovalById(id);
  if (!prev) return null;
  if (prev.status !== 'queued' && prev.status !== 'approved') return null;
  const next = {
    ...prev,
    ...patch,
    status: 'queued' as const,
    updatedAt: new Date().toISOString(),
  };
  await saveOne(next);
  return next;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryApprovals.clear();
  },
});
