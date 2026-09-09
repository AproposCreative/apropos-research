import { expect, it, vi } from 'vitest';
import { createWriterDraftIdentity } from '@/lib/ai-chat/draft-identity';
import { slugifyArticleTitle } from '@/lib/articles/article-payload';

it('reserves one ID before overlapping saves finish', async () => {
  const makeId = vi.fn(() => 'draft-fixture');
  const identity = createWriterDraftIdentity(makeId);
  const ids = await Promise.all([Promise.resolve(identity.reserve()), Promise.resolve(identity.reserve())]);
  expect(ids).toEqual(['draft-fixture', 'draft-fixture']);
  expect(makeId).toHaveBeenCalledOnce();
});
it('updates loaded drafts and only allocates after starting a new article', () => {
  const makeId = vi.fn(() => 'draft-new');
  const identity = createWriterDraftIdentity(makeId);
  identity.set('draft-existing');
  expect(identity.reserve()).toBe('draft-existing');
  expect(makeId).not.toHaveBeenCalled();
  identity.set(null);
  expect(identity.reserve()).toBe('draft-new');
});
it('reuses canonical Danish slug normalization in Writer', () => {
  expect(slugifyArticleTitle('  København: Ægte nærvær!  ')).toBe('koebenhavn-aegte-naervaer');
});
