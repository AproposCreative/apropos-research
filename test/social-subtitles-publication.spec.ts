import { beforeEach, expect, it, vi } from 'vitest';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { socialSubtitlesSchema, mergeSocialSubtitles } from '@/lib/editorial/social-subtitles';
import { editorialWorkflow } from '@/lib/editorial/workflows';

const state = vi.hoisted(() => ({ rows: [] as any[], size: 0, where: vi.fn(), select: vi.fn(), limit: vi.fn(), unavailable: false }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => state.unavailable ? null : ({ collection: (name: string) => {
  expect(name).toBe('editorialSubmissions');
  const query = { where: (...args: unknown[]) => { state.where(...args); return query; },
    select: (...args: unknown[]) => { state.select(...args); return query; },
    limit: (...args: unknown[]) => { state.limit(...args); return query; },
    get: async () => ({ size: state.size || state.rows.length, docs: state.rows.map(row => ({ data: () => row })) }) };
  return query;
} }) }));
import { publishedSocialSubtitles } from '@/lib/editorial/published-social-subtitles';
const copy = { square: 'Designhistorie møder reklame.', story: 'Designmuseum undersøger grænsen mellem designhistorie og reklame.' };
const item = { id: 'a'.repeat(24), fieldData: { name: 'Kontrapunkt', subtitle: 'Museet undersøger design.', content: '<p>Bevaret artikel</p>' } };
beforeEach(() => { vi.clearAllMocks(); state.rows = []; state.size = 0; state.unavailable = false; });
it('only projects copy for the exact published version, no private fields or writes', async () => {
  state.rows = [{ status: 'published', article: { socialSubtitles: copy, content: 'Private source' }, uid: 'private',
    publishedTarget: { itemId: item.id, fieldDataHash: cmsFieldHash(item.fieldData) } }];
  expect([...(await publishedSocialSubtitles([item]))]).toEqual([[item.id, copy]]);
  expect(state.where).toHaveBeenCalledWith('status', '==', 'published');
  expect(state.limit).toHaveBeenCalledWith(301);
  expect(state.select).toHaveBeenCalledWith('status', 'article.socialSubtitles', 'publishedTarget.itemId', 'publishedTarget.fieldDataHash');
  expect((await publishedSocialSubtitles([{ ...item, fieldData: { ...item.fieldData, subtitle: 'Ny tekst' } }])).size).toBe(0);
});
it.each(['draft', 'scheduled', 'prepared'])('does not leak %s copy', async status => {
  state.rows = [{ status, article: { socialSubtitles: copy }, publishedTarget: { itemId: item.id, fieldDataHash: cmsFieldHash(item.fieldData) } }];
  expect((await publishedSocialSubtitles([item])).size).toBe(0);
});
it('fails closed for absent bindings, malformed copy, unavailable storage, and oversized scan', async () => {
  state.rows = [{ status: 'published', article: { socialSubtitles: copy } },
    { status: 'published', article: { socialSubtitles: { square: '<script>x</script>', story: 'bad' } }, publishedTarget: { itemId: item.id, fieldDataHash: cmsFieldHash(item.fieldData) } }];
  expect((await publishedSocialSubtitles([item])).size).toBe(0);
  state.size = 301; expect((await publishedSocialSubtitles([item])).size).toBe(0);
  state.unavailable = true; expect((await publishedSocialSubtitles([item])).size).toBe(0);
});
it('enforces bounded plain-text variants, preserving source copy when only media changes', () => {
  expect(socialSubtitlesSchema.parse(copy)).toEqual(copy);
  for (const value of [{ ...copy, square: 'x'.repeat(91) }, { ...copy, story: 'x'.repeat(131) }, { ...copy, square: '<b>Test</b>' }, { ...copy, square: 'a\nb' }])
    expect(socialSubtitlesSchema.safeParse(value).success).toBe(false);
  const article = { title: 'Titlen', subtitle: 'Original', content: '<p>Tekst</p>', socialSubtitles: copy };
  expect(mergeSocialSubtitles(article, { content: '<p>Tekst</p><img src="/x">' }).socialSubtitles).toEqual(copy);
  expect(mergeSocialSubtitles(article, { subtitle: 'Ny undertitel' }).socialSubtitles).toBeUndefined();
  expect(mergeSocialSubtitles(article, { subtitle: 'Ny undertitel', socialSubtitles: copy }).socialSubtitles).toEqual(copy);
  expect(article.socialSubtitles).toEqual(copy);
});
it.each(['submit', 'liv', 'editorial'])('includes the same prewriting instruction in %s', workflow => {
  const result = editorialWorkflow({ workflow });
  expect(result.instructions).toContain('article.socialSubtitles.square');
  expect(result.instructions).toContain('ikke via et ekstra AI-kald');
  expect(result.paidAiCalls).toBe(0);
});
