import { beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ access: null as any, drafts: vi.fn(), work: vi.fn(), cms: vi.fn(), checkpoint: vi.fn(), workspace: vi.fn(), writing: vi.fn() }));
vi.mock('@/lib/mcp/oauth', () => ({ mcpRequestAccess: async () => mocks.access }));
vi.mock('@/lib/editorial/draft-overview', () => ({ listDrafts: mocks.drafts }));
vi.mock('@/lib/editorial/work-catalog', () => ({ listEditorialWork: mocks.work }));
vi.mock('@/lib/mcp/editorial', () => ({ getCmsArticle: mocks.cms, getLivWork: mocks.checkpoint, getWorkspace: mocks.workspace, getWritingBrief: mocks.writing }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [{ id: 'liv', name: 'Liv Brandt' }], categories: [{ id: 'culture', name: 'Kultur' }] }) }));
import { GET } from '@/app/api/editorial/review/route';
import { reviewQueue, reviewSavedArticle } from '@/lib/editorial/review-queue';
const origin = 'https://ai.aproposmagazine.com';
beforeEach(() => { vi.clearAllMocks(); mocks.access = { uid: 'owner', owner: true };
  mocks.drafts.mockResolvedValue({ items: [{ id: 'private-submission:a', kind: 'private-submission', idOfVersion: 'a'.repeat(64), title: 'Gemte tekst' }], coverage: {} });
  mocks.work.mockResolvedValue({ items: [ { id: 'prepare-2026-10-08', kind: 'liv-run', title: 'Kun hint', hasText: false },
    { id: 'archived', kind: 'saved-writing', hasText: true, title: 'Omskrivning' },
    { id: 'published', kind: 'liv-run', stage: 'publication_receipt', hasText: true } ], coverage: {}, matchingInWindow: 3 });
});
it('authorizes the actual account before reading shared historical text', async () => {
  mocks.access = null; expect((await GET(new Request(`${origin}/api/editorial/review`))).status).toBe(401);
  mocks.access = { uid: 'colleague', owner: false };
  expect((await GET(new Request(`${origin}/api/editorial/review?uid=owner`))).status).toBe(403);
  expect(mocks.drafts).not.toHaveBeenCalled(); expect(mocks.work).not.toHaveBeenCalled();
});
it('keeps failed plans and archive attempts separate and points to the same submission', async () => {
  const result = await reviewQueue('owner');
  expect(mocks.drafts).toHaveBeenCalledWith('owner', { limit: 10 }, true);
  expect(result.items).toHaveLength(1); expect(result.items[0].href).toBe(`/connect/chatgpt?submission=${'a'.repeat(64)}`);
  expect(result.unfinishedRuns.map(x => x.id)).toEqual(['prepare-2026-10-08']);
  expect(result.writingAttempts.map(x => x.id)).toEqual(['archived']);
});
it('renders retained checkpoints with historical warnings, never a ready flag', async () => {
  mocks.checkpoint.mockResolvedValue({ found: true, checkpointHash: 'h', articleCheckpoint: { title: 'Bevaret', content: '<h2>Overblik</h2><p>Tekst</p>', author: 'liv', category: 'culture' } });
  const result = await reviewSavedArticle('owner', 'liv-checkpoint', 'prepare-2026-10-08');
  expect(result.reading.author).toBe('Liv Brandt'); expect(result.reading.blocks).toHaveLength(2);
  expect(result.publicationApproval).toBe(false); expect(result.paidAiCalls).toBe(0); expect(result.notice).toContain('Gamle kontrolresultater');
});
it('does not substitute a newer workspace or turn an empty attempt into an article', async () => {
  mocks.workspace.mockResolvedValue({ workspace: { revision: 2, data: { currentDraftId: 'different' } } });
  await expect(reviewSavedArticle('owner', 'private-workspace', 'requested')).rejects.toThrow('version_changed');
  mocks.checkpoint.mockResolvedValue({ found: true, title: 'Plan' });
  await expect(reviewSavedArticle('owner', 'liv-checkpoint', 'prepare-2026-10-08')).rejects.toThrow('text_missing');
});
it('returns private no-store reads and rejects unknown source or caller identity', async () => {
  const response = await GET(new Request(`${origin}/api/editorial/review?uid=other`));
  expect(response.status).toBe(200); expect(response.headers.get('cache-control')).toBe('private, no-store');
  expect(mocks.drafts).toHaveBeenCalledWith('owner', { limit: 10 }, true);
  expect((await GET(new Request(`${origin}/api/editorial/review?source=unknown&id=12345678`))).status).toBe(409);
});
