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
