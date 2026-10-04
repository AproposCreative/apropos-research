import { expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: vi.fn(() => { throw Error('unexpected_db'); }) }));
import { withoutPaidAi, assertPaidAiAllowed } from '@/lib/ai/no-paid-calls';
import { livBudgetFetch } from '@/lib/liv/cost-openai';
import { createLivCostLedger } from '@/lib/liv/cost-ledger';
it('propagates the spending prohibition through asynchronous operations without affecting ordinary tasks', async () => {
  await withoutPaidAi(async () => { await Promise.resolve(); expect(() => assertPaidAiAllowed()).toThrow('mcp_paid_call_requires_separate_approval'); });
  expect(() => assertPaidAiAllowed()).not.toThrow();
});
it('blocks the transport before fetch, parsing, fallback or reservation', async () => {
  const fetcher = vi.fn(), reserve = vi.fn(); const wrapped = livBudgetFetch(fetcher, { reserve } as any);
  await expect(withoutPaidAi(() => wrapped('https://api.openai.com/v1/chat/completions', { method: 'POST', body: '{}' }))).rejects.toThrow('mcp_paid_call_requires_separate_approval');
  expect(fetcher).not.toHaveBeenCalled(); expect(reserve).not.toHaveBeenCalled();
});
it('also blocks direct ledger reservations before database access', async () => {
  await expect(withoutPaidAi(() => createLivCostLedger().reserve({} as any))).rejects.toThrow('mcp_paid_call_requires_separate_approval');
});
