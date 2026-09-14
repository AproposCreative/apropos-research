import { beforeEach, expect, it, vi } from 'vitest';
import { join } from 'node:path';
const read = vi.hoisted(() => vi.fn());
vi.mock('node:fs', () => ({ readFileSync: read }));
import { loadInternalLinkCatalog } from '@/lib/seo-engine/archive-content-fixes';

beforeEach(() => vi.resetAllMocks());
it('reads only the canonical bundled article catalog', () => {
  read.mockReturnValue(JSON.stringify([{ url: '/articles/kultur', title: 'Kulturhistorie' }]));
  expect(loadInternalLinkCatalog()).toEqual([{ url: 'https://www.aproposmagazine.com/articles/kultur', title: 'Kulturhistorie', slug: 'kultur' }]);
  expect(read).toHaveBeenCalledExactlyOnceWith(join(process.cwd(), 'data', 'apropos-articles.json'), 'utf8');
});
it('accepts explicit raw rows without filesystem access, retaining filtering and deduplication', () => {
  expect(loadInternalLinkCatalog({ raw: [
    { url: '/articles/kultur', title: 'Kulturhistorie' },
    { url: '/articles/kultur', title: 'Duplikat' },
    { url: 'https://example.com/articles/test', title: 'Ekstern artikel' },
  ] })).toHaveLength(1);
  expect(loadInternalLinkCatalog({ raw: [] })).toEqual([]);
  expect(read).not.toHaveBeenCalled();
});
it.each(['null', '{}', '"text"', 'broken JSON'])('rejects malformed catalog %s without breaking preview', raw => {
  read.mockReturnValue(raw);
  expect(loadInternalLinkCatalog()).toEqual([]);
});
it('skips malformed rows while keeping valid same-site entries', () => {
  read.mockReturnValue('[null,42,"invalid",{"url":"/articles/kultur","title":"Kulturhistorie"}]');
  expect(loadInternalLinkCatalog()).toHaveLength(1);
});
it('handles a missing bundled catalog without inventing link targets', () => {
  read.mockImplementation(() => { throw new Error('ENOENT'); });
  expect(loadInternalLinkCatalog()).toEqual([]);
});
