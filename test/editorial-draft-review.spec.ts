import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, read: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/mcp/editorial', () => ({ getCmsArticle: mock.read }));
import { draftDiagnostics } from '@/lib/editorial/draft-diagnostics';
import { reviewWorkspace } from '@/lib/editorial/review-workspace';
import { savedFactualChecks } from '@/lib/editorial/saved-checks';
const memory = memoryFirestore();
beforeEach(() => { memory.clear(); mock.db = memory.db; vi.clearAllMocks(); });
it('points to concrete repetitions without declaring a semantic or fact pass', () => {
  const article = { title: 'MOR', intro: 'En koncert er annonceret.', content: '<p>En koncert er annonceret.</p><p>Det interessante er oplevelsen.</p><p>Det interessante er oplevelsen.</p>' };
  const result = draftDiagnostics(article);
  expect(result.findings.filter(f => f.code === 'repeated_passage')).toHaveLength(2);
  expect(result.findings[0]).toMatchObject({ field: 'content', excerpt: 'En koncert er annonceret.', paragraphId: expect.any(String) });
  expect(result).toMatchObject({ factCheck: 'not_performed', semanticEditorialReview: 'requires_editor', publicationApproval: false });
  expect(draftDiagnostics({ ...article, title: 'Ny titel' }).paragraphs[0].id).not.toBe(result.paragraphs[0].id);
});
it('reports exact workspace revision, canonical rules and unverified imported research', async () => {
  memory.rows.set('writerWorkspaces/owner', { revision: 4, data: { currentDraftId: 'draft-1234', articleData: { title: 'Bog', content: '<p>Tekst</p>', mcpResearch: { verified: true } } } });
  const result = await reviewWorkspace('owner', { draftId: 'draft-1234', expectedRevision: 4 });
  expect(result).toMatchObject({ revision: 4, publicationApproval: false, researchVerified: false, admission: { status: 'not_granted' } });
  expect(result.rules.structureHash).toMatch(/^[a-f0-9]{64}$/);
  expect(mock.read).not.toHaveBeenCalled();
  await expect(reviewWorkspace('owner', { draftId: 'draft-1234', expectedRevision: 3 })).rejects.toThrow('revision_conflict');
  await expect(reviewWorkspace('colleague', { draftId: 'draft-1234', expectedRevision: 4 })).rejects.toThrow('revision_conflict');
});
it('projects saved factual evidence separately and strips arbitrary fields', () => {
  const report = { articleHash: 'a'.repeat(64), checkedAt: '2026-10-04T08:00:00Z', complete: true, blockers: [],
    coverage: { expectedUnits: 1, checkedUnits: 1 }, results: [{ claim: 'Dato', status: 'supported', evidence: 'Officiel side', citations: [{ sourceId: 'S1', url: 'https://example.com/article', quote: 'Premiere den 4.' }] }],
    sources: [{ id: 'S1', url: 'https://example.com/article', title: 'Kilde', contentHash: 'b'.repeat(64), retrievedAt: '2026-10-04T08:00:00Z', publishedAt: null }], secret: 'PRIVATE' };
  const result = savedFactualChecks([{ name: 'factcheck', pass: true, evidence: report }]);
  expect(result[0]).toMatchObject({ historicalPass: true, reportAvailable: true, freshness: 'not_revalidated', publicationApproval: false });
  expect(result[0].report?.results[0].citations[0].url).toBe('https://example.com/article');
  expect(JSON.stringify(result)).not.toContain('PRIVATE');
  report.sources[0].url = 'https://example.com/?token=secret';
  expect(savedFactualChecks([{ name: 'factcheck', evidence: report }])[0].reportAvailable).toBe(false);
});
