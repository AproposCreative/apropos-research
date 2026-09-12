import { expect, it } from 'vitest';
import { quoteLivOpenAIRequest, quoteLivImageRequest, readLivProviderUsage, usageUsdUpperBound } from '@/lib/liv/cost-pricing';
const chat = { model: 'gpt-5.6-luna', max_completion_tokens: 1000, messages: [{ role: 'user', content: 'Dansk kultur' }] };
it('uses documented long-context/cache-write ceilings, not arbitrary estimated cheap rates', () => {
  const luna = quoteLivOpenAIRequest('/chat/completions', chat);
  expect(luna.inputUsdPerMillion).toBe(0.5); expect(luna.outputUsdPerMillion).toBe(1.8);
  expect(luna.inputTokenBound).toBeGreaterThan(Buffer.byteLength(JSON.stringify(chat)));
  const sol = quoteLivOpenAIRequest('/chat/completions', { ...chat, model: 'gpt-5.6-sol' });
  expect(sol.inputUsdPerMillion).toBe(10); expect(sol.outputUsdPerMillion).toBe(30);
  expect(sol.reservedUsdMicros).toBeGreaterThan(luna.reservedUsdMicros);
});
it.each(['unknown', 'gpt-5.6', 'ft:gpt-5.6-luna:custom', 'gpt-6-astra'])('never prices unknown model %s as zero', model => {
  expect(() => quoteLivOpenAIRequest('/chat/completions', { ...chat, model })).toThrow('pricing_unknown');
});
it.each([{ stream: true }, { background: true }, { previous_response_id: 'resp_x' }, { max_completion_tokens: undefined },
  { max_completion_tokens: 128001 }, { n: 2 }, { service_tier: 'priority' }, { tools: [{ type: 'code_interpreter' }] },
  { new_paid_feature: true }])('rejects unbounded request before transport: %j', patch => {
  expect(() => quoteLivOpenAIRequest('/chat/completions', { ...chat, ...patch })).toThrow(/liv_cost_/);
});
it('bounds search inference and tool fees independently of the natural-language search-once instruction', () => {
  const request = { model: chat.model, input: 'Find en kilde', tools: [{ type: 'web_search' }], max_output_tokens: 3000, max_tool_calls: 1 };
  const quote = quoteLivOpenAIRequest('/responses', request);
  expect(quote.toolCallBound).toBe(1); expect(quote.fixedUsdBound).toBe(0.01);
  expect(quote.inputTokenBound).toBe(262_000);
  expect(() => quoteLivOpenAIRequest('/responses', { ...request, max_tool_calls: undefined })).toThrow('tools_unbounded');
  expect(() => quoteLivOpenAIRequest('/responses', { ...request, max_tool_calls: 3 })).toThrow('tools_unbounded');
  const usage = { inputTokens: 100, outputTokens: 10, toolCalls: 1, cachedInputTokens: null, reasoningTokens: null };
  expect(usageUsdUpperBound(quote, usage)).toBe(10068);
  expect(usageUsdUpperBound(quote, { ...usage, toolCalls: null })).toBe(10068);
  expect(() => quoteLivOpenAIRequest('/responses', { ...request, tools: [{ type: 'web_search', return_token_budget: 'unlimited' }] })).toThrow('tools_unbounded');
});
it('bounds high-detail vision by patches, excludes encoded transport bytes and counts each image', () => {
  const request = (url: string, detail = 'high', count = 1) => ({ ...chat, model: 'gpt-5.6-sol', messages: [{ role: 'user', content:
    Array.from({ length: count }, () => ({ type: 'image_url', image_url: { url, detail } })) }] });
  const quote = quoteLivOpenAIRequest('/chat/completions', request('https://example.test/photo.jpg'));
  const encoded = quoteLivOpenAIRequest('/chat/completions', request(`data:image/jpeg;base64,${'a'.repeat(1000000)}`));
  expect(encoded.inputTokenBound).toBe(quote.inputTokenBound);
  expect(quote.inputTokenBound).toBeLessThan(5000);
  expect(quote.reservedUsdMicros * 8 / 1000000).toBeLessThan(1); // Fixture FX ceiling, not a market quote.
  expect(quoteLivOpenAIRequest('/chat/completions', request('url', 'high', 2)).inputTokenBound).toBeGreaterThan(quote.inputTokenBound + 3001);
  expect(quoteLivOpenAIRequest('/chat/completions', request('url', 'low')).inputTokenBound).toBeLessThan(2000);
  for (const detail of ['auto', 'original', 'unknown']) expect(() => quoteLivOpenAIRequest('/chat/completions', request('url', detail))).toThrow('detail_unbounded');
});
it('prices only the exact supported image generation shape with prompt plus image cost', () => {
  const body = { model: 'gpt-image-1.5', prompt: 'An original illustration', size: '1536x1024', quality: 'high' };
  const quote = quoteLivImageRequest('/images/generations', body);
  expect(quote.fixedUsdBound).toBe(0.20); expect(quote.reservedUsdMicros).toBeGreaterThan(200000);
  for (const patch of [{ model: 'gpt-image-2' }, { n: 2 }, { size: 'auto' }, { image: 'input' }, { prompt: 'x'.repeat(33000) }]) {
    expect(() => quoteLivImageRequest('/images/generations', { ...body, ...patch })).toThrow(/liv_cost_/);
  }
});
it('prices the documented embedding model and explicitly knows it has no output token bill', () => {
  const quote = quoteLivOpenAIRequest('/embeddings', { model: 'text-embedding-3-small', input: 'Tekst', encoding_format: 'base64' });
  expect(quote.reservedUsdMicros).toBeGreaterThan(0); expect(quote.inputUsdPerMillion).toBe(0.02);
  expect(readLivProviderUsage({ usage: { prompt_tokens: 50, total_tokens: 50 } }, '/embeddings')?.outputTokens).toBe(0);
});
it('preserves actual usage counts and keeps missing/malformed usage unknown, not zero', () => {
  expect(readLivProviderUsage({ usage: { prompt_tokens: 100, completion_tokens: 20,
    prompt_tokens_details: { cached_tokens: 40 }, completion_tokens_details: { reasoning_tokens: 10 } } }, '/chat/completions'))
    .toEqual({ inputTokens: 100, outputTokens: 20, cachedInputTokens: 40, reasoningTokens: 10, toolCalls: 0 });
  for (const value of [null, {}, { usage: {} }, { usage: { input_tokens: 0, output_tokens: 0 } }, { usage: { input_tokens: 1, output_tokens: -1 } }]) {
    expect(readLivProviderUsage(value, '/responses')).toBeNull();
  }
});
