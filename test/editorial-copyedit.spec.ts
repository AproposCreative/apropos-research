import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, user: { uid: 'owner', owner: true } as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: async () => mock.user }));
import { saveMcpDraft } from '@/lib/mcp/workspace';
import { previewCopyedit } from '@/lib/editorial/copyedit';
import { previewWorkspaceCopyedit, applyWorkspaceCopyedit } from '@/lib/editorial/workspace-copyedit';
import { POST, PUT } from '@/app/api/editorial/copyedit/route';
import { NextRequest } from 'next/server';
const memory = memoryFirestore();
const content = '<p>Den gamle åbning.</p><figure><img src="https://example.com/a.jpg" alt="Scene"><figcaption>Foto: Fotograf</figcaption></figure><p>Resten.</p>';
const article = { title: 'Titel', content, featuredImage: 'https://example.com/cover.jpg', author: 'Liv', seoTitle: 'Bevar SEO' };
const input = { draftId: 'draft-1234', expectedRevision: 1, patches: [{ field: 'content' as const, before: 'Den gamle åbning.', after: 'En klar åbning.' }] };
beforeEach(async () => { memory.clear(); mock.db = memory.db; mock.user = { uid: 'owner', owner: true };
  await saveMcpDraft('owner', { draftId: input.draftId, expectedRevision: 0, article }); });
it('previews exact changes without saving and preserves all other fields and assets', async () => {
  const result = await previewWorkspaceCopyedit('owner', input);
  expect(result.article).toEqual({ ...article, content: content.replace('Den gamle åbning.', 'En klar åbning.') });
  expect(result).toMatchObject({ saved: false, publicationApproval: false, changedFields: ['content'], estimatedAiCostDkk: 0 });
  expect(memory.rows.get('writerWorkspaces/owner').revision).toBe(1);
});
it('commits an atomic receipt, archives the preimage and replays after subsequent work', async () => {
  const { previewHash } = await previewWorkspaceCopyedit('owner', input);
  const saved = await applyWorkspaceCopyedit('owner', { ...input, previewHash });
  expect(saved).toMatchObject({ revision: 2, mediaPreserved: true, requiresFreshChecks: true });
  expect(memory.rows.get('writerWorkspaces/owner/history/1').data.articleData).toMatchObject(article);
  expect(memory.rows.has(`writerWorkspaces/owner/copyedits/${previewHash}`)).toBe(true);
  await saveMcpDraft('owner', { draftId: 'new-draft', expectedRevision: 2, article });
  expect(await applyWorkspaceCopyedit('owner', { ...input, previewHash })).toMatchObject({ revision: 2, replay: true });
  expect(memory.rows.get('writerWorkspaces/owner').revision).toBe(3);
});
it('does not apply a stale preview or expose another workspace', async () => {
  const { previewHash } = await previewWorkspaceCopyedit('owner', input);
  await expect(applyWorkspaceCopyedit('colleague', { ...input, previewHash })).rejects.toThrow('mcp_revision_conflict');
  await saveMcpDraft('owner', { draftId: input.draftId, expectedRevision: 1, article: { ...article, title: 'En anden titel' } });
  await expect(applyWorkspaceCopyedit('owner', { ...input, previewHash })).rejects.toThrow('mcp_revision_conflict');
});
it('deduplicates parallel double-clicks at the transaction boundary', async () => {
  const { previewHash } = await previewWorkspaceCopyedit('owner', input);
  const results = await Promise.all([1, 2].map(() => applyWorkspaceCopyedit('owner', { ...input, previewHash })));
  expect(results.every(r => r.revision === 2)).toBe(true);
  expect(memory.rows.get('writerWorkspaces/owner').revision).toBe(2);
});
it.each([
  ['missing', 'new'], ['Resten.', '<script>alert(1)</script>'],
  ['https://example.com/a.jpg', 'https://example.com/b.jpg'], ['Foto: Fotograf', 'Foto: En anden'],
])('rejects ambiguous/unsafe/media patches: %s', (before, after) => {
  expect(() => previewCopyedit(article, [{ field: 'content', before, after }])).toThrow();
});
it('rejects repeated preimages and preserves literal replacement characters', () => {
  expect(() => previewCopyedit({ ...article, title: 'Titel Titel' }, [{ field: 'title', before: 'Titel', after: 'Ny' }])).toThrow('ambiguous');
  expect(previewCopyedit(article, [{ field: 'title', before: 'Titel', after: '$& $$' }]).article.title).toBe('$& $$');
});
const request = (body: unknown, token = true) => new NextRequest('https://ai.aproposmagazine.com/api/editorial/copyedit', {
  method: 'POST', headers: token ? { authorization: 'Bearer fixture' } : {}, body: JSON.stringify(body) });
it('shares the service through the owner-only API, rejects identity injection and private caching', async () => {
  expect((await POST(request(input, false))).status).toBe(401);
  mock.user = { uid: 'casper', owner: false }; expect((await POST(request(input))).status).toBe(403);
  mock.user = { uid: 'owner', owner: true };
  expect((await POST(request({ ...input, uid: 'casper' }))).status).toBe(409);
  const preview = await POST(request(input)); expect(preview.headers.get('cache-control')).toContain('no-store');
  const { previewHash } = await preview.json();
  expect((await (await PUT(request({ ...input, previewHash }))).json()).revision).toBe(2);
});
