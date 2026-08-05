import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import {
  COLLECTIONS,
  requireFirestore,
} from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';

const COUNTER_FILE = 'accreditation_id_counter.json';
const DOC_ID = 'request';

type CounterState = { next: number };

let memoryNext = 1;

/** Sequential LIV-NNN ids — Firestore transaction in production. */
export async function nextRequestId(): Promise<string> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    const id = `LIV-${String(memoryNext).padStart(3, '0')}`;
    memoryNext += 1;
    return id;
  }
  if (kind === 'json') {
    const state = readJsonFile<CounterState>(COUNTER_FILE, { next: 1 });
    const id = `LIV-${String(state.next).padStart(3, '0')}`;
    writeJsonFile(COUNTER_FILE, { next: state.next + 1 });
    return id;
  }

  const db = requireFirestore();
  const ref = db.collection(COLLECTIONS.idCounter).doc(DOC_ID);
  const n = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const current = Number(snap.data()?.next || 1);
    tx.set(ref, { next: current + 1, updatedAt: new Date().toISOString() }, { merge: true });
    return current;
  });
  return `LIV-${String(n).padStart(3, '0')}`;
}

export function newEntityId(prefix: string): string {
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryNext = 1;
  },
});
