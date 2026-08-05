import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { newEntityId } from '@/lib/accreditation/ids';
import type { AuditEvent } from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILENAME = 'accreditation_audit.json';
const MAX_EVENTS = 2000;

const memoryAudit = new Map<string, AuditEvent>();

async function loadAll(): Promise<AuditEvent[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryAudit.values()];
  if (kind === 'json') return readJsonFile<AuditEvent[]>(FILENAME, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.audit).limit(MAX_EVENTS).get();
  return snap.docs.map((d) => d.data() as AuditEvent);
}

export async function readAuditEvents(): Promise<AuditEvent[]> {
  return loadAll();
}

export async function appendAudit(input: {
  requestId?: string;
  type: string;
  detail: string;
  meta?: AuditEvent['meta'];
}): Promise<AuditEvent> {
  const event: AuditEvent = {
    id: newEntityId('audit'),
    requestId: input.requestId,
    type: input.type,
    detail: input.detail,
    meta: input.meta,
    createdAt: new Date().toISOString(),
  };

  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryAudit.set(event.id, event);
    if (memoryAudit.size > MAX_EVENTS) {
      const sorted = [...memoryAudit.values()].sort((a, b) =>
        a.createdAt.localeCompare(b.createdAt)
      );
      const drop = sorted.slice(0, Math.max(0, sorted.length - MAX_EVENTS));
      for (const e of drop) memoryAudit.delete(e.id);
    }
    return event;
  }
  if (kind === 'json') {
    const all = readJsonFile<AuditEvent[]>(FILENAME, []);
    all.push(event);
    writeJsonFile(FILENAME, all.slice(-MAX_EVENTS));
    return event;
  }

  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.audit)
    .doc(event.id)
    .set(stripUndefined({ ...event } as Record<string, unknown>));
  return event;
}

/** AI call audit — always records model + promptVersion. */
export async function appendAiAudit(input: {
  requestId?: string;
  type: string;
  detail: string;
  model: string;
  promptVersion: string;
  task?: string;
  lane?: string;
  meta?: AuditEvent['meta'];
}): Promise<AuditEvent> {
  return appendAudit({
    requestId: input.requestId,
    type: input.type,
    detail: input.detail,
    meta: {
      ...(input.meta || {}),
      model: input.model,
      promptVersion: input.promptVersion,
      ...(input.task ? { task: input.task } : {}),
      ...(input.lane ? { lane: input.lane } : {}),
    },
  });
}

export async function listAuditForRequest(requestId: string): Promise<AuditEvent[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'firestore') {
    const db = requireFirestore();
    const snap = await db
      .collection(COLLECTIONS.audit)
      .where('requestId', '==', requestId)
      .limit(MAX_EVENTS)
      .get();
    return snap.docs
      .map((d) => d.data() as AuditEvent)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  return (await loadAll())
    .filter((e) => e.requestId === requestId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryAudit.clear();
  },
});
