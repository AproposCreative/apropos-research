import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  docs: new Map<string, Record<string, any>>(),
  tail: Promise.resolve(),
  cms: { id: 'item', lastUpdated: 'v1', lastPublished: 'published', isDraft: false,
    fieldData: { 'seo-title': 'Old title', 'meta-description': 'Old description' } } as any,
  allow: true,
  failRollbackHistory: false,
}));

// Serialized, atomic transactions exercise actual store/lease code without service access.
vi.mock('@/lib/firebase-admin', () => {
  const ref = (path: string) => ({ path,
    get: async () => ({ exists: state.docs.has(path), id: path.split('/').at(-1), data: () => structuredClone(state.docs.get(path)) }),
    set: async (data: any, opts?: any) => {
      if (state.failRollbackHistory && path.startsWith('seoEngineOpportunityVersions/') && data.rolledBackAt) {
        state.failRollbackHistory = false; throw new Error('History unavailable');
      }
      state.docs.set(path, opts?.merge ? { ...state.docs.get(path), ...data } : data); },
  });
  return { getAdminDb: () => ({
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    runTransaction: (fn: any) => {
      const run = state.tail.then(async () => {
        const writes: Array<() => void> = [];
        const result = await fn({ get: (r: any) => r.get(),
          set: (r: any, data: any, opts?: any) => writes.push(() => { void r.set(data, opts); }),
          delete: (r: any) => writes.push(() => { state.docs.delete(r.path); }),
        });
        writes.forEach((write) => write());
        return result;
      });
      state.tail = run.catch(() => undefined);
      return run;
    },
  }) };
});
vi.mock('firebase-admin/firestore', () => ({ FieldValue: { serverTimestamp: () => 'server-time' } }));
vi.mock('@/lib/seo-engine/opportunity-engine/settings', () => ({
  resolveAutomaticOpportunityRuntime: vi.fn(async () => ({ shouldAutoOptimize: state.allow, killSwitchEnabled: state.allow })),
}));
vi.mock('@/lib/webflow/locale-items', () => ({
  resolveWebflowLocaleIds: () => ({ dk: 'da', en: 'en' }),
  fetchArticleItemByLocale: vi.fn(async () => structuredClone(state.cms)),
  patchArticleFieldDataForLocale: vi.fn(async (_id: string, fields: any) => {
    Object.assign(state.cms.fieldData, fields); state.cms.lastUpdated += 'x';
  }),
}));
import { acquireCmsWriteLease } from '../lib/seo-engine/cms-write-lease';
import { claimIdempotencyKey, completeIdempotencyKey, getOpportunity, upsertOpportunity } from '../lib/seo-engine/opportunity-engine/store';
import { applyOpportunityProposals, rollbackOpportunity } from '../lib/seo-engine/opportunity-engine/apply';
import { fetchArticleItemByLocale, patchArticleFieldDataForLocale } from '../lib/webflow/locale-items';
import { resolveAutomaticOpportunityRuntime } from '../lib/seo-engine/opportunity-engine/settings';

const oppPath = 'seoEngineOpportunities/opp';
function seed() {
  state.docs.set(oppPath, {
    id: 'opp', itemId: 'item', locale: 'en', status: 'approved', url: 'https://example.test/article',
    proposals: [
      { field: 'seoTitle', currentValue: 'Old title', proposedValue: 'New title' },
      { field: 'metaDescription', currentValue: 'Old description', proposedValue: 'New description' },
    ], scannedSeoTitle: 'Old title', scannedMetaDescription: 'Old description', scannedCmsLastUpdated: 'v1',
    fingerprint: 'fingerprint', idempotencyKey: 'key', versionIds: [],
  });
}
const apply = () => applyOpportunityProposals({ opportunityId: 'opp', actor: 'editor', mode: 'auto', confirmOverwrite: true });
const rollback = () => rollbackOpportunity({ opportunityId: 'opp', actor: 'editor' });
const versions = () => [...state.docs.entries()].filter(([k]) => k.startsWith('seoEngineOpportunityVersions/')).map(([, v]) => v);

beforeEach(() => {
  vi.clearAllMocks(); state.docs.clear(); state.tail = Promise.resolve(); state.allow = true; state.failRollbackHistory = false;
  state.cms = { id: 'item', lastUpdated: 'v1', lastPublished: 'published', isDraft: false,
    fieldData: { 'seo-title': 'Old title', 'meta-description': 'Old description' } };
  vi.mocked(fetchArticleItemByLocale).mockImplementation(async () => structuredClone(state.cms));
  vi.mocked(patchArticleFieldDataForLocale).mockImplementation(async (_id, fields) => {
    Object.assign(state.cms.fieldData, fields); state.cms.lastUpdated += 'x';
  });
  vi.mocked(resolveAutomaticOpportunityRuntime).mockImplementation(async () => ({ shouldAutoOptimize: state.allow, killSwitchEnabled: state.allow }) as any);
  seed();
});

describe('CMS writes and rollback recovery', () => {
  it('writes only metadata to the correct locale and records verified staged state', async () => {
    const result = await apply();
    expect(result.opportunity.cmsWriteState).toBe('staged_verified');
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledWith('item', { 'seo-title': 'New title', 'meta-description': 'New description' }, 'en');
    expect(result.opportunity.pendingApply).toBeNull();
  });
  it('rejects rollback over a newer editor change before any CMS write', async () => {
    await apply(); vi.mocked(patchArticleFieldDataForLocale).mockClear();
    state.cms.fieldData['seo-title'] = 'Editor title';
    await expect(rollback()).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(patchArticleFieldDataForLocale).not.toHaveBeenCalled();
    expect(versions().every((v) => !v.rolledBackAt)).toBe(true);
  });
  it('does not mark failed PATCH as rolled back and retries successfully', async () => {
    await apply();
    vi.mocked(patchArticleFieldDataForLocale).mockRejectedValueOnce(new Error('CMS unavailable'));
    await expect(rollback()).rejects.toThrow('CMS unavailable');
    expect(versions().every((v) => !v.rolledBackAt)).toBe(true);
    expect((await getOpportunity('opp'))?.status).toBe('applied');
    await rollback();
    expect(state.cms.fieldData['seo-title']).toBe('Old title');
    expect(versions().every((v) => v.rolledBackAt)).toBe(true);
  });
  it('reconciles rollback when CMS succeeded but its response was lost', async () => {
    await apply();
    vi.mocked(patchArticleFieldDataForLocale).mockImplementationOnce(async (_id, fields) => {
      Object.assign(state.cms.fieldData, fields); throw new Error('response lost');
    });
    await expect(rollback()).rejects.toThrow('response lost');
    const count = vi.mocked(patchArticleFieldDataForLocale).mock.calls.length;
    await rollback();
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledTimes(count);
    expect((await getOpportunity('opp'))?.status).toBe('rolled_back');
  });
  it('rejects readback mismatch and leaves rollback retryable', async () => {
    await apply();
    vi.mocked(patchArticleFieldDataForLocale).mockResolvedValueOnce(undefined);
    await expect(rollback()).rejects.toMatchObject({ code: 'readback_failed' });
    expect(versions().every((v) => !v.rolledBackAt)).toBe(true);
    await rollback();
  });
  it('reconciles apply after lost CMS response without a duplicate write', async () => {
    vi.mocked(patchArticleFieldDataForLocale).mockImplementationOnce(async (_id, fields) => {
      Object.assign(state.cms.fieldData, fields); state.cms.lastUpdated = 'v2'; throw new Error('response lost');
    });
    await expect(apply()).rejects.toThrow('response lost');
    expect((await getOpportunity('opp'))?.pendingApply).toBeTruthy();
    const result = await apply();
    expect(result.opportunity.status).toBe('applied');
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledTimes(1);
    expect(versions()).toHaveLength(2);
  });
  it('retries history completion after successful rollback without another PATCH', async () => {
    await apply(); state.failRollbackHistory = true;
    await expect(rollback()).rejects.toThrow('History unavailable');
    expect(state.cms.fieldData['seo-title']).toBe('Old title');
    const count = vi.mocked(patchArticleFieldDataForLocale).mock.calls.length;
    await rollback();
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledTimes(count);
    expect(versions().every((v) => v.rolledBackAt)).toBe(true);
  });
  it('does not retry a frozen proposal over changed editorial content', async () => {
    vi.mocked(patchArticleFieldDataForLocale).mockRejectedValueOnce(new Error('offline'));
    await expect(apply()).rejects.toThrow('offline');
    state.cms.lastUpdated = 'editor-change';
    await expect(apply()).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledTimes(1);
  });
  it('does not report applied on incorrect readback', async () => {
    vi.mocked(patchArticleFieldDataForLocale).mockResolvedValueOnce(undefined);
    await expect(apply()).rejects.toMatchObject({ code: 'readback_failed' });
    expect((await getOpportunity('opp'))?.status).toBe('approved');
    await apply();
    expect((await getOpportunity('opp'))?.status).toBe('applied');
  });
  it('does not replace an approved proposal during a concurrent scan', async () => {
    const before = await getOpportunity('opp');
    await upsertOpportunity({ ...before!, proposals: [], idempotencyKey: 'different' });
    expect((await getOpportunity('opp'))?.idempotencyKey).toBe('key');
    await apply();
    expect(state.cms.fieldData['seo-title']).toBe('New title');
  });
  it('freezes a pending operation across new scans', async () => {
    vi.mocked(patchArticleFieldDataForLocale).mockRejectedValueOnce(new Error('offline'));
    await expect(apply()).rejects.toThrow();
    const before = await getOpportunity('opp');
    await upsertOpportunity({ ...before!, proposals: [] });
    expect((await getOpportunity('opp'))?.proposals).toEqual(before?.proposals);
  });
  it('rechecks stop immediately before writing', async () => {
    vi.mocked(resolveAutomaticOpportunityRuntime)
      .mockResolvedValueOnce({ shouldAutoOptimize: true, killSwitchEnabled: true } as any)
      .mockResolvedValueOnce({ shouldAutoOptimize: false, killSwitchEnabled: false } as any);
    await expect(apply()).rejects.toMatchObject({ code: 'auto_disabled' });
    expect(patchArticleFieldDataForLocale).not.toHaveBeenCalled();
  });
  it('blocks a draft even when it has an earlier publication date', async () => {
    state.cms.isDraft = true;
    await expect(apply()).rejects.toMatchObject({ code: 'revision_conflict' });
    expect(patchArticleFieldDataForLocale).not.toHaveBeenCalled();
  });
  it('rolls back only the latest operation, preserving older history', async () => {
    await apply();
    state.docs.set('seoEngineOpportunityVersions/older', {
      id: 'older', opportunityId: 'opp', itemId: 'item', locale: 'en', field: 'seoTitle',
      before: 'Ancient title', after: 'Old title', appliedAt: '2020-01-01T00:00:00.000Z', appliedBy: 'editor',
    });
    state.docs.get(oppPath)!.versionIds.unshift('older');
    await rollback();
    expect(state.docs.get('seoEngineOpportunityVersions/older')?.rolledBackAt).toBeUndefined();
    expect(state.cms.fieldData['seo-title']).toBe('Old title');
  });
});

describe('atomic concurrency control', () => {
  it('allows only one concurrent claim and prevents non-owner completion', async () => {
    const results = await Promise.all([1, 2].map(() => claimIdempotencyKey({ key: 'race', opportunityId: 'opp' })));
    expect(results.filter(Boolean)).toHaveLength(1);
    await expect(completeIdempotencyKey({ key: 'race', owner: 'wrong-owner', status: 'applied' })).rejects.toMatchObject({ code: 'write_busy' });
    await completeIdempotencyKey({ key: 'race', owner: results.find(Boolean)!, status: 'applied' });
    expect(await claimIdempotencyKey({ key: 'race', opportunityId: 'opp' })).toBeNull();
  });
  it('reclaims an expired lease and rejects the former owner', async () => {
    const old = await claimIdempotencyKey({ key: 'expired', opportunityId: 'opp' });
    state.docs.get('seoEngineOpportunityIdempotency/expired')!.expiresAt = 1;
    const next = await claimIdempotencyKey({ key: 'expired', opportunityId: 'opp' });
    expect(next).toBeTruthy(); expect(next).not.toBe(old);
    await expect(completeIdempotencyKey({ key: 'expired', owner: old!, status: 'failed' })).rejects.toThrow();
  });
  it('serializes different proposals for the same item/locale, while allowing another locale', async () => {
    const lease = await acquireCmsWriteLease('item', 'en');
    await expect(acquireCmsWriteLease('item', 'en')).rejects.toMatchObject({ code: 'write_busy' });
    const other = await acquireCmsWriteLease('item', 'da'); await other.release();
    await lease.assertOwned(); await lease.release();
    const next = await acquireCmsWriteLease('item', 'en'); await next.release();
  });
  it('allows just one of two concurrent applies to mutate CMS', async () => {
    const results = await Promise.allSettled([apply(), apply()]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(patchArticleFieldDataForLocale).toHaveBeenCalledTimes(1);
  });
});
