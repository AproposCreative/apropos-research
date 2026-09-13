import { afterEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { currentLivCostContext, withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';

const mocks = vi.hoisted(() => ({ create: vi.fn(), auth: vi.fn(async () => 'test-user') }));
vi.mock('@/lib/openai', () => ({ models: { default: 'test-model' }, getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }) }));
vi.mock('@/lib/newsletter/auth-request', () => ({ getNewsletterUserIdFromRequest: mocks.auth }));
vi.mock('@/lib/logger', () => ({ logger: {}, createRequestLogger: () => ({ debug: vi.fn(), warn: vi.fn(), error: vi.fn(), info: vi.fn() }) }));
import { POST as article } from '@/app/api/generate-article/route';
import { POST as fields } from '@/app/api/generate-webflow-fields/route';
import { POST as suggestions } from '@/app/api/ai-suggestions/route';
import { POST as analysis } from '@/app/api/analyze-research/route';

const routes = [
  { name: 'generate-article', post: article, body: { prompt: 'Test' }, limit: 2000 },
  { name: 'generate-webflow-fields', post: fields, body: { prompt: 'Test' }, limit: 1500 },
  { name: 'ai-suggestions', post: suggestions, body: { text: 'En længere testtekst' }, limit: 300 },
  { name: 'analyze-research', post: analysis, body: { title: 'Test' }, limit: 3000 },
];
const response = { choices: [{ finish_reason: 'stop', message: { content: JSON.stringify({ angle: 'Kultur', audience: 'Læsere', suggestions: ['a', 'b', 'c', 'd', 'e'] }) } }] };
const request = (route: typeof routes[number]) => new NextRequest(`https://example.invalid/api/${route.name}`, { method: 'POST', body: JSON.stringify(route.body) });
afterEach(() => { vi.unstubAllEnvs(); vi.clearAllMocks(); });

it.each(routes)('$name uses one bounded call in the shared writer budget', async route => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  mocks.create.mockImplementation(async (body, options) => {
    expect(currentLivCostContext()).toMatchObject({ scope: 'writer', stage: route.name });
    expect(body.max_completion_tokens).toBe(route.limit);
    expect(options).toMatchObject({ maxRetries: 0, timeout: 45000 });
    return response;
  });
  expect((await route.post(request(route))).status).toBe(200);
  expect(mocks.create).toHaveBeenCalledTimes(1);
  expect(currentLivCostContext()).toBeUndefined();
});

it.each(routes)('$name stops before provider on invalid budget configuration', async route => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'TRUE');
  expect((await route.post(request(route))).status).toBe(503);
  expect(mocks.create).not.toHaveBeenCalled();
});

it.each(routes)('$name preserves parent ownership and reports budget denial without fallback success', async route => {
  mocks.create.mockImplementation(async () => {
    expect(currentLivCostContext()).toMatchObject({ runId: 'liv-test', stage: route.name });
    throw new Error('connection failed', { cause: new LivCostPretransportError('liv_cost_budget_exceeded') });
  });
  const result = await withLivCostContext({ runId: 'liv-test', stage: 'prepare' }, () => route.post(request(route)));
  expect(result.status).toBe(503);
  expect(result.headers.get('cache-control')).toBe('no-store');
  expect(mocks.create).toHaveBeenCalledTimes(1);
});
