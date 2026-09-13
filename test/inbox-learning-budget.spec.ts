import { afterEach, expect, it, vi } from 'vitest';
import { currentLivCostContext } from '@/lib/liv/cost-context';
const mocks = vi.hoisted(() => ({ create: vi.fn(), save: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }) }));
vi.mock('@/lib/accreditation/models', () => ({ getAccreditationFastModel: () => 'test' }));
vi.mock('@/lib/accreditation/memory-store', () => ({ getContactProfile: async () => null, upsertContactProfile: mocks.save }));
vi.mock('@/lib/liv-inbox/settings-store', () => ({ getLivInboxSettings: async () => ({ editorNotes: '' }), updateLivInboxSettings: mocks.save }));
import { learnFromEdit } from '@/lib/liv-inbox/learn';
const edit = { original: 'Tak for din besked.', edited: 'Tak, vi vender tilbage i morgen.', contactEmail: 'test@example.invalid' };
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });
it('learns within one bounded shared scope', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  mocks.create.mockImplementation(async (body, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'accreditation', stage: 'inbox-learn' });
    expect(body.max_completion_tokens).toBe(2000);
    expect(options).toEqual({ maxRetries: 0, timeout: 45000 });
    return { choices: [{ finish_reason: 'stop', message: { content: '{"global":"Svar kort","contact":""}' } }] };
  });
  expect((await learnFromEdit(edit)).learned).toBe(true);
  expect(mocks.save).toHaveBeenCalledTimes(1);
});
it('does not spend or change notes when budget configuration is invalid', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  expect(await learnFromEdit(edit)).toEqual({ learned: false });
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.save).not.toHaveBeenCalled();
});
it('never stores incomplete generated rules', async () => {
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'length', message: { content: '{"global":"Incomplete","contact":""}' } }] });
  expect(await learnFromEdit(edit)).toEqual({ learned: false });
  expect(mocks.save).not.toHaveBeenCalled();
});
