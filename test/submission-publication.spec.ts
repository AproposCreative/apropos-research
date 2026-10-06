import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { createHash } from 'node:crypto';
import { preservePublicationMetadata } from '@/lib/seo-engine/post-publish/editorial';
const cmsFields = { name: 'Min artikel', content: '<p>Uændret tekst</p>' };
const state = vi.hoisted(() => ({ db: null as any, inspect: vi.fn(), publish: vi.fn(), verify: vi.fn(), enabled: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/mcp/oauth', () => ({ activeMember: async () => ({ owner: true }) }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: vi.fn() }));
vi.mock('@/lib/liv/cms-readback', () => ({ inspectLivCmsDraft: (...args: unknown[]) => state.inspect(...args) }));
vi.mock('@/lib/liv/publish-verified', () => ({ publishVerifiedLivArticle: (...args: unknown[]) => state.publish(...args), verifyLiveLivArticle: (...args: unknown[]) => state.verify(...args) }));
vi.mock('@/lib/mcp/publication', () => ({ assertPublicationEnabled: () => state.enabled() }));
vi.mock('@/lib/editorial/submission-published-target', () => ({ readSubmissionCms: async () => ({ id: 'c'.repeat(24), cmsLocaleId: 'd'.repeat(24), fieldData: cmsFields }) }));
import { copenhagenPublicationInstant, approveSubmissionPublication, publishSubmission } from '@/lib/editorial/submission-publication';
const id = 'a'.repeat(64), path = `editorialSubmissions/${id}`, expected = { title: 'Min artikel', content: '<p>Uændret tekst</p>' }, assets = [];
const hash = cmsFieldHash({ expected, assets });
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db;
  memory.rows.set(path, { id, uid: 'owner', revision: 1, status: 'prepared', contentHash: 'b'.repeat(64), preparedHash: hash, assets,
    choices: {},
    prepared: { itemId: 'c'.repeat(24), expected, proof: { fieldDataHash: 'cms-v1' } } });
  state.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'body', ok: true }], fieldDataHash: 'cms-v1' });
  state.verify.mockResolvedValue({ publicationVerified: true, publicUrl: 'https://example.com/article' });
  state.publish.mockImplementation(async (input: any) => { await input.beforePublish(cmsFieldHash(cmsFields)); return { publicationVerified: true }; });
});
it('rejects DST gaps and ambiguous times, preserves continuous Copenhagen scheduling', () => {
  expect(copenhagenPublicationInstant('2026-10-06T10:00', Date.parse('2026-10-05T00:00Z'))).toBe('2026-10-06T08:00:00.000Z');
  expect(copenhagenPublicationInstant('2026-10-26T10:00', Date.parse('2026-10-05T00:00Z'))).toBe('2026-10-26T09:00:00.000Z');
  expect(() => copenhagenPublicationInstant('2026-10-25T02:30', Date.parse('2026-10-05T00:00Z'))).toThrow('invalid_schedule');
  expect(() => copenhagenPublicationInstant('2026-03-29T02:30', Date.parse('2026-03-28T00:00Z'))).toThrow('invalid_schedule');
});
it('requires exact personal preview and rejects another owner or edited CMS', async () => {
  await expect(approveSubmissionPublication('other', id, hash, 'now')).rejects.toThrow('not_found');
  state.inspect.mockResolvedValueOnce({ draftConfirmed: true, publicationReady: true, checks: [{ ok: true }], fieldDataHash: 'changed' });
  await expect(approveSubmissionPublication('owner', id, hash, 'now')).rejects.toThrow('preview_changed');
  expect(state.publish).not.toHaveBeenCalled();
});
it('publishes only the approved item once, outside the Liv delivery queue', async () => {
  await approveSubmissionPublication('owner', id, hash, 'now');
  const result = await publishSubmission('owner', id, new Date(Date.now() + 100));
  expect(result).toMatchObject({ status: 'published', countsAsUnattendedLiv: false });
  await publishSubmission('owner', id);
  expect(state.publish).toHaveBeenCalledTimes(1);
  expect([...memory.rows.keys()].every(k => k.startsWith('editorialSubmissions/'))).toBe(true);
});
it('after an ambiguous write reconciles read-only and never republishes', async () => {
  await approveSubmissionPublication('owner', id, hash, 'now');
  state.publish.mockImplementationOnce(async (input: any) => { await input.beforePublish(cmsFieldHash(cmsFields)); throw Error('timeout'); });
  expect(await publishSubmission('owner', id, new Date(Date.now() + 100))).toMatchObject({ publicationVerified: false });
  expect(memory.rows.get(path).publication.attempted).toBe(true);
  await publishSubmission('owner', id); // Backoff prevents a tight polling loop.
  expect(state.verify).not.toHaveBeenCalled();
  memory.rows.get(path).reconcileAfter = 0;
  expect(await publishSubmission('owner', id, new Date(Date.now() + 100))).toMatchObject({ status: 'published' });
  expect(state.publish).toHaveBeenCalledTimes(1);
  expect(state.verify).toHaveBeenCalledWith(expect.objectContaining({ fieldDataHash: cmsFieldHash(cmsFields) }));
});
it('media updates publish the same approved item without changing its original date', async () => {
  memory.rows.get(path).publishedTarget = { itemId: 'c'.repeat(24), fields: cmsFields, fieldDataHash: cmsFieldHash(cmsFields), linkedAt: 'now' };
  await approveSubmissionPublication('owner', id, hash, 'now');
  expect(await publishSubmission('owner', id, new Date(Date.now() + 100))).toMatchObject({ status: 'published' });
  expect(state.publish.mock.calls[0][0]).toMatchObject({ itemId: 'c'.repeat(24), inspectionPolicy: { allowPublishedUpdate: true } });
  expect(state.publish.mock.calls[0][0]).not.toHaveProperty('publicationDate');
  expect(memory.rows.get(path).publishedTarget.fieldDataHash).toBe(cmsFieldHash(cmsFields));
  const preservation = [...memory.rows.entries()].find(([key]) => key.includes('/publicationPreservations/'))?.[1];
  expect(preservation).toMatchObject({ reason: 'media_only', actor: 'owner', approvedVersion: hash, aiReviewed: false });
  expect([...memory.rows.keys()].some(k => k.startsWith('seoEngineOpportunityIdempotency/'))).toBe(false);
});
it('preserves existing SEO locks and history without claiming a paid review or publication', async () => {
  const key = createHash('sha256').update(`${'c'.repeat(24)}:da`).digest('hex'), statePath = `seoPostPublishArticles/${key}`;
  memory.rows.set(statePath, { lockedFields: ['seoTitle'], lastAppliedAt: 'old', lastReviewedKey: 'prior-review' });
  const input = { staged: { id: 'c'.repeat(24), cmsLocaleId: 'd'.repeat(24), fieldData: cmsFields }, locale: 'da' as const,
    actor: 'owner', submissionId: id, approvedVersion: hash, reason: 'human_final_review' as const };
  const assertLease = vi.fn();
  await preservePublicationMetadata(input, assertLease); await preservePublicationMetadata(input, assertLease);
  expect(assertLease).toHaveBeenCalledTimes(2);
  expect(memory.rows.get(statePath)).toMatchObject({ lockedFields: ['seoTitle'], lastAppliedAt: 'old', lastReviewedKey: 'prior-review' });
  expect(memory.rows.get(statePath).publicationPreservedKey).toMatch(/^[a-f0-9]{64}$/);
  expect([...memory.rows.keys()].filter(k => k.includes('/publicationPreservations/'))).toHaveLength(1);
  expect(state.publish).not.toHaveBeenCalled();
});
it('cannot record preservation over a pending SEO write or without a current CMS lease', async () => {
  const key = createHash('sha256').update(`${'c'.repeat(24)}:da`).digest('hex'), statePath = `seoPostPublishArticles/${key}`;
  memory.rows.set(statePath, { lockedFields: [], pendingJobId: 'in-flight' });
  const input = { staged: { id: 'c'.repeat(24), cmsLocaleId: 'd'.repeat(24), fieldData: cmsFields }, locale: 'da' as const,
    actor: 'owner', submissionId: id, approvedVersion: hash, reason: 'media_only' as const };
  await expect(preservePublicationMetadata(input, async () => {})).rejects.toThrow('write_pending');
  await expect(preservePublicationMetadata(input, async () => { throw Error('lost'); })).rejects.toThrow('lost');
  expect(memory.rows.get(statePath)).not.toHaveProperty('publicationPreservedKey');
});
