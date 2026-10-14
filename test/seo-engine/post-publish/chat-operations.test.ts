import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from '../../helpers/mcp-firestore';
const m = vi.hoisted(() => ({ db: null as any, warn: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => m.db }));
vi.mock('@/lib/logger', () => ({ logger: { warn: m.warn } }));
import { assessSeoChatHealth, readSeoChatHealth, observeSeoChatHealth } from '../../../lib/seo-engine/post-publish/chat-health';
import { selectChatCandidates, chatQueuePriority } from '../../../lib/seo-engine/post-publish/chat-queue';
import { seoStatusPresentation } from '../../../lib/seo-engine/post-publish/presentation';
import { snapshotHash } from '../../../lib/seo-engine/post-publish/snapshot';
import type { QualityJob } from '../../../lib/seo-engine/post-publish/jobs';
const store = memoryFirestore(), now = new Date('2026-10-12T10:30:00Z');
const job = (id: string, patch: Partial<QualityJob> = {}) => ({ id, status: 'queued', source: 'recovery', mode: 'publication_quality',
  createdAt: '2026-10-01T00:00:00Z', updatedAt: now.toISOString(),
  snapshot: { metadata: { seoTitle: 'God titel', metaDescription: 'En konkret beskrivelse' } }, ...patch } as QualityJob);
const base = () => ({ now, mode: 'chatgpt-first', day: '2026-10-12', batch: null, tasks: [], active: [], partial: false });
beforeEach(() => { store.clear(); m.db = store.db; m.warn.mockReset(); });
it.each(['chatgpt_metadata_public_verified', 'chatgpt_metadata_reconciled', 'future_success_code'])('does not display successful %s as failed', reason => {
  const display = seoStatusPresentation({ status: 'applied', reason, publicReceipt: { url: 'https://example.com' } });
  expect(display.label).toBe('Verificeret live'); expect(display.reason).not.toMatch(/ikke gennemføres/);
});
it('separates proposal, unknown status and verified publication', () => {
  expect(seoStatusPresentation({ status: 'queued', reason: 'proposal_saved_not_published', publicReceipt: null }).reason).toContain('endnu ikke anvendt');
  expect(seoStatusPresentation({ status: 'applied', reason: null, publicReceipt: null }).label).toContain('Afventer');
  expect(seoStatusPresentation({ status: 'applied', reason: 'chatgpt_metadata_public_verified', publicReceipt: null }).reason).toContain('mangler en offentlig kontrolkvittering');
  expect(seoStatusPresentation({ status: 'failed', reason: 'new_failure', publicReceipt: null }).reason).toContain('ikke gennemføres');
});
it.each(['2026-10-12T07:59:00Z', '2026-10-26T08:59:00Z'])('waits until local 10 including DST: %s', at => {
  const result = assessSeoChatHealth({ ...base(), now: new Date(at), day: at.slice(0, 10) });
  expect(result.issues).toEqual([]); expect(result.status).toBe('waiting');
});
it.each(['2026-10-12T08:00:00Z', '2026-10-26T09:00:00Z'])('detects missing run after grace without inventing auth failure: %s', at => {
  const result = assessSeoChatHealth({ ...base(), now: new Date(at), day: at.slice(0, 10) });
  expect(result.issues).toEqual([{ code: 'scheduled_run_not_observed' }]); expect(result.timerOriginVerified).toBe(false);
});
it('does not generate retrospective missing alarms before the verified schedule takes effect', () => {
  expect(assessSeoChatHealth({ ...base(), day: '2026-10-11' }).issues).toEqual([]);
});
it('accepts empty completed batch, but not a half-examined batch or missing public receipt', () => {
  const batch = { taskIds: [], checked: [], candidateIds: [], limit: 2, createdAt: now.toISOString() };
  expect(assessSeoChatHealth({ ...base(), batch }).status).toBe('completed');
  expect(assessSeoChatHealth({ ...base(), batch: { ...batch, candidateIds: ['a'] } }).status).toBe('in_progress');
  expect(assessSeoChatHealth({ ...base(), batch: { ...batch, taskIds: ['a'] }, tasks: [job('a', { status: 'kept' })] }).status).not.toBe('completed');
});
it('detects stalled reviews, uncertain writes and exact saved access errors without retrying', () => {
  const active = [job('a', { processor: 'chatgpt-first', updatedAt: '2026-10-12T06:00:00Z' }),
    job('b', { writeStartedAt: '2026-10-12T07:00:00Z', reason: 'seo_webflow_live_write_403' })];
  const result = assessSeoChatHealth({ ...base(), active });
  expect(result.issues.map(x => x.code)).toContain('review_stalled');
  expect(result.issues.map(x => x.code)).toContain('write_readback_pending');
  expect(result.issues.map(x => x.code)).toContain('service_access_failed');
  expect(result.automaticRepairAttempted).toBe(false); expect(result.paidModelCalls).toBe(0);
});
it('reports a settled editorial conflict as attention, not an unfinished timer run or verified publication', () => {
  const batch = { taskIds: ['a','b'], checked: ['a','b'], candidateIds: ['a','b'], limit: 2, createdAt: '2026-10-12T07:00:00Z' };
  const result = assessSeoChatHealth({ ...base(), batch, tasks: [
    job('a', { status: 'kept', publicReceipt: { url: 'https://example.com' } as any }),
    job('b', { status: 'needs_editor', reason: 'locale_content_mismatch' }),
  ] });
  expect(result.status).toBe('attention'); expect(result.completedTasks).toBe(1); expect(result.editorialAttentionTasks).toBe(1);
  expect(result.issues).toEqual([{ code: 'editorial_attention' }]);
});
it('reads actual batch identity, preserves jobs/holds and records only changed warning signatures', async () => {
  store.rows.set('seoPostPublishControl/processor', { uid: 'owner', mode: 'chatgpt-first' });
  store.rows.set('aiProviderHolds/hold', { active: true });
  const batchKey = `seoPostPublishControl/chat-${snapshotHash({ uid: 'owner', requestId: 'apropos-seo-2026-10-12' })}`;
  const a = job('a', { processor: 'chatgpt-first', updatedAt: '2026-10-12T06:00:00Z' });
  store.rows.set('seoPostPublishJobs/a', a);
  store.rows.set(batchKey, { taskIds: ['a'], checked: ['a'], candidateIds: ['a'], limit: 2, createdAt: '2026-10-12T07:00:00Z' });
  const before = structuredClone([...store.rows]);
  expect((await readSeoChatHealth(now)).runObserved).toBe(true); expect([...store.rows]).toEqual(before);
  expect((await observeSeoChatHealth(now)).changed).toBe(true);
  expect((await observeSeoChatHealth(new Date(now.getTime() + 60000))).changed).toBe(false);
  expect(m.warn).toHaveBeenCalledOnce(); expect(store.rows.get('seoPostPublishJobs/a')).toEqual(a);
  expect(store.rows.get('aiProviderHolds/hold')).toEqual({ active: true });
});
it('finds old active work behind more than 100 completed historical jobs', async () => {
  for (let i = 0; i < 150; i++) store.rows.set(`seoPostPublishJobs/terminal-${i}`, job(`terminal-${i}`, { status: 'kept' }));
  store.rows.set('seoPostPublishJobs/old', job('old'));
  const selection = await store.db.runTransaction((tx: any) => selectChatCandidates(tx, 'owner'));
  expect(selection.candidateIds).toEqual(['old']); expect(selection.selection.scanned).toBe(1);
});
it('rotates bounded active windows and never resets any existing job', async () => {
  for (let i = 0; i < 205; i++) { const id = String(i).padStart(3, '0'); store.rows.set(`seoPostPublishJobs/${id}`, job(id)); }
  async function select() { return store.db.runTransaction(async (tx: any) => {
    const s = await selectChatCandidates(tx, 'owner'); tx.set(s.cursorRef, s.cursorState); return s;
  }); }
  const first = await select(), second = await select(), third = await select();
  expect(first.candidateIds).toHaveLength(200); expect(first.selection.partial).toBe(true);
  expect(second.candidateIds).toHaveLength(5); expect(second.candidateIds[0]).toBe('200');
  expect(third.candidateIds[0]).toBe('000'); expect(store.rows.get('seoPostPublishJobs/000').status).toBe('queued');
});
it('prioritizes resume/write-readback, objective missing fields, publish events, Google evidence then ordinary reviews', () => {
  const owned = { uid: 'owner' } as any;
  const candidates = [job('ordinary'), job('google', { mode: 'performance', evidence: { comparable: true, currentDays: 28, previousDays: 28,
    currentImpressions: 500, previousImpressions: 500, fetchedAt: now.toISOString() } }), job('new', { source: 'webhook' }),
    job('missing', { snapshot: { metadata: { seoTitle: '', metaDescription: '' } } as any }),
    job('resume', { chatReview: owned }), job('write', { chatReview: owned, writeStartedAt: now.toISOString() })];
  expect(candidates.sort((a, b) => chatQueuePriority(a, 'owner', +now) - chatQueuePriority(b, 'owner', +now)).map(j => j.id))
    .toEqual(['write', 'resume', 'missing', 'new', 'google', 'ordinary']);
});
