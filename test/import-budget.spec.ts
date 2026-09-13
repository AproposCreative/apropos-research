import { afterEach, expect, it, vi } from 'vitest';
import type OpenAI from 'openai';
import { currentLivCostContext, withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
import { analyzeArticleForImport } from '@/lib/articles/import-autofill';
const create = vi.fn();
const client = { chat: { completions: { create } } } as unknown as OpenAI;
const input = { articleText: 'Hele den færdige artikel', sections: [], topics: [], authors: [], streamingServices: [] };
const result = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ title: 'Titel', intro: 'Intro', contentHtml: '<p>Tekst</p>' }) } }] };
afterEach(() => { vi.unstubAllEnvs(); vi.resetAllMocks(); });
it('bounds one import, passes cancellation and does not slice source', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  const signal = new AbortController().signal;
  create.mockImplementation(async (body, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: 'article-import' });
    expect(body.max_completion_tokens).toBe(10000);
    expect(body.messages[1].content).toBe(input.articleText);
    expect(options).toEqual({ maxRetries: 0, timeout: 60000, signal });
    return result;
  });
  expect((await analyzeArticleForImport(client, input, signal)).title).toBe('Titel');
  expect(create).toHaveBeenCalledTimes(1);
});
it('preserves parent run ownership', async () => {
  create.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ runId: 'saved-run', stage: 'article-import' });
    return result;
  });
  await withLivCostContext({ runId: 'saved-run', stage: 'prepare' }, () => analyzeArticleForImport(client, input));
});
it.each([
  { ...input, articleText: 'x'.repeat(24001) },
  { ...input, topics: [{ name: 'x'.repeat(24001) }] },
])('rejects oversized input before model work', async oversized => {
  await expect(analyzeArticleForImport(client, oversized)).rejects.toThrow('Originalen er ikke ændret');
  expect(create).not.toHaveBeenCalled();
});
it.each(['length', 'content_filter'])('rejects incomplete %s output', async finish_reason => {
  create.mockResolvedValue({ choices: [{ ...result.choices[0], finish_reason }] });
  await expect(analyzeArticleForImport(client, input)).rejects.toThrow('ikke færdig');
});
it('rejects empty JSON instead of constructing a successful fallback', async () => {
  create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: '{}' } }] });
  await expect(analyzeArticleForImport(client, input)).rejects.toThrow('obligatoriske');
});
it('denies invalid accounting configuration before transport', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  await expect(analyzeArticleForImport(client, input)).rejects.toThrow('liv_cost_shared_flag_invalid');
  expect(create).not.toHaveBeenCalled();
});
it('propagates a denied reservation without retry', async () => {
  const denied = new LivCostPretransportError('liv_cost_monthly_limit');
  create.mockRejectedValue(denied);
  await expect(analyzeArticleForImport(client, input)).rejects.toBe(denied);
  expect(create).toHaveBeenCalledTimes(1);
});
