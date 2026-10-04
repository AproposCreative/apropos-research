import { createHash } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
const mock = vi.hoisted(() => ({ db: null as any, state: { entries: [], slots: {} } as any }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => mock.db }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => mock.state }));
import { listEditorialWork, runSummary } from '@/lib/editorial/work-catalog';
const memory = memoryFirestore();
beforeEach(() => { memory.clear(); mock.db = memory.db; mock.state = { entries: [], slots: {} }; });
it('discovers checkpoints, paid text and own work without leaking prompts or colleague work', async () => {
  memory.rows.set('livDailyArticles/prepare-2026-10-04', { title: 'Plan', dayKey: '2026-10-04', updatedAt: '2026-10-04T09:00:00Z', status: 'failed', reason: 'source_similarity',
    articleCheckpoint: { title: 'Færdig tekst, ikke godkendt', content: '<p>En gemt artikeltekst.</p>' }, rawError: 'sk-secret' });
  const desk = createHash('sha256').update('liv-daily').digest('hex');
  memory.rows.set(`livSourceArchives/${desk}/runs/00000000-0000-4000-8000-000000000000`, { writerText: 'PRIVATE PROMPT', rawResponse: '{"title":"Gemt artikel"}', status: 'not_verified', createdAt: '2026-10-04T08:00:00Z' });
  memory.rows.set('writerWorkspaces/owner', { revision: 2, updatedAt: '2026-10-04T10:00:00Z', data: { currentDraftId: 'owner-draft', articleData: { title: 'Eget arbejde' } } });
  memory.rows.set('writerWorkspaces/colleague', { data: { currentDraftId: 'SECRET-COLLEAGUE' } });
  const result = await listEditorialWork('owner', {});
  expect(result.items).toHaveLength(3); expect(result.items[0].title).toBe('Eget arbejde');
  expect(result.items[1]).toMatchObject({ stage: 'written_draft', blockers: ['source_similarity'], publicationApproval: false });
  expect(result.items[2].title).toBe('Gemt artikel');
  expect(JSON.stringify(result)).not.toMatch(/PRIVATE PROMPT|sk-secret|SECRET-COLLEAGUE/);
  expect((await listEditorialWork('owner', { query: 'Gemt', limit: 1 })).items[0].title).toBe('Gemt artikel');
});
it('requires actual stored receipt evidence, not status=published or a plan', () => {
  const row = { status: 'published', webflowItemId: 'cms' };
  expect(runSummary('run', row, mock.state, '2026-10-04').stage).toBe('plan_or_research');
  mock.state.slots['2026-10-04'] = { itemId: 'cms', state: 'published', publicUrl: 'https://example.com/story', checkedAt: '2026-10-04T08:00:00Z' };
  expect(runSummary('run', row, mock.state, '2026-10-04')).toMatchObject({ stage: 'publication_receipt', publicationApproval: false });
});
it('does not treat a title-only or image-only checkpoint as written prose', () => {
  for (const articleCheckpoint of [{ title: 'Kun titel' }, { content: '<p>&nbsp;</p><img src="https://example.com/image.jpg">' }]) {
    expect(runSummary('run', { articleCheckpoint }, mock.state, '2026-10-05')).toMatchObject({ stage: 'checkpoint_incomplete', hasText: false, publicationApproval: false });
  }
});
it('never calls stale, rejected or blocked inventory ready', () => {
  const entry = { itemId: 'cms', state: 'ready', expiresDay: '2026-10-06' };
  mock.state.entries = [entry]; expect(runSummary('r', { webflowItemId: 'cms' }, mock.state, '2026-10-04').stage).toBe('ready_manifest');
  for (const patch of [{ expiresDay: '2026-10-03' }, { publicationBlockers: ['changed'] }, { decision: 'rejected' }]) {
    mock.state.entries = [{ ...entry, ...patch }];
    expect(runSummary('r', { webflowItemId: 'cms' }, mock.state, '2026-10-04').stage).not.toBe('ready_manifest');
  }
});
it('bounds reads and explicitly reports truncation instead of claiming complete inventory', async () => {
  for (let i = 0; i < 110; i++) memory.rows.set(`livDailyArticles/legacy-${i}`, { updatedAt: '2026-10-04T08:00:00Z' });
  expect((await listEditorialWork('owner', {})).coverage).toMatchObject({ runRows: 100, truncated: true });
});
it('does not call an insufficient-evidence response or a pre-generation brief a written article', async () => {
  const desk = createHash('sha256').update('liv-daily').digest('hex');
  memory.rows.set(`livSourceArchives/${desk}/runs/038c3fa7-2885-4bab-be30-1653d7a81cf2`, {
    status: 'insufficient_evidence', finishReason: 'stop', createdAt: '2026-09-30T08:00:00Z',
    rawResponse: JSON.stringify({ status: 'insufficient_evidence', title: '', subtitle: '', intro: '', content: '',
      rating: null, ratingReason: null, missingEvidence: ['En officiel dato mangler.'] }),
  });
  memory.rows.set(`livSourceArchives/${desk}/runs/00000000-0000-4000-8000-000000000000`, {
    status: 'not_verified', createdAt: '2026-09-30T07:00:00Z', writerText: 'PRIVATE RESEARCH BRIEF',
  });
  const result = await listEditorialWork('owner', {});
  expect(result.items[0]).toMatchObject({ stage: 'evidence_blocked', hasText: false,
    hasRawResponse: true, publicationApproval: false, missingEvidence: ['En officiel dato mangler.'] });
  expect(result.items[1]).toMatchObject({ stage: 'brief_only', hasText: false, hasRawResponse: false });
  expect(JSON.stringify(result)).not.toContain('PRIVATE RESEARCH BRIEF');
});
