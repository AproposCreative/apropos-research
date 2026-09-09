import { readJsonFile, writeJsonFile } from '@/lib/funding/json-store';
import { newEntityId } from '@/lib/accreditation/ids';
import { resolveAccreditationPersistenceKind } from '@/lib/accreditation/persistence/env';
import { requireFirestore, stripUndefined } from '@/lib/accreditation/persistence/firestore-kit';
import { registerAccreditationStoreReset } from '@/lib/accreditation/persistence/reset-registry';
import type { LivInboxItem } from '@/lib/liv-inbox/types';

const FILENAME = 'liv_inbox_items.json';
const COLLECTION = 'livInboxItems';
const MAX_ITEMS = 200;

const memoryItems = new Map<string, LivInboxItem>();

function sortNewestFirst(items: LivInboxItem[]): LivInboxItem[] {
  return [...items].sort((a, b) => b.receivedAt.localeCompare(a.receivedAt));
}

async function loadAll(): Promise<LivInboxItem[]> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return [...memoryItems.values()];
  if (kind === 'json') return readJsonFile<LivInboxItem[]>(FILENAME, []);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTION).get();
  return snap.docs.map((d) => d.data() as LivInboxItem);
}

async function saveOne(item: LivInboxItem): Promise<void> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') {
    memoryItems.set(item.id, item);
    return;
  }
  if (kind === 'json') {
    const all = readJsonFile<LivInboxItem[]>(FILENAME, []);
    const idx = all.findIndex((i) => i.id === item.id);
    if (idx >= 0) all[idx] = item;
    else all.push(item);
    writeJsonFile(FILENAME, sortNewestFirst(all).slice(0, MAX_ITEMS));
    return;
  }
  const db = requireFirestore();
  await db
    .collection(COLLECTION)
    .doc(item.id)
    .set(stripUndefined({ ...item } as Record<string, unknown>), { merge: true });
}

export async function listInboxItems(): Promise<LivInboxItem[]> {
  return sortNewestFirst(await loadAll());
}

export async function getInboxItem(id: string): Promise<LivInboxItem | undefined> {
  const kind = resolveAccreditationPersistenceKind();
  if (kind === 'memory') return memoryItems.get(id);
  if (kind === 'json') return readJsonFile<LivInboxItem[]>(FILENAME, []).find((i) => i.id === id);
  const db = requireFirestore();
  const snap = await db.collection(COLLECTION).doc(id).get();
  if (!snap.exists) return undefined;
  return snap.data() as LivInboxItem;
}

export async function createInboxItem(
  input: Omit<LivInboxItem, 'id'> & { id?: string }
): Promise<LivInboxItem> {
  const item: LivInboxItem = { ...input, id: input.id || newEntityId('inbox') };
  await saveOne(item);
  return item;
}

export async function updateInboxItem(
  id: string,
  patch: Partial<Omit<LivInboxItem, 'id'>>
): Promise<LivInboxItem | null> {
  const existing = await getInboxItem(id);
  if (!existing) return null;
  const next: LivInboxItem = { ...existing, ...patch, id: existing.id };
  await saveOne(next);
  return next;
}

registerAccreditationStoreReset({
  __resetForTests() {
    memoryItems.clear();
  },
});
