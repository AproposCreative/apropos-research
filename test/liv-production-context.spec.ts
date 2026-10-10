import { beforeEach, expect, it, vi } from 'vitest';
import { memoryFirestore } from './helpers/mcp-firestore';
import { emptyDeliveryState, type DeliveryState } from '@/lib/liv/delivery-policy';
const state = vi.hoisted(() => ({ db: null as any, delivery: null as unknown as DeliveryState, plan: vi.fn(), work: vi.fn(), status: vi.fn() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.db }));
vi.mock('@/lib/liv/delivery-store', () => ({ readDeliveryState: async () => state.delivery }));
vi.mock('@/lib/liv/daily-plan-store', () => ({ getLivDailyPlan: state.plan }));
vi.mock('@/lib/mcp/editorial', () => ({ editorialContext: async () => ({ voice: { text: 'Canonical voice', hash: 'voice-hash' } }), getLivWork: state.work }));
vi.mock('@/lib/editorial/submission-options', () => ({ getSubmissionOptions: async () => ({ authors: [], categories: [] }) }));
vi.mock('@/lib/editorial/submissions', () => ({ submissionStore: () => ({ collection: state.db.collection('editorialSubmissions') }), getSubmissionStatus: state.status }));
vi.mock('@/lib/ai/provider-hold', () => ({ readProviderHold: async () => ({ blocked: true, revision: 5 }) }));
import { getLivProductionContext } from '@/lib/editorial/liv-production-context';
import { livProductionSubmissionId } from '@/lib/editorial/liv-production-identity';
import { assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
let memory: ReturnType<typeof memoryFirestore>;
beforeEach(() => {
  vi.clearAllMocks(); memory = memoryFirestore(); state.db = memory.db; state.delivery = emptyDeliveryState();
  state.plan.mockImplementation(async (day: string) => day === '2026-10-10' ? { dayKey: day, status: 'failed', topicHint: 'Old hint' } : null);
  state.work.mockResolvedValue({ found: true, status: 'failed', reason: 'liv_cost_provider_quota_exhausted' });
  state.status.mockResolvedValue({ revision: 2 });
});
it('composes canonical instructions, honest coverage and existing work without changing state or spending', async () => {
  state.work.mockImplementation(async () => { expect(() => assertPaidAiAllowed()).toThrow(); return { found: true, status: 'failed' }; });
  const result = await getLivProductionContext('owner', {}, new Date('2026-10-10T08:20:00Z'));
  expect(result.production).toEqual({ day: '2026-10-10', kind: 'scheduled' });
  expect(result.scheduledFor).toBe('2026-10-10T08:00:00.000Z');
  expect(result.automaticDelivery).toMatchObject({ overdue: true, published: false });
  expect(result.week.map(row => row.status)).toEqual(['blocked', 'off_day', 'unplanned', 'off_day', 'unplanned', 'off_day', 'unplanned']);
  expect(result.editorial.voice.text).toBe('Canonical voice'); expect(result.backendAi).toMatchObject({ allowed: false, estimatedDkk: 0, holdChanged: false });
  expect(result.retainedWork.nextTool).toBe('get_liv_work'); expect(result.countsAsUnattendedLiv).toBe(false);
  expect(memory.rows.size).toBe(0); expect(state.status).not.toHaveBeenCalled();
});
it('resumes exactly the private submission across sessions rather than creating another article', async () => {
  const id = livProductionSubmissionId('owner', { day: '2026-10-10', kind: 'scheduled' });
  memory.rows.set(`editorialSubmissions/${id}`, { uid: 'owner' });
  const result = await getLivProductionContext('owner', {}, new Date('2026-10-10T08:20:00Z'));
  expect(result.existingSubmission).toEqual({ revision: 2 }); expect(result.nextAction).toBe('resume_existing_submission');
  const other = await getLivProductionContext('other', {}, new Date('2026-10-10T08:20:00Z'));
  expect(other.existingSubmission).toBeNull(); expect(other.submissionId).not.toBe(id);
});
it('keeps a separate durable reserve, off-days and month/DST cadence', async () => {
  state.delivery.reservePreparation = { dayKey: '2026-09-28' };
  const reserve = await getLivProductionContext('owner', { kind: 'reserve' }, new Date('2026-10-10T08:20:00Z'));
  expect(reserve.production).toEqual({ kind: 'reserve', day: '2026-09-28' }); expect(reserve.scheduledFor).toBeNull();
  const future = await getLivProductionContext('owner', {}, new Date('2026-10-31T11:00:00Z'));
  expect(future.production.day).toBe('2026-11-01'); expect(future.scheduledFor).toBe('2026-11-01T09:00:00.000Z');
  expect(future.automaticDelivery.overdue).toBe(false);
  await expect(getLivProductionContext('owner', { day: '2026-10-11' })).rejects.toThrow('off_day');
});
it('prepares the next publication on an off day, using Danish calendar dates over month and DST boundaries', async () => {
  for (const [at, day, scheduledFor] of [
    ['2026-10-11T06:00:00Z', '2026-10-12', '2026-10-12T08:00:00.000Z'],
    ['2026-10-25T07:00:00Z', '2026-10-26', '2026-10-26T09:00:00.000Z'],
    ['2026-10-31T07:00:00Z', '2026-11-01', '2026-11-01T09:00:00.000Z'],
  ]) {
    const result = await getLivProductionContext('owner', {}, new Date(at));
    expect(result).toMatchObject({ phase: 'preparation_day', targetDate: day, scheduledFor,
      schedulePolicy: { prepareAtLocal: '08:00', publishAtLocal: '10:00', personalApprovalRequired: true } });
    expect(result.automaticDelivery).toMatchObject({ publicationDay: false, overdue: false });
    expect(result.nextActions).toContain('research_in_chat');
  }
  expect(memory.rows.size).toBe(0);
});
it('resumes today and never directs silent rewrites of a scheduled or published version', async () => {
  const id = livProductionSubmissionId('owner', { day: '2026-10-10', kind: 'scheduled' });
  memory.rows.set(`editorialSubmissions/${id}`, { uid: 'owner' });
  state.status.mockResolvedValue({ status: 'scheduled', revision: 5 });
  const result = await getLivProductionContext('owner', {}, new Date('2026-10-10T06:00:00Z'));
  expect(result.phase).toBe('publication_day');
  expect(result.nextActions).toEqual(['verify_sources_without_rewriting_approved_version', 'await_server_publication']);
  state.status.mockResolvedValue({ status: 'published', revision: 5 });
  expect((await getLivProductionContext('owner', {}, new Date('2026-10-10T09:00:00Z'))).nextActions).toEqual(['verify_public_readback']);
});
it('does not buy speculative inventory for a future date or relabel a historical recovery as on-time publication', async () => {
  const now = new Date('2026-10-10T06:00:00Z');
  const future = await getLivProductionContext('owner', { day: '2026-10-14' }, now);
  expect(future.phase).toBe('future_day'); expect(future.nextActions).toEqual(['wait_until_preparation_day']);
  const past = await getLivProductionContext('owner', { day: '2026-10-08' }, now);
  expect(past).toMatchObject({ phase: 'recovery', targetDate: '2026-10-08', countsAsUnattendedLiv: false });
  state.work.mockResolvedValue({ found: true, webflowItemId: 'existing' });
  expect((await getLivProductionContext('owner', {}, now)).nextActions).toEqual(['inspect_existing_cms_article_before_any_create']);
});
