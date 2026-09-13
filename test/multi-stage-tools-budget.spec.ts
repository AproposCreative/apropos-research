import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentLivCostContext, withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';
const provider = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock('@/lib/openai', () => ({ models: { default: 'test', research: 'test' }, getOpenAIClient: () => ({ chat: { completions: { create: provider.create } } }) }));
vi.mock('@/lib/logger', () => ({ logger: {}, createRequestLogger: () => ({ warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
import { POST as enhance } from '@/app/api/content-enhancer/route';
import { POST as quality } from '@/app/api/quality-check/route';
const routes = [
  { name: 'content-enhancer', post: enhance },
  { name: 'quality-check', post: quality },
];
const request = (name: string) => new NextRequest(`https://example.invalid/api/${name}`, { method: 'POST', body: JSON.stringify({ content: 'Original tekst', topic: 'Kultur', author: 'Test', articleType: 'feature' }) });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each(routes)('$name shares one budget identity across all five calls', async route => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  const ids = new Set<string>();
  provider.create.mockImplementation(async body => {
    const context = currentLivCostContext();
    expect(context).toMatchObject({ scope: 'writer', stage: route.name });
    ids.add(context!.runId);
    expect(body.max_completion_tokens).toBeGreaterThan(0);
    return { choices: [{ message: { content: '{"score":80,"summary":"Test","improvedContent":"Original tekst"}' } }] };
  });
  expect((await route.post(request(route.name))).status).toBe(200);
  expect(provider.create).toHaveBeenCalledTimes(5);
  expect(ids.size).toBe(1);
  expect(currentLivCostContext()).toBeUndefined();
});

it.each(routes)('$name does not start work with invalid accounting configuration', async route => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  expect((await route.post(request(route.name))).status).toBe(503);
  expect(provider.create).not.toHaveBeenCalled();
});

it.each(routes)('$name preserves parent run and surfaces wrapped denial', async route => {
  provider.create.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ runId: 'parent-run', stage: route.name });
    throw new Error('SDK connection error', { cause: new LivCostPretransportError('liv_cost_budget_exceeded') });
  });
  const result = await withLivCostContext({ runId: 'parent-run', stage: 'prepare' }, () => route.post(request(route.name)));
  expect(result.status).toBe(503);
  expect(result.headers.get('cache-control')).toBe('no-store');
  if (route.name === 'content-enhancer') expect(provider.create).toHaveBeenCalledTimes(1);
});
