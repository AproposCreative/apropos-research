import { afterEach, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ read: vi.fn(), write: vi.fn() }));
vi.mock('@/src/store/indexdb', () => ({ readIndex: mocks.read, upsertHead: mocks.write }));
import { fetchText } from '@/src/fetch/fetch';
afterEach(() => { vi.unstubAllGlobals(); vi.clearAllMocks(); });
it('does not read or modify the disk index in serverless mode', async () => {
  const fetch = vi.fn().mockResolvedValue(new Response('article', { headers: { 'content-type': 'text/html', etag: 'fresh' } }));
  vi.stubGlobal('fetch', fetch);
  const result = await fetchText('https://fixture.example/article', { persistCache: false, noRobots: true });
  expect(result.text).toBe('article');
  expect(fetch).toHaveBeenCalledWith('https://fixture.example/article', expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(mocks.read).not.toHaveBeenCalled();
  expect(mocks.write).not.toHaveBeenCalled();
});
