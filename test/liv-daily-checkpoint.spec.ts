import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as Record<string, any>, available: true, writes: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: () => ({ doc: (id: string) => id }),
  runTransaction: async (fn: any) => fn({
    get: async () => ({ data: () => state.row }),
    set: (_ref: unknown, patch: any) => { state.writes(patch); Object.assign(state.row, patch); },
  }),
} : null }));
import { claimLivDaily, checkpointLivDailyCmsItem } from '@/lib/liv/daily-history-store';
const id = '0123456789abcdef01234567';
beforeEach(() => {
  state.available = true;
  state.row = { status: 'processing', processingStartedAt: { toMillis: () => 1 } };
  state.writes.mockClear();
});
it('retains the item before completion and prevents stale processing from creating it again', async () => {
  await checkpointLivDailyCmsItem('2026-09-10', id);
  expect(state.row.webflowItemId).toBe(id);
  expect(await claimLivDaily('2026-09-10')).toEqual({ ok: false, reason: 'already_done' });
  expect(state.writes).toHaveBeenCalledTimes(1);
});
it('permits recovery of stale processing with no known CMS item', async () => {
  expect(await claimLivDaily('2026-09-10')).toEqual({ ok: true, dayKey: '2026-09-10' });
});
it('does not overwrite a different known item', async () => {
  state.row.webflowItemId = '1123456789abcdef01234567';
  await expect(checkpointLivDailyCmsItem('2026-09-10', id)).rejects.toThrow('conflict');
  expect(state.writes).not.toHaveBeenCalled();
});
it('does not overwrite a completed run', async () => {
  state.row.status = 'published';
  await expect(checkpointLivDailyCmsItem('2026-09-10', id)).rejects.toThrow('conflict');
});
it('fails explicitly if the checkpoint store is unavailable', async () => {
  state.available = false;
  await expect(checkpointLivDailyCmsItem('2026-09-10', id)).rejects.toThrow('unavailable');
});
it('rejects an invalid identity before writing', async () => {
  await expect(checkpointLivDailyCmsItem('../day', id)).rejects.toThrow('invalid');
  await expect(checkpointLivDailyCmsItem('2026-09-10', 'bad-id')).rejects.toThrow('invalid');
  expect(state.writes).not.toHaveBeenCalled();
});
