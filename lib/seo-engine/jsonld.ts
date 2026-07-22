import type { EditorialAnalysisV1, JsonLdGraph, SeoEngineInputContract } from '@/lib/seo-engine/schema';
import { SEO_ENGINE_JSONLD_VERSION } from '@/lib/seo-engine/versions';

/**
 * Deterministic JSON-LD builder. Omits unknown fields; never invents Event/Review data.
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

  graph.push({
    '@type': 'WebPage',
    '@id': pageUrl ? `${pageUrl}#webpage` : undefined,
    name: seoTitle,
    description: metaDescription,
    url: pageUrl,
    inLanguage: input.language === 'en' ? 'en' : 'da',
    isPartOf: { '@type': 'WebSite', name: 'Apropos Magazine' },
  });

  const articleType = suggestSchemaArticleType(analysis);
  const article: Record<string, unknown> = {
    '@type': articleType,
    headline: input.editorialTitle,
    description: metaDescription,
    inLanguage: input.language === 'en' ? 'en' : 'da',
    about: {
      '@type': mapEntityType(analysis.primaryEntity.entityType),
      name: analysis.primaryEntity.likelyOfficialName || analysis.primaryEntity.asWritten,
    },
  };
  if (input.author) {
    article.author = { '@type': 'Person', name: input.author };
  }
  article.publisher = {
    '@type': 'Organization',
    name: 'Apropos Magazine',
  };
  if (imageUrl) {
    article.image = { '@type': 'ImageObject', url: imageUrl };
  }
  if (pageUrl) article.mainEntityOfPage = pageUrl;
  graph.push(article);

  if (imageUrl) {
    graph.push({
      '@type': 'ImageObject',
      url: imageUrl,
      caption: input.primaryImage?.description || undefined,
    });
  }

  // Review+Rating only when clearly a review with rating + work
  const isReview = /anmeldelse|review/i.test(analysis.articleType.suggested);
  if (isReview && typeof input.rating === 'number' && analysis.work) {
    graph.push({
      '@type': 'Review',
      itemReviewed: {
        '@type': mapEntityType(analysis.primaryEntity.entityType),
        name: analysis.work,
      },
      reviewRating: {
        '@type': 'Rating',
        ratingValue: input.rating,
        bestRating: 6,
        worstRating: 1,
      },
      author: input.author ? { '@type': 'Person', name: input.author } : undefined,
    });
  }

  return {
    '@context': 'https://schema.org',
    '@graph': graph.map(stripUndefined),
  };
}

function suggestSchemaArticleType(analysis: EditorialAnalysisV1): string {
  const t = analysis.articleType.suggested.toLowerCase();
  if (t.includes('nyhed')) return 'NewsArticle';
  return 'Article';
}

function mapEntityType(entityType: string): string {
  const t = entityType.toLowerCase();
  if (t.includes('film') || t.includes('movie')) return 'Movie';
  if (t.includes('serie') || t.includes('tv')) return 'TVSeries';
  if (t.includes('musik') || t.includes('album')) return 'MusicAlbum';
  if (t.includes('spil') || t.includes('game')) return 'VideoGame';
  if (t.includes('person') || t.includes('artist')) return 'Person';
  if (t.includes('festival')) return 'Festival';
  return 'Thing';
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
