import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, state: {} as any, expected: {} as any, inspect: vi.fn(), deliver: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => mock.state, readDeliveryPayload: async () => mock.expected }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: mock.inspect }));
vi.mock('@/lib/liv/deliver-ready', () => ({ deliverReadyArticle: mock.deliver }));
import { publicationState, previewPublication, approvePublication, executePublication, readPublication } from '@/lib/mcp/publication';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const memory = memoryFirestore(), itemId = 'a'.repeat(24), uid = 'frederik', day = '2026-10-04';
beforeEach(() => {
  memory.clear(); vi.clearAllMocks(); mock.db = memory.db; vi.useFakeTimers(); vi.setSystemTime(new Date(`${day}T09:00:00Z`));
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'auto_publish'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  mock.expected = { title: 'Testtitel', slug: 'testtitel', content: '<p>Testtekst</p>', featuredImage: 'https://example.com/cover.jpg' };
  mock.state = { slots: {}, entries: [{ itemId, title: 'Testtitel', kind: 'scheduled', state: 'ready', scheduledDay: day, expiresDay: day, payloadHash: cmsFieldHash(mock.expected) }] };
  mock.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }], fieldDataHash: 'f'.repeat(64) });
  mock.deliver.mockResolvedValue({ status: 'published', publicationVerified: true, itemId, publicUrl: 'https://www.aproposmagazine.com/articles/testtitel' });
});
afterEach(() => { vi.useRealTimers(); vi.unstubAllEnvs(); });
async function preview() {
  const result = await previewPublication(uid, itemId); if (!('previewId' in result)) throw Error('not_ready'); return result.previewId;
}
it('produces a pinned preview without publishing or approving', async () => {
  const id = await preview(); expect(memory.rows.get(`mcpPublications/${id}`)).toMatchObject({ uid, itemId, approved: false, attempted: false, payloadHash: cmsFieldHash(mock.expected) });
  expect(mock.deliver).not.toHaveBeenCalled();
});
it.each(['absent', 'rejected', 'future', 'blocked', 'coverRevision', 'otherSlot', 'mediaFailed'])('does not promote an unready article: %s', async kind => {
  if (kind === 'absent') mock.state.entries = [];
  if (kind === 'rejected') mock.state.entries[0].decision = 'rejected';
  if (kind === 'future') mock.state.entries[0].scheduledDay = '2026-10-06';
  if (kind === 'blocked') mock.state.entries[0].publicationBlockers = ['rights'];
  if (kind === 'coverRevision') mock.state.coverRevision = { itemId };
  if (kind === 'otherSlot') mock.state.slots[day] = { itemId: 'b'.repeat(24) };
  if (kind === 'mediaFailed') mock.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: false, checks: [{ id: 'missing_images', ok: false }], fieldDataHash: 'f'.repeat(64) });
  expect(await publicationState(itemId)).toMatchObject({ ready: false }); expect(memory.rows.size).toBe(0); expect(mock.deliver).not.toHaveBeenCalled();
});
it('does not accept an empty list of publication checks', async () => {
  mock.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [], fieldDataHash: 'f'.repeat(64) });
  expect(await publicationState(itemId)).toMatchObject({ ready: false });
});
it('requires separate authenticated human confirmation and correct owner', async () => {
  const id = await preview(); await expect(executePublication(uid, id)).rejects.toThrow('human_confirmation');
  await expect(readPublication('casper', id)).rejects.toThrow('preview_not_found');
  await expect(approvePublication('casper', id)).rejects.toThrow('preview_not_found'); expect(mock.deliver).not.toHaveBeenCalled();
});
it.each(['cms', 'payload', 'expiry', 'day'])('rejects a stale preview before confirming: %s', async kind => {
  const id = await preview();
  if (kind === 'cms') mock.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }], fieldDataHash: 'e'.repeat(64) });
  if (kind === 'payload') mock.expected.title = 'Changed';
  if (kind === 'expiry') vi.advanceTimersByTime(600001);
  if (kind === 'day') vi.advanceTimersByTime(86400000);
  await expect(approvePublication(uid, id)).rejects.toThrow(); expect(mock.deliver).not.toHaveBeenCalled();
});
it('rechecks after approval before publication', async () => {
  const id = await preview(); await approvePublication(uid, id); mock.state.entries[0].publicationBlockers = ['changed'];
  await expect(executePublication(uid, id)).rejects.toThrow('revision_conflict'); expect(mock.deliver).not.toHaveBeenCalled();
});
it('uses the existing verified path and replays the same receipt', async () => {
  const id = await preview(); expect(await approvePublication(uid, id)).toEqual({ approved: true, publicationStarted: false });
  const first = await executePublication(uid, id); const replay = await executePublication(uid, id);
  expect(replay).toEqual(first); expect(mock.deliver).toHaveBeenCalledTimes(1);
  expect(mock.deliver.mock.calls[0][2]).toMatchObject({ itemId, requestId: `mcp-${id}`, expectedPayloadHash: cmsFieldHash(mock.expected) });
});
it('reuses the same delivery identity after timeout and never fabricates a receipt', async () => {
  const id = await preview(); await approvePublication(uid, id); mock.deliver.mockRejectedValueOnce(Error('timeout'));
  await expect(executePublication(uid, id)).rejects.toThrow('timeout');
  mock.deliver.mockResolvedValue({ status: 'published', day });
  expect(await executePublication(uid, id)).toMatchObject({ status: 'reconciliation_required', publicationVerified: false });
  expect(mock.deliver.mock.calls[0][2].requestId).toBe(mock.deliver.mock.calls[1][2].requestId);
});
it('accepts only the exact completed delivery receipt on retry', async () => {
  const id = await preview(); await approvePublication(uid, id); mock.deliver.mockImplementation(async () => {
    mock.state.slots[day] = { itemId, state: 'published', publicUrl: 'https://www.aproposmagazine.com/articles/testtitel', checkedAt: new Date().toISOString(), explicitPublication: { requestId: `mcp-${id}` } };
    return { status: 'published', day };
  });
  expect(await executePublication(uid, id)).toMatchObject({ publicationVerified: true, replay: true, itemId });
});
it('respects the publication kill switch', async () => {
  const id = await preview(); await approvePublication(uid, id); vi.stubEnv('LIV_DAILY_PAUSED', 'true');
  await expect(executePublication(uid, id)).rejects.toThrow('publication_disabled'); expect(mock.deliver).not.toHaveBeenCalled();
});
