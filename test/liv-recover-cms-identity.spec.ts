import { expect, it, vi } from 'vitest';
vi.mock('@/lib/config/env', () => ({ env: {} }));
vi.mock('@/lib/webflow-config', () => ({ getWebflowConfig: () => ({}) }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: vi.fn(), inspectLivCmsDraft: vi.fn() }));
import { findPreparedCmsIdentity } from '@/lib/liv/recover-cms-identity';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { PreparationProof } from '@/lib/liv/prepared-admission';
const expected = { title: 'Saved', slug: 'saved', content: '<p>Saved</p>' };
const proof = { expected, hash: cmsFieldHash(expected), editorialPassed: true, structurePassed: true } as PreparationProof;
const itemId = 'a'.repeat(24), localeId = 'b'.repeat(24), collectionId = 'c'.repeat(24);
const item = { id: itemId, cmsLocaleId: localeId, fieldData: { slug: 'saved' } };
function deps(items: unknown[]) { return { collectionId, localeId, read: vi.fn().mockResolvedValue({ items }),
  inspect: vi.fn().mockResolvedValue({ draftConfirmed: true, publicationReady: true, checks: [{ id: 'body', ok: true }] }) }; }
it('recovers only an exact inspected staged revision, without writes', async () => {
  const d = deps([item]); expect(await findPreparedCmsIdentity(proof, d)).toBe(itemId);
  expect(d.inspect).toHaveBeenCalledWith({ itemId, expected });
});
it('retains uncertainty when no candidate exists, never calls create', async () => {
  const d = deps([]); expect(await findPreparedCmsIdentity(proof, d)).toBeNull();
  expect(d.inspect).not.toHaveBeenCalled();
});
it('rejects duplicate identities or changed content', async () => {
  await expect(findPreparedCmsIdentity(proof, deps([item, { ...item, id: 'd'.repeat(24) }]))).rejects.toThrow('ambiguous');
  const d = deps([item]); d.inspect.mockResolvedValue({ draftConfirmed: true, publicationReady: false, checks: [{ ok: false }] });
  await expect(findPreparedCmsIdentity(proof, d)).rejects.toThrow('not_ready');
});
it('rejects an invalid proof before accessing CMS', async () => {
  const d = deps([item]); await expect(findPreparedCmsIdentity({ ...proof, hash: 'bad' }, d)).rejects.toThrow('proof_invalid');
  expect(d.read).not.toHaveBeenCalled();
});
