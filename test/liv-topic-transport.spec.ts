import { afterEach, beforeEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetch: vi.fn(), history: vi.fn() }));
vi.mock('@/lib/api/internal-auth', () => ({ internalApiHeaders: () => ({ 'x-internal-api-secret': 'fixture-only' }) }));
vi.mock('@/lib/logger', () => ({ logger: { warn: vi.fn(), error: vi.fn() } }));
vi.mock('@/lib/liv/daily-history-store', () => ({ getRecentLivDailySlugs: mocks.history, getRecentLivDailyTopics: mocks.history }));
import { pickLivTopic } from '@/lib/liv/pick-topic';
const options = { baseUrl: 'https://app.example', topicHint: 'Kultur i København', mustUseTrending: false };
beforeEach(() => { vi.resetAllMocks(); vi.stubGlobal('fetch', mocks.fetch); mocks.history.mockResolvedValue([]); });
afterEach(() => vi.unstubAllGlobals());
it.each([401, 403, 500, 503])('reports HTTP %s as failure, not a missing topic or synthetic fallback', async status => {
  mocks.fetch.mockResolvedValue(new Response('', { status }));
  await expect(pickLivTopic(options)).rejects.toThrow(`liv_trending_http_${status}`);
  expect(mocks.history).not.toHaveBeenCalled();
});
it('keeps internal auth, bounds the wait and refuses login redirects', async () => {
  mocks.fetch.mockResolvedValue(Response.json({ articles: [] }));
  expect(await pickLivTopic(options)).toMatchObject({ synthetic: true, title: options.topicHint });
  expect(mocks.fetch).toHaveBeenCalledWith('https://app.example/api/trending', expect.objectContaining({
    headers: { 'x-internal-api-secret': 'fixture-only' }, redirect: 'error', signal: expect.any(AbortSignal),
  }));
});
it.each([{}, { articles: null }, { articles: 'invalid' }])('rejects invalid schemas: %j', async body => {
  mocks.fetch.mockResolvedValue(Response.json(body));
  await expect(pickLivTopic(options)).rejects.toThrow('liv_trending_invalid_response');
});
it('does not expose upstream details on network or JSON failure', async () => {
  mocks.fetch.mockRejectedValue(new Error('private upstream body'));
  await expect(pickLivTopic(options)).rejects.toThrow('liv_trending_unavailable');
  mocks.fetch.mockResolvedValue(new Response('<html>private</html>'));
  await expect(pickLivTopic(options)).rejects.toThrow('liv_trending_unavailable');
});
it('reserves no-topic for a successful empty result when trending is mandatory', async () => {
  mocks.fetch.mockResolvedValue(Response.json({ articles: [] }));
  expect(await pickLivTopic({ ...options, mustUseTrending: true })).toBeNull();
});
