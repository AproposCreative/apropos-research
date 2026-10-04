import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, cms: {} as any, fetch: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/image-gen/webflow', () => ({ imageGenCmsConfiguration: () => ({ token: 'fixture', collection: 'b'.repeat(24), locale: 'c'.repeat(24) }) }));
vi.mock('@/lib/liv/cms-readback', () => ({ readLivWebflowJson: async () => structuredClone(mock.cms) }));
vi.mock('@/lib/seo-engine/post-publish/editorial', () => ({ assertEditorialMetadataWritable: async () => {} }));
vi.mock('@/lib/webflow-mapping', () => ({ readMapping: () => ({ entries: [
  { internal: 'title', webflowSlug: 'name' }, { internal: 'intro', webflowSlug: 'intro' },
  { internal: 'content', webflowSlug: 'content' }, { internal: 'featuredImage', webflowSlug: 'image' },
] }) }));
import { openCmsArticle, getWorkspace, saveCms, getSaveStatus } from '@/lib/mcp/editorial';
import { previewWorkspaceCopyedit, applyWorkspaceCopyedit } from '@/lib/editorial/workspace-copyedit';
import { reviewWorkspace } from '@/lib/editorial/review-workspace';
import { withoutPaidAi } from '@/lib/ai/no-paid-calls';
const memory = memoryFirestore(), itemId = 'a'.repeat(24), draftId = `mcp-${itemId}`;
beforeEach(() => {
  memory.clear(); mock.db = memory.db; vi.clearAllMocks();
  mock.cms = { id: itemId, cmsLocaleId: 'c'.repeat(24), isArchived: false, isDraft: false, lastPublished: '2026-10-01T08:00:00Z',
    fieldData: { name: 'Valgt artikel', intro: 'En uklar indledning.', content: '<p>Bevar brødteksten.</p><figure><img src="https://example.com/body.jpg" alt="Scenen"><figcaption>Foto: Fotografen</figcaption></figure>',
      image: { url: 'https://example.com/cover.jpg' }, 'ai-generated': false, unrelated: 'untouched' } };
  vi.stubGlobal('fetch', mock.fetch);
  mock.fetch.mockImplementation(async (_url, options) => {
    const body = JSON.parse(options.body);
    expect(options.method).toBe('PATCH'); expect(body).not.toHaveProperty('isDraft');
    expect(Object.keys(body.fieldData)).toEqual(['intro']);
    mock.cms.fieldData = { ...mock.cms.fieldData, ...body.fieldData };
    return new Response('{}');
  });
});
afterEach(() => vi.unstubAllGlobals());
it('opens → previews → edits → reports → saves staged with readback, without touching live publication/media', async () => withoutPaidAi(async () => {
  const original = structuredClone(mock.cms);
  const opened = await openCmsArticle('owner', itemId, 0);
  expect(opened).toMatchObject({ revision: 1, livePublicationChanged: false });
  const input = { draftId, expectedRevision: 1, patches: [{ field: 'intro' as const, before: 'En uklar indledning.', after: 'En konkret indledning.' }] };
  const preview = await previewWorkspaceCopyedit('owner', input);
  await applyWorkspaceCopyedit('owner', { ...input, previewHash: preview.previewHash });
  const report = await reviewWorkspace('owner', { draftId, expectedRevision: 2 });
  expect(report.admission.status).toBe('not_granted'); expect(report.factCheck).toBe('not_performed');
  const saved = await saveCms('owner', { draftId, expectedRevision: 2, expectedCmsHash: opened.cmsHash });
  expect(saved).toMatchObject({ stagedOnly: true, publicationVerified: false });
  expect(mock.cms).toEqual({ ...original, fieldData: { ...original.fieldData, intro: 'En konkret indledning.' } });
  const receipt = await getSaveStatus('owner', draftId);
  expect(receipt.stagedSaves[0].phase).toBe('saved');
  expect((await getWorkspace('owner')).workspace?.revision).toBe(2);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
}));
