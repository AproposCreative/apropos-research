import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { describe, expect, it } from 'vitest';

// Execute the ACTUAL template footer through its DOM-ready lifecycle.
// This verifies the template artifact, not an unrelated server-schema helper.
const template = readFileSync('docs/webflow-embeds/article-review-footer.html', 'utf8');
function render({ headline = 'Marvel’s Wolverine Anmeldelse', language = 'da', rating = 4 as number | string, bookTitle = '', bookAuthor = '', keywords = 'Gaming, Anmeldelser', description = 'A human review.', articleSection = '', reviewer = 'Peter Milo', pathname = '', replay = false, topics = ['gaming', 'anmeldelser'], primaryTopic = '', globalTopics = ['film', 'gaming', 'serier', 'koncerter'], withScope = true, graph = false, existingReview = false } = {}) {
  const article = { '@type': 'Article', headline, description, keywords, articleSection, author: { '@type': 'Person', name: reviewer }, image: 'https://example.org/cover.webp', datePublished: '2026-10-08', dateModified: '2026-10-09' };
  const nodes: any[] = [];
  function makeNode(data: unknown, managed = false) {
    const node: any = { dataset: managed ? { aproposReviewSchema: '' } : {}, textContent: JSON.stringify(data), remove: () => nodes.splice(nodes.indexOf(node), 1) };
    return node;
  }
  const previousReview = { '@type': 'Review', itemReviewed: { '@type': 'VideoGame', name: 'Stale type' } };
  nodes.push(makeNode(graph ? { '@context': 'https://schema.org', '@graph': existingReview ? [article, previousReview] : [article] } : article));
  if (existingReview && !graph) nodes.push(makeNode(previousReview, true));
  const metadata = {
    attributes: {} as Record<string, string>,
    setAttribute(name: string, value: string) { this.attributes[name] = value; },
    querySelectorAll(selector: string) {
      if (selector === '[data-review-topic-slug]') return topics.map(textContent => ({ textContent }));
      throw Error(`Unexpected scoped selector: ${selector}`);
    },
  };
  const handlers: (() => void)[] = [];
  const timers: (() => void)[] = [];
  const label = { textContent: '', style: { display: '' }, classList: { add() {} } };
  const canonical = { href: 'https://www.aproposmagazine.com/articles/wolverine' };
  const document = {
    documentElement: { lang: language },
    addEventListener(_type: string, callback: () => void) { handlers.push(callback); },
    querySelector(selector: string) {
      if (selector === '[data-apropos-review-metadata]') return withScope ? metadata : null;
      if (selector === 'template[data-apropos-primary-topic]') return { content: { querySelector: () => ({ textContent: primaryTopic }) } };
      if (selector === 'template[data-apropos-book-metadata]') return { content: { querySelector: (s: string) => ({ textContent: s === '[data-book-title]' ? bookTitle : bookAuthor }) } };
      if (selector === '.apropos-review-label') return label;
      if (selector === 'link[rel="canonical"]') return canonical;
      if (selector === 'script[data-apropos-review-schema]') return nodes.find(n => n.dataset?.aproposReviewSchema !== undefined) || null;
      throw Error(`Unexpected selector: ${selector}`);
    },
    querySelectorAll(selector: string) {
      if (selector === 'script[type="application/ld+json"]') return nodes;
      if (selector === 'a[href*="/topics/"]') return globalTopics.map(slug => ({ textContent: slug, href: '/topics/' + slug }));
      throw Error(`Unexpected selector: ${selector}`);
    },
    createElement() { const node: any = { dataset: {}, textContent: '', remove: () => nodes.splice(nodes.indexOf(node), 1) }; return node; },
    head: { appendChild(node: any) { nodes.push(node); } },
  };
  const script = template.match(/<script>([\s\S]*)<\/script>/)![1].replace(/\{\{wf [^\n]*?\}\}/g, String(rating));
  runInNewContext(script, { document, location: { pathname: pathname || (language === 'en' ? '/en/articles/wolverine' : '/articles/wolverine'), href: canonical.href }, setTimeout: (fn: () => void) => timers.push(fn) }, { timeout: 1000 });
  handlers.forEach(fn => fn());
  while (timers.length) timers.shift()!();
  if (replay) {
    handlers.forEach(fn => fn());
    while (timers.length) timers.shift()!();
  }
  const roots = nodes.map(n => JSON.parse(n.textContent));
  return { nodes: roots.flatMap(n => n['@graph'] || [n]), roots, label, canonical, resolution: metadata.attributes['data-review-resolution'] };
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
    expect(review.dateModified).toBe('2026-10-09');
  });
  it('keeps book author separate from reviewer and preserves explicit title', () => {
    const result = render({ headline: 'Anmeldelse: I mellemtiden er vi ingen', bookTitle: 'I mellemtiden er vi ingen', bookAuthor: 'Frederik Drescher Kluth', keywords: 'Anmeldelser', topics: ['anmeldelser'] });
    const review = result.nodes.find(n => n['@type'] === 'Review');
    expect(review.itemReviewed).toMatchObject({ '@type': 'Book', name: 'I mellemtiden er vi ingen', author: { name: 'Frederik Drescher Kluth' } });
    expect(review.author.name).toBe('Peter Milo');
  });
  it.each(['The Review of Everything', 'A Preview'])('does not strip inside work title %s', (headline) => {
    const result = render({ headline, keywords: 'Film', topics: ['film'] });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed.name).toBe(headline);
  });
  it.each([0, -1, 7, '', 'invalid', '{{wf unresolved}}'])('does not create a review for invalid rating %s', (rating) => {
    const result = render({ rating });
    expect(result.nodes.some(n => n['@type'] === 'Review')).toBe(false);
    expect(result.label.style.display).toBe('none');
  });
  it('preserves multiple book authors and treats bound plain text as data', () => {
    const title = 'A "quoted" book <script>not executable</script>';
    const result = render({ bookTitle: title, bookAuthor: 'Forfatter A; Forfatter B', keywords: 'Anmeldelser', topics: ['anmeldelser'] });
    const review = result.nodes.find(n => n['@type'] === 'Review');
    expect(review.itemReviewed.name).toBe(title);
    expect(review.itemReviewed.author).toEqual([{ '@type': 'Person', name: 'Forfatter A' }, { '@type': 'Person', name: 'Forfatter B' }]);
    expect(review.author.name).toBe('Peter Milo');
  });
  it('keeps one review on replay and preserves locale canonical and timestamps', () => {
    const result = render({ language: 'en', pathname: '/en/articles/wolverine/', replay: true });
    const reviews = result.nodes.filter(n => n['@type'] === 'Review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ url: 'https://www.aproposmagazine.com/en/articles/wolverine', '@id': 'https://www.aproposmagazine.com/en/articles/wolverine#review', inLanguage: 'en', datePublished: '2026-10-08', dateModified: '2026-10-09' });
    expect(result.canonical.href).toBe('https://www.aproposmagazine.com/en/articles/wolverine');
  });

  const streetFighter = [
    { language: 'da', topics: ['film', 'anmeldelser'], keywords: 'Anmeldelser', articleSection: 'Serier &amp; Film', description: 'Vi anmelder Street Fighter (2026): Solide kampscener, 90’er-nostalgi og humor holder filmen oppe, selv om historien halter.', label: 'Filmanmeldelse' },
    { language: 'en', topics: ['movies', 'reviews'], keywords: 'Reviews', articleSection: 'Series &amp; Movies', description: 'Før “gaming” blev et ord, der kunne stå på en PowerPoint og få voksne mennesker til at nikke alvorligt, stod Street Fighter II som ren åbenbaring på en.', label: 'Film review' },
  ];
  it.each(streetFighter)('uses the verified Film reference for Street Fighter $language', (fixture) => {
    const result = render({ ...fixture, headline: 'Street Fighter (2026)', reviewer: 'Casper Fiil' });
    const reviews = result.nodes.filter(n => n['@type'] === 'Review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0]).toMatchObject({ name: 'Street Fighter (2026)', reviewBody: fixture.description, itemReviewed: { '@type': 'Movie', name: 'Street Fighter (2026)' }, reviewRating: { ratingValue: 4, bestRating: 6, worstRating: 1 }, author: { name: 'Casper Fiil' }, inLanguage: fixture.language });
    expect(result.label.textContent).toBe(fixture.label);
    expect(result.resolution).toBe('typed');
  });
  it.each(['gaming', 'Xbox', 'Nintendo', 'switch', 'A concert album and book about a festival', 'A quiet encounter', ''])('does not let SEO prose %s reclassify a Film reference', (description) => {
    const result = render({ topics: ['film', 'anmeldelser'], headline: 'Gaming and Series: a concert film', description, keywords: 'Gaming, TV, Festival', articleSection: 'Gaming' });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe('Movie');
    expect(result.label.textContent).toBe('Filmanmeldelse');
  });
  it.each([
    ['da', 'gaming', 'VideoGame', 'Spilanmeldelse'], ['en', 'gaming', 'VideoGame', 'Game review'],
    ['da', 'serier', 'TVSeries', 'Serieanmeldelse'], ['en', 'series', 'TVSeries', 'Series review'],
  ])('keeps structured %s/%s independent of cross-media prose', (language, topic, type, label) => {
    const result = render({ language, topics: [topic], headline: 'Movie series film cinema gaming concert festival book album', description: 'A Nintendo switch game about a movie and a TV series.', keywords: 'Film', articleSection: 'Series & Movies' });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe(type);
    expect(result.label.textContent).toBe(label);
  });
  it('keeps dedicated book metadata even when prose mentions other media', () => {
    const result = render({ topics: ['reviews'], bookTitle: 'Gaming and Film', bookAuthor: 'Book Author', headline: 'The album, movie and festival in a book', description: 'Xbox, cinema and a TV series.', reviewer: 'Reviewer', language: 'en' });
    const review = result.nodes.find(n => n['@type'] === 'Review');
    expect(review.itemReviewed).toMatchObject({ '@type': 'Book', name: 'Gaming and Film', author: { '@type': 'Person', name: 'Book Author' } });
    expect(review.author.name).toBe('Reviewer');
    expect(result.label.textContent).toBe('Book review');
  });
  it.each(['Serier & Film', 'Series &amp; Movies', 'Musik', 'Music'])('does not turn broad section %s into a specific reviewed type', (articleSection) => {
    const result = render({ topics: ['reviews'], articleSection });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe('CreativeWork');
    expect(result.resolution).toBe('generic-review');
  });
  it.each([['film', 'gaming', 'reviews'], ['gaming', 'reviews', 'film'], ['film', 'serier', 'reviews']])('diagnoses conflicting taxonomy %j without a first-match type', (...topics) => {
    const result = render({ topics });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe('CreativeWork');
    expect(result.resolution).toBe('conflicting-types');
    expect(result.label.textContent).toBe('Anmeldelse');
  });
  it('does not emit a generic Review for a conflict without a review-format topic', () => {
    const result = render({ topics: ['film', 'gaming'] });
    expect(result.nodes.some(n => n['@type'] === 'Review')).toBe(false);
    expect(result.resolution).toBe('conflicting-types');
    expect(result.label.style.display).toBe('none');
  });
  it.each([
    ['da', 'koncerter', 'Koncertanmeldelse'], ['en', 'Concerts', 'Concert review'],
    ['da', 'festival', 'Festivalanmeldelse'], ['en', 'festival', 'Festival review'],
  ])('keeps the %s/%s event label without inventing Event or Review', (language, topic, label) => {
    const result = render({ language, topics: [topic, 'reviews'], description: 'Film, Nintendo, gaming and an album.', existingReview: true, graph: true });
    expect(result.nodes.map(n => n['@type'])).toEqual(['Article']);
    expect(result.label.textContent).toBe(label);
    expect(result.resolution).toBe('event-omitted');
    expect(result.nodes[0].inLanguage).toBe(language);
  });
  it('omits structured Review when a work and event topic conflict', () => {
    const result = render({ topics: ['film', 'festival', 'reviews'] });
    expect(result.nodes.some(n => n['@type'] === 'Review')).toBe(false);
    expect(result.resolution).toBe('event-type-conflict');
    expect(result.label.textContent).toBe('Festivalanmeldelse');
  });
  it('ignores global topic navigation and duplicate localized Film slugs', () => {
    const result = render({ topics: ['film', 'movies', 'film'], globalTopics: ['gaming', 'serier', 'festival', 'koncerter'], primaryTopic: 'gaming' });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe('Movie');
    expect(result.resolution).toBe('typed');
  });
  it.each([true, false])('falls back to an explicit primary reference when scope present=%s is empty', (withScope) => {
    const result = render({ withScope, topics: [], primaryTopic: 'movies' });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe('Movie');
  });
  it.each(['', '{{wf unresolved}}', '<script>gaming</script>', 'Film, Gaming', 'unknown', '__proto__', 'constructor'])('does not infer taxonomy from invalid plain-text value %s', (value) => {
    const result = render({ topics: [value], primaryTopic: value, bookTitle: '{{wf unresolved}}', keywords: 'Film', articleSection: 'Movies' });
    expect(result.nodes.some(n => n['@type'] === 'Review')).toBe(false);
    expect(result.resolution).toBe('missing-type');
  });
  it('does not establish Book solely from the headline prefix', () => {
    const result = render({ topics: ['reviews'], headline: 'Boganmeldelse: A Movie', bookTitle: '' });
    expect(result.nodes.find(n => n['@type'] === 'Review').itemReviewed['@type']).toBe('CreativeWork');
  });
  it.each([false, true])('updates one pre-existing Review with graph=%s without dropping Article', (graph) => {
    const result = render({ graph, existingReview: true, replay: true, topics: ['film'], language: 'en' });
    expect(result.nodes.filter(n => n['@type'] === 'Article')).toHaveLength(1);
    const reviews = result.nodes.filter(n => n['@type'] === 'Review');
    expect(reviews).toHaveLength(1);
    expect(reviews[0].itemReviewed['@type']).toBe('Movie');
    expect(result.nodes.find(n => n['@type'] === 'Article')).toMatchObject({ inLanguage: 'en', url: 'https://www.aproposmagazine.com/en/articles/wolverine' });
  });
  it('hides unrated event labels while keeping locale canonical repair', () => {
    const result = render({ rating: 0, topics: ['festival'], language: 'en', existingReview: true, graph: true });
    expect(result.nodes.map(n => n['@type'])).toEqual(['Article']);
    expect(result.label.style.display).toBe('none');
    expect(result.nodes[0].inLanguage).toBe('en');
  });
});
