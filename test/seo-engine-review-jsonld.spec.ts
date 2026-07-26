import { describe, expect, it } from 'vitest';
import { buildDemoAnalysis } from '../lib/seo-engine/demo-pipeline';
import { computeInputVersionHash } from '../lib/seo-engine/hash';
import { buildNormalizedInputText } from '../lib/seo-engine/long-article';
import { buildJsonLd, findJsonLdNodesByType } from '../lib/seo-engine/jsonld';
import {
  extractJsonLdFromHtml,
  findHtmlSchemaNodesByType,
  renderServerJsonLdHtml,
  renderServerReviewJsonLdHtml,
} from '../lib/seo-engine/jsonld-html';
import {
  evaluateReviewSchemaEligibility,
  resolveItemReviewedType,
} from '../lib/seo-engine/review-schema';
import type { EditorialAnalysisV1, SeoEngineInputContract } from '../lib/seo-engine/schema';

function baseBody(n = 220): string {
  return `${'Brødtekst med nok tegn til analyse. '.repeat(Math.ceil(n / 36))}`.slice(0, n);
}

function makeInput(partial: Partial<SeoEngineInputContract>): SeoEngineInputContract {
  return {
    editorialTitle: partial.editorialTitle || 'Titel',
    language: partial.language || 'da',
    body: partial.body || baseBody(),
    ...partial,
  };
}

function makeAnalysis(
  input: SeoEngineInputContract,
  overrides: {
    suggestedType?: string;
    entityType?: string;
    work?: string;
    topic?: string;
  } = {}
): EditorialAnalysisV1 {
  const hash = computeInputVersionHash(input);
  const { normalizedText, inputMode } = buildNormalizedInputText(input);
  const analysis = buildDemoAnalysis({
    input: {
      ...input,
      articleType: overrides.suggestedType || input.articleType,
    },
    normalizedText,
    inputVersionHash: hash,
    inputMode,
  });
  if (overrides.suggestedType) {
    analysis.articleType.suggested = overrides.suggestedType;
    analysis.articleType.editor = overrides.suggestedType;
  }
  if (overrides.entityType) {
    analysis.primaryEntity.entityType = overrides.entityType;
  }
  if (overrides.work !== undefined) analysis.work = overrides.work;
  if (overrides.topic) {
    analysis.topic.value = overrides.topic;
  }
  return analysis;
}

describe('server-rendered Review JSON-LD (raw HTML)', () => {
  it('emits Movie Review in raw HTML for Filmanmeldelse', () => {
    const input = makeInput({
      editorialTitle: 'The Substance',
      articleType: 'Filmanmeldelse',
      rating: 5,
      author: 'Casper Fiil',
      publishDate: '2025-10-01T13:12:22.294Z',
      dateModified: '2026-07-24T19:20:46.307Z',
      existingUrl: 'https://www.aproposmagazine.com/articles/the-substance',
      primaryImage: { url: 'https://cdn.example.com/substance.webp' },
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Filmanmeldelse',
      entityType: 'film',
      work: 'The Substance',
      topic: 'film',
    });
    const html = renderServerJsonLdHtml({
      input,
      analysis,
      seoTitle: 'The Substance anmeldelse',
      metaDescription: 'En skarp filmanmeldelse af The Substance.',
    });

    expect(html).toContain('type="application/ld+json"');
    expect(html).toContain('data-apropos-server-jsonld');
    // Raw HTML must contain Review without requiring JS execution
    expect(html).toMatch(/"@type":"Review"/);

    const reviews = findHtmlSchemaNodesByType(html, 'Review');
    expect(reviews).toHaveLength(1);
    const review = reviews[0]!;
    expect(review.itemReviewed).toMatchObject({
      '@type': 'Movie',
      name: 'The Substance',
    });
    expect(review.reviewRating).toMatchObject({
      '@type': 'Rating',
      ratingValue: 5,
      bestRating: 6,
      worstRating: 1,
    });
    expect(review.author).toMatchObject({ '@type': 'Person', name: 'Casper Fiil' });
    expect(review.publisher).toMatchObject({
      '@type': 'Organization',
      name: 'Apropos Magazine',
    });
    expect(review.datePublished).toBe('2025-10-01T13:12:22.294Z');
    expect(review.dateModified).toBe('2026-07-24T19:20:46.307Z');
    expect(review.url).toBe('https://www.aproposmagazine.com/articles/the-substance');
    expect(review.inLanguage).toBe('da');
    expect(review.image).toBe('https://cdn.example.com/substance.webp');

    // Article schema preserved; publish date not replaced by modified
    const articles = findHtmlSchemaNodesByType(html, 'Article');
    expect(articles).toHaveLength(1);
    expect(articles[0]!.datePublished).toBe('2025-10-01T13:12:22.294Z');
    expect(articles[0]!.dateModified).toBe('2026-07-24T19:20:46.307Z');
    expect(articles[0]!.inLanguage).toBe('da');
  });

  it('emits TVSeries Review for Serieanmeldelse', () => {
    const input = makeInput({
      editorialTitle: 'Alien: Earth',
      articleType: 'Serieanmeldelse',
      rating: 5,
      publishDate: '2025-10-01T13:12:22.294Z',
      existingUrl: 'https://www.aproposmagazine.com/articles/anmeldelse-alien-earth',
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Serieanmeldelse',
      entityType: 'tv-serie',
      work: 'Alien: Earth',
      topic: 'serier',
    });
    const html = renderServerJsonLdHtml({
      input,
      analysis,
      seoTitle: 'Alien: Earth anmeldelse',
      metaDescription: 'Serieanmeldelse af Alien: Earth.',
    });
    const reviews = findHtmlSchemaNodesByType(html, 'Review');
    expect(reviews[0]?.itemReviewed).toMatchObject({
      '@type': 'TVSeries',
      name: 'Alien: Earth',
    });
  });

  it('emits VideoGame Review for Spilanmeldelse', () => {
    const input = makeInput({
      editorialTitle: 'Anmeldelse: Astro Bot',
      articleType: 'Spilanmeldelse',
      rating: 6,
      existingUrl: 'https://www.aproposmagazine.com/articles/anmeldelse-astro-bot-ps5',
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Spilanmeldelse',
      entityType: 'spil',
      work: 'Astro Bot',
      topic: 'gaming',
    });
    const html = renderServerJsonLdHtml({
      input,
      analysis,
      seoTitle: 'Astro Bot anmeldelse',
      metaDescription: 'Spilanmeldelse af Astro Bot.',
    });
    expect(findHtmlSchemaNodesByType(html, 'Review')[0]?.itemReviewed).toMatchObject({
      '@type': 'VideoGame',
      name: 'Astro Bot',
    });
  });

  it('emits MusicAlbum Review for Albumanmeldelse', () => {
    const input = makeInput({
      editorialTitle: 'Nyt album',
      articleType: 'Albumanmeldelse',
      rating: 4,
      existingUrl: 'https://www.aproposmagazine.com/articles/album-x',
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Albumanmeldelse',
      entityType: 'album',
      work: 'Micro Pleasures',
      topic: 'musik',
    });
    const html = renderServerJsonLdHtml({
      input,
      analysis,
      seoTitle: 'Micro Pleasures anmeldelse',
      metaDescription: 'Albumanmeldelse.',
    });
    expect(findHtmlSchemaNodesByType(html, 'Review')[0]?.itemReviewed).toMatchObject({
      '@type': 'MusicAlbum',
      name: 'Micro Pleasures',
    });
  });

  it('omits Review and Event on non-review articles', () => {
    const input = makeInput({
      editorialTitle: 'Copenhell 2026: Den store Apropos-guide',
      articleType: 'Festivalguide',
      // rating alone must not create Review on guides
      rating: 5,
      existingUrl: 'https://www.aproposmagazine.com/articles/copenhell-guide',
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Festivalguide',
      entityType: 'festival',
      work: 'Copenhell',
      topic: 'festival',
    });
    const html = renderServerJsonLdHtml({
      input,
      analysis,
      seoTitle: 'Copenhell guide',
      metaDescription: 'Guide til Copenhell.',
    });
    expect(findHtmlSchemaNodesByType(html, 'Review')).toHaveLength(0);
    expect(findHtmlSchemaNodesByType(html, 'Event')).toHaveLength(0);
    expect(findHtmlSchemaNodesByType(html, 'Article')).toHaveLength(1);
  });

  it('does not invent Event without verified event data', () => {
    const input = makeInput({
      editorialTitle: 'Koncert uden dato',
      articleType: 'Feature',
      eventDate: undefined,
      venue: undefined,
    });
    const analysis = makeAnalysis(input, { suggestedType: 'Feature' });
    const graph = buildJsonLd({
      input,
      analysis,
      seoTitle: 'Feature',
      metaDescription: 'En feature.',
    });
    expect(findJsonLdNodesByType(graph, 'Event')).toHaveLength(0);
    expect(findJsonLdNodesByType(graph, 'Review')).toHaveLength(0);
  });

  it('emits Event only with verified date + place (non-review)', () => {
    const input = makeInput({
      editorialTitle: 'Roskilde preview',
      articleType: 'Feature',
      festival: 'Roskilde Festival',
      eventDate: '2026-06-28',
      venue: 'Roskilde Dyrskueplads',
      city: 'Roskilde',
    });
    const analysis = makeAnalysis(input, { suggestedType: 'Feature' });
    const graph = buildJsonLd({
      input,
      analysis,
      seoTitle: 'Roskilde',
      metaDescription: 'Preview.',
    });
    const events = findJsonLdNodesByType(graph, 'Event');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      name: 'Roskilde Festival',
      startDate: '2026-06-28',
    });
  });

  it('falls back concert itemReviewed to CreativeWork without verified event data', () => {
    const input = makeInput({
      editorialTitle: 'Live i Vega',
      articleType: 'Koncertanmeldelse',
      rating: 4,
      // no eventDate / venue
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Koncertanmeldelse',
      entityType: 'koncert',
      work: 'Artist X',
    });
    const el = evaluateReviewSchemaEligibility({ input, analysis });
    expect(el.eligible).toBe(true);
    expect(el.itemReviewedType).toBe('CreativeWork');
    const reviewHtml = renderServerReviewJsonLdHtml({
      input,
      analysis,
      metaDescription: 'Koncertanmeldelse.',
    });
    expect(reviewHtml).toBeTruthy();
    const review = findHtmlSchemaNodesByType(reviewHtml!, 'Review')[0]!;
    expect(review.itemReviewed).toMatchObject({
      '@type': 'CreativeWork',
      name: 'Artist X',
    });
  });

  it('avoids duplicate Review nodes in @graph output', () => {
    const input = makeInput({
      editorialTitle: 'Game',
      articleType: 'Spilanmeldelse',
      rating: 5,
    });
    const analysis = makeAnalysis(input, {
      suggestedType: 'Spilanmeldelse',
      entityType: 'game',
      work: 'Silksong',
    });
    const html = renderServerJsonLdHtml({
      input,
      analysis,
      seoTitle: 'Silksong anmeldelse',
      metaDescription: 'Spil.',
    });
    const docs = extractJsonLdFromHtml(html);
    expect(docs).toHaveLength(1);
    expect(findHtmlSchemaNodesByType(html, 'Review')).toHaveLength(1);
    expect(findHtmlSchemaNodesByType(html, 'Article')).toHaveLength(1);
  });

  it('maps itemReviewed types from article type before entity fallback', () => {
    expect(
      resolveItemReviewedType({
        articleType: 'Filmanmeldelse',
        entityType: 'unknown',
        topic: 'kultur',
      })
    ).toBe('Movie');
    expect(
      resolveItemReviewedType({
        articleType: 'Serieanmeldelse',
        entityType: 'unknown',
      })
    ).toBe('TVSeries');
    expect(
      resolveItemReviewedType({
        articleType: 'Spilanmeldelse',
        entityType: 'unknown',
      })
    ).toBe('VideoGame');
    expect(
      resolveItemReviewedType({
        articleType: 'Albumanmeldelse',
        entityType: 'unknown',
      })
    ).toBe('MusicAlbum');
    expect(
      resolveItemReviewedType({
        articleType: 'Feature',
        entityType: 'film',
        topic: 'film',
      })
    ).toBe('Movie');
  });

  it('rejects Review without rating or work/entity name', () => {
    const noRating = makeInput({ articleType: 'Filmanmeldelse' });
    const a1 = makeAnalysis(noRating, {
      suggestedType: 'Filmanmeldelse',
      work: 'X',
      entityType: 'film',
    });
    expect(evaluateReviewSchemaEligibility({ input: noRating, analysis: a1 }).eligible).toBe(
      false
    );

    const noWork = makeInput({ articleType: 'Filmanmeldelse', rating: 3 });
    const a2 = makeAnalysis(noWork, {
      suggestedType: 'Filmanmeldelse',
      work: '',
      entityType: 'film',
    });
    a2.primaryEntity.asWritten = '';
    a2.primaryEntity.likelyOfficialName = undefined;
    a2.work = undefined;
    expect(evaluateReviewSchemaEligibility({ input: noWork, analysis: a2 }).eligible).toBe(
      false
    );
  });
});
