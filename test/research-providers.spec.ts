import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ create: vi.fn(), fetch: vi.fn() }));
vi.mock('@/lib/openai', () => ({ getOpenAIClient: () => ({ responses: { create: m.create } }), models: { research: 'fixture-model' } }));
vi.mock('@/lib/api/internal-auth', () => ({ internalApiHeaders: () => ({ 'Content-Type': 'application/json' }) }));
import { createOpenAIResponsesProvider } from '@/lib/research/providers/openaiResponsesProvider';
import { createLegacyWebSearchProvider } from '@/lib/research/providers/legacyWebSearchProvider';

const citation = (url: string) => ({ type: 'url_citation', title: 'Fixture', url, start_index: 1, end_index: 5 });
const text = 'Factual research context. '.repeat(20);
beforeEach(() => {
  vi.resetAllMocks(); vi.stubGlobal('fetch', m.fetch);
  m.create.mockResolvedValue({ status: 'completed', output: [{ type: 'message', content: [
    { type: 'output_text', text, annotations: [citation('https://example.com/film'), citation('https://example.com/film'), citation('http://insecure.example'), citation('https://name:password@example.com/private')] },
    { type: 'output_text', text: 'A separate counterpoint.', annotations: [citation('https://other.example/review')] },
  ] }] });
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it('requires web search, cancels transport, disables retries, and preserves the cited brief', async () => {
  const signal = new AbortController().signal;
  const data = await createOpenAIResponsesProvider().search({ query: 'fixture', maxResults: 5, signal, timeoutMs: 45000 });
  expect(m.create).toHaveBeenCalledWith(expect.objectContaining({ tool_choice: 'required', store: false, max_output_tokens: 3000 }), { signal, timeout: 45000, maxRetries: 0 });
  expect(data.contextText).toBe(`${text}\n\nA separate counterpoint.`);
  expect(data.sources.map(s => s.url)).toEqual(['https://example.com/film', 'https://other.example/review']);
});
it.each(['incomplete', 'failed', 'cancelled', 'in_progress'])('rejects %s Responses output', async status => {
  m.create.mockResolvedValue({ status, output: [] });
  await expect(createOpenAIResponsesProvider().search({ query: 'fixture', maxResults: 3 })).rejects.toThrow('research_response_incomplete');
});
it('legacy transport preserves safe HTTP status without reading or returning the body', async () => {
  const read = vi.fn(); m.fetch.mockResolvedValue({ ok: false, status: 401, text: read, json: read });
  const signal = new AbortController().signal;
  await expect(createLegacyWebSearchProvider().search({ query: 'fixture', maxResults: 3, signal })).rejects.toMatchObject({ status: 401, message: 'research_legacy_http_error' });
  expect(m.fetch.mock.calls[0][1].signal).toBe(signal);
  expect(read).not.toHaveBeenCalled();
});
it('legacy transport accepts its existing nested result envelope', async () => {
  m.fetch.mockResolvedValue({ ok: true, json: async () => ({ data: { results: [{ title: 'Film', url: 'https://example.com', content: text }] } }) });
  const data = await createLegacyWebSearchProvider().search({ query: 'fixture', maxResults: 3 });
  expect(data.sources).toHaveLength(1);
});
