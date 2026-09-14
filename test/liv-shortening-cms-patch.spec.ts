import { describe, expect, it, vi } from 'vitest';
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: vi.fn() }));
import { buildLivShorteningCmsPatch } from '@/lib/liv/shortening-cms-patch';
import { buildLivShorteningCandidate } from '@/lib/liv/shortening-candidate';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import type { WebflowArticleFields } from '@/lib/webflow/types';

const words = (n: number) => Array(n).fill('kultur').join(' ');
const image = '<figure><img src="https://source.test/still.jpg" alt="Scenen"><figcaption>Foto: Fotografen</figcaption></figure>';
const optimized = image.replace('https://source.test/still.jpg', 'https://cdn.test/still.webp').replace(' alt=', ' width="800" srcset="https://cdn.test/still-small.webp 400w" alt=');
const article = { title: 'Anmeldelse: Værket', content: `<p>${words(200)}</p>${image}<p>${words(200)}</p><p>${words(200)}</p>` } as GeneratedArticle;
const edits = { bodyEdits: [{ index: 0, before: words(200), after: words(100) }] };
function fixture() {
  return { article, expected: { title: article.title, slug: 'vaerket', content: article.content,
    wordCount: 600, readTime: 3, rating: 2, fotoCredit: 'Fotografen', tags: ['film'] } as WebflowArticleFields,
  cmsFields: { name: article.title, slug: 'vaerket', content: article.content.replace(image, optimized), 'minutes-to-read': 3 },
  targetWords: 500, edits, reviewedCandidateHash: cmsFieldHash({ content: buildLivShorteningCandidate(article, 500, edits).content }),
  schemaSlugs: ['content', 'minutes-to-read'] };
}
describe('shortening CMS patch', () => {
  it('preserves optimized media, credits and metadata without mutating inputs or inventing CMS fields', () => {
    const input = fixture(), before = JSON.stringify(input);
    const result = buildLivShorteningCmsPatch(input);
    expect(result.patch.content).toContain(optimized);
    expect(Object.keys(result.patch)).toEqual(['content', 'minutes-to-read']);
    expect(result.expected).toMatchObject({ wordCount: 500, readTime: 3, rating: 2, fotoCredit: 'Fotografen', tags: ['film'] });
    expect(result.checkpointContent).toContain(image);
    expect(result.publicationReady).toBe(false);
    expect(JSON.stringify(input)).toBe(before);
  });
  it('updates reading time and schema-backed count', () => {
    const input = fixture();
    input.cmsFields['minutes-to-read'] = 9;
    input.schemaSlugs.push('word-count');
    expect(buildLivShorteningCmsPatch(input).patch).toMatchObject({ 'minutes-to-read': 3, 'word-count': 500 });
  });
  it('rejects a different reviewed preview', () => {
    expect(() => buildLivShorteningCmsPatch({ ...fixture(), reviewedCandidateHash: '0'.repeat(64) })).toThrow('review_changed');
  });
  it.each(['Foto: Fotografen', 'Scenen', 'kultur'])('rejects changed caption, alt or prose: %s', text => {
    const input = fixture();
    input.cmsFields.content = input.cmsFields.content.replace(text, 'ændret');
    expect(() => buildLivShorteningCmsPatch(input)).toThrow('checkpoint_changed');
  });
  it('rejects changed canonical payload', () => {
    const input = fixture(); input.expected.content += '<p>Ny tekst</p>';
    expect(() => buildLivShorteningCmsPatch(input)).toThrow('checkpoint_changed');
  });
  it('requires the actual reading-time schema field', () => {
    expect(() => buildLivShorteningCmsPatch({ ...fixture(), schemaSlugs: ['content'] })).toThrow('schema_changed');
  });
});
