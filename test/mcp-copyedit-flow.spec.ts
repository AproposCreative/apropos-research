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
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
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

it('can make a second precise edit after the first verified CMS save without reopening the article', async () => withoutPaidAi(async () => {
  const opened = await openCmsArticle('owner', itemId, 0);
  const first = { draftId, expectedRevision: 1, patches: [{ field: 'intro' as const, before: 'En uklar indledning.', after: 'En konkret indledning.' }] };
  await applyWorkspaceCopyedit('owner', { ...first, previewHash: (await previewWorkspaceCopyedit('owner', first)).previewHash });
  const firstSave = await saveCms('owner', { draftId, expectedRevision: 2, expectedCmsHash: opened.cmsHash });
  const second = { draftId, expectedRevision: 2, patches: [{ field: 'intro' as const, before: 'En konkret indledning.', after: 'En endnu skarpere indledning.' }] };
  await applyWorkspaceCopyedit('owner', { ...second, previewHash: (await previewWorkspaceCopyedit('owner', second)).previewHash });
  const secondSave = await saveCms('owner', { draftId, expectedRevision: 3, expectedCmsHash: firstSave.cmsHash });
  expect(secondSave).toMatchObject({ stagedOnly: true, changedFields: ['intro'], publicationVerified: false });
  expect(mock.cms.fieldData.intro).toBe('En endnu skarpere indledning.');
  expect(mock.fetch).toHaveBeenCalledTimes(2);
}));

async function editedArticle() {
  const opened = await openCmsArticle('owner', itemId, 0);
  const input = { draftId, expectedRevision: 1, patches: [{ field: 'intro' as const, before: 'En uklar indledning.', after: 'En konkret indledning.' }] };
  await applyWorkspaceCopyedit('owner', { ...input, previewHash: (await previewWorkspaceCopyedit('owner', input)).previewHash });
  return { draftId, expectedRevision: 2, expectedCmsHash: opened.cmsHash };
}

it('replays the original request after its binding advances without writing twice', async () => {
  const input = await editedArticle();
  const first = await saveCms('owner', input), replay = await saveCms('owner', input);
  expect(replay).toMatchObject({ ...first, replay: true });
  expect(mock.fetch).toHaveBeenCalledTimes(1);
});

it.each(['status', 'same-request'])('recovers a lost response through %s and supports the next edit without buying or rewriting anything', async recovery => withoutPaidAi(async () => {
  const input = await editedArticle(), write = mock.fetch.getMockImplementation()!;
  mock.fetch.mockImplementationOnce(async (...args) => { await write(...args); throw Error('response_lost'); });
  await expect(saveCms('owner', input)).rejects.toThrow('response_lost');
  // The editor can already be working on the next version while CMS status is unknown.
  const edit = { draftId, expectedRevision: 2, patches: [{ field: 'intro' as const, before: 'En konkret indledning.', after: 'Næste redigering, som endnu ikke er gemt i CMS.' }] };
  if (recovery === 'status') {
    await applyWorkspaceCopyedit('owner', { ...edit, previewHash: (await previewWorkspaceCopyedit('owner', edit)).previewHash });
    const workspace = structuredClone(memory.rows.get('writerWorkspaces/owner'));
    const status = await getSaveStatus('owner', draftId);
    expect(status.stagedSaves[0]).toMatchObject({ phase: 'saved', receipt: { bindingAdvanced: true } });
    expect(memory.rows.get('writerWorkspaces/owner')).toEqual(workspace);
  } else {
    expect(await saveCms('owner', input)).toMatchObject({ replay: true, bindingAdvanced: true });
    await applyWorkspaceCopyedit('owner', { ...edit, previewHash: (await previewWorkspaceCopyedit('owner', edit)).previewHash });
  }
  const recoveredHash = cmsFieldHash(mock.cms.fieldData);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
  const result = await saveCms('owner', { draftId, expectedRevision: 3, expectedCmsHash: recoveredHash });
  expect(result).toMatchObject({ bindingAdvanced: true, changedFields: ['intro'] });
  expect(mock.fetch).toHaveBeenCalledTimes(2);
  expect(mock.cms.fieldData.intro).toBe(edit.patches[0].after);
}));

it('preserves a newer article binding opened during an in-flight save', async () => {
  const input = await editedArticle(), write = mock.fetch.getMockImplementation()!;
  let newerBinding: unknown;
  mock.fetch.mockImplementationOnce(async (...args) => {
    const response = await write(...args);
    await openCmsArticle('owner', itemId, 2);
    newerBinding = structuredClone(memory.rows.get(`writerWorkspaces/owner/mcpBindings/${draftId}`));
    return response;
  });
  expect(await saveCms('owner', input)).toMatchObject({ bindingAdvanced: false, stagedOnly: true });
  expect(memory.rows.get(`writerWorkspaces/owner/mcpBindings/${draftId}`)).toEqual(newerBinding);
  expect((await getWorkspace('owner')).workspace?.revision).toBe(3);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
});

it('does not advance the binding or unlock an uncertain write after a conflicting CMS readback', async () => {
  const input = await editedArticle(), write = mock.fetch.getMockImplementation()!;
  const binding = structuredClone(memory.rows.get(`writerWorkspaces/owner/mcpBindings/${draftId}`));
  mock.fetch.mockImplementationOnce(async (...args) => { await write(...args); mock.cms.fieldData.unrelated = 'another editor'; throw Error('response_lost'); });
  await expect(saveCms('owner', input)).rejects.toThrow();
  const status = await getSaveStatus('owner', draftId);
  expect(status.stagedSaves[0]).toMatchObject({ phase: 'attempted', receipt: null });
  expect(memory.rows.get(`writerWorkspaces/owner/mcpBindings/${draftId}`)).toEqual(binding);
  expect(memory.rows.has(`mcpCmsLocks/${itemId}`)).toBe(true);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
});

it('reconciles pre-upgrade receipts without fabricating a next binding or rewriting the CMS', async () => {
  const input = await editedArticle(), write = mock.fetch.getMockImplementation()!;
  mock.fetch.mockImplementationOnce(async (...args) => { await write(...args); throw Error('response_lost'); });
  await expect(saveCms('owner', input)).rejects.toThrow();
  const binding = structuredClone(memory.rows.get(`writerWorkspaces/owner/mcpBindings/${draftId}`));
  const path = [...memory.rows.keys()].find(key => key.includes('/mcpCmsEdits/'))!;
  delete memory.rows.get(path).nextBinding; delete memory.rows.get(path).bindingBeforeHash;
  const status = await getSaveStatus('owner', draftId);
  expect(status.stagedSaves[0]).toMatchObject({ phase: 'saved', receipt: { bindingAdvanced: false, nextEditAction: expect.any(String) } });
  expect(memory.rows.get(`writerWorkspaces/owner/mcpBindings/${draftId}`)).toEqual(binding);
  expect(memory.rows.has(`mcpCmsLocks/${itemId}`)).toBe(false);
  expect(mock.fetch).toHaveBeenCalledTimes(1);
});
