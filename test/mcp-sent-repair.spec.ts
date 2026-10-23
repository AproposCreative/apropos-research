import { expect, it, vi } from 'vitest';

const mock = vi.hoisted(() => ({ editorial: vi.fn(), accreditation: vi.fn() }));
vi.mock('@/lib/editorial-mail/service', () => ({ repairEditorialSent: mock.editorial }));
vi.mock('@/lib/accreditation/mcp-drafts', () => ({ repairAccreditationSent: mock.accreditation }));
import { ownerSentRepairInput, repairOwnerSent } from '@/lib/mcp/sent-repair';
import type { McpIdentity } from '@/lib/mcp/oauth';

const owner = { uid: 'owner', owner: true, scopes: ['apropos:draft'] } as McpIdentity;

it('routes a version-bound accreditation sent repair without an editorial write', async () => {
  const approvalId = `mcp-${'a'.repeat(40)}`;
  const expectedHash = 'b'.repeat(64);
  mock.accreditation.mockResolvedValueOnce({ status: 'verified', smtpCalled: false });
  expect(await repairOwnerSent(owner, { draftId: `${approvalId}:${expectedHash}` })).toMatchObject({ status: 'verified', smtpCalled: false });
  expect(mock.accreditation).toHaveBeenCalledWith(owner, { approvalId, expectedHash });
  expect(mock.editorial).not.toHaveBeenCalled();
});

it('keeps ordinary editorial repairs and rejects missing accreditation hashes', async () => {
  const draftId = 'c'.repeat(64);
  mock.editorial.mockResolvedValueOnce({ status: 'verified' });
  await repairOwnerSent(owner, { draftId });
  expect(mock.editorial).toHaveBeenCalledWith(owner, { draftId });
  expect(() => ownerSentRepairInput.parse({ draftId: `mcp-${'a'.repeat(40)}` })).toThrow();
});
