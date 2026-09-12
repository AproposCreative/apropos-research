import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, Record<string, any>>(), reads: vi.fn(), available: true, fail: false }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: () => ({ doc: (id: string) => ({ get: async () => {
    state.reads(id); if (state.fail) throw new Error('private upstream message');
    return { exists: state.rows.has(id), data: () => state.rows.get(id) };
  } }) }),
} : null }));
import { readNextLivPreparationStatus, livPreparationStatusForRow, canResumeLivPreparationCheckpoint } from '@/lib/liv/preparation-status';
import { emptyDeliveryState, type ReadyEntry } from '@/lib/liv/delivery-policy';

const now = new Date('2026-09-12T10:00:00Z');
const day = '2026-09-12';
const entry = (overrides: Partial<ReadyEntry> = {}): ReadyEntry => ({ itemId: 'a'.repeat(24), slug: 'story', title: 'Private title',
  kind: 'scheduled', scheduledDay: day, expiresDay: day, state: 'ready', preparedAt: now.toISOString(), payloadHash: 'b'.repeat(64), ...overrides });
beforeEach(() => { state.rows.clear(); state.reads.mockClear(); state.available = true; state.fail = false; });

it('projects exactly today’s next candidate with no mutations or generation', async () => {
  const manifest = emptyDeliveryState(), before = structuredClone(manifest);
  expect(await readNextLivPreparationStatus(manifest, now)).toEqual({ day, scope: 'prepare', runStatus: null,
    status: 'queued', reasonCode: 'awaiting_preparation' });
  expect(state.reads).toHaveBeenCalledWith('prepare-2026-09-12');
  expect(manifest).toEqual(before);
});

it('reads tomorrow after today is covered and exposes a known exhausted factcheck status, not paid content', async () => {
  const manifest = emptyDeliveryState(); manifest.entries.push(entry());
  state.rows.set('prepare-2026-09-13', { status: 'skipped_factcheck', preparationAttempts: 5,
    title: 'Private title', articleCheckpoint: { content: 'Private text', preparedMedia: [{}, {}, {}] },
    rawResponse: 'Private raw', reason: 'private error containing credentials', historicalCost: 200 });
  expect(await readNextLivPreparationStatus(manifest, now)).toEqual({ day: '2026-09-13', scope: 'prepare',
    runStatus: 'skipped_factcheck', status: 'blocked_saved_work', reasonCode: 'factcheck_required' });
  expect(state.reads).toHaveBeenCalledTimes(1);
});

it('reads only the alternative scope after an explicit rejection', async () => {
  const manifest = emptyDeliveryState(); manifest.entries.push(entry({ decision: 'rejected' }));
  expect(await readNextLivPreparationStatus(manifest, now)).toMatchObject({ day, scope: 'prepare-alternative', status: 'queued' });
  expect(state.reads).toHaveBeenCalledWith('prepare-alternative-2026-09-12');
});

it('reports idle without database reads when today and tomorrow are already covered', async () => {
  const manifest = emptyDeliveryState(); manifest.entries.push(entry(), entry({ scheduledDay: '2026-09-13', expiresDay: '2026-09-13' }));
  expect(await readNextLivPreparationStatus(manifest, now)).toMatchObject({ status: 'idle', reasonCode: 'no_preparation_needed' });
  expect(state.reads).not.toHaveBeenCalled();
});

it('surfaces two explicit rejections without creating or reading a third job', async () => {
  const manifest = emptyDeliveryState(); manifest.entries.push(entry({ decision: 'rejected' }), entry({ itemId: 'c'.repeat(24), decision: 'rejected' }));
  expect(await readNextLivPreparationStatus(manifest, now)).toMatchObject({ day, status: 'blocked_saved_work', reasonCode: 'alternative_limit_reached' });
  expect(state.reads).not.toHaveBeenCalled();
});

it.each(['cover', 'publish'])('exposes a safe reconciliation hold for %s without any source or CMS read', async kind => {
  const manifest = emptyDeliveryState();
  if (kind === 'cover') manifest.coverRevision = { id: 'private-id', itemId: 'private-item', day };
  else manifest.slots[day] = { state: 'attempted', itemId: 'private-item', token: 'private-token', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 };
  const result = await readNextLivPreparationStatus(manifest, now);
  expect(result.status).toBe('reconciliation_required');
  expect(JSON.stringify(result)).not.toContain('private');
  expect(state.reads).not.toHaveBeenCalled();
});

it.each(['missing', 'failed'])('returns unavailable rather than false idle on a %s datastore', async kind => {
  state.available = kind !== 'missing'; state.fail = kind === 'failed';
  expect(await readNextLivPreparationStatus(emptyDeliveryState(), now)).toEqual({ day, scope: 'prepare', runStatus: null,
    status: 'unavailable', reasonCode: 'status_unavailable' });
});

it('maps only known status and reason codes, never arbitrary stored strings', () => {
  expect(livPreparationStatusForRow(day, 'prepare', { status: 'private-status', reason: 'secret: private-provider-body' })).toEqual({
    day, scope: 'prepare', runStatus: null, status: 'blocked_saved_work', reasonCode: 'operator_retry_required' });
  expect(livPreparationStatusForRow(day, 'prepare', { status: 'failed', preparationAttempts: 3, reason: 'research_sources_unavailable: private-source' }).reasonCode)
    .toBe('source_evidence_required');
});

it('preserves automatic attempt limits and explicit continuation/authorization eligibility', () => {
  const row = { status: 'failed', preparationAttempts: 5, articleCheckpoint: { preparedMedia: [{}, {}, {}] } };
  expect(canResumeLivPreparationCheckpoint(row)).toBe(false);
  expect(livPreparationStatusForRow(day, 'prepare', row).status).toBe('blocked_saved_work');
  expect(canResumeLivPreparationCheckpoint({ ...row, preparationAttempts: 4 })).toBe(true);
  expect(canResumeLivPreparationCheckpoint({ ...row, retryAuthorization: 'server-grant' })).toBe(true);
  expect(canResumeLivPreparationCheckpoint({ ...row, continuationReady: true })).toBe(true);
  expect(canResumeLivPreparationCheckpoint({ ...row, retryAuthorization: 'server-grant', cmsSaveStarted: true })).toBe(false);
  expect(row.preparationAttempts).toBe(5);
});

it('distinguishes active processing from a blocked stale checkpoint', () => {
  const row = { status: 'processing', articleCheckpoint: { content: 'private' }, processingStartedAt: { toMillis: () => now.getTime() - 1000 } };
  expect(livPreparationStatusForRow(day, 'prepare', row, now.getTime())).toMatchObject({ status: 'preparing', reasonCode: 'preparation_in_progress' });
  expect(livPreparationStatusForRow(day, 'prepare', row, now.getTime() + 30 * 60_000).status).toBe('blocked_saved_work');
});
