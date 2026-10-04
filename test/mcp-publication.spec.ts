import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, state: {} as any, expected: {} as any, inspect: vi.fn(), deliver: vi.fn(), verify: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => mock.state, readDeliveryPayload: async () => mock.expected }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: mock.inspect }));
vi.mock('@/lib/liv/deliver-ready', () => ({ deliverReadyArticle: mock.deliver }));
vi.mock('@/lib/liv/publish-verified', () => ({ verifyLiveLivArticle: mock.verify }));
import { publicationState, previewPublication, approvePublication, executePublication, readPublication, getPublicationStatus } from '@/lib/mcp/publication';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
const memory = memoryFirestore(), itemId = 'a'.repeat(24), uid = 'frederik', day = '2026-10-04';
beforeEach(() => {
  memory.clear(); vi.clearAllMocks(); mock.db = memory.db; vi.useFakeTimers(); vi.setSystemTime(new Date(`${day}T09:00:00Z`));
  vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'true'); vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'auto_publish'); vi.stubEnv('LIV_DAILY_PAUSED', 'false');
  mock.expected = { title: 'Testtitel', slug: 'testtitel', content: '<p>Testtekst</p>', featuredImage: 'https://example.com/cover.jpg' };
  mock.state = { slots: {}, entries: [{ itemId, title: 'Testtitel', kind: 'scheduled', state: 'ready', scheduledDay: day, expiresDay: day, payloadHash: cmsFieldHash(mock.expected) }] };
  mock.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'all', ok: true }], fieldDataHash: 'f'.repeat(64) });
  mock.deliver.mockResolvedValue({ status: 'published', publicationVerified: true, itemId, publicUrl: 'https://www.aproposmagazine.com/articles/testtitel' });
  mock.verify.mockImplementation(async () => ({ publicationVerified: true, itemId, localeId: 'd'.repeat(24),
    publicUrl: 'https://www.aproposmagazine.com/articles/testtitel', checkedAt: new Date().toISOString() }));
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
it('recovers a lost publication response after midnight using readback only', async () => {
  const id = await preview(); await approvePublication(uid, id);
  mock.deliver.mockImplementationOnce(async () => {
    mock.state.slots[day] = { itemId, state: 'published', fieldDataHash: 'f'.repeat(64),
      publicUrl: 'https://www.aproposmagazine.com/articles/testtitel', checkedAt: new Date().toISOString(),
      explicitPublication: { requestId: `mcp-${id}`, itemId, expectedPayloadHash: cmsFieldHash(mock.expected) } };
    throw Error('response_lost');
  });
  await expect(executePublication(uid, id)).rejects.toThrow('response_lost');
  const preserved = JSON.stringify([...memory.rows]);
  vi.advanceTimersByTime(86400000);
  expect(await executePublication(uid, id)).toMatchObject({ status: 'published', publicationVerified: true, itemId,
    day, readOnly: true, recordedPublication: { checkedAt: `${day}T09:00:00.000Z` } });
  expect(mock.deliver).toHaveBeenCalledTimes(1); expect(mock.verify).toHaveBeenCalledTimes(1);
  expect(JSON.stringify([...memory.rows])).toBe(preserved);
});

async function attempted(state: 'attempted' | 'published' = 'published') {
  const id = await preview(); await approvePublication(uid, id);
  await memory.db.collection('mcpPublications').doc(id).update({ attempted: true });
  mock.state.slots[day] = { itemId, state, fieldDataHash: 'e'.repeat(64), token: 'PRIVATE-LEASE',
    publicUrl: 'https://www.aproposmagazine.com/articles/testtitel', checkedAt: new Date().toISOString(),
    explicitPublication: { requestId: `mcp-${id}`, itemId, expectedPayloadHash: cmsFieldHash(mock.expected) } };
  return id;
}
it('reads unconfirmed, approved and expired previews without dispatch or treating approval as publication', async () => {
  const id = await preview();
  expect(await getPublicationStatus(uid, id)).toMatchObject({ status: 'awaiting_confirmation', approved: false, publicationVerified: false });
  await approvePublication(uid, id);
  expect(await getPublicationStatus(uid, id)).toMatchObject({ status: 'confirmed_not_started', approved: true, publishRequested: false, publicationVerified: false });
  vi.advanceTimersByTime(600001);
  expect(await getPublicationStatus(uid, id)).toMatchObject({ status: 'preview_expired', previewExpired: true, publicationVerified: false });
  expect(mock.verify).not.toHaveBeenCalled(); expect(mock.deliver).not.toHaveBeenCalled();
});
it('reports current readback separately from a historical receipt, also with every publication switch off', async () => {
  const id = await attempted(), preserved = JSON.stringify([...memory.rows]), state = JSON.stringify(mock.state);
  vi.advanceTimersByTime(86400000); vi.stubEnv('LIV_DAILY_PAUSED', 'true'); vi.stubEnv('LIV_DELIVERY_QUEUE_ENABLED', 'false');
  vi.stubEnv('LIV_DAILY_PUBLICATION_MODE', 'draft');
  const result = await getPublicationStatus(uid, id);
  expect(result).toMatchObject({ status: 'published', itemId, day, readOnly: true, paidAiCalls: 0, deliveryFinalized: true,
    publicationVerified: true, publicationOrigin: 'operator', checkedAt: '2026-10-05T09:00:00.000Z',
    recordedPublication: { checkedAt: `${day}T09:00:00.000Z` } });
  expect(mock.verify).toHaveBeenCalledExactlyOnceWith({ itemId, expected: mock.expected, fieldDataHash: 'e'.repeat(64) });
  expect(JSON.stringify(result)).not.toContain('PRIVATE-LEASE');
  expect(JSON.stringify([...memory.rows])).toBe(preserved); expect(JSON.stringify(mock.state)).toBe(state);
  expect(mock.deliver).not.toHaveBeenCalled();
});
it('can confirm live content without falsely finalizing an uncertain server delivery', async () => {
  const id = await attempted('attempted'), before = JSON.stringify(mock.state);
  expect(await getPublicationStatus(uid, id)).toMatchObject({ status: 'published', publicationVerified: true,
    deliveryFinalized: false, recordedPublication: null });
  expect(JSON.stringify(mock.state)).toBe(before); expect(mock.deliver).not.toHaveBeenCalled();
});
it.each(['missing', 'item', 'request', 'explicitItem', 'payloadBinding', 'snapshotMissing', 'snapshotMalformed', 'selected'])('refuses unrelated or incomplete publication intent: %s', async kind => {
  const id = await attempted(), slot = mock.state.slots[day];
  if (kind === 'missing') delete mock.state.slots[day];
  if (kind === 'item') slot.itemId = 'b'.repeat(24);
  if (kind === 'request') slot.explicitPublication.requestId = 'mcp-other';
  if (kind === 'explicitItem') slot.explicitPublication.itemId = 'b'.repeat(24);
  if (kind === 'payloadBinding') slot.explicitPublication.expectedPayloadHash = 'b'.repeat(64);
  if (kind === 'snapshotMissing') delete slot.fieldDataHash;
  if (kind === 'snapshotMalformed') slot.fieldDataHash = 'not-a-hash';
  if (kind === 'selected') slot.state = 'selected';
  expect(await getPublicationStatus(uid, id)).toMatchObject({ status: 'reconciliation_required', publicationVerified: false,
    reason: 'matching_publication_intent_missing' });
  expect(mock.verify).not.toHaveBeenCalled(); expect(mock.deliver).not.toHaveBeenCalled();
});
it('does not verify a different retained article version', async () => {
  const id = await attempted(); mock.expected.content += '<p>En senere ændring</p>';
  expect(await getPublicationStatus(uid, id)).toMatchObject({ publicationVerified: false, status: 'reconciliation_required', reason: 'payload_version_changed' });
  expect(mock.verify).not.toHaveBeenCalled();
});
it.each(['liv_publication_public_page_mismatch', 'secret-token https://private.example/?key=private'])('does not certify an old receipt when fresh readback fails: %s', async message => {
  const id = await attempted(); mock.verify.mockRejectedValue(Error(message));
  const preserved = JSON.stringify([...memory.rows]);
  const result = await getPublicationStatus(uid, id);
  expect(result).toMatchObject({ publicationVerified: false, status: 'reconciliation_required', reason: 'live_readback_unconfirmed',
    recordedPublication: { checkedAt: `${day}T09:00:00.000Z` }, deliveryFinalized: true });
  expect(JSON.stringify(result)).not.toMatch(/secret-token|private.example/);
  expect(JSON.stringify([...memory.rows])).toBe(preserved); expect(mock.deliver).not.toHaveBeenCalled();
});
it.each([{ itemId: 'b'.repeat(24) }, { publicUrl: 'https://example.com/another-article' }, { checkedAt: 'invalid' },
  { publicationVerified: false }])('rejects an inconsistent fresh readback result: %j', async changed => {
  const id = await attempted(); mock.verify.mockResolvedValue({ publicationVerified: true, itemId,
    publicUrl: 'https://www.aproposmagazine.com/articles/testtitel', checkedAt: new Date().toISOString(), ...changed });
  expect(await getPublicationStatus(uid, id)).toMatchObject({ publicationVerified: false, status: 'reconciliation_required', detail: 'liv_publication_readback_mismatch' });
});
it('does not expose another owner operation or claim a non-existent preview exists', async () => {
  const id = await attempted();
  await expect(getPublicationStatus('casper', id)).rejects.toThrow('mcp_preview_not_found');
  await expect(getPublicationStatus(uid, '00000000-0000-4000-8000-000000000000')).rejects.toThrow('mcp_preview_not_found');
  expect(mock.verify).not.toHaveBeenCalled(); expect(mock.deliver).not.toHaveBeenCalled();
});
