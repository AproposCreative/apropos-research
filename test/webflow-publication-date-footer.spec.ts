import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

const template = readFileSync('docs/webflow-embeds/article-review-footer-live.html', 'utf8');
function render(date: string, rating = 0) {
  const article = { '@type': 'Article', headline: 'Anmeldelse: Test', datePublished: '2026-10-16T08:08:57.082Z', dateModified: '2026-10-28T12:00:00.000Z', author: { name: 'Liv Brandt' } };
  const nodes: any[] = [{ textContent: JSON.stringify(article) }];
  const handlers: (() => void)[] = [];
  const document = {
    documentElement: { lang: 'da' },
    addEventListener(_event: string, fn: () => void) { handlers.push(fn); },
    querySelector(selector: string) {
      if (selector === 'template[data-apropos-publication-metadata]') return { content: { querySelector: () => ({ textContent: date }) } };
      if (selector === '[data-apropos-review-metadata]') return { querySelectorAll: () => [{ textContent: 'serier' }], setAttribute() {} };
      return null;
    },
    querySelectorAll() { return nodes; },
    createElement() { return { dataset: {}, textContent: '' }; },
    head: { appendChild(node: any) { nodes.push(node); } },
  };
  const script = template.match(/<script>([\s\S]*)<\/script>/)![1].replace(/\{\{wf [^\n]*?\}\}/g, String(rating));
  runInNewContext(script, { document, location: { pathname: '/articles/test' }, setTimeout: (fn: () => void) => fn() }, { timeout: 1000 });
  handlers.forEach(fn => fn());
  return nodes.map(n => JSON.parse(n.textContent));
}

describe('live publication date integration', () => {
  it('replaces creation date with the verified original publication receipt even without a rating', () => {
    const [article] = render('2026-10-23T13:08:49.244Z');
    expect(article.datePublished).toBe('2026-10-23T13:08:49.244Z');
    expect(article.dateModified).toBe('2026-10-28T12:00:00.000Z');
  });
  it.each(['', '{{wf unresolved}}', 'invalid', '2026-02-30T10:00:00Z', '2099-10-23T13:08:49Z', '<script>alert(1)</script>'])('omits unknown or invalid publication date %s', date => {
    expect(render(date)[0]).not.toHaveProperty('datePublished');
  });
  it('passes the same receipt-backed date into Review without changing rating or author', () => {
    const nodes = render('2026-10-23T13:08:49.244Z', 4);
    const review = nodes.find(n => n['@type'] === 'Review');
    expect(review.datePublished).toBe(nodes[0].datePublished);
    expect(review.reviewRating.ratingValue).toBe(4);
    expect(review.author.name).toBe('Liv Brandt');
    expect(review.itemReviewed['@type']).toBe('TVSeries');
  });
  it('omits unknown dates from both Article and Review', () => {
    expect(render('', 4).every(n => !Object.hasOwn(n, 'datePublished'))).toBe(true);
  });
});
