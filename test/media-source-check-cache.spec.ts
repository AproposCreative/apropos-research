import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ get: vi.fn(), set: vi.fn(), user: vi.fn(), validate: vi.fn(), available: true }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => m.available ? { collection: () => ({ doc: m.user }) } : null }));
vi.mock('@/lib/media-source-validation', () => ({ mediaSourceUrl: (base: string, path: string) => new URL(path, base), validateMediaSource: m.validate }));
import { checkMediaSource } from '@/lib/media-source-check-cache';
beforeEach(() => {
  vi.resetAllMocks(); m.available = true;
  m.user.mockReturnValue({ collection: () => ({ doc: () => ({ get: m.get, set: m.set }) }) });
  m.get.mockResolvedValue({ data: () => undefined }); m.validate.mockResolvedValue({ urlCount: 4, checkedAt: '2026-09-13' });
});
it('caches a successful check and reuses it only for the authenticated user', async () => {
  expect(await checkMediaSource('milo', 'https://public.com', '/rss')).toMatchObject({ cached: false, urlCount: 4 });
  const record = m.set.mock.calls[0][0]; expect(record.expiresAt - Date.now()).toBeGreaterThan(86390000);
  m.get.mockResolvedValue({ data: () => record });
  expect(await checkMediaSource('milo', 'https://public.com', '/rss')).toMatchObject({ cached: true });
  expect(m.validate).toHaveBeenCalledTimes(1); expect(m.user).toHaveBeenCalledWith('milo');
});
it('manual refresh and expired results require a new check', async () => {
  m.get.mockResolvedValue({ data: () => ({ version: 1, url: 'https://public.com/rss', result: {}, expiresAt: Date.now() + 100000 }) });
  await checkMediaSource('frederik', 'https://public.com', '/rss', true);
  m.get.mockResolvedValue({ data: () => ({ version: 1, url: 'https://public.com/rss', result: {}, expiresAt: 0 }) });
  await checkMediaSource('frederik', 'https://public.com', '/rss'); expect(m.validate).toHaveBeenCalledTimes(2);
});
it('does not turn validation or storage failure into a successful cached result', async () => {
  m.available = false; await expect(checkMediaSource('milo', 'https://public.com', '/rss')).rejects.toThrow();
  m.available = true; m.validate.mockRejectedValue(new Error('invalid feed'));
  await expect(checkMediaSource('milo', 'https://public.com', '/rss')).rejects.toThrow('invalid feed'); expect(m.set).not.toHaveBeenCalled();
});
