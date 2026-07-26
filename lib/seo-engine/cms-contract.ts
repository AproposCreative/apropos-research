import type { SeoEngineInputContract } from '@/lib/seo-engine/schema';
import { getCmsSeoSlugs, isCmsSeoFieldEmpty } from '@/lib/seo-engine/webflow-adapter';
import { stripHtmlToText } from '@/lib/seo-engine/html-text';

/**
 * Map Webflow CMS fieldData (+ meta) into the engine input contract.
 */
export function webflowItemToSeoEngineInput(args: {
  fieldData: Record<string, unknown>;
  language?: 'da' | 'en';
  existingUrl?: string;
  /** Original publish timestamp — preserved as datePublished in JSON-LD. */
  publishDate?: string | null;
  /** CMS lastUpdated — mapped to dateModified only. */
  dateModified?: string | null;
  /** Resolved author display name (not the CMS reference id). */
  authorName?: string | null;
}): SeoEngineInputContract {
  const fd = args.fieldData;
  const slugs = getCmsSeoSlugs();
  const name = String(fd.name || fd.title || '').trim();
  const contentHtml = String(fd.content || '').trim();
  const body = stripHtmlToText(contentHtml) || contentHtml;
  const existingSeoTitle = fd[slugs.seoTitle];
  const existingMeta = fd[slugs.metaDescription];
  const articleType =
    optionalString(fd['article-type']) || optionalString(fd.articleType);
  const ratingRaw = fd.stjerne;
  const rating =
    typeof ratingRaw === 'number'
      ? ratingRaw
      : typeof ratingRaw === 'string' && ratingRaw.trim() !== '' && Number.isFinite(Number(ratingRaw))
        ? Number(ratingRaw)
        : undefined;

  return {
    editorialTitle: name || 'Uden titel',
    language: args.language || 'da',
    body,
    subtitle: optionalString(fd.subtitle),
    intro: optionalString(fd.intro),
    author: optionalString(args.authorName) || undefined,
    articleType: articleType || undefined,
    existingSlug: optionalString(fd.slug),
    existingUrl: args.existingUrl,
    publishDate: optionalString(args.publishDate) || undefined,
    dateModified: optionalString(args.dateModified) || undefined,
    existingSeoTitle: isCmsSeoFieldEmpty(existingSeoTitle)
      ? null
      : String(existingSeoTitle).trim(),
    existingMetaDescription: isCmsSeoFieldEmpty(existingMeta)
      ? null
      : String(existingMeta).trim(),
    rating,
    // festival is a CMS reference id — do not treat as display name for schema
    venue: optionalString(fd.location) || undefined,
    eventDate: optionalIsoDate(fd['start-dato']),
    streamingLink: optionalString(fd['watch-now-link']),
    ticketLink: optionalString(fd['buy-tickets']),
    trailerLink: optionalString(fd['video-trailer']),
    primaryImage: fd.thumb
      ? {
          url: typeof fd.thumb === 'string' ? fd.thumb : optionalString((fd.thumb as { url?: string })?.url),
        }
      : undefined,
  };
}

function optionalString(v: unknown): string | undefined {
  if (typeof v !== 'string') return undefined;
  const t = v.trim();
  return t || undefined;
}

function optionalIsoDate(v: unknown): string | undefined {
  if (typeof v === 'string') {
    const t = v.trim();
    return t || undefined;
  }
  if (v instanceof Date && Number.isFinite(v.getTime())) {
    return v.toISOString();
  }
  return undefined;
}

export function cmsSeoEmptiness(fieldData: Record<string, unknown>): {
  seoTitleEmpty: boolean;
  metaDescriptionEmpty: boolean;
  anyEmpty: boolean;
  bothEmpty: boolean;
} {
  const slugs = getCmsSeoSlugs();
  const seoTitleEmpty = isCmsSeoFieldEmpty(fieldData[slugs.seoTitle]);
  const metaDescriptionEmpty = isCmsSeoFieldEmpty(fieldData[slugs.metaDescription]);
  return {
    seoTitleEmpty,
    metaDescriptionEmpty,
    anyEmpty: seoTitleEmpty || metaDescriptionEmpty,
    bothEmpty: seoTitleEmpty && metaDescriptionEmpty,
  };
}
