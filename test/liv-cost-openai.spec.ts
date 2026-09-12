import { beforeEach, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => null }));
import { LivBudgetOpenAI, livBudgetFetch } from '@/lib/liv/cost-openai';
import { currentLivCostContext, withLivCostContext, withLivCostStage } from '@/lib/liv/cost-context';
import type { LivCostLedger } from '@/lib/liv/cost-ledger';
import { LivCostPretransportError, getLivCostPretransportError } from '@/lib/liv/cost-errors';
const context = { runId: 'prepare-2026-09-13', stage: 'writing' };
const request = { model: 'gpt-5.6-luna', max_completion_tokens: 1000, messages: [{ role: 'user' as const, content: 'Private test draft' }] };
const mock = { transport: vi.fn<typeof fetch>(), reserve: vi.fn<LivCostLedger['reserve']>(), complete: vi.fn<LivCostLedger['complete']>() };
const ledger: LivCostLedger = { reserve: mock.reserve, complete: mock.complete };
const completion = () => new Response(JSON.stringify({ id: 'chatcmpl_fixture', model: request.model,
  choices: [{ message: { role: 'assistant', content: 'Preserve paid output' }, finish_reason: 'stop', index: 0 }],
  usage: { prompt_tokens: 100, completion_tokens: 50, total_tokens: 150 } }), { status: 200,
  headers: { 'content-type': 'application/json', 'x-request-id': 'req_fixture' } });
beforeEach(() => {
  vi.resetAllMocks(); mock.transport.mockImplementation(async () => completion()); mock.complete.mockResolvedValue();
  mock.reserve.mockImplementation(async input => ({ ...input, month: '2026-09', runId: input.context.runId, stage: input.context.stage,
    model: input.quote.model, reservedDkkMicros: 100000, createdAt: '2026-09-12T10:00:00Z',
    policy: { monthlyLimitDkkMicros: 300000000, usdToDkkCeiling: 8, conversionBasis: 'Fixture only', priceVersion: input.quote.version, validUntil: '2026-10-01' } }));
});
const client = () => new LivBudgetOpenAI({ apiKey: 'fixture-only-not-a-real-key', fetch: mock.transport }, ledger);
it('reserves before transport and records usage/request attribution without persisting private prompt or result', async () => {
  const sdk = client();
  mock.transport.mockImplementation(async () => { expect(mock.reserve).toHaveBeenCalledOnce(); return completion(); });
  const result = await withLivCostContext(context, () => sdk.chat.completions.create(request).withResponse());
  expect(result.data.choices[0].message.content).toBe('Preserve paid output');
  expect(mock.reserve.mock.calls[0][0]).toMatchObject({ context, quote: { model: request.model } });
  expect(mock.complete.mock.calls[0][1]).toMatchObject({ status: 'response', providerRequestId: 'req_fixture', responseModel: request.model,
    usage: { inputTokens: 100, outputTokens: 50, cachedInputTokens: null, reasoningTokens: null } });
  expect(JSON.stringify(mock.reserve.mock.calls)).not.toContain('Private test draft');
  expect(JSON.stringify(mock.complete.mock.calls)).not.toContain('Preserve paid output');
});
it('covers a client/resource cached outside ALS while leaving concurrent manual calls unmodified', async () => {
  const sdk = client(), cached = sdk.chat.completions;
  const manual = cached.create({ ...request, model: 'manual-unpriced-model' }, { maxRetries: 0 });
  await Promise.all([manual, withLivCostContext(context, () => cached.create(request))]);
  expect(mock.transport).toHaveBeenCalledTimes(2); expect(mock.reserve).toHaveBeenCalledOnce();
  const bodies = mock.transport.mock.calls.map(([, init]) => JSON.parse(init!.body as string));
  expect(bodies.find(body => body.model === 'manual-unpriced-model').service_tier).toBeUndefined();
  expect(bodies.find(body => body.model === request.model).service_tier).toBe('default');
});
it('disables automatic SDK retries even when a Liv caller explicitly asks for retries', async () => {
  mock.transport.mockImplementation(async () => new Response(JSON.stringify({ error: { message: 'Temporary fixture failure' } }), {
    status: 500, headers: { 'content-type': 'application/json', 'retry-after-ms': '1' } }));
  await expect(withLivCostContext(context, () => client().chat.completions.create(request, { maxRetries: 4 }))).rejects.toThrow();
  expect(mock.transport).toHaveBeenCalledOnce(); expect(mock.reserve).toHaveBeenCalledOnce();
  expect(mock.complete.mock.calls[0][1]).toMatchObject({ status: 'ambiguous', httpStatus: 500, usage: null });
});
it('retains unrelated manual SDK retry behavior', async () => {
  mock.transport.mockResolvedValueOnce(new Response('{}', { status: 500, headers: { 'retry-after-ms': '1' } }));
  await client().chat.completions.create(request, { maxRetries: 1 });
  expect(mock.transport).toHaveBeenCalledTimes(2); expect(mock.reserve).not.toHaveBeenCalled();
});
it('blocks transport for unknown pricing, exhausted/missing ledger policy and unsupported stream', async () => {
  const sdk = client();
  await expect(withLivCostContext(context, () => sdk.chat.completions.create({ ...request, model: 'unknown' }))).rejects.toThrow();
  await expect(withLivCostContext(context, () => sdk.chat.completions.create({ ...request, stream: true }))).rejects.toThrow('streaming_uncovered');
  mock.reserve.mockRejectedValue(new Error('liv_cost_monthly_budget_exceeded'));
  await expect(withLivCostContext(context, () => sdk.chat.completions.create(request))).rejects.toThrow();
  expect(mock.transport).not.toHaveBeenCalled();
});
it('preserves a paid response when usage persistence fails but blocks subsequent calls in the same run', async () => {
  const sdk = client(); mock.complete.mockRejectedValue(new Error('storage outage'));
  await withLivCostContext(context, async () => {
    const response = await sdk.chat.completions.create(request);
    expect(response.choices[0].message.content).toBe('Preserve paid output');
    expect(currentLivCostContext()?.blocked).toBe(true);
    await expect(sdk.chat.completions.create(request)).rejects.toThrow();
  });
  expect(mock.transport).toHaveBeenCalledOnce();
});
it('records ambiguous transport loss and never retries or releases its reservation', async () => {
  mock.transport.mockRejectedValue(new Error('socket disappeared'));
  await expect(withLivCostContext(context, () => client().chat.completions.create(request))).rejects.toThrow();
  expect(mock.transport).toHaveBeenCalledOnce();
  expect(mock.complete.mock.calls[0][1]).toMatchObject({ status: 'ambiguous', usage: null, httpStatus: null });
});
it('exposes typed unpaid evidence through the real SDK wrapper for explicit reservation denials', async () => {
  mock.reserve.mockRejectedValue(new LivCostPretransportError('liv_cost_monthly_budget_exceeded'));
  const error = await withLivCostContext(context, () => client().chat.completions.create(request)).catch(error => error);
  expect(getLivCostPretransportError(error)).toMatchObject({ code: 'liv_cost_monthly_budget_exceeded', providerAttempted: false });
  expect(mock.transport).not.toHaveBeenCalled(); expect(mock.complete).not.toHaveBeenCalled();
});
it('exposes typed unpaid evidence for local request validation before reservation', async () => {
  const error = await withLivCostContext(context, () => client().chat.completions.create({ ...request, model: 'unknown' })).catch(error => error);
  expect(getLivCostPretransportError(error)).toMatchObject({ code: 'liv_cost_pricing_unknown', providerAttempted: false });
  expect(mock.reserve).not.toHaveBeenCalled(); expect(mock.transport).not.toHaveBeenCalled();
});
it('does not classify unknown reservation persistence errors or lookalike network failures as unpaid', async () => {
  const sdk = client();
  mock.reserve.mockRejectedValueOnce(new Error('reservation commit outcome unknown'));
  const storeError = await withLivCostContext(context, () => sdk.chat.completions.create(request)).catch(error => error);
  expect(getLivCostPretransportError(storeError)).toBeNull(); expect(mock.transport).not.toHaveBeenCalled();
  mock.transport.mockRejectedValue(new Error('liv_cost_monthly_budget_exceeded'));
  const networkError = await withLivCostContext(context, () => sdk.chat.completions.create(request)).catch(error => error);
  expect(getLivCostPretransportError(networkError)).toBeNull(); expect(mock.transport).toHaveBeenCalledOnce();
  expect(mock.complete.mock.calls[0][1].status).toBe('ambiguous');
  expect(getLivCostPretransportError({ name: 'LivCostPretransportError', code: 'liv_cost_monthly_budget_exceeded', providerAttempted: false })).toBeNull();
  const circular = new Error('network'); circular.cause = circular;
  expect(getLivCostPretransportError(circular)).toBeNull();
});
it('bounds Responses search to one tool call and records unknown usage honestly', async () => {
  mock.transport.mockImplementation(async () => new Response(JSON.stringify({ id: 'resp_fixture', status: 'completed', output: [] }), {
    headers: { 'content-type': 'application/json' } }));
  await withLivCostContext(context, () => client().responses.create({ model: request.model, input: 'Find a source',
    tools: [{ type: 'web_search_preview' } as any], max_output_tokens: 3000 }).catch(() => undefined));
  expect(mock.transport).not.toHaveBeenCalled();
  await withLivCostContext(context, () => client().responses.create({ model: request.model, input: 'Find a source',
    tools: [{ type: 'web_search' } as any], max_output_tokens: 3000 }));
  const sent = JSON.parse(mock.transport.mock.calls[0][1]!.body as string);
  expect(sent.max_tool_calls).toBe(1); expect(sent.service_tier).toBe('default');
  expect(mock.complete.mock.calls[0][1].usage).toBeNull();
});
it('guards image and embedding methods too, preserving actual caller results', async () => {
  const sdk = client();
  mock.transport.mockImplementation(async () => new Response(JSON.stringify({ data: [{ b64_json: 'cHJlc2VydmU=' }],
    usage: { input_tokens: 100, output_tokens: 6250 } }), { headers: { 'content-type': 'application/json' } }));
  const result = await withLivCostContext(context, () => withLivCostStage('media', () => sdk.images.generate({
    model: 'gpt-image-1.5', prompt: 'An illustration', size: '1536x1024', quality: 'high' })));
  expect(result.data?.[0].b64_json).toBe('cHJlc2VydmU=');
  expect(mock.reserve.mock.calls[0][0].context.stage).toBe('media');
  mock.transport.mockImplementation(async () => new Response(JSON.stringify({ data: [{ embedding: [1, 2], index: 0 }], usage: { prompt_tokens: 10, total_tokens: 10 } }), { headers: { 'content-type': 'application/json' } }));
  await withLivCostContext(context, () => sdk.embeddings.create({ model: 'text-embedding-3-small', input: 'Text', encoding_format: 'float' }));
  expect(mock.reserve.mock.calls[1][0].quote.kind).toBe('embedding');
  expect(mock.complete.mock.calls[1][1].usage?.outputTokens).toBe(0);
});
it.each([undefined, 'auto'] as const)('normalizes vision detail %s to high without mutating input or manual requests', async detail => {
  const sdk = client();
  const body = { ...request, messages: [{ role: 'user' as const, content: [{ type: 'image_url' as const,
    image_url: { url: `data:image/jpeg;base64,${'a'.repeat(10000)}`, ...(detail ? { detail } : {}) } }] }] };
  await withLivCostContext(context, () => sdk.chat.completions.create(body));
  expect(JSON.parse(mock.transport.mock.calls[0][1]!.body as string).messages[0].content[0].image_url.detail).toBe('high');
  expect(mock.reserve.mock.calls[0][0].quote.inputTokenBound).toBeLessThan(5000);
  expect(body.messages[0].content[0].image_url.detail).toBe(detail);
  await sdk.chat.completions.create(body);
  expect(JSON.parse(mock.transport.mock.calls[1][1]!.body as string).messages[0].content[0].image_url.detail).toBe(detail);
  expect(mock.reserve).toHaveBeenCalledOnce();
});
it('does not double-reserve when OpenAI.withOptions clones the guarded client', async () => {
  const sdk = client().withOptions({ timeout: 1000 });
  await withLivCostContext(context, () => sdk.chat.completions.create(request));
  expect(mock.reserve).toHaveBeenCalledOnce(); expect(mock.transport).toHaveBeenCalledOnce();
});
it('refuses unpriced/regional/non-OpenAI transports and redirects inside Liv context', async () => {
  const guarded = livBudgetFetch(mock.transport, ledger);
  for (const url of ['https://evil.example/v1/chat/completions', 'https://eu.api.openai.com/v1/chat/completions']) {
    await expect(withLivCostContext(context, () => guarded(url, { method: 'POST', body: JSON.stringify(request) }))).rejects.toThrow('transport_uncovered');
  }
  expect(mock.transport).not.toHaveBeenCalled();
  await withLivCostContext(context, () => guarded('https://api.openai.com/v1/chat/completions', { method: 'POST', body: JSON.stringify(request) }));
  expect(mock.transport.mock.calls[0][1]?.redirect).toBe('error');
});
