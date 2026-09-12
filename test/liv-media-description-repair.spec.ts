import { describe, expect, it } from 'vitest';
import { load } from 'cheerio';
import { insertLivBodyMedia, type MediaEvidence } from '@/lib/liv/automatic-media';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { applyLivMediaDescriptionCorrections } from '@/lib/liv/media-description-repair';

function article(): GeneratedArticle {
  const preparedMedia: MediaEvidence[] = (['hero', 'body-1', 'body-2'] as const).map((role, i) => ({
    role, url: `https://assets.example/${role}.webp?alt=media&token=existing`, storagePath: `saved/${role}`,
    contentHash: `${i}`.repeat(64), sourceHash: `${i + 3}`.repeat(64), width: 1920, height: 1080, bytes: 12000,
    alt: `En stol inde i cirklen ${role}`, caption: `En stol i billedet ${role}.`, credit: 'Jane & Co',
    sourceUrl: `https://source.example/${role}`, sourcePageUrl: 'https://source.example/press', kind: 'photography',
  }));
  const hero = preparedMedia[0];
  return { title: 'Samme titel', subtitle: 'Samme undertitel', intro: 'Samme intro', excerpt: 'Samme uddrag',
    content: insertLivBodyMedia('<p class="keep">Uændret &amp; tekst.</p>\n<p>Andet afsnit.</p>\n<p>Slutning.</p>', preparedMedia),
    slug: 'samme-slug', tags: ['Kultur'], section: 'Kultur', rawResponse: 'original paid response', preparedMedia,
    researchSources: [{ title: 'Kilde', source: 'example', url: 'https://source.example/press' }],
    selectedImage: { ...hero, id: 'hero-id', articleHash: 'old-visual-proof', width: 1920, height: 1080,
      sourceUrl: hero.sourceUrl!, createdAt: '2026-09-12T00:00:00Z', rightsStatus: 'unverified', visualReview: 'automated' } };
}
const correction = (role: 'hero' | 'body-1' | 'body-2' = 'body-1') => ({ role,
  alt: 'En stol uden for cirklen', caption: 'Stolen står uden for cirklen.' });
const apply = (a: GeneratedArticle, corrections: unknown[]) => applyLivMediaDescriptionCorrections(a, { corrections });

describe('applyLivMediaDescriptionCorrections', () => {
  it('changes only the exact body description spans and matching evidence, leaving the input untouched', () => {
    const a = article(); const original = structuredClone(a); const c = correction();
    const b = apply(a, [c]);
    expect(a).toEqual(original);
    expect(b).toEqual({ ...a,
      content: a.content.replace('alt="En stol inde i cirklen body-1"', `alt="${c.alt}"`)
        .replace('En stol i billedet body-1.', c.caption),
      preparedMedia: a.preparedMedia!.map(item => item.role === c.role ? { ...item, alt: c.alt, caption: c.caption } : item),
    });
    expect(b.selectedImage).toBe(a.selectedImage);
    expect(b.selectedImage!.articleHash).toBe('old-visual-proof');
    expect(load(b.content)('figure[data-liv-media="body-1"] figcaption').text()).toBe(`${c.caption} Foto: Jane & Co`);
  });

  it('corrects the hero alt in both records without touching HTML, provenance, or approval hash', () => {
    const a = article(); const c = correction('hero'); const b = apply(a, [c]);
    expect(b.content).toBe(a.content);
    expect(b.selectedImage).toEqual({ ...a.selectedImage, alt: c.alt });
    expect(b.preparedMedia![0]).toEqual({ ...a.preparedMedia![0], alt: c.alt, caption: c.caption });
  });

  it('supports exactly three distinct role corrections without offset drift', () => {
    const a = article(); const b = apply(a, [correction('body-2'), correction('hero'), correction('body-1')]);
    const $ = load(b.content);
    expect(b.preparedMedia!.every(item => item.alt === correction().alt)).toBe(true);
    expect($('figcaption').map((_i, el) => $(el).text()).get()).toEqual(Array(2).fill(`${correction().caption} Foto: Jane & Co`));
    expect($('p').map((_i, el) => $(el).text()).get()).toEqual(load(a.content)('p').map((_i, el) => load(a.content)(el).text()).get());
  });

  it.each(['Foto: Jane', 'Illustration: Apropos / AI', 'Kilde: Arkivet', 'Credit: Jane', '© Jane'])('retains the existing credit format %s', credit => {
    const a = article(); a.preparedMedia![1].credit = credit;
    a.content = insertLivBodyMedia('<p>A.</p><p>B.</p><p>C.</p>', a.preparedMedia!);
    const b = apply(a, [correction()]);
    expect(load(b.content)('figure[data-liv-media="body-1"] figcaption').text()).toBe(`${correction().caption} ${credit}`);
    expect(b.preparedMedia![1].credit).toBe(credit);
  });

  it('escapes quoted text and ampersands literally, including replacement metacharacters', () => {
    const a = article(); const c = { ...correction(), alt: 'Stol "udenfor" & $&', caption: 'En stol & $\' $`.' };
    const b = apply(a, [c]); const $ = load(b.content);
    expect($('figure[data-liv-media="body-1"] img').attr('alt')).toBe(c.alt);
    expect($('figure[data-liv-media="body-1"] figcaption').text()).toBe(`${c.caption} Foto: Jane & Co`);
    expect($('img').length).toBe(2);
  });

  it.each([
    null, {}, { corrections: [] }, { corrections: [correction(), correction()] },
    { corrections: Array(4).fill(correction()) }, { corrections: [{ ...correction(), role: 'body-3' }] },
    { corrections: [{ ...correction(), alt: '<img src=x onerror=alert(1)>' }] },
    { corrections: [{ ...correction(), caption: 'line\nbreak' }] },
    { corrections: [{ ...correction(), alt: 'javascript:alert(1)' }] },
    { corrections: [{ ...correction(), caption: 'https://invented.example' }] },
    { corrections: [{ ...correction(), alt: ' ' }] },
    { corrections: [{ ...correction(), alt: 'a'.repeat(241) }] },
    { corrections: [{ ...correction(), caption: 'a'.repeat(401) }] },
    { corrections: [{ ...correction(), url: 'https://replacement.example' }] },
    { corrections: [correction()], selectedImage: { articleHash: 'approved' } },
  ])('rejects malformed, unsafe, duplicate, or out-of-scope corrections %j', value => {
    const a = article(); const original = structuredClone(a);
    expect(() => applyLivMediaDescriptionCorrections(a, value)).toThrow('liv_media_description_invalid');
    expect(a).toEqual(original);
  });

  it.each(['missing-media', 'duplicate-media', 'missing-figure', 'duplicate-figure', 'wrong-url', 'wrong-credit', 'wrong-width', 'duplicate-alt', 'caption-html', 'hero-mismatch'])('rejects inconsistent saved evidence: %s', kind => {
    const a = article();
    if (kind === 'missing-media') a.preparedMedia = [];
    if (kind === 'duplicate-media') a.preparedMedia!.push(a.preparedMedia![1]);
    if (kind === 'missing-figure') a.content = '<p>No saved figure.</p>';
    if (kind === 'duplicate-figure') a.content += a.content;
    if (kind === 'wrong-url') a.preparedMedia![1].url = 'https://other.example/image';
    if (kind === 'wrong-credit') a.preparedMedia![1].credit = 'Other person';
    if (kind === 'wrong-width') a.preparedMedia![1].width = 2000;
    if (kind === 'duplicate-alt') a.content = a.content.replace('alt="En stol inde i cirklen body-1"', 'alt="En stol inde i cirklen body-1" alt="other"');
    if (kind === 'caption-html') a.content = a.content.replace('En stol i billedet body-1.', '<b>En stol i billedet body-1.</b>');
    if (kind === 'hero-mismatch') a.selectedImage!.contentHash = 'other';
    expect(() => apply(a, [correction(kind === 'hero-mismatch' ? 'hero' : 'body-1')])).toThrow('liv_media_description_invalid');
  });

  it('rejects no-ops and removal of existing AI disclosure', () => {
    const a = article();
    expect(() => apply(a, [{ role: 'body-1', alt: a.preparedMedia![1].alt, caption: a.preparedMedia![1].caption }])).toThrow();
    a.preparedMedia![1].caption = 'AI-illustration: En stol.';
    a.content = insertLivBodyMedia('<p>A.</p><p>B.</p><p>C.</p>', a.preparedMedia!);
    expect(() => apply(a, [correction()])).toThrow();
    expect(apply(a, [{ ...correction(), caption: 'AI-illustration: Stolen står udenfor.' }]).content).toContain('AI-illustration: Stolen står udenfor. Foto: Jane &amp; Co');
  });
});
