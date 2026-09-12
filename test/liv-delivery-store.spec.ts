import { beforeEach, expect, it, vi } from 'vitest';
const database = vi.hoisted(() => ({ rows: new Map<string, any>(), available: true }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => database.available ? {
  collection: (name: string) => ({ doc: (id: string) => ({ key: `${name}/${id}`,
    get: async () => ({ data: () => structuredClone(database.rows.get(`${name}/${id}`)) }) }) }),
  runTransaction: async (fn: any) => {
    const writes: Array<() => void> = [];
    const result = await fn({
      get: async (ref: any) => {
        if (writes.length) throw new Error('read_after_write');
        return { exists: database.rows.has(ref.key), data: () => structuredClone(database.rows.get(ref.key)) };
      },
      set: (ref: any, data: any) => writes.push(() => database.rows.set(ref.key, structuredClone(data))),
      create: (ref: any, data: any) => {
        if (database.rows.has(ref.key)) throw new Error('exists');
        writes.push(() => database.rows.set(ref.key, structuredClone(data)));
      },
    });
    writes.forEach(write => write()); return result;
  },
} : null }));
import { enqueueReadyArticle, claimDelivery, readDeliveryPayload, readDeliveryState,
  updateDelivery, claimPreparation, releasePreparation, decideDelivery } from '@/lib/liv/delivery-store';
import type { WebflowArticleFields } from '@/lib/webflow/types';
const day = '2026-09-11', itemId = 'a'.repeat(24);
const entry = { itemId, slug: 'kultur', title: 'Kultur', scheduledDay: day, expiresDay: day, kind: 'scheduled' as const };
const expected = { title: 'Kultur', slug: 'kultur', content: 'Tekst' } as WebflowArticleFields;
beforeEach(() => { database.rows.clear(); database.available = true; });
it('atomically stores a single ready entry and immutable payload', async () => {
  await enqueueReadyArticle(entry, expected); await enqueueReadyArticle(entry, expected);
  expect((await readDeliveryState()).entries).toHaveLength(1);
  expect(await readDeliveryPayload(itemId)).toEqual(expected);
});
it('rejects slug reuse even if the manifest no longer contains the original entry', async () => {
  await enqueueReadyArticle(entry, expected);
  database.rows.set('livDelivery/manifest', { entries: [], slots: {} });
  await expect(enqueueReadyArticle({ ...entry, itemId: 'b'.repeat(24) }, expected)).rejects.toThrow('duplicate');
});
it('rejects changed payload for an existing item', async () => {
  await enqueueReadyArticle(entry, expected);
  await expect(enqueueReadyArticle(entry, { ...expected, content: 'Ændret' })).rejects.toThrow('duplicate');
});
it('detects payload corruption on read', async () => {
  await enqueueReadyArticle(entry, expected);
  database.rows.get(`livDelivery/item-${itemId}`).expected.content = 'Ændret';
  await expect(readDeliveryPayload(itemId)).rejects.toThrow('changed');
});
it('does not publish another item if the legacy job already ran', async () => {
  await enqueueReadyArticle(entry, expected);
  database.rows.set(`livDailyArticles/daily-${day}`, { status: 'published', webflowItemId: 'legacy' });
  expect(await claimDelivery(day, 100)).toBeNull();
});
it('can use the reserve queue after a legacy no-topic skip', async () => {
  await enqueueReadyArticle(entry, expected);
  database.rows.set(`livDailyArticles/daily-${day}`, { status: 'skipped_no_topic' });
  expect(await claimDelivery(day, 100)).toMatchObject({ itemId, state: 'selected' });
});
it('rejects stale lease tokens', async () => {
  await enqueueReadyArticle(entry, expected);
  const first = await claimDelivery(day, 100);
  await claimDelivery(day, 400000);
  await expect(updateDelivery(day, first!.token, s => { s.state = 'published'; })).rejects.toThrow('lease_lost');
});
it('allows one preparation worker and prevents an old worker from unlocking its successor', async () => {
  const first = await claimPreparation(100);
  expect(await claimPreparation(101)).toBeNull();
  const second = await claimPreparation(400000);
  await releasePreparation(first!);
  expect((await readDeliveryState()).preparation?.token).toBe(second);
});
it('fails closed when the database is unavailable', async () => {
  database.available = false;
  await expect(claimDelivery(day)).rejects.toThrow('unavailable');
});
async function choice() {
  await enqueueReadyArticle(entry, expected);
  return { itemId, payloadHash: (await readDeliveryState()).entries[0].payloadHash, revision: 0, decision: 'approved' as const };
}
it('persists an approval with user and exact revision, and allows reversal', async () => {
  const input = await choice();
  await decideDelivery(input, 'editor', new Date('2026-09-10T12:00:00Z'));
  expect((await readDeliveryState()).entries[0]).toMatchObject({ decision: 'approved', decisionRevision: 1, decidedBy: 'editor' });
  await decideDelivery({ ...input, revision: 1, decision: 'rejected' }, 'editor', new Date('2026-09-10T13:00:00Z'));
  expect((await readDeliveryState()).entries[0].decision).toBe('rejected');
});
it('a rejection committed before worker selection blocks automatic publication', async () => {
  await decideDelivery({ ...await choice(), decision: 'rejected' }, 'editor', new Date('2026-09-10T12:00:00Z'));
  expect(await claimDelivery(day, 100)).toBeNull();
});
it('a worker selection committed first locks editorial changes', async () => {
  const input = await choice();
  await claimDelivery(day, 100);
  await expect(decideDelivery({ ...input, decision: 'rejected' }, 'editor', new Date('2026-09-10T12:00:00Z'))).rejects.toThrow('Opdater');
  expect((await readDeliveryState()).entries[0].decision).toBeUndefined();
});
it('rejects a stale browser tab and mismatched content without overwriting the latest choice', async () => {
  const input = await choice(), now = new Date('2026-09-10T12:00:00Z');
  await expect(decideDelivery({ ...input, payloadHash: 'f'.repeat(64) }, 'editor', now)).rejects.toThrow('Opdater');
  await decideDelivery(input, 'editor', now);
  await expect(decideDelivery({ ...input, decision: 'rejected' }, 'second-editor', now)).rejects.toThrow('Opdater');
});
it('cannot approve an expired story or accept an invalid action', async () => {
  const input = await choice();
  await expect(decideDelivery(input, 'editor', new Date('2026-09-12T12:00:00Z'))).rejects.toThrow('Opdater');
  await expect(decideDelivery({ ...input, decision: 'publish' as any }, 'editor')).rejects.toThrow('invalid_decision');
});
it('atomically stores private attributed feedback without changing content, assets or payload hash', async () => {
  const input = await choice(), now = new Date('2026-09-10T12:00:00Z');
  const originalPayload = structuredClone(database.rows.get(`livDelivery/item-${itemId}`));
  const result = await decideDelivery({ ...input, feedback: '  Mere konkret kulturkritik.  ' }, 'editor', now);
  expect(result).toMatchObject({ feedback: 'Mere konkret kulturkritik.', revision: 1 });
  expect((await readDeliveryState()).entries[0]).toMatchObject({ payloadHash: input.payloadHash,
    editorialFeedback: { text: 'Mere konkret kulturkritik.', userId: 'editor', revision: 1, recordedAt: now.toISOString() } });
  expect(database.rows.get(`livEditorialFeedback/decision-${itemId}-1`)).toMatchObject({
    source: 'liv-delivery-decision', scope: 'liv-daily', itemId, payloadHash: input.payloadHash, userId: 'editor',
    previousDecision: 'pending', previousRevision: 0, decision: 'approved', text: 'Mere konkret kulturkritik.',
  });
  expect(database.rows.get('livEditorialFeedback/recent').records).toHaveLength(1);
  expect(database.rows.get(`livDelivery/item-${itemId}`)).toEqual(originalPayload);
});
it('preserves audit on edits and permits only the author to clear their active preference', async () => {
  const input = await choice(), now = new Date('2026-09-10T12:00:00Z');
  await decideDelivery({ ...input, feedback: 'En konkret præference' }, 'editor', now);
  const audit = structuredClone(database.rows.get(`livEditorialFeedback/decision-${itemId}-1`));
  const other = await decideDelivery({ ...input, revision: 1, feedback: '' }, 'other-editor', now);
  expect(other.feedback).toBeNull();
  expect((await readDeliveryState()).entries[0].editorialFeedback?.userId).toBe('editor');
  expect(database.rows.get('livEditorialFeedback/recent').records).toHaveLength(1);
  await decideDelivery({ ...input, revision: 2, feedback: 'En ændret præference' }, 'editor', now);
  expect(database.rows.get('livEditorialFeedback/recent').records[0].text).toBe('En ændret præference');
  await decideDelivery({ ...input, revision: 3, feedback: '' }, 'editor', now);
  expect((await readDeliveryState()).entries[0].editorialFeedback).toBeUndefined();
  expect(database.rows.get('livEditorialFeedback/recent').records).toEqual([]);
  expect(database.rows.get(`livEditorialFeedback/decision-${itemId}-1`)).toEqual(audit);
  expect(database.rows.get(`livEditorialFeedback/decision-${itemId}-3`).text).toBe('En ændret præference');
});
it('keeps comments on old-client decisions that omit the optional field', async () => {
  const input = await choice(), now = new Date('2026-09-10T12:00:00Z');
  await decideDelivery({ ...input, feedback: 'Kortere indledning.' }, 'editor', now);
  await decideDelivery({ ...input, revision: 1, decision: 'rejected' }, 'editor', now);
  expect((await readDeliveryState()).entries[0].editorialFeedback?.text).toBe('Kortere indledning.');
  expect(database.rows.has(`livEditorialFeedback/decision-${itemId}-2`)).toBe(false);
});
it('cannot persist feedback through stale revision, changed payload, selected slot or invalid text', async () => {
  const input = await choice(), now = new Date('2026-09-10T12:00:00Z');
  const before = structuredClone(database.rows);
  for (const patch of [{ revision: 2 }, { payloadHash: 'f'.repeat(64) }, { feedback: 'x'.repeat(501) }]) {
    await expect(decideDelivery({ ...input, feedback: 'Test', ...patch }, 'editor', now)).rejects.toThrow();
    expect(database.rows).toEqual(before);
  }
  await claimDelivery(day, 100);
  const selected = structuredClone(database.rows);
  await expect(decideDelivery({ ...input, feedback: 'Test' }, 'editor', now)).rejects.toThrow('Opdater');
  expect(database.rows).toEqual(selected);
});
it('retains feedback and immutable audits after ready entries are compacted', async () => {
  const input = await choice(), now = new Date('2026-09-10T12:00:00Z');
  await decideDelivery({ ...input, feedback: 'Mere kulturhistorie.' }, 'editor', now);
  database.rows.set('livDelivery/manifest', { entries: [], slots: {} });
  expect(database.rows.get('livEditorialFeedback/recent').records[0].text).toBe('Mere kulturhistorie.');
  expect(database.rows.has(`livEditorialFeedback/decision-${itemId}-1`)).toBe(true);
});
it('does not overwrite an existing immutable audit or partially persist a failed transaction', async () => {
  const input = await choice();
  database.rows.set(`livEditorialFeedback/decision-${itemId}-1`, { text: 'Immutable old audit' });
  const before = structuredClone(database.rows);
  await expect(decideDelivery({ ...input, feedback: 'New comment' }, 'editor', new Date('2026-09-10T12:00:00Z')))
    .rejects.toThrow('exists');
  expect(database.rows).toEqual(before);
});
