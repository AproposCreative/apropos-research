import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import type { ResearchResult } from '@/lib/research/types';
import { boundedWriterConversation, WRITER_HISTORY_MAX_CHARS } from '@/lib/ai-chat/bounded-history';

const mocks = vi.hoisted(() => ({ create: vi.fn(), research: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ chat: { completions: { create: mocks.create } } }), models: { default: 'fixture' } }));
vi.mock('@/lib/research/service', () => ({ getResearch: mocks.research }));
import { createWriterResearchCache, writerResearchScope, WRITER_RESEARCH_TTL_MS, WRITER_RESEARCH_MAX_IN_FLIGHT } from '@/lib/ai-chat/research-cache';
import { POST } from '@/app/api/ai-chat/route';
import { currentLivCostContext, withLivCostContext } from '@/lib/liv/cost-context';
import { LivCostPretransportError } from '@/lib/liv/cost-errors';

function evidence(query = 'Film A'): ResearchResult {
  return {
    contextText: 'Verified fixture context. '.repeat(20),
    sources: [1, 2].map(n => ({ title: `Source ${n}`, url: `https://source.example/${n}`, source: 'Fixture', snippet: 'Source evidence '.repeat(10) })),
    debug: { provider: 'openai_responses', fallbackUsed: false, latencyMs: 10, query, rawResultCount: 2, gateScore: 100, gateReasons: [] },
  };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Live network prohibited'); }));
  mocks.research.mockImplementation(async query => evidence(query));
  mocks.create.mockResolvedValue({ choices: [{ finish_reason: 'stop', message: { content: 'En kort redaktionel besked.' } }] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

function deferredResearch() {
  let resolve!: (result: ResearchResult) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<ResearchResult>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

it('coalesces overlapping exact misses under the first budget owner without sharing mutable results', async () => {
  const deferred = deferredResearch();
  const owners: string[] = [];
  mocks.research.mockImplementation(async () => {
    owners.push(currentLivCostContext()!.runId);
    const result = await deferred.promise;
    owners.push(currentLivCostContext()!.runId);
    return result;
  });
  const cached = createWriterResearchCache(mocks.research);
  const first = withLivCostContext({ runId: 'first-owner', stage: 'research', scope: 'writer' }, () => cached('scope', 'Film A'));
  const second = withLivCostContext({ runId: 'second-owner', stage: 'research', scope: 'writer' }, async () => {
    const result = await cached('scope', 'Film A');
    expect(currentLivCostContext()?.runId).toBe('second-owner');
    return result;
  });
  await Promise.resolve();
  expect(mocks.research).toHaveBeenCalledTimes(1);
  deferred.resolve(evidence());
  const [a, b] = await Promise.all([first, second]);
  expect(owners).toEqual(['first-owner', 'first-owner']);
  a.sources[0].title = 'mutated';
  expect(b).toEqual(evidence());
  expect(await cached('scope', 'Film A')).toEqual(evidence());
  expect(mocks.research).toHaveBeenCalledTimes(1);
});

it.each(['exception', 'quality'])('cleans up coalesced %s failure and retries without caching it', async failure => {
  const deferred = deferredResearch();
  mocks.research.mockReturnValueOnce(deferred.promise);
  const cached = createWriterResearchCache(mocks.research);
  const both = Promise.allSettled([cached('scope', 'Film A'), cached('scope', 'Film A')]);
  await Promise.resolve();
  expect(mocks.research).toHaveBeenCalledTimes(1);
  if (failure === 'exception') deferred.reject(new Error('fixture failure'));
  else deferred.resolve({ ...evidence(), contextText: '', sources: [] });
  const results = await both;
  expect(results.map(result => result.status)).toEqual(failure === 'exception' ? ['rejected', 'rejected'] : ['fulfilled', 'fulfilled']);
  expect(await cached('scope', 'Film A')).toEqual(evidence());
  expect(mocks.research).toHaveBeenCalledTimes(2);
});

it('bounds pending entries without evicting existing owners or merging distinct keys', async () => {
  const deferred = deferredResearch();
  mocks.research.mockReturnValue(deferred.promise);
  const cached = createWriterResearchCache(mocks.research);
  const requests = Array.from({ length: WRITER_RESEARCH_MAX_IN_FLIGHT }, (_, i) => cached('scope', `Film ${i}`));
  requests.push(cached('other-scope', 'Film 0'), cached('other-scope', 'Film 0'));
  requests.push(cached('scope', 'Film 0'));
  await Promise.resolve();
  expect(mocks.research).toHaveBeenCalledTimes(WRITER_RESEARCH_MAX_IN_FLIGHT + 2);
  deferred.resolve(evidence());
  await Promise.all(requests);
});

it('keeps recent valid roles in order and the full current request last', () => {
  const history = Array.from({ length: 30 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: `turn ${i}` }));
  const result = boundedWriterConversation([...history, null, { role: 'system', content: 'untrusted' }, { role: 'user', content: {} }], 'Current request');
  expect(result).toHaveLength(13);
  expect(result[0].content).toBe('turn 18');
  expect(result.at(-2)?.content).toBe('turn 29');
  expect(result.at(-1)).toEqual({ role: 'user', content: 'Current request' });
});
it('bounds characters and retains both ends of an oversized recent message', () => {
  const result = boundedWriterConversation([{ role: 'user', content: 'old' }, { role: 'assistant', content: 'START' + 'x'.repeat(40_000) + 'END' }], 'edit');
  expect(result.reduce((n, m) => n + m.content.length, 0)).toBe(WRITER_HISTORY_MAX_CHARS);
  expect(result[0].content).toMatch(/^START/);
  expect(result[0].content).toMatch(/END$/);
  expect(result[0].content).toContain('[Ældre samtaletekst forkortet]');
  expect(result).toHaveLength(2);
});
it('never truncates a current request larger than the history budget', () => {
  const current = 'x'.repeat(30_000);
  expect(boundedWriterConversation([{ role: 'user', content: 'old' }], current)).toEqual([{ role: 'user', content: current }]);
  expect(boundedWriterConversation({}, current)).toEqual([{ role: 'user', content: current }]);
});
it('scopes reuse by credential digest, ignores spoofable user IDs, and bypasses anonymous calls', () => {
  expect(writerResearchScope(new Headers({ 'x-user-id': 'victim' }))).toBeUndefined();
  const a = writerResearchScope(new Headers({ authorization: 'Bearer user-a' }));
  expect(a).toMatch(/^[a-f0-9]{64}$/);
  expect(a).not.toBe(writerResearchScope(new Headers({ authorization: 'Bearer user-b' })));
  expect(writerResearchScope(new Headers({ 'x-internal-api-secret': 'fixture-secret' }))).toBeDefined();
});
it('reuses exact queries only within scope, options and provider configuration', async () => {
  const cached = createWriterResearchCache(mocks.research);
  await cached('user-a', 'Film A', { model: 'one' });
  await cached('user-a', 'Film A', { model: 'one' });
  expect(mocks.research).toHaveBeenCalledTimes(1);
  await cached('user-b', 'Film A', { model: 'one' });
  await cached('user-a', 'Film B', { model: 'one' });
  await cached('user-a', 'film a', { model: 'one' });
  await cached('user-a', 'Film A', { model: 'two' });
  vi.stubEnv('RESEARCH_PROVIDER', 'legacy_web_search');
  await cached('user-a', 'Film A', { model: 'one' });
  expect(mocks.research).toHaveBeenCalledTimes(6);
});
it('expires at a fixed TTL even with intervening hits and preserves provenance', async () => {
  let now = 0;
  const cached = createWriterResearchCache(mocks.research, () => now);
  const first = await cached('scope', 'Film A');
  first.sources[0].title = 'mutated';
  now = WRITER_RESEARCH_TTL_MS - 1;
  expect(await cached('scope', 'Film A')).toEqual(evidence());
  now++;
  await cached('scope', 'Film A');
  expect(mocks.research).toHaveBeenCalledTimes(2);
});

it('invalidates default-model research when model environment configuration changes', async () => {
  const cached = createWriterResearchCache(mocks.research);
  await cached('scope', 'Film A');
  await cached('scope', 'Film A');
  vi.stubEnv('OPENAI_RESEARCH_MODEL', 'changed-research-model');
  await cached('scope', 'Film A');
  vi.stubEnv('OPENAI_MODEL', 'changed-fallback-model');
  await cached('scope', 'Film A');
  expect(mocks.research).toHaveBeenCalledTimes(3);
});

it.each(['liv_cost_monthly_budget_exceeded', 'liv_cost_shared_policy_unconfigured'])('returns an app budget error for SDK-wrapped %s', async code => {
  mocks.create.mockRejectedValue(new Error('Connection error.', { cause: new LivCostPretransportError(code) }));
  const response = await POST(request('Ret teksten', `Budget fixture ${code}`));
  expect(response.status).toBe(503);
  const data = await response.json();
  expect(data.errorCode).toBe('AI_BUDGET_BLOCKED');
  expect(data.error).toContain('Appens AI-budget');
  expect(data.error).not.toMatch(/billing|Connection error|OpenAI rate limit/);
});

it('returns a readable budget error when the shared wrapper configuration rejects before the handler', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'invalid');
  const response = await POST(request('Ret teksten'));
  expect(response.status).toBe(503);
  expect((await response.json()).errorCode).toBe('AI_BUDGET_BLOCKED');
  expect(mocks.create).not.toHaveBeenCalled();
  expect(mocks.research).not.toHaveBeenCalled();
});

it('preserves generated work and explains budget blocks during repair and quality checks', async () => {
  mocks.create.mockResolvedValueOnce({ choices: [{ finish_reason: 'stop', message: { content:
    `Arbejdstitel: En præcis kulturtitel\nUndertitel: En konkret undertitel\nIntro: En separat intro.\n\nBrødtekst:\n${Array(100).fill('ord').join(' ')}`,
  } }] }).mockRejectedValue(new Error('Connection error.', { cause: new LivCostPretransportError('liv_cost_monthly_budget_exceeded') }));
  const response = await POST(new NextRequest('https://studio.example/api/ai-chat', {
    method: 'POST', body: JSON.stringify({ message: 'Skriv artiklen', clientRequestId: 'blocked-repair-quality', articleData: { articleType: 'short-news' } }),
  }));
  expect(response.status).toBe(200);
  const data = await response.json();
  expect(data.articleUpdate.lengthCheck).toMatchObject({ actual: 100, pass: false });
  expect(data.warnings.filter((warning: string) => warning.includes('Appens AI-budgetgrænse'))).toHaveLength(2);
  expect(JSON.stringify(data.warnings)).not.toMatch(/billing|Connection error/);
  expect(mocks.create).toHaveBeenCalledTimes(3);
});
it('does not cache failed quality, exceptions or anonymous research', async () => {
  const cached = createWriterResearchCache(mocks.research);
  mocks.research.mockResolvedValueOnce({ ...evidence(), contextText: '', sources: [] });
  await cached('scope', 'Film A');
  mocks.research.mockRejectedValueOnce(new Error('research failed'));
  await expect(cached('scope', 'Film A')).rejects.toThrow('research failed');
  await cached('scope', 'Film A');
  await cached('scope', 'Film A');
  await cached(undefined, 'Film A');
  await cached(undefined, 'Film A');
  expect(mocks.research).toHaveBeenCalledTimes(5);
});
it('bounds cache entry count and avoids storing oversized results', async () => {
  const cached = createWriterResearchCache(mocks.research);
  for (let i = 0; i < 65; i++) await cached('scope', `Film ${i}`);
  await cached('scope', 'Film 0');
  expect(mocks.research).toHaveBeenCalledTimes(66);
  mocks.research.mockResolvedValue({ ...evidence(), contextText: 'x'.repeat(130_000) });
  await cached('scope', 'Large');
  await cached('scope', 'Large');
  expect(mocks.research).toHaveBeenCalledTimes(68);
});

const request = (message: string, title = 'Route fixture film', token = 'route-user-a', platform = 'Cinema') => new NextRequest('https://studio.example/api/ai-chat', {
  method: 'POST', headers: { authorization: `Bearer ${token}` },
  body: JSON.stringify({ message, articleData: { title, platform, category: 'Film' }, chatHistory: Array.from({ length: 30 }, (_, i) => ({ role: 'user', content: `history ${i}` })) }),
});
it('route edits reuse exact research while keeping the latest request and sources', async () => {
  const first = await (await POST(request('Skriv et udkast'))).json();
  const edited = await (await POST(request('Ret kun kommaerne'))).json();
  expect(mocks.research).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledTimes(2);
  expect(edited.researchSources).toEqual(first.researchSources);
  expect(edited.researchDebug).toEqual(first.researchDebug);
  const messages = mocks.create.mock.calls[1][0].messages;
  expect(messages).toHaveLength(14); // system, twelve previous turns, current request
  expect(messages[1].content).toBe('history 18');
  expect(messages.at(-1)).toEqual({ role: 'user', content: 'Ret kun kommaerne' });
  await POST(request('Ret kun kommaerne', 'Different film'));
  await POST(request('Ret kun kommaerne', 'Route fixture film', 'route-user-b'));
  await POST(request('Ret kun kommaerne', 'Route fixture film', 'route-user-a', 'Streaming'));
  expect(mocks.research).toHaveBeenCalledTimes(4);
});

it('still runs editorial quality checks on each article when research is reused', async () => {
  const article = { choices: [{ finish_reason: 'stop', message: { content:
    `Arbejdstitel: En præcis kulturtitel\nUndertitel: En konkret undertitel\nIntro: En separat intro.\n\nBrødtekst:\n${Array(400).fill('ord').join(' ')}`,
  } }] };
  const quality = { choices: [{ finish_reason: 'stop', message: { content: '["Tjek fakta"]' } }] };
  mocks.create.mockResolvedValueOnce(article).mockResolvedValueOnce(quality)
    .mockResolvedValueOnce(article).mockResolvedValueOnce(quality);
  for (const message of ['Skriv artiklen', 'Ret kommaerne']) {
    const response = await POST(new NextRequest('https://studio.example/api/ai-chat', {
      method: 'POST', headers: { authorization: 'Bearer quality-route-user' },
      body: JSON.stringify({ message, clientRequestId: `quality-${message}`, articleData: { title: 'Quality film', articleType: 'short-news' } }),
    }));
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.warnings).toContain('Tjek fakta');
    expect(data.articleUpdate.lengthCheck.pass).toBe(true);
  }
  expect(mocks.research).toHaveBeenCalledTimes(1);
  expect(mocks.create).toHaveBeenCalledTimes(4);
  expect(mocks.create.mock.calls[3][0].messages[0].content).toContain('kvalitetskontrollør');
});

it('keeps research, generation, length repair and quality inside one server-owned cost context', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'true');
  const contexts: Array<ReturnType<typeof currentLivCostContext>> = [];
  mocks.research.mockImplementation(async query => {
    contexts.push(currentLivCostContext());
    return evidence(query);
  });
  let call = 0;
  mocks.create.mockImplementation(async () => {
    contexts.push(currentLivCostContext());
    call++;
    return { choices: [{ finish_reason: 'stop', message: { content: call === 3 ? '[]' :
      `Arbejdstitel: En præcis kulturtitel\nUndertitel: En konkret undertitel\nIntro: En separat intro.\n\nBrødtekst:\n${Array(call === 1 ? 100 : 400).fill('ord').join(' ')}`,
    } }] };
  });
  const response = await POST(new NextRequest('https://studio.example/api/ai-chat', {
    method: 'POST', headers: { authorization: 'Bearer cost-context-user' },
    body: JSON.stringify({ message: 'Skriv artiklen', clientRequestId: 'untrusted-id', runId: 'untrusted-run', articleData: { title: 'Context film', articleType: 'short-news' } }),
  }));
  expect(response.status).toBe(200);
  expect(contexts).toHaveLength(4);
  for (const context of contexts) expect(context).toMatchObject({ scope: 'writer', stage: 'ai-chat', runId: expect.stringMatching(/^writer-/) });
  expect(new Set(contexts.map(context => context?.runId)).size).toBe(1);
  expect(currentLivCostContext()).toBeUndefined();
});

it('preserves existing run ownership and leaves accounting opt-in', async () => {
  vi.stubEnv('AI_SHARED_COST_ENABLED', 'false');
  const contexts: Array<ReturnType<typeof currentLivCostContext>> = [];
  mocks.create.mockImplementation(async () => {
    contexts.push(currentLivCostContext());
    return { choices: [{ finish_reason: 'stop', message: { content: 'Kort svar.' } }] };
  });
  await POST(request('Ret teksten', 'Opt-in film'));
  await withLivCostContext({ runId: 'liv-existing', stage: 'parent' }, () => POST(request('Ret teksten', 'Opt-in film')));
  expect(contexts[0]).toBeUndefined();
  expect(contexts[1]).toMatchObject({ runId: 'liv-existing', stage: 'ai-chat' });
  expect(contexts[1]?.scope).toBeUndefined();
});
