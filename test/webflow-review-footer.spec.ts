import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Execute the ACTUAL proposed template footer, including both DOM-ready handlers.
// This verifies the template artifact, not an unrelated server-schema helper.
const template = readFileSync('docs/webflow-embeds/article-review-footer.html', 'utf8');
function render({ headline = 'Marvel’s Wolverine Anmeldelse', language = 'da', rating = 4, bookTitle = '', bookAuthor = '', keywords = 'Gaming, Anmeldelser' } = {}) {
  const article = { '@type': 'Article', headline, description: 'A human review.', keywords, author: { '@type': 'Person', name: 'Peter Milo' }, image: 'https://example.org/cover.webp', datePublished: '2026-10-08', dateModified: '2026-10-09' };
  const nodes: any[] = [{ textContent: JSON.stringify(article) }];
  const handlers: (() => void)[] = [];
  const label = { textContent: '', style: { display: '' }, classList: { add() {} } };
  const canonical = { href: 'https://www.aproposmagazine.com/articles/wolverine' };
  const document = {
    documentElement: { lang: language },
    addEventListener(_type: string, callback: () => void) { handlers.push(callback); },
    querySelector(selector: string) {
      if (selector === 'template[data-apropos-book-metadata]') return { content: { querySelector: (s: string) => ({ textContent: s === '[data-book-title]' ? bookTitle : bookAuthor }) } };
      if (selector === '.apropos-review-label') return label;
      if (selector === 'link[rel="canonical"]') return canonical;
      if (selector === 'script[data-apropos-review-schema]') return nodes.find(n => n.dataset?.aproposReviewSchema !== undefined) || null;
      throw Error(`Unexpected selector: ${selector}`);
    },
    querySelectorAll() { return nodes; },
    createElement() { const node: any = { dataset: {}, textContent: '', remove: () => nodes.splice(nodes.indexOf(node), 1) }; return node; },
    head: { appendChild(node: any) { nodes.push(node); } },
  };
  const script = template.match(/<script>([\s\S]*)<\/script>/)![1].replace(/\{\{wf [^\n]*?\}\}/g, String(rating));
  runInNewContext(script, { document, location: { pathname: language === 'en' ? '/en/articles/wolverine' : '/articles/wolverine', href: canonical.href }, setTimeout: (fn: () => void) => fn() }, { timeout: 1000 });
  handlers.forEach(fn => fn());
  return { nodes: nodes.map(n => JSON.parse(n.textContent)), label };
}

describe('actual Webflow article footer release candidate', () => {
  it.each([['Marvel’s Wolverine Anmeldelse', 'da'], ['Marvel’s Wolverine Review', 'en'], ['Anmeldelse: Marvel’s Wolverine', 'da']])('keeps headline %s but strips the work wrapper', (headline, language) => {
    const result = render({ headline, language });
    const review = result.nodes.find(n => n['@type'] === 'Review');
    expect(review.name).toBe(headline);
    expect(review.itemReviewed).toMatchObject({ '@type': 'VideoGame', name: 'Marvel’s Wolverine' });
    expect(review.reviewRating).toMatchObject({ ratingValue: 4, bestRating: 6, worstRating: 1 });
    expect(review.author.name).toBe('Peter Milo');
    expect(review.inLanguage).toBe(language);
    expect(review.datePublished).toBe('2026-10-08');
  });
  it('keeps book author separate from reviewer and preserves explicit title', () => {
    const result = render({ headline: 'Anmeldelse: I mellemtiden er vi ingen', bookTitle: 'I mellemtiden er vi ingen', bookAuthor: 'Frederik Drescher Kluth', keywords: 'Anmeldelser' });
    const review = result.nodes.find(n => n['@type'] === 'Review');
    expect(review.itemReviewed).toMatchObject({ '@type': 'Book', name: 'I mellemtiden er vi ingen', author: { name: 'Frederik Drescher Kluth' } });
    expect(review.author.name).toBe('Peter Milo');
  });
  it.each(['The Review of Everything', 'A Preview'])('does not strip inside work title %s', (headline) => {
    const result = render({ headline, keywords: 'Film' });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed.name).toBe(headline);
  });
  it('does not create a review when there is no rating', () => {
    expect(render({ rating: 0 }).nodes.some(n => n['@type'] === 'Review')).toBe(false);
  });
});
