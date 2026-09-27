import { expect, it } from 'vitest';
import { parseSourceHtml } from '@/lib/factcheck/source-reader';
const url = 'https://unitedstage.dk/artigeardit-vender-tilbage-til-royal-arena-i-2027/';
const title = 'ARTIGEARDIT VENDER TILBAGE TIL ROYAL ARENA I 2027';
const body = 'Artigeardit vender tilbage den 13. marts 2027. '.repeat(8);
const news = `<section class="single-news overflow-hidden"><h1> ${title} </h1><p>${body}</p></section>`;
const related = `<section class="latest-news"><article><h2>SVEA S I DR KONCERTSALEN</h2><p>${'En anden koncert. '.repeat(20)}</p></article></section>`;
const page = (content: string) => `<meta property="og:title" content="${title}"><meta property="article:published_time" content="2026-09-22T08:00:00Z"><main>${content}</main>`;
it('reads the actual press release, not the first related-news article', () => {
  const source = parseSourceHtml(url, page(news + related), 'S1', Date.parse('2026-09-27'));
  expect(source.text).toContain(body.trim());
  expect(source.text).not.toContain('SVEA');
  expect(source.publishedAt).toBe('2026-09-22T08:00:00.000Z');
});
it.each([related, news + news, news.replace(title, 'En anden overskrift'), news.replace('h1', 'h2')])(
  'does not silently fall back to related news for ambiguous/missing release', html => {
    expect(() => parseSourceHtml(url, page(html), 'S1')).toThrow('entydig United Stage');
  });
it('does not impose a publisher-specific selector on unrelated sources', () => {
  expect(parseSourceHtml('https://example.org/story', `<article><h1>En historie</h1><p>${body}</p></article>`, 'S1').text).toContain(body.trim());
});
