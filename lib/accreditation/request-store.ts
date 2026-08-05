import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { newEntityId, nextRequestId } from '@/lib/accreditation/ids';
import { assertTransition } from '@/lib/accreditation/state-machine';
import {
  DEFAULT_SENDER_MAILBOX,
  type AccreditationApplicant,
  type AccreditationRequest,
  type AccreditationRequestStatus,
  type ContactConfidence,
  type WorkflowSheetRow,
} from '@/lib/accreditation/types';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
  stripUndefined,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const FILENAME = 'accreditation_requests.json';

const memoryRequests = new Map<string, AccreditationRequest>();

async function loadAll(): Promise<AccreditationRequest[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryRequests.values()];
  if (kind === 'json') return readJsonFile<AccreditationRequest[]>(FILENAME, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.requests).get();
  return snap.docs.map((d) => d.data() as AccreditationRequest);
}

async function saveAll(requests: AccreditationRequest[]): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryRequests.clear();
    for (const r of requests) memoryRequests.set(r.id, r);
    return;
  }
  if (kind === 'json') {
    writeJsonFile(FILENAME, requests);
    return;
  }
  // Firestore: prefer per-doc writes via upsert helpers — batch only for test bulk
  const db = requireFirestore();
  const batch = db.batch();
  for (const r of requests) {
    batch.set(
      db.collection(COLLECTIONS.requests).doc(r.id),
      stripUndefined({ ...r } as Record<string, unknown>),
      { merge: true }
    );
  }
  await batch.commit();
}

async function saveOne(request: AccreditationRequest): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryRequests.set(request.id, request);
    return;
  }
  if (kind === 'json') {
    const all = readJsonFile<AccreditationRequest[]>(FILENAME, []);
    const idx = all.findIndex((r) => r.id === request.id);
    if (idx >= 0) all[idx] = request;
    else all.push(request);
    writeJsonFile(FILENAME, all);
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTIONS.requests)
    .doc(request.id)
    .set(stripUndefined({ ...request } as Record<string, unknown>), { merge: true });
}

export async function readRequests(): Promise<AccreditationRequest[]> {
  return loadAll();
}

export async function writeRequests(requests: AccreditationRequest[]): Promise<void> {
  await saveAll(requests);
}

export async function getRequestById(id: string): Promise<AccreditationRequest | undefined> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return memoryRequests.get(id);
  if (kind === 'json') {
    return readJsonFile<AccreditationRequest[]>(FILENAME, []).find((r) => r.id === id);
  }
  const db = requireFirestore();
  const snap = await db.collection(COLLECTIONS.requests).doc(id).get();
  if (!snap.exists) return undefined;
  return snap.data() as AccreditationRequest;
}

export async function createRequest(input: {
  artist: string;
  venue?: string;
  eventDate?: string;
  applicants?: AccreditationApplicant[];
  accessRequested?: string;
  notes?: string;
  id?: string;
}): Promise<AccreditationRequest> {
  const now = new Date().toISOString();
  const request: AccreditationRequest = {
    id: input.id || (await nextRequestId()),
    artist: input.artist.trim(),
    venue: input.venue?.trim() || undefined,
    eventDate: input.eventDate?.trim() || undefined,
    applicants: (input.applicants || []).map((a) => ({
      name: a.name.trim(),
      ...(a.email?.trim() ? { email: a.email.trim() } : {}),
      ...(a.notes?.trim() ? { notes: a.notes.trim() } : {}),
    })),
    accessRequested: input.accessRequested?.trim() || 'presseakkreditering (anmeldelse)',
    senderMailbox: DEFAULT_SENDER_MAILBOX,
    status: 'intake',
    notes: input.notes?.trim() || undefined,
    createdAt: now,
    updatedAt: now,
  };
  await saveOne(request);
  return request;
}

export async function updateRequest(
  id: string,
  patch: Partial<Omit<AccreditationRequest, 'id' | 'createdAt'>>,
  opts?: { bypassTransitionCheck?: boolean }
): Promise<AccreditationRequest | null> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'firestore') {
    const db = requireFirestore();
    const ref = db.collection(COLLECTIONS.requests).doc(id);
    return db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) return null;
      const prev = snap.data() as AccreditationRequest;
      if (patch.status && patch.status !== prev.status && !opts?.bypassTransitionCheck) {
        assertTransition(prev.status, patch.status);
      }
      const next = { ...prev, ...patch, updatedAt: new Date().toISOString() };
      tx.set(ref, stripUndefined({ ...next } as Record<string, unknown>), { merge: true });
      return next;
    });
  }

  const existing = await getRequestById(id);
  if (!existing) return null;
  if (patch.status && patch.status !== existing.status && !opts?.bypassTransitionCheck) {
    assertTransition(existing.status, patch.status);
  }
  const next = { ...existing, ...patch, updatedAt: new Date().toISOString() };
  await saveOne(next);
  return next;
}

export async function setRequestStatus(
  id: string,
  status: AccreditationRequestStatus
): Promise<AccreditationRequest | null> {
  return updateRequest(id, { status });
}

export async function upsertRequestFromSheetRow(
  row: WorkflowSheetRow
): Promise<AccreditationRequest> {
  const existing = await getRequestById(row.requestId);
  const applicants = row.applicants
    ? row.applicants.split(/[,;]/).map((n) => ({ name: n.trim() })).filter((a) => a.name)
    : [];

  const status = mapSheetStatus(row.status);
  const confidence = inferConfidenceFromSheet(row);

  if (existing) {
    return (
      (await updateRequest(
        existing.id,
        {
          artist: row.artist || existing.artist,
          venue: row.venue || existing.venue,
          eventDate: row.eventDate || existing.eventDate,
          applicants: applicants.length ? applicants : existing.applicants,
          accessRequested: row.accessRequested || existing.accessRequested,
          promoter: row.promoter || existing.promoter,
          contactName: row.contactName || existing.contactName,
          contactEmail: row.contactEmail || existing.contactEmail,
          contactConfidence: confidence || existing.contactConfidence,
          senderMailbox: row.senderMailbox || existing.senderMailbox,
          status: status || existing.status,
          outcomeReason: row.outcomeReason || existing.outcomeReason,
          notes: row.notes || existing.notes,
          sheetRowNumber: row.rowNumber,
        },
        { bypassTransitionCheck: true }
      )) || existing
    );
  }

  const created = await createRequest({
    id: row.requestId || newEntityId('LIV-HIST'),
    artist: row.artist || 'Ukendt',
    venue: row.venue || undefined,
    eventDate: row.eventDate || undefined,
    applicants,
    accessRequested: row.accessRequested || undefined,
    notes: row.notes || undefined,
  });

  return (
    (await updateRequest(
      created.id,
      {
        promoter: row.promoter || undefined,
        contactName: row.contactName || undefined,
        contactEmail: row.contactEmail || undefined,
        contactConfidence: confidence,
        senderMailbox: row.senderMailbox || DEFAULT_SENDER_MAILBOX,
        status: status || 'closed',
        outcomeReason: row.outcomeReason || undefined,
        sheetRowNumber: row.rowNumber,
      },
      { bypassTransitionCheck: true }
    )) || created
  );
}

function mapSheetStatus(raw: string): AccreditationRequestStatus | undefined {
  const s = raw.trim().toLowerCase();
  if (!s) return undefined;
  if (s.includes('reject') || s.includes('afvis') || s.includes('denied')) return 'denied';
  if (s.includes('grant') || s.includes('godkend') || s.includes('approved') || s.includes('access'))
    return 'granted';
  if (s.includes('wait') || s.includes('afvent')) return 'sent_awaiting_reply';
  if (s.includes('closed') || s.includes('lukket') || s.includes('migrat')) return 'closed';
  if (s.includes('draft')) return 'draft_ready';
  return undefined;
}

function inferConfidenceFromSheet(row: WorkflowSheetRow): ContactConfidence | undefined {
  if (row.contactEmail?.includes('@')) return 'high';
  if (row.contactName || row.promoter) return 'medium';
  return undefined;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryRequests.clear();
  },
});
