import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, cms: vi.fn(), state: { entries: [], slots: {} } as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/image-gen/webflow', () => ({ readEditorialCmsCandidates: mock.cms }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => mock.state }));
import { listDrafts, draftPresence } from '@/lib/editorial/draft-overview';
const memory = memoryFirestore(), id = 'a'.repeat(24), day = '2026-10-05T10:00:00Z';
const prose = { title: 'Gemte kladder', content: '<p>PRIVATE ARTICLE BODY</p>', intro: 'PRIVATE INTRO', subtitle: 'Kort', author: 'Frederik', category: 'Kultur',
  slug: 'gemte-kladder', seoTitle: 'Titel', seoDescription: 'Beskrivelse', featuredImage: 'https://example.com/cover.webp', fotoCredit: 'Fotograf' };
const cmsItem = (itemId = id, fields: object = {}) => ({ id: itemId, isDraft: true, lastPublished: null, lastUpdated: day,
  fieldData: { name: prose.title, content: prose.content, intro: prose.intro, ...fields } });
const cmsWindow = (items: any[]) => ({ items, rowsRead: items.length, complete: true, maxRows: 300, sortedBy: 'lastUpdated_desc' });
beforeEach(() => { vi.clearAllMocks(); memory.clear(); mock.db = memory.db; mock.state = { entries: [], slots: {} }; mock.cms.mockResolvedValue(cmsWindow([])); });

it('returns five actual drafts, not newer plans, placeholders, published articles or raw paid attempts', async () => {
  mock.cms.mockResolvedValue(cmsWindow(Array.from({ length: 6 }, (_, i) => cmsItem(i.toString().repeat(24), { name: `Kladde ${i}` }))));
  memory.rows.set('livDailyArticles/prepare-2026-10-06', { title: 'Kun en plan', updatedAt: day });
  memory.rows.set('livDailyArticles/prepare-2026-10-08', { articleCheckpoint: { title: 'Billede uden artikel', content: '<img src="https://example.com/cover.webp">' }, updatedAt: day });
  const desk = createHash('sha256').update('liv-daily').digest('hex');
  memory.rows.set(`livSourceArchives/${desk}/runs/00000000-0000-4000-8000-000000000000`, { rawResponse: JSON.stringify(prose), createdAt: day, writerText: 'SECRET PROMPT' });
  const result = await listDrafts('owner', {});
  expect(result.items).toHaveLength(5); expect(result.matchingDraftsInWindow).toBe(6);
  expect(result.otherSavedWork).toMatchObject({ plansOrEmptyCheckpoints: 2, retainedWritingAttempts: 1, writingAttemptsWithText: 1 });
  expect(result.items.every(i => i.stage === 'cms_draft' && !i.publicationApproval)).toBe(true);
  expect(result.items[0].missing).toContain('two_distinct_body_images');
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE ARTICLE|PRIVATE INTRO|SECRET PROMPT|Kun en plan|rawResponse/);
  expect(JSON.stringify(result).length).toBeLessThan(10000);
  expect(mock.cms).toHaveBeenCalledExactlyOnceWith(5, undefined);
});

it('joins versions only on a trusted CMS identity, preserving the distinct latest revision and diagnostics', async () => {
  mock.cms.mockResolvedValue(cmsWindow([cmsItem()]));
  memory.rows.set('livDailyArticles/prepare-2026-10-06', { webflowItemId: id, updatedAt: '2026-10-04T08:00:00Z',
    articleCheckpoint: prose, reason: 'source_similarity', gateResults: [{ name: 'factcheck', pass: false, detail: 'PRIVATE EVIDENCE' }] });
  memory.rows.set('writerWorkspaces/owner', { revision: 3, updatedAt: '2026-10-05T11:00:00Z', data: { currentDraftId: 'owner-draft', articleData: { ...prose, title: 'Nyere privat udgave' } } });
  memory.rows.set('writerWorkspaces/owner/mcpBindings/owner-draft', { itemId: id });
  memory.rows.set('writerWorkspaces/other', { revision: 4, updatedAt: day, data: { currentDraftId: 'other-draft', articleData: { ...prose, title: 'SECRET COLLEAGUE' } } });
  const result = await listDrafts('owner', {});
  expect(result.items).toHaveLength(1);
  expect(result.items[0]).toMatchObject({ id, idOfVersion: 'owner-draft', kind: 'private-workspace', version: 3,
    title: 'Nyere privat udgave', relatedVersionCount: 2, blockers: [], savedChecks: [], checks: 'not_revalidated' });
  expect(result.items[0].relatedVersions.map(v => v.kind)).toEqual(['cms', 'liv-checkpoint']);
  expect(JSON.stringify(result)).not.toMatch(/SECRET COLLEAGUE|PRIVATE EVIDENCE/);
});

it('keeps equal titles separate and will not trust an unbound workspace webflowId', async () => {
  mock.cms.mockResolvedValue(cmsWindow([cmsItem()]));
  memory.rows.set('writerWorkspaces/owner', { revision: 1, updatedAt: day, data: { currentDraftId: 'owner-draft', articleData: { ...prose, webflowId: id } } });
  const result = await listDrafts('owner', {});
  expect(result.items).toHaveLength(2); expect(new Set(result.items.map(i => i.id)).size).toBe(2);
});

it('does not revive archived/published checkpoints, but preserves a private revision of a published article', async () => {
  mock.cms.mockResolvedValue(cmsWindow([{ ...cmsItem(), isDraft: false, lastPublished: day }, { ...cmsItem('b'.repeat(24)), isArchived: true }]));
  memory.rows.set('livDailyArticles/prepare-2026-10-04', { webflowItemId: id, articleCheckpoint: prose, updatedAt: day });
  memory.rows.set('livDailyArticles/prepare-2026-10-02', { webflowItemId: 'b'.repeat(24), articleCheckpoint: prose, updatedAt: day });
  expect((await listDrafts('owner', {})).items).toEqual([]);
  memory.rows.set('writerWorkspaces/owner', { revision: 1, updatedAt: day, data: { currentDraftId: 'owner-draft', articleData: prose } });
  memory.rows.set('writerWorkspaces/owner/mcpBindings/owner-draft', { itemId: id });
  expect((await listDrafts('owner', {})).items[0].stage).toBe('private_revision');
});

it('shows saved readiness only as historical, never a new approval even with no missing fields', async () => {
  const article = { ...prose, content: '<p>Tekst</p><img alt="En" src="https://example.com/one.webp"><img alt="To" src="https://example.com/two.webp">' };
  memory.rows.set('livDailyArticles/prepare-2026-10-06', { articleCheckpoint: article, updatedAt: day, status: 'ready', gateResults: [{ name: 'factcheck', pass: true }] });
  const item = (await listDrafts('owner', {})).items[0];
  expect(item).toMatchObject({ missing: [], savedChecks: ['factcheck:historical_pass'], checks: 'not_revalidated', publicationApproval: false });
});

it('counts distinct body images excluding cover and does not confuse alt presence with rights validation', () => {
  const body = '<p>En tekst</p><img src="https://example.com/cover.webp"><img alt="Foto" src="https://example.com/one.webp"><img alt="Foto" src="https://example.com/one.webp">';
  expect(draftPresence({ ...prose, content: body })).toMatchObject({ hasText: true, bodyImages: 1,
    missing: ['two_distinct_body_images', 'body_image_alt'] });
  expect(draftPresence({ content: '<script>ignored</script><style>ignored</style><img src="a">' }).hasText).toBe(false);
});

it('scopes submissions to the owner, reports blocked steps and does not leak prose or raw errors', async () => {
  memory.rows.set(`editorialSubmissions/${'c'.repeat(64)}`, { uid: 'owner', article: prose, status: 'blocked', blocker: 'cms_conflict', blockedStep: 'cms', updatedAt: day, revision: 7, error: 'sk-secret' });
  memory.rows.set(`editorialSubmissions/${'d'.repeat(64)}`, { uid: 'other', article: { ...prose, title: 'SECRET OTHER' }, updatedAt: day });
  const result = await listDrafts('owner', { query: 'gemte' });
  expect(result.items).toHaveLength(1); expect(result.items[0]).toMatchObject({ kind: 'private-submission', version: 7, stage: 'blocked', blockers: ['cms_conflict', 'cms'] });
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE ARTICLE|sk-secret|SECRET OTHER/);
  expect((await listDrafts('owner', { query: 'ukendt' })).items).toEqual([]);
});

it('degrades honestly on CMS failure without hiding saved text or retrying the upstream request', async () => {
  mock.cms.mockRejectedValue(Error('sk-secret upstream'));
  memory.rows.set('livDailyArticles/prepare-2026-10-06', { articleCheckpoint: prose, updatedAt: day, reason: 'liv_cost_provider_quota_exhausted' });
  const result = await listDrafts('owner', {});
  expect(result.items).toHaveLength(1); expect(result.coverage.unavailable).toEqual(['cms']);
  expect(result.items[0].blockers).toEqual(['liv_cost_provider_quota_exhausted']);
  expect(JSON.stringify(result)).not.toContain('sk-secret'); expect(mock.cms).toHaveBeenCalledTimes(1);
});

it('sorts before limiting, records bounded coverage and leaves all source records unchanged', async () => {
  mock.cms.mockResolvedValue({ ...cmsWindow([cmsItem(id), { ...cmsItem('b'.repeat(24)), lastUpdated: '2026-10-05T11:00:00Z' }]), complete: false, rowsRead: 100 });
  memory.rows.set('writerWorkspaces/owner', { revision: 1, updatedAt: day, data: { currentDraftId: 'owner-draft', articleData: prose } });
  const before = structuredClone([...memory.rows]);
  const result = await listDrafts('owner', { limit: 1 });
  expect(result.items[0].itemId).toBe('b'.repeat(24)); expect(result.coverage.cmsComplete).toBe(false);
  expect([...memory.rows]).toEqual(before);
});
