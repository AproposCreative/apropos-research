import { afterEach, expect, it, vi } from 'vitest';
import { currentLivCostContext } from '@/lib/liv/cost-context';
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: provider.create } } }) }));
vi.mock('@/lib/config/env', () => ({ env: { OPENAI_MODEL: 'test-model' } }));
import { generateNewsletterIntro } from '@/lib/newsletter/intro-ai';
const week = { start: new Date('2026-09-07'), end: new Date('2026-09-13'), isoWeek: 37, labelDa: 'Testuge' };
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('accounts intro against shared writer budget with bounded call and no retries', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  provider.create.mockImplementation(async (body, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'newsletter-intro' });
    expect(body.max_completion_tokens).toBe(600);
    expect(options).toEqual({ maxRetries: 0, timeout: 45000 });
    return { choices: [{ finish_reason: 'stop', message: { content: '{"headline":"Kultur","intro":"Læs med."}' } }] };
  });
  expect(await generateNewsletterIntro(week, [])).toEqual({ headline: 'Kultur', intro: 'Læs med.' });
  expect(provider.create).toHaveBeenCalledTimes(1);
});
it('returns an explicit fallback warning without provider work when config is invalid', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  expect(await generateNewsletterIntro(week, [])).toMatchObject({ intro: '', error: expect.stringContaining('budgetkontrollen') });
  expect(provider.create).not.toHaveBeenCalled();
});
it('never accepts a truncated intro even when JSON parses', async () => {
  provider.create.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: '{"headline":"Kultur","intro":"Halv tekst"}' } }] });
  expect(await generateNewsletterIntro(week, [])).toMatchObject({ intro: '', error: expect.stringContaining('ikke færdig') });
});
it('does not expose provider error bodies to draft warnings', async () => {
  provider.create.mockRejectedValue(new Error('sensitive-provider-body'));
  const result = await generateNewsletterIntro(week, []);
  expect(result.intro).toBe('');
  expect(result.error).not.toContain('sensitive-provider-body');
});
