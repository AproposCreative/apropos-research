import { describe, expect, it } from 'vitest';
import { buildLivShorteningCandidate } from '@/lib/liv/shortening-candidate';
import { livEditableParagraphs } from '@/lib/liv/paragraph-edits';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
const words = (n: number) => Array(n).fill('kultur').join(' ');
const media = '<figure><img src="https://example.com/image.webp" alt="Scenen"><figcaption>Foto: Fotografen</figcaption></figure>';
const article = { title: 'Den tydelige titel', content: `<h2>Analysen</h2><p>${words(200)}</p>${media}<p>${words(200)}</p><p>${words(200)}</p>` } as GeneratedArticle;
const edits = { bodyEdits: [{ index: 0, before: words(200), after: words(100) }] };
describe('explicit shortening candidate', () => {
  it('shortens an already valid daily body without changing saved article or media', () => {
    const before = JSON.stringify(article);
    const result = buildLivShorteningCandidate(article, 500, edits);
    expect(result).toMatchObject({ beforeWords: 600, afterWords: 500, targetWords: 500, publicationReady: false, editorialReviewRequired: true });
    expect(result.content).toContain(media);
    expect(result.content).toContain('<h2>Analysen</h2>');
    expect(JSON.stringify(article)).toBe(before);
    expect(result).not.toHaveProperty('preparationProof');
    expect(result).not.toHaveProperty('selectedImage');
  });
  it.each([449, 651, 600, 500.5])('rejects invalid target %s', target => {
    expect(() => buildLivShorteningCandidate(article, target, edits)).toThrow('target_invalid');
  });
  it('rejects hidden metadata edits', () => {
    expect(() => buildLivShorteningCandidate(article, 500, { ...edits, title: 'Ny titel' })).toThrow('candidate_invalid');
  });
  it('rejects an expansion even if other deletions could reduce total length', () => {
    expect(() => buildLivShorteningCandidate(article, 500, { bodyEdits: [{ index: 0, before: words(200), after: words(201) }] })).toThrow('not_shorter');
  });
  it('rejects stale paragraph text', () => {
    expect(() => buildLivShorteningCandidate(article, 500, { bodyEdits: [{ index: 0, before: words(199), after: words(100) }] })).toThrow('invalid_body_edit');
  });
  it('does not return an over-target candidate', () => {
    expect(() => buildLivShorteningCandidate(article, 450, edits)).toThrow('length_failed');
  });
  it.each(['<blockquote><p>Beskyttet citat med mange ord</p></blockquote>', '<p>Læs <a href="https://example.com">kilden til historien</a></p>'])('protects quotations and links', protectedHtml => {
    const input = { ...article, content: protectedHtml + article.content };
    const before = livEditableParagraphs(input.content)[0].before;
    expect(() => buildLivShorteningCandidate(input, 500, { bodyEdits: [{ index: 0, before, after: 'Kort citat' }] })).toThrow('invalid_body_edit');
  });
  it('rejects falling below the canonical daily minimum', () => {
    expect(() => buildLivShorteningCandidate(article, 450, { bodyEdits: [{ index: 0, before: words(200), after: words(49) }] })).toThrow('length_failed');
  });
  it('rejects editing the entire body even when total length would fit', () => {
    expect(() => buildLivShorteningCandidate(article, 450, { bodyEdits: [0, 1, 2].map(index => ({ index, before: words(200), after: words(150) })) })).toThrow('scope_exceeded');
  });
});
