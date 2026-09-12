import { afterEach, beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn() } }));
import { logger } from '@/lib/logger';
import * as store from '@/lib/liv/delivery-store';
import { deliverReadyArticle } from '@/lib/liv/deliver-ready';
import { emptyDeliveryState } from '@/lib/liv/delivery-policy';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const now = new Date('2026-09-11T08:00:00Z'), day = '2026-09-11';
beforeEach(() => { vi.clearAllMocks(); vi.useFakeTimers(); vi.setSystemTime(now); });
afterEach(() => vi.useRealTimers());
function fixture() {
  const state = emptyDeliveryState();
  state.entries = ['a', 'b'].map((id, i) => ({ itemId: id.repeat(24), slug: `artikel-${id}`, title: 'Artikel',
    kind: i ? 'reserve' : 'scheduled', state: 'ready', scheduledDay: day, expiresDay: '2026-09-18',
    payloadHash: cmsFieldHash({ title: 'Artikel', slug: 'artikel-a' }), preparedAt: now.toISOString() }));
  const receipt = { publicationVerified: true as const, publicUrl: 'https://www.aproposmagazine.com/articles/artikel-a',
    itemId: 'a'.repeat(24), localeId: 'd'.repeat(24), checkedAt: now.toISOString() };
  const publish = vi.fn(async (input: { beforePublish?: (hash: string) => Promise<void> }) => {
    await input.beforePublish?.('c'.repeat(64)); return receipt;
  });
  const verify = vi.fn().mockResolvedValue(receipt);
  const deps = { ...store, readDeliveryState: async () => structuredClone(state),
    claimDelivery: async (d: string, time = Date.now()) => store.selectDelivery(state, d, time, String(time)),
    readDeliveryPayload: async () => ({ title: 'Artikel', slug: 'artikel-a' } as WebflowArticleFields),
    updateDelivery: async (d: string, token: string, change: Parameters<typeof store.updateDelivery>[2]) => {
      if (state.slots[d]?.token !== token) throw new Error('liv_delivery_lease_lost');
      change(state.slots[d], state);
    }, publish, verify, planHash: async () => 'current-plan', record: vi.fn().mockResolvedValue(undefined) };
  return { state, publish, verify, deps };
}
it('does not publish before 10 Copenhagen', async () => {
  const f = fixture();
  expect(await deliverReadyArticle(new Date('2026-09-11T07:59:00Z'), f.deps)).toMatchObject({ status: 'before_deadline' });
  expect(f.publish).not.toHaveBeenCalled();
});
it('publishes one item and treats duplicate ticks as completed', async () => {
  const f = fixture();
  expect(await deliverReadyArticle(now, f.deps)).toMatchObject({ status: 'published' });
  await deliverReadyArticle(now, f.deps);
  expect(f.publish).toHaveBeenCalledTimes(1);
  expect(f.state.entries[0].state).toBe('published');
  expect(f.state.entries[1].state).toBe('ready');
});
it('falls back to the reserve after definitive pre-write rejection', async () => {
  const f = fixture(); f.publish.mockRejectedValueOnce(new Error('liv_publication_checks_failed'));
  expect(await deliverReadyArticle(now, f.deps)).toMatchObject({ status: 'retry_required' });
  expect(f.state.entries[0].state).toBe('rejected');
  await deliverReadyArticle(now, f.deps);
  expect(f.state.slots[day].itemId).toBe('b'.repeat(24));
});
it('uses read-only reconciliation after an ambiguous external write', async () => {
  const f = fixture();
  f.publish.mockImplementationOnce(async input => { await input.beforePublish?.('c'.repeat(64)); throw new Error('timeout'); });
  expect(await deliverReadyArticle(now, f.deps)).toMatchObject({ status: 'reconciliation_required' });
  expect(f.state.slots[day].state).toBe('attempted');
  const later = new Date(now.getTime() + 16 * 60_000); vi.setSystemTime(later);
  expect(await deliverReadyArticle(later, f.deps)).toMatchObject({ status: 'published' });
  expect(f.publish).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
  expect(f.state.entries[1].state).toBe('ready');
});
it('retains the chosen item after a pre-write network failure', async () => {
  const f = fixture(); f.publish.mockRejectedValueOnce(new Error('network'));
  await deliverReadyArticle(now, f.deps);
  expect(f.state.slots[day]).toMatchObject({ state: 'selected', itemId: 'a'.repeat(24) });
  await deliverReadyArticle(now, f.deps);
  expect(f.publish).toHaveBeenCalledTimes(1);
});
it('never switches to a second story while a previous write is unverified', async () => {
  const f = fixture();
  f.publish.mockImplementationOnce(async input => { await input.beforePublish?.('c'.repeat(64)); throw new Error('timeout'); });
  await deliverReadyArticle(now, f.deps);
  f.verify.mockRejectedValue(new Error('liv_publication_public_page_mismatch'));
  const tomorrow = new Date('2026-09-12T08:00:00Z'); vi.setSystemTime(tomorrow);
  expect(await deliverReadyArticle(tomorrow, f.deps)).toMatchObject({ status: 'reconciliation_required', day });
  expect(f.publish).toHaveBeenCalledTimes(1); expect(f.state.slots['2026-09-12']).toBeUndefined();
});
it('rejects a scheduled story after the editor changes the plan', async () => {
  const f = fixture(); f.state.entries[0].planHash = 'old-plan';
  await deliverReadyArticle(now, f.deps);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.state.entries[0].state).toBe('rejected');
});
it('reconciles rather than republishing after the history database fails', async () => {
  const f = fixture(); f.deps.record.mockRejectedValueOnce(new Error('database down'));
  await deliverReadyArticle(now, f.deps);
  const later = new Date(now.getTime() + 16 * 60_000); vi.setSystemTime(later);
  expect(await deliverReadyArticle(later, f.deps)).toMatchObject({ status: 'published' });
  expect(f.publish).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
});

it('persists and logs a safe preflight HTTP reason while retaining the selected item and backoff', async () => {
  const f = fixture(); f.publish.mockRejectedValueOnce(new Error('Webflow locale update error 400'));
  expect(await deliverReadyArticle(now, f.deps)).toMatchObject({ status: 'retry_required', reason: 'liv_delivery_upstream_http_400' });
  const lastFailure = { at: now.toISOString(), stage: 'publication_preflight', reason: 'liv_delivery_upstream_http_400', attempted: false };
  expect(f.state.slots[day]).toMatchObject({ state: 'selected', leaseUntil: 0,
    nextAttemptAt: now.getTime() + 15 * 60_000, lastFailure });
  expect(f.state.entries[0]).toMatchObject({ lastFailure });
  expect(logger.warn).toHaveBeenCalledWith('[liv/delivery] attempt failed', { day, itemId: 'a'.repeat(24), ...lastFailure });
});

it('retains a definitive rejection reason on the entry after its slot is removed', async () => {
  const f = fixture(); f.publish.mockRejectedValueOnce(new Error('liv_publication_checks_failed'));
  await deliverReadyArticle(now, f.deps);
  expect(f.state.slots[day]).toBeUndefined();
  expect(f.state.entries[0]).toMatchObject({ state: 'rejected', lastFailure: {
    stage: 'publication_preflight', reason: 'liv_publication_checks_failed', attempted: false,
  } });
});

it('does not expose upstream secrets in persisted errors, logs, or the returned reason', async () => {
  const f = fixture(); const secret = 'Bearer private-token https://upstream.example/?token=private-token';
  f.publish.mockRejectedValueOnce(new Error(secret));
  const result = await deliverReadyArticle(now, f.deps);
  expect(result.reason).toBe('liv_delivery_failed');
  expect(JSON.stringify([result, f.state, vi.mocked(logger.warn).mock.calls])).not.toContain('private-token');
});

it('records post-intent failures as ambiguous without retrying publication', async () => {
  const f = fixture();
  f.publish.mockImplementationOnce(async input => { await input.beforePublish?.('c'.repeat(64)); throw new Error('liv_publication_live_mismatch'); });
  await deliverReadyArticle(now, f.deps);
  expect(f.state.slots[day]).toMatchObject({ state: 'attempted', lastFailure: {
    stage: 'publish_or_readback', reason: 'liv_publication_live_mismatch', attempted: true,
  } });
  const later = new Date(now.getTime() + 16 * 60_000); vi.setSystemTime(later);
  await deliverReadyArticle(later, f.deps);
  expect(f.publish).toHaveBeenCalledTimes(1); expect(f.verify).toHaveBeenCalledTimes(1);
});
