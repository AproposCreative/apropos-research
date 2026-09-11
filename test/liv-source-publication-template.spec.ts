import { expect, it } from 'vitest';
import { parseSourceHtml } from '@/lib/factcheck/source-reader';

const now = Date.parse('2026-09-11T10:00:00Z');
const url = 'https://www.roskilde-festival.dk/nyheder/headline-flip-vender-tilbage';
const heroDate = (date: string) => `<span class="typography-module article-hero-module-scss-module__UX3O9q__appearanceText">${date}</span>`;
const html = (header: string) => `<main>${header}<article><h1>Headline Flip</h1><p>${'Koncerten finder sted den 5. november 2026. '.repeat(10)}</p></article></main>`;

it('reads the actual Roskilde news hero date without confusing it with the event date', () => {
  const result = parseSourceHtml(url, html(heroDate('09.09.2026') + heroDate('Året rundt')), 's1', now);
  expect(result.publishedAt).toBe('2026-09-09T00:00:00.000Z');
  expect(result.text).toContain('5. november 2026');
});
it.each(['31.09.2026', '29.02.2026', '12.09.2026', '09/09/2026', '2026-09-09'])('rejects invalid/future/unsupported visible date %s', date => {
  expect(parseSourceHtml(url, html(heroDate(date)), 's1', now).publishedAt).toBeNull();
});
it.each(['https://other.example/nyheder/headline-flip', 'https://roskilde-festival.dk.evil.example/nyheder/test', 'https://www.roskilde-festival.dk/events/headline-flip'])('does not apply the news adapter to %s', address => {
  expect(parseSourceHtml(address, html(heroDate('09.09.2026')), 's1', now).publishedAt).toBeNull();
});
it('rejects conflicting dates and ignores navigation/hidden dates and script data', () => {
  expect(parseSourceHtml(url, html(heroDate('08.09.2026') + heroDate('09.09.2026')), 's1', now).publishedAt).toBeNull();
  const unrelated = `<nav>${heroDate('09.09.2026')}</nav><div hidden>${heroDate('09.09.2026')}</div><script>{"date":"09.09.2026"}</script>`;
  expect(parseSourceHtml(url, html(unrelated), 's1', now).publishedAt).toBeNull();
});
it('preserves explicit metadata precedence, including an explicitly invalid date', () => {
  expect(parseSourceHtml(url, `<meta property="article:published_time" content="2026-09-08T09:00:00Z">${html(heroDate('09.09.2026'))}`, 's1', now).publishedAt).toBe('2026-09-08T09:00:00.000Z');
  expect(parseSourceHtml(url, `<meta property="article:published_time" content="2026-02-30">${html(heroDate('09.09.2026'))}`, 's1', now).publishedAt).toBeNull();
});
