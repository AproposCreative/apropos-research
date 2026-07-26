/**
 * Server-side Review JSON-LD eligibility + itemReviewed typing.
 *
 * Uses artikeltype / topic / entity — not keyword-guess alone.
 * Never invents standalone Event schema without verified event data.
 */

import {
  isReviewSeoArticleType,
  resolveEffectiveArticleType,
} from '@/lib/seo-engine/review-title-rule';
import type { EditorialAnalysisV1, SeoEngineInputContract } from '@/lib/seo-engine/schema';

/** Schema.org types we emit for itemReviewed. */
export type ReviewedSchemaType =
  | 'Movie'
  | 'TVSeries'
  | 'VideoGame'
  | 'MusicAlbum'
  | 'MusicEvent'
  | 'Festival'
  | 'TheaterEvent'
  | 'VisualArtwork'
  | 'CreativeWork';

const ARTICLE_TYPE_TO_REVIEWED: Record<string, ReviewedSchemaType> = {
  filmanmeldelse: 'Movie',
  serieanmeldelse: 'TVSeries',
  spilanmeldelse: 'VideoGame',
  albumanmeldelse: 'MusicAlbum',
  koncertanmeldelse: 'MusicEvent',
  festivalanmeldelse: 'Festival',
  teateranmeldelse: 'TheaterEvent',
  kunstanmeldelse: 'VisualArtwork',
};

const ENTITY_TYPE_TO_REVIEWED: Array<{ match: RegExp; type: ReviewedSchemaType }> = [
  { match: /\b(film|movie|cinema)\b/i, type: 'Movie' },
  { match: /\b(serie|series|tv\s*series|tv-serie)\b/i, type: 'TVSeries' },
  { match: /\b(spil|game|videogame|video\s*game|gaming)\b/i, type: 'VideoGame' },
  { match: /\b(album|ep|single|record|musikalbum)\b/i, type: 'MusicAlbum' },
  { match: /\b(koncert|concert|live\s*show|musicevent)\b/i, type: 'MusicEvent' },
  { match: /\b(festival)\b/i, type: 'Festival' },
  { match: /\b(teater|theatre|theater|play)\b/i, type: 'TheaterEvent' },
  { match: /\b(kunst|art|artwork|exhibition)\b/i, type: 'VisualArtwork' },
];

/** Event-like itemReviewed types that require verified event facts. */
const EVENT_LIKE: ReadonlySet<ReviewedSchemaType> = new Set([
  'MusicEvent',
  'Festival',
  'TheaterEvent',
]);

export type ReviewSchemaEligibility = {
  eligible: boolean;
  reason: string;
  effectiveArticleType: string;
  itemReviewedType: ReviewedSchemaType | null;
  itemReviewedName: string | null;
  ratingValue: number | null;
};

export function isValidReviewRating(rating: unknown): rating is number {
  return typeof rating === 'number' && Number.isFinite(rating) && rating >= 1 && rating <= 6;
}

/**
 * Resolve itemReviewed.@type from article type first, then entity/topic, then safe fallback.
 */
export function resolveItemReviewedType(args: {
  articleType: string | null | undefined;
  entityType?: string | null;
  topic?: string | null;
}): ReviewedSchemaType {
  const typeKey = (args.articleType || '').trim().toLowerCase();
  if (typeKey && ARTICLE_TYPE_TO_REVIEWED[typeKey]) {
    return ARTICLE_TYPE_TO_REVIEWED[typeKey]!;
  }
  // Generic "Anmeldelse" / "review" — use entity/topic, not title keywords alone
  const blob = `${args.entityType || ''} ${args.topic || ''}`.trim();
  if (blob) {
    for (const row of ENTITY_TYPE_TO_REVIEWED) {
      if (row.match.test(blob)) return row.type;
    }
  }
  return 'CreativeWork';
}

/** True when we have enough verified event facts to keep an Event-like itemReviewed. */
export function hasVerifiedEventData(input: SeoEngineInputContract): boolean {
  const hasDate = Boolean(input.eventDate?.trim());
  const hasPlace = Boolean(input.venue?.trim() || input.city?.trim() || input.festival?.trim());
  return hasDate && hasPlace;
}

/**
 * Decide whether a Review node should be emitted.
 * Requires: review article type + valid rating + non-empty itemReviewed name.
 */
export function evaluateReviewSchemaEligibility(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
}): ReviewSchemaEligibility {
  const { input, analysis } = args;
  const effectiveArticleType = resolveEffectiveArticleType(
    analysis,
    input.articleType || null
  );

  if (!isReviewSeoArticleType(effectiveArticleType)) {
    // Generic "Anmeldelse" alone is not in the strict set — still allow when
    // suggested/editor clearly indicates review AND entity/work + rating exist.
    const loose = /anmeldelse|review/i.test(effectiveArticleType);
    if (!loose) {
      return {
        eligible: false,
        reason: 'not_review_article_type',
        effectiveArticleType,
        itemReviewedType: null,
        itemReviewedName: null,
        ratingValue: null,
      };
    }
  }

  if (!isValidReviewRating(input.rating)) {
    return {
      eligible: false,
      reason: 'missing_or_invalid_rating',
      effectiveArticleType,
      itemReviewedType: null,
      itemReviewedName: null,
      ratingValue: null,
    };
  }

  const itemReviewedName = resolveItemReviewedName({ input, analysis });
  if (!itemReviewedName) {
    return {
      eligible: false,
      reason: 'missing_item_reviewed_name',
      effectiveArticleType,
      itemReviewedType: null,
      itemReviewedName: null,
      ratingValue: input.rating,
    };
  }

  let itemReviewedType = resolveItemReviewedType({
    articleType: effectiveArticleType,
    entityType: analysis.primaryEntity?.entityType,
    topic: analysis.topic?.value,
  });

  // Event-like types without verified event data → CreativeWork fallback (no Event schema).
  if (EVENT_LIKE.has(itemReviewedType) && !hasVerifiedEventData(input)) {
    itemReviewedType = 'CreativeWork';
  }

  return {
    eligible: true,
    reason: 'ok',
    effectiveArticleType,
    itemReviewedType,
    itemReviewedName,
    ratingValue: input.rating,
  };
}

export function resolveItemReviewedName(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
}): string | null {
  const work = (args.analysis.work || '').trim();
  if (work) return work;
  const official = (args.analysis.primaryEntity?.likelyOfficialName || '').trim();
  if (official) return official;
  const asWritten = (args.analysis.primaryEntity?.asWritten || '').trim();
  if (asWritten) return asWritten;
  return null;
}

/**
 * Build a standalone Review schema.org object (no @context) for @graph, or with @context for HTML.
 */
export function buildReviewSchemaNode(args: {
  input: SeoEngineInputContract;
  analysis: EditorialAnalysisV1;
  metaDescription: string;
  eligibility?: ReviewSchemaEligibility;
  includeContext?: boolean;
}): Record<string, unknown> | null {
  const eligibility =
    args.eligibility ||
    evaluateReviewSchemaEligibility({ input: args.input, analysis: args.analysis });
  if (
    !eligibility.eligible ||
    !eligibility.itemReviewedType ||
    !eligibility.itemReviewedName ||
    eligibility.ratingValue == null
  ) {
    return null;
  }

  const { input } = args;
  const pageUrl = input.existingUrl?.trim() || undefined;
  const imageUrl = input.primaryImage?.url?.trim() || undefined;
  const inLanguage = input.language === 'en' ? 'en' : 'da';
  const datePublished = input.publishDate?.trim() || undefined;
  // Preserve original publish date; dateModified is separate and must not replace it.
  const dateModified = input.dateModified?.trim() || undefined;

  const itemReviewed: Record<string, unknown> = {
    '@type': eligibility.itemReviewedType,
    name: eligibility.itemReviewedName,
  };
  if (imageUrl) itemReviewed.image = imageUrl;
  if (
    EVENT_LIKE.has(eligibility.itemReviewedType) &&
    hasVerifiedEventData(input)
  ) {
    if (input.eventDate?.trim()) itemReviewed.startDate = input.eventDate.trim();
    if (input.venue?.trim() || input.city?.trim()) {
      itemReviewed.location = {
        '@type': 'Place',
        name: input.venue?.trim() || undefined,
        address: input.city?.trim() || undefined,
      };
    }
  }

  const review: Record<string, unknown> = {
    '@type': 'Review',
    ...(pageUrl ? { '@id': `${pageUrl}#review`, url: pageUrl } : {}),
    itemReviewed,
    reviewRating: {
      '@type': 'Rating',
      ratingValue: eligibility.ratingValue,
      bestRating: 6,
      worstRating: 1,
    },
    inLanguage,
    publisher: {
      '@type': 'Organization',
      name: 'Apropos Magazine',
    },
  };

  if (input.author?.trim()) {
    review.author = { '@type': 'Person', name: input.author.trim() };
  }
  if (datePublished) review.datePublished = datePublished;
  if (dateModified) review.dateModified = dateModified;
  if (imageUrl) review.image = imageUrl;
  if (args.metaDescription?.trim()) {
    review.reviewBody = args.metaDescription.trim();
  }
  if (eligibility.itemReviewedName) {
    const suffix = inLanguage === 'en' ? 'review' : 'anmeldelse';
    review.name = `${eligibility.itemReviewedName} — ${suffix}`;
  }

  if (args.includeContext) {
    return { '@context': 'https://schema.org', ...review };
  }
  return review;
}

/** Standalone Event schema — only with verified required fields. Never invented. */
export function buildEventSchemaNode(input: SeoEngineInputContract): Record<string, unknown> | null {
  if (!hasVerifiedEventData(input)) return null;
  const name =
    input.festival?.trim() ||
    input.editorialTitle?.trim() ||
    null;
  if (!name) return null;
  const startDate = input.eventDate!.trim();
  const locationName = input.venue?.trim() || input.city?.trim();
  if (!locationName) return null;

  return {
    '@type': 'Event',
    name,
    startDate,
    eventAttendanceMode: 'https://schema.org/OfflineEventAttendanceMode',
    eventStatus: 'https://schema.org/EventScheduled',
    location: {
      '@type': 'Place',
      name: locationName,
      address: input.city?.trim() || undefined,
    },
  };
}
