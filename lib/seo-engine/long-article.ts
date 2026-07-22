import {
  SEO_ENGINE_EVIDENCE_QUOTE_MAX,
  SEO_ENGINE_LONG_ARTICLE_CHARS,
  SEO_ENGINE_SNAPSHOT_SOFT_MAX_BYTES,
} from '@/lib/seo-engine/versions';
import type { SeoEngineInputContract } from '@/lib/seo-engine/schema';

export type ExtractManifest = {
  keptHeadChars: number;
  keptTailChars: number;
  headingSamples: number;
  originalBodyChars: number;
};

export type NormalizedInputText = {
  normalizedText: string;
  inputMode: 'full' | 'long_article_extract';
  extractManifest?: ExtractManifest;
};

function buildPrefix(input: SeoEngineInputContract): string {
  const parts = [
    input.editorialTitle,
    input.subtitle,
    input.intro,
    input.articleType ? `Type: ${input.articleType}` : '',
    input.author ? `Forfatter: ${input.author}` : '',
  ].filter(Boolean);
  return parts.join('\n\n');
}

/**
 * Builds the immutable text that evidence offsets refer to.
 * Never silently truncates mid-article without long_article_extract mode.
 */
export function buildNormalizedInputText(input: SeoEngineInputContract): NormalizedInputText {
  const prefix = buildPrefix(input);
  const body = input.body || '';
  const full = `${prefix}\n\n${body}`.trim();

  if (body.length <= SEO_ENGINE_LONG_ARTICLE_CHARS) {
    const bytes = Buffer.byteLength(full, 'utf8');
    if (bytes <= SEO_ENGINE_SNAPSHOT_SOFT_MAX_BYTES) {
      return { normalizedText: full, inputMode: 'full' };
    }
  }

  const head = body.slice(0, 12_000);
  const tail = body.slice(Math.max(0, body.length - 12_000));
  const headings = (body.match(/^#{1,3}\s.+$/gm) || []).slice(0, 40).join('\n');
  const extract = [
    prefix,
    '--- EXTRACT HEAD ---',
    head,
    headings ? `--- HEADINGS ---\n${headings}` : '',
    '--- EXTRACT TAIL (verdict zone) ---',
    tail,
  ]
    .filter(Boolean)
    .join('\n\n')
    .trim();

  return {
    normalizedText: extract,
    inputMode: 'long_article_extract',
    extractManifest: {
      keptHeadChars: head.length,
      keptTailChars: tail.length,
      headingSamples: (body.match(/^#{1,3}\s.+$/gm) || []).length,
      originalBodyChars: body.length,
    },
  };
}

export function clipEvidenceQuote(quote: string): string {
  const t = quote.trim().replace(/\s+/g, ' ');
  if (t.length <= SEO_ENGINE_EVIDENCE_QUOTE_MAX) return t;
  return t.slice(0, SEO_ENGINE_EVIDENCE_QUOTE_MAX - 1).trimEnd() + '…';
}

/** Locate quote in normalizedText; returns null if not found. */
export function locateQuoteInText(
  normalizedText: string,
  quote: string
): { startOffset: number; endOffset: number; quote: string } | null {
  const clipped = clipEvidenceQuote(quote);
  const idx = normalizedText.indexOf(clipped);
  if (idx >= 0) {
    return { startOffset: idx, endOffset: idx + clipped.length, quote: clipped };
  }
  // try first 80 chars of quote
  const short = clipped.slice(0, Math.min(80, clipped.length));
  const idx2 = normalizedText.indexOf(short);
  if (idx2 >= 0) {
    return { startOffset: idx2, endOffset: idx2 + short.length, quote: short };
  }
  return null;
}
