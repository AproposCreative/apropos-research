import { afterEach, expect, it, vi } from 'vitest';
import { currentLivCostContext } from '@/lib/liv/cost-context';
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: provider.create } } }) }));
vi.mock('@/lib/accreditation/audit-store', () => ({ appendAiAudit: vi.fn() }));
vi.mock('@/lib/accreditation/agent-control', () => ({ isAutomationEnabled: async () => false }));
vi.mock('@/lib/accreditation/liv-system-prompt', () => ({ composeLivSystemPrompt: () => ({ prompt: 'test prompt' }) }));
vi.mock('@/lib/accreditation/memory-store', () => ({ loadMemoryForReply: async () => '' }));
vi.mock('@/lib/accreditation/models', () => ({ resolveAccreditationModelForTask: () => 'test-model' }));
vi.mock('@/lib/accreditation/request-store', () => ({ getRequestById: vi.fn() }));
import { summarizeAccreditationInbound } from '@/lib/accreditation/summarize-inbound';
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('makes one bounded summary request inside the shared budget context', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  provider.create.mockImplementation(async (request, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'accreditation', stage: 'inbound-summary' });
    expect(request.max_completion_tokens).toBe(2000);
    expect(options.maxRetries).toBe(0);
    return { choices: [{ message: { content: '{"summary":"Modtaget","suggestedReply":"Tak","novelQuestion":false}' } }] };
  });
  expect(await summarizeAccreditationInbound({ from: 'test@example.invalid', subject: 'Test', text: 'Test' })).toMatchObject({ aiSummary: 'Modtaget' });
  expect(provider.create).toHaveBeenCalledTimes(1);
  expect(currentLivCostContext()).toBeUndefined();
});
it('returns manual-review fallback without calling provider for invalid budget configuration', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  const result = await summarizeAccreditationInbound({ from: 'test@example.invalid', subject: 'Test', text: 'Test' });
  expect(result.novelQuestion).toBe(true);
  expect(result.aiSummary).toContain('manuelt');
  expect(provider.create).not.toHaveBeenCalled();
});
