import { expect, it } from 'vitest';
import { load } from 'cheerio';
import { restorePreparedCaptions } from '@/lib/liv/restore-prepared-captions';
const body = (prefix: string, credit: boolean) => '<p>Samme tekst.</p>' + [1, 2].map(i =>
  `<figure class="w-richtext-figure-type-image"><img src="https://example.org/${prefix}-${i}.webp" alt="Motiv ${i}" width="1200" height="800"><figcaption>Motiv ${i}.${credit ? ' Illustration: Apropos Magazine / AI' : ''}</figcaption></figure>`).join('\n');
it('restores original credits but keeps CMS image URLs and dimensions', () => {
  const restored = restorePreparedCaptions(body('cms', false), body('prepared', true));
  const $ = load(restored);
  expect($('figcaption').first().text()).toBe('Motiv 1. Illustration: Apropos Magazine / AI');
  expect($('img').first().attr('src')).toBe('https://example.org/cms-1.webp');
  expect($('img').first().attr('height')).toBe('800');
  expect($('p').text()).toBe('Samme tekst.');
  expect(restorePreparedCaptions(restored, body('prepared', true))).toBe(restored);
});
it.each(['prose', 'alt', 'missing', 'uncredited'])('rejects %s rather than overwriting unrelated changes', defect => {
  let cms = body('cms', false), prepared = body('prepared', true);
  if (defect === 'prose') cms = cms.replace('Samme', 'Anden');
  if (defect === 'alt') cms = cms.replace('alt="Motiv 1"', 'alt="Andet motiv"');
  if (defect === 'missing') cms = '<p>Samme tekst.</p>';
  if (defect === 'uncredited') prepared = body('prepared', false);
  expect(() => restorePreparedCaptions(cms, prepared)).toThrow('caption_conflict');
});
