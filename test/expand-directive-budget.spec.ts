import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { currentLivCostContext } from '@/lib/liv/cost-context';
const m = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: m.create } } }) }));
vi.mock('@/lib/liv/voice', () => ({ loadLivVoice: () => ({ hash: 'test', text: 'voice' }) }));
vi.mock('@/lib/liv/model-config', () => ({ livModels: () => ({ utility: 'test' }) }));
import { expandDirective } from '@/lib/liv/expand-directive';
beforeEach(() => { vi.resetAllMocks(); vi.stubEnv('AI_SHARED_COST_ENABLED', 'true'); });
afterEach(() => vi.unstubAllEnvs());
it('accounts once and reuses the cache', async () => {
  m.create.mockImplementation(async (_, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'expand-directive' });
    expect(options).toEqual({ maxRetries: 0, timeout: 45000 });
    return { choices: [{ finish_reason: 'stop', message: { content: 'Færdig briefing' } }] };
  });
  const input = { topicHint: 'cache-test' };
  expect((await expandDirective(input)).cached).toBe(false);
  expect(await expandDirective(input)).toEqual({ expandedDirective: 'Færdig briefing', cached: true });
  expect(m.create).toHaveBeenCalledTimes(1);
});
it('preserves raw input and never caches truncated output', async () => {
  m.create.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: 'Afbrudt' } }] });
  const input = { directiveHint: 'truncation-test' };
  expect(await expandDirective(input)).toEqual({ expandedDirective: input.directiveHint, cached: false });
  await expandDirective(input);
  expect(m.create).toHaveBeenCalledTimes(2);
});
it('invalid budget flag preserves the user hint without a provider call', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  expect(await expandDirective({ topicHint: 'denial-test' })).toEqual({ expandedDirective: 'denial-test', cached: false });
  expect(m.create).not.toHaveBeenCalled();
});
