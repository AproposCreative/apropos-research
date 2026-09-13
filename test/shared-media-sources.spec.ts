import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ collection: vi.fn(), get: vi.fn(), available: true }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => m.available ? { collection: m.collection } : null }));
import { getAllEnabledMediaSources } from '@/lib/getMediaSources';
beforeEach(() => { vi.resetAllMocks(); m.available = true; m.collection.mockReturnValue({ where: () => ({ get: m.get }) }); m.get.mockResolvedValue({ docs: [] }); });
it('reads only shared sources and preserves an empty selection', async () => {
  expect(await getAllEnabledMediaSources()).toEqual([]);
  expect(m.collection).toHaveBeenCalledWith('sharedMediaSources');
});
it('never substitutes defaults for unavailable storage', async () => {
  m.available = false; await expect(getAllEnabledMediaSources()).rejects.toThrow('shared_media_sources_unavailable');
  m.available = true; m.get.mockRejectedValue(new Error('private detail'));
  await expect(getAllEnabledMediaSources()).rejects.toThrow('shared_media_sources_unavailable');
});
it('excludes personal, disabled and malformed rows even if returned by storage', async () => {
  const source = { name: 'Shared', baseUrl: 'https://shared.example', sitemapIndex: '/rss', enabled: true };
  m.get.mockResolvedValue({ docs: [source, { ...source, userId: 'milo' }, { ...source, enabled: false }, { name: 'bad' }]
    .map((row, i) => ({ id: String(i), data: () => row })) });
  expect(await getAllEnabledMediaSources()).toEqual([{ ...source, id: '0' }]);
});
