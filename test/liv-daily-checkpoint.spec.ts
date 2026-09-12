import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ row: {} as Record<string, any>, available: true, writes: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: () => ({ doc: (id: string) => id }),
  runTransaction: async (fn: any) => fn({
    get: async () => ({ data: () => state.row }),
    set: (_ref: unknown, patch: any) => { state.writes(patch); Object.assign(state.row, patch); },
  }),
} : null }));
import { claimLivDaily, checkpointLivDailyCmsItem, checkpointLivDailyArticle, yieldLivPreparation } from '@/lib/liv/daily-history-store';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
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
it('retries only pre-generation preparation failures, never daily terminal results', async () => {
  state.row = { status: 'skipped_no_topic' };
  expect(await claimLivDaily('2026-09-12')).toEqual({ ok: false, reason: 'already_done' });
  expect(await claimLivDaily('2026-09-12', 'prepare')).toEqual({ ok: true, dayKey: '2026-09-12' });
  expect(state.row.preparationAttempts).toBe(1);
});
it('cannot claim a preparation retry a fourth time', async () => {
  state.row = { status: 'failed', reason: 'liv_trending_http_401', preparationAttempts: 3 };
  expect(await claimLivDaily('2026-09-12', 'prepare')).toEqual({ ok: false, reason: 'already_done' });
  expect(state.writes).not.toHaveBeenCalled();
});
it('preserves an article checkpoint even when its hash is absent', async () => {
  state.row = { status: 'skipped_no_topic', articleCheckpoint: { title: 'Already generated' } };
  expect(await claimLivDaily('2026-09-12', 'prepare')).toEqual({ ok: false, reason: 'already_done' });
});
it('preserves generated text and prevents a stale retry from regenerating paid media', async () => {
  const article = { title: 'Kunst i parken', slug: 'kunst', intro: 'Intro', content: 'Gemt tekst' } as GeneratedArticle;
  await checkpointLivDailyArticle('2026-09-10', article);
  expect(state.row.articleCheckpoint).toEqual(article);
  expect(state.row.articleCheckpointHash).toMatch(/^[a-f0-9]{64}$/);
  expect(await claimLivDaily('2026-09-10')).toEqual({ ok: false, reason: 'already_done' });
});
it('cannot replace text after the CMS item has been saved', async () => {
  state.row.webflowItemId = id;
  await expect(checkpointLivDailyArticle('2026-09-10', { title: 'Title', content: 'Content' } as GeneratedArticle)).rejects.toThrow('conflict');
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
it('yields saved text and resumes it without waiting for a stale worker', async () => {
  state.row.articleCheckpoint = { title: 'Saved', content: 'Paid text' };
  state.row.processingStartedAt = { toMillis: () => Date.now() };
  await yieldLivPreparation('2026-09-12', 'prepare');
  expect(state.row.continuationReady).toBe(true);
  expect(await claimLivDaily('2026-09-12', 'prepare')).toMatchObject({ ok: true });
  expect(state.row.continuationReady).toBe(false);
  expect(state.row.articleCheckpoint.content).toBe('Paid text');
});
it('allows one explicitly authorized retry without resetting attempts or text', async () => {
  state.row = { status: 'failed', preparationAttempts: 5, retryAuthorization: 'audit-id',
    articleCheckpoint: { content: 'Paid text' } };
  expect(await claimLivDaily('2026-09-12', 'prepare')).toMatchObject({ ok: true });
  expect(state.row.preparationAttempts).toBe(6);
  expect(state.row.articleCheckpoint.content).toBe('Paid text');
  expect(typeof state.row.retryAuthorization).not.toBe('string');
});
it.each(['webflowItemId', 'preparationProof', 'cmsSaveStarted'])('retry never bypasses an uncertain CMS write: %s', async key => {
  state.row = { status: 'failed', retryAuthorization: 'audit-id', [key]: key === 'webflowItemId' ? id : true };
  expect(await claimLivDaily('2026-09-12', 'prepare')).toMatchObject({ ok: false });
});
it('resumes failed complete-media checkpoints instead of filtering them out as terminal', async () => {
  state.row = { status: 'failed', preparationAttempts: 4, articleCheckpoint: { preparedMedia: [{}, {}, {}] } };
  expect(await claimLivDaily('2026-09-12', 'prepare')).toMatchObject({ ok: true });
});
