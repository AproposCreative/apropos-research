import { expect, it } from 'vitest';
import { parseSourceHtml } from '@/lib/factcheck/source-reader';
const url = 'https://publisher.example/article';
const now = Date.parse('2026-09-12T10:00:00Z');
const node = { '@type': 'NewsArticle', url, datePublished: '2026-09-10T17:04:05' };
const html = (data: unknown) => `<script type="application/ld+json">${JSON.stringify(data)}</script><article>${'Faktisk artikeltekst. '.repeat(30)}</article>`;
it.each(['2026-09-10T10:26:12.487003+00:00', '2026-09-10T12:26:12.487003123+02:00'])('reads explicit sub-millisecond publication metadata: %s', date => {
  expect(parseSourceHtml(url, `<meta property="article:published_time" content="${date}">${html(node)}`, 's1', now).publishedAt)
    .toBe('2026-09-10T10:26:12.487Z');
  expect(parseSourceHtml(url, html({...node,datePublished:date}), 's1', now).publishedAt)
    .toBe('2026-09-10T10:26:12.487Z');
});
it.each(['2027-09-10T10:26:12.487003Z', '2026-02-30T10:26:12.487003Z',
  '2026-09-10T25:26:12.487003Z', '2026-09-10T10:26:12.487003', '2026-09-10T10:26:12.487003+02:99'])('still rejects invalid or future precise dates: %s', date => {
  expect(parseSourceHtml(url, `<meta property="article:published_time" content="${date}">${html(node)}`, 's1', now).publishedAt).toBeNull();
});
it('reads the matching NewsArticle publication calendar date without inventing its timezone', () => {
  expect(parseSourceHtml(url, html(node), 's1', now).publishedAt).toBe('2026-09-10T00:00:00.000Z');
});
it('supports arrays and JSON-LD graphs with an identified main article', () => {
  const graph = { '@graph': [{ '@type': 'WebSite', datePublished: '2000-01-01' },
    { ...node, url: undefined, mainEntityOfPage: { '@id': `${url}#webpage` }, datePublished: '2026-09-10T17:04:05+02:00' }] };
  expect(parseSourceHtml(url, html([graph]), 's1', now).publishedAt).toBe('2026-09-10T15:04:05.000Z');
});
it.each([
  { ...node, url: 'https://other.example/article' },
  { ...node, url: undefined },
  { ...node, '@type': 'Event' },
  { ...node, datePublished: undefined, dateModified: '2026-09-10' },
  { ...node, datePublished: '2026-02-30' },
  { ...node, datePublished: '2027-01-01' },
])('does not infer publication from unrelated, missing, invalid or future metadata: %j', value => {
  expect(parseSourceHtml(url, html(value), 's1', now).publishedAt).toBeNull();
});
it('rejects conflicting article dates rather than arbitrarily selecting one', () => {
  expect(parseSourceHtml(url, html([node, { ...node, datePublished: '2026-09-11' }]), 's1', now).publishedAt).toBeNull();
});
it('keeps meaningful query parameters in page identity', () => {
  expect(parseSourceHtml(`${url}?id=1`, html({ ...node, url: `${url}?id=2` }), 's1', now).publishedAt).toBeNull();
});
it('never overrides an explicitly invalid metadata date with a different JSON-LD date', () => {
  expect(parseSourceHtml(url, `<meta property="article:published_time" content="2027-01-01">${html(node)}`, 's1', now).publishedAt).toBeNull();
});
it('extracts only the explicit Tudum article body and its matching publication date', () => {
  const page = 'https://www.netflix.com/tudum/articles/the-gentlemen';
  const markup = `<script type="application/ld+json">${JSON.stringify({ ...node, url: page })}</script><article>Unrelated recommendation</article><div data-uia="article-content" data-sel="article-content">${'The actual season two article. '.repeat(30)}<article>Nested unrelated card</article></div>`;
  const source = parseSourceHtml(page, markup, 's1', now);
  expect(source.text).toContain('The actual season two article.');
  expect(source.text).not.toContain('Unrelated');
  expect(source.text).not.toContain('Nested');
  expect(source.publishedAt).toBe('2026-09-10T00:00:00.000Z');
  expect(() => parseSourceHtml(page, html(node), 's1', now)).toThrow('entydig');
  expect(() => parseSourceHtml(page, markup + markup, 's1', now)).toThrow('entydig');
});
