import type { EditorialAnalysisV1, JsonLdGraph, SeoEngineInputContract } from '@/lib/seo-engine/schema';
import {
  buildEventSchemaNode,
  buildReviewSchemaNode,
  evaluateReviewSchemaEligibility,
  resolveItemReviewedType,
} from '@/lib/seo-engine/review-schema';
import { resolveEffectiveArticleType } from '@/lib/seo-engine/review-title-rule';
import { SEO_ENGINE_JSONLD_VERSION } from '@/lib/seo-engine/versions';

/**
 * Deterministic server-side JSON-LD builder.
 * Omits unknown fields; never invents Review/Event without verified data.
 * Review is emitted only for real reviews with rating + itemReviewed.
 */
export function buildJsonLd(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
  seoTitle: string;
  metaDescription: string;
}): JsonLdGraph {
  const { input, analysis, seoTitle, metaDescription } = args;
  const graph: Record<string, unknown>[] = [];

  const pageUrl = input.existingUrl?.trim() || undefined;
  const imageUrl = input.primaryImage?.url?.trim() || undefined;
  const inLanguage = input.language === 'en' ? 'en' : 'da';
  const datePublished = input.publishDate?.trim() || undefined;
  const dateModified = input.dateModified?.trim() || undefined;

  graph.push({
    '@type': 'WebPage',
    '@id': pageUrl ? `${pageUrl}#webpage` : undefined,
    name: seoTitle,
    description: metaDescription,
    url: pageUrl,
    inLanguage,
    isPartOf: { '@type': 'WebSite', name: 'Apropos Magazine' },
  });

  const articleType = suggestSchemaArticleType(analysis, input);
  const aboutType = mapAboutEntityType(analysis, input);
  const article: Record<string, unknown> = {
    '@type': articleType,
    headline: input.editorialTitle,
    description: metaDescription,
    inLanguage,
    about: {
      '@type': aboutType,
      name: analysis.primaryEntity.likelyOfficialName || analysis.primaryEntity.asWritten,
    },
  };
  if (input.author?.trim()) {
    article.author = { '@type': 'Person', name: input.author.trim() };
  }
  article.publisher = {
    '@type': 'Organization',
    name: 'Apropos Magazine',
  };
  if (imageUrl) {
    article.image = { '@type': 'ImageObject', url: imageUrl };
  }
  if (pageUrl) {
    article.mainEntityOfPage = pageUrl;
    article.url = pageUrl;
  }
  // Preserve original publish date; never overwrite with dateModified.
  if (datePublished) article.datePublished = datePublished;
  if (dateModified) article.dateModified = dateModified;
  graph.push(article);

  if (imageUrl) {
    graph.push({
      '@type': 'ImageObject',
      url: imageUrl,
      caption: input.primaryImage?.description || undefined,
    });
  }

  const reviewEligibility = evaluateReviewSchemaEligibility({ input, analysis });
  const reviewNode = buildReviewSchemaNode({
    input,
    analysis,
    metaDescription,
    eligibility: reviewEligibility,
    includeContext: false,
  });
  if (reviewNode) {
    graph.push(reviewNode);
  }

  // Standalone Event only with verified eventDate + place — never on ordinary articles.
  const eventNode = buildEventSchemaNode(input);
  if (eventNode && !reviewNode) {
    // Avoid duplicate Event when Review already carries event-like itemReviewed.
    graph.push(eventNode);
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph.map(stripUndefined),
  };
}

function suggestSchemaArticleType(
  analysis: EditorialAnalysisV1,
  input: SeoEngineInputContract
): string {
  const t = resolveEffectiveArticleType(analysis, input.articleType).toLowerCase();
  if (t.includes('nyhed')) return 'NewsArticle';
  return 'Article';
}

function mapAboutEntityType(
  analysis: EditorialAnalysisV1,
  input: SeoEngineInputContract
): string {
  const articleType = resolveEffectiveArticleType(analysis, input.articleType);
  const reviewed = resolveItemReviewedType({
    articleType,
    entityType: analysis.primaryEntity.entityType,
    topic: analysis.topic?.value,
  });
  // about[] prefers CreativeWork subtypes; Event-like → CreativeWork for Article.about
  if (reviewed === 'MusicEvent' || reviewed === 'Festival' || reviewed === 'TheaterEvent') {
    return 'CreativeWork';
  }
  return reviewed;
}

function stripUndefined(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined) continue;
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      out[k] = stripUndefined(v as Record<string, unknown>);
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function jsonLdVersionStamp(): string {
  return SEO_ENGINE_JSONLD_VERSION;
}

/** Extract typed nodes from a graph for tests / HTML inspection. */
export function findJsonLdNodesByType(
  graph: JsonLdGraph,
  type: string
): Array<Record<string, unknown>> {
  const nodes = (graph['@graph'] || []) as Array<Record<string, unknown>>;
  return nodes.filter((n) => n['@type'] === type);
}
