import { beforeEach, expect, it, vi } from 'vitest';
const state = vi.hoisted(() => ({ available: true, error: false, stored: undefined as boolean | undefined }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.available ? {
  collection: () => ({ doc: () => ({ get: async () => {
    if (state.error) throw new Error('unavailable');
    return { exists: state.stored !== undefined, data: () => ({ autoOpportunityOptEnabled: state.stored }) };
  } }) }),
} : null }));
import { resolveAutoOpportunityOptimizationEnabled } from '../lib/seo-engine/opportunity-engine/settings';
beforeEach(() => { vi.unstubAllEnvs(); state.available = true; state.error = false; state.stored = undefined; });
it.each(['true', '1', 'on', ''])('stored stop wins over environment enable %s', async (env) => {
  vi.stubEnv('SEO_ENGINE_AUTO_OPPORTUNITY_OPT', env); state.stored = false;
  expect(await resolveAutoOpportunityOptimizationEnabled()).toBe(false);
});
it('environment stop wins over stored enable', async () => {
  vi.stubEnv('SEO_ENGINE_AUTO_OPPORTUNITY_OPT', 'false'); state.stored = true;
  expect(await resolveAutoOpportunityOptimizationEnabled()).toBe(false);
});
it.each([false, true])('fails closed with environment true and unavailable settings (read error=%s)', async (error) => {
  vi.stubEnv('SEO_ENGINE_AUTO_OPPORTUNITY_OPT', 'true'); state.available = error; state.error = error;
  expect(await resolveAutoOpportunityOptimizationEnabled()).toBe(false);
});
it('defaults on only after successful settings read', async () => {
  vi.stubEnv('SEO_ENGINE_AUTO_OPPORTUNITY_OPT', '');
  expect(await resolveAutoOpportunityOptimizationEnabled()).toBe(true);
});
