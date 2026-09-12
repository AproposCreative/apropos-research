import { describe, expect, it, vi } from 'vitest';
import { runQualityJob, type QualityWorkerDependencies } from '../../../lib/seo-engine/post-publish/worker';
import type { QualityJob } from '../../../lib/seo-engine/post-publish/jobs';

function fixture() {
  const snapshot = { itemId: 'item', locale: 'da' as const, published: true, hasUnpublishedChanges: false,
    contentVersion: 'v1', metadata: { seoTitle: 'Mayday', metaDescription: 'Anmeldelse af filmen.' } };
  const job: QualityJob = { id: 'job', source: 'webhook', mode: 'publication_quality', snapshot,
    article: { editorialTitle: 'Mayday', locale: 'da', body: 'Konkret filmanmeldelse. '.repeat(20), metadata: snapshot.metadata },
    status: 'running', createdAt: '2026-09-12', updatedAt: '2026-09-12', attempt: 1, owner: 'worker' };
  const call = vi.fn().mockResolvedValueOnce(JSON.stringify({
    seoTitle: { verdict: 'improve', reason: 'Præcis intention', proposedValue: 'Mayday: Anmeldelse' },
    metaDescription: { verdict: 'keep', reason: 'Dækkende', proposedValue: null },
  })).mockResolvedValueOnce(JSON.stringify({
    seoTitle: { supported: true, better: true, reason: 'Præcis' }, metaDescription: { supported: true, better: false, reason: 'Samme' },
  }));
  const receipt = { after: { ...snapshot, metadata: { ...snapshot.metadata, seoTitle: 'Mayday: Anmeldelse' } },
    publicReceipt: { url: 'https://www.aproposmagazine.com/articles/mayday', checkedAt: '2026-09-12' } };
  const deps: QualityWorkerDependencies = {
    claim: vi.fn(async () => job), state: vi.fn(async () => ({ lockedFields: [] })),
    read: vi.fn(async () => ({ snapshot })), enabled: vi.fn(async () => true), model: vi.fn(() => call),
    reserve: vi.fn(async (j, decision) => { j.writeStartedAt = '2026-09-12T12:00:00Z'; j.decision = decision; }),
    checkpoint: vi.fn(async () => {}), finish: vi.fn(async () => {}),
    apply: vi.fn(async args => { await args.beforeWrite(snapshot); return receipt; }),
    reconcile: vi.fn(async () => receipt), now: () => Date.parse('2026-09-12T12:00:00Z'),
  };
  return { job, deps, call, snapshot, receipt };
}

describe('publication quality worker', () => {
  it('reviews filled fields, reserves the write and only completes after public verification', async () => {
    const { deps } = fixture();
    expect((await runQualityJob('job', deps)).status).toBe('applied');
    expect(deps.reserve).toHaveBeenCalledOnce();
    expect(deps.finish).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ status: 'applied', publicReceipt: expect.anything() }));
  });
  it('resumes uncertain CMS delivery through readback, never a second model or write', async () => {
    const { job, deps } = fixture();
    job.writeStartedAt = '2026-09-12T12:00:00Z';
    job.decision = { action: 'apply', reason: 'verified', patch: { seoTitle: 'Mayday: Anmeldelse' } };
    expect((await runQualityJob('job', deps)).status).toBe('applied');
    expect(deps.reconcile).toHaveBeenCalledOnce();
    expect(deps.model).not.toHaveBeenCalled();
    expect(deps.apply).not.toHaveBeenCalled();
  });
  it('keeps pending writes pending when public HTML is stale', async () => {
    const { deps } = fixture();
    deps.apply = vi.fn(async args => { await args.beforeWrite(fixture().snapshot); throw new Error('seo_public_metadata_pending'); });
    expect((await runQualityJob('job', deps)).status).toBe('verify_pending');
    expect(deps.finish).not.toHaveBeenCalled();
  });
  it('does not pay for an editor-locked article', async () => {
    const { deps } = fixture();
    deps.state = vi.fn(async () => ({ lockedFields: ['seoTitle', 'metaDescription'] }));
    expect((await runQualityJob('job', deps)).reason).toBe('editorial_locks');
    expect(deps.model).not.toHaveBeenCalled();
  });
  it('blocks editorial changes made during AI generation', async () => {
    const { deps, snapshot } = fixture();
    deps.read = vi.fn().mockResolvedValueOnce({ snapshot }).mockResolvedValueOnce({ snapshot: { ...snapshot, contentVersion: 'v2' } });
    expect((await runQualityJob('job', deps)).status).toBe('stale');
    expect(deps.apply).not.toHaveBeenCalled();
  });
  it('does not consume retry budget while automation is paused', async () => {
    const { deps } = fixture();
    deps.enabled = vi.fn(async () => false);
    expect((await runQualityJob('job', deps)).reason).toBe('auto_disabled');
    expect(deps.checkpoint).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ attempt: 0 }), true);
    expect(deps.model).not.toHaveBeenCalled();
  });
});
