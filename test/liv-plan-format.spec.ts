import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ rows: new Map<string, any>() }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({
  collection: () => ({ doc: (id: string) => ({ id, get: async () => ({ exists: state.rows.has(id), data: () => state.rows.get(id) }) }) }),
  runTransaction: async (run: any) => run({
    get: (ref: any) => ref.get(), create: (ref: any, data: any) => state.rows.set(ref.id, data),
  }),
}) }));
import { ensureLivDailyPlan, getLivDailyPlan } from '@/lib/liv/daily-plan-store';
import { defaultEditorialPlan } from '@/lib/liv/rolling-plan';
import { selectLivArticleFormat } from '@/lib/liv/review-format';

beforeEach(() => state.rows.clear());
const day = '2026-09-15';
const topic = { title: 'Alle Guds farver', category: 'Film', source: { title: 'Alle Guds farver: anmeldelse' } };

it('preserves automatic format selection through the actual default-plan storage/read path', async () => {
  await ensureLivDailyPlan(defaultEditorialPlan(day));
  const plan = await getLivDailyPlan(day);
  expect(plan?.articleFormat).toBeUndefined();
  expect(selectLivArticleFormat({ ...plan!, topic })).toBe('research-review');
});

it.each(['article', 'research-review'] as const)('never changes an existing explicit %s plan', async articleFormat => {
  const original = { ...defaultEditorialPlan(day), articleFormat };
  state.rows.set(`plan-${day}`, original);
  await ensureLivDailyPlan(defaultEditorialPlan(day));
  const plan = await getLivDailyPlan(day);
  expect(plan?.articleFormat).toBe(articleFormat);
  expect(selectLivArticleFormat({ ...plan!, topic })).toBe(articleFormat);
  expect(state.rows.get(`plan-${day}`)).toEqual(original);
});
