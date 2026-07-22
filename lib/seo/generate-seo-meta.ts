/**
 * SEO/Meta generator.
 *
 * @deprecated Soft-deprecated in favor of the Apropos SEO Engine
 * (`lib/seo-engine/*`, overlay `/ai?view=seo`). That pipeline is the
 * server-authoritative, two-phase (analyze → strategize) SEO entry point
 * with evidence, confidence bands, validation, and durable auto-SEO jobs.
 * This module remains as the lightweight single-shot generator used by
 * `Liv`/AI-chat drafting flows and is NOT removed — new SEO features
 * (auto-fill on publish, history, JSON-LD, etc.) belong in the SEO Engine.
 *
 * Two modes:
 *  - `smart` (default, sync): a heuristic that builds compelling SEO copy
 *    from existing fields with word-boundary truncation (no mid-word cuts,
 *    no trailing ellipsis). Always available, zero-cost.
 *  - `ai` (async): uses gpt-4o-mini to craft Danish SEO title + meta
 *    description tuned for SERPs. Cached by content hash so repeat calls
 *    on the same article don't spend tokens.
 *
 * Both modes return `{ seoTitle, seoDescription }` and respect SEO limits
 * from `lib/seo/constants.ts`.
 */

import { createHash } from 'node:crypto';
import { apiCache, CACHE_TTL } from '@/lib/cache';
import { getOpenAIClient } from '@/lib/openai';
import {
  SEO_DESCRIPTION_MAX,
  SEO_DESCRIPTION_MIN,
  SEO_TITLE_MAX,
  SEO_TITLE_MIN,
} from '@/lib/seo/constants';

export interface SeoInput {
  title?: string | null;
  subtitle?: string | null;
  intro?: string | null;
  content?: string | null;
  /** Optional section/category for context (e.g. "Anmeldelse", "Koncert"). */
  section?: string | null;
  /** Optional keyword hints to weave into copy. */
  keywords?: string[];
}

export interface SeoOutput {
  seoTitle?: string;
  seoDescription?: string;
  /** Primary keyphrase the AI selected (if AI mode). */
  primaryKeyword?: string;
  /** Which mode produced the result. Useful for observability. */
  source: 'ai' | 'smart' | 'fallback';
}

/* ----------------------------------------------------------------------- */
/* Public API                                                              */
/* ----------------------------------------------------------------------- */

/**
 * Synchronous smart heuristic. Always succeeds, never calls the network.
 * Uses word-boundary truncation and never appends "..." to a partial word.
 */
export function generateSeoMetaSmart(input: SeoInput): SeoOutput {
  const title = clean(input.title);
  const subtitle = clean(input.subtitle);
  const intro = clean(input.intro);
  const content = clean(input.content);

  // ----- SEO title -----
  let seoTitle = title;
  // Combine title + subtitle if there's room and it adds context.
  if (subtitle && seoTitle && seoTitle.length + subtitle.length + 3 <= SEO_TITLE_MAX) {
    seoTitle = `${seoTitle} – ${subtitle}`;
  }
  seoTitle = truncateAtWord(seoTitle, SEO_TITLE_MAX);

  // ----- Meta description -----
  // Prefer intro -> subtitle -> content. Build at least 1-2 sentences.
  const sourceText = intro || subtitle || content;
  const seoDescription = buildDescription(sourceText, SEO_DESCRIPTION_MAX);

  return {
    seoTitle: seoTitle || undefined,
    seoDescription: seoDescription || undefined,
    source: 'smart',
  };
}

/**
 * Async AI-driven generator. Falls back to the smart heuristic if OpenAI
 * is unavailable or returns invalid JSON. Result is cached by content hash.
 */
export async function generateSeoMetaAI(input: SeoInput): Promise<SeoOutput> {
  const cacheKey = `seo-meta:${hashInput(input)}`;
  const cached = apiCache.get<SeoOutput>(cacheKey);
  if (cached) return cached;

  const client = getOpenAIClient();
  if (!client) return generateSeoMetaSmart(input);

  const systemPrompt = [
    'Du er en dansk SEO-redaktør for et kulturmagasin.',
    'Skriv en SEO-titel og en meta-beskrivelse, der er klare, præcise og lokkende.',
    'Krav:',
    `- SEO-titel: maks ${SEO_TITLE_MAX} tegn (inkl. mellemrum), inkluder primært søgeord tidligt.`,
    `- Meta-beskrivelse: maks ${SEO_DESCRIPTION_MAX} tegn, fuld sætning, slutter på "." eller andet meningsfuldt tegn (aldrig "...").`,
    '- Ingen clickbait. Ingen emojis. Ingen "...".',
    '- Skriv på dansk.',
    'Returnér KUN gyldig JSON: {"seoTitle":"...","seoDescription":"...","primaryKeyword":"..."}',
  ].join('\n');

  const userPrompt = [
    input.section ? `Sektion: ${input.section}` : null,
    input.title ? `Titel: ${input.title}` : null,
    input.subtitle ? `Undertitel: ${input.subtitle}` : null,
    input.intro ? `Intro: ${input.intro}` : null,
    input.content ? `Brødtekst (uddrag): ${truncateAtWord(input.content, 800)}` : null,
    input.keywords?.length ? `Foreslåede nøgleord: ${input.keywords.join(', ')}` : null,
  ]
    .filter(Boolean)
    .join('\n\n');

  try {
    const completion = await client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.4,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    });

    const raw = completion.choices[0]?.message?.content?.trim();
    if (!raw) return cacheAndReturn(cacheKey, generateSeoMetaSmart(input));

    let parsed: { seoTitle?: unknown; seoDescription?: unknown; primaryKeyword?: unknown };
    try {
      parsed = JSON.parse(raw);
    } catch {
      return cacheAndReturn(cacheKey, generateSeoMetaSmart(input));
    }

    const seoTitleRaw = typeof parsed.seoTitle === 'string' ? parsed.seoTitle : '';
    const seoDescriptionRaw = typeof parsed.seoDescription === 'string' ? parsed.seoDescription : '';
    const primaryKeyword = typeof parsed.primaryKeyword === 'string' ? parsed.primaryKeyword : undefined;

    // Defense in depth: enforce limits even if the model drifts.
    const seoTitle = truncateAtWord(stripEllipsis(seoTitleRaw), SEO_TITLE_MAX);
    const seoDescription = buildDescription(seoDescriptionRaw, SEO_DESCRIPTION_MAX);

    if (!seoTitle || seoTitle.length < SEO_TITLE_MIN) {
      return cacheAndReturn(cacheKey, generateSeoMetaSmart(input));
    }

    const result: SeoOutput = {
      seoTitle,
      seoDescription: seoDescription || undefined,
      primaryKeyword,
      source: 'ai',
    };
    return cacheAndReturn(cacheKey, result);
  } catch {
    return generateSeoMetaSmart(input);
  }
}

/* ----------------------------------------------------------------------- */
/* Helpers                                                                 */
/* ----------------------------------------------------------------------- */

function clean(value: string | null | undefined): string {
  if (!value) return '';
  return String(value)
    .replace(/<[^>]+>/g, ' ')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip a trailing ellipsis (… or ...) — we never want partial-word cuts. */
function stripEllipsis(value: string): string {
  return value.replace(/[\s\u00A0]*(?:\.{3}|…)\s*$/u, '').trim();
}

/**
 * Truncate at the last word boundary that fits within `max` chars.
 * Never produces a mid-word cut, never appends "...".
 */
export function truncateAtWord(input: string, max: number): string {
  const text = (input || '').trim();
  if (text.length <= max) return text;

  // Try to cut at the last sentence boundary first, then word boundary.
  const slice = text.slice(0, max + 1);

  // Prefer to end at . ! ? — find the last one inside [max-50 .. max].
  const sentenceMatch = slice.slice(0, max).match(/[\s\S]*[.!?](?=\s|$)/);
  if (sentenceMatch && sentenceMatch[0].length >= Math.max(SEO_TITLE_MIN, max * 0.55)) {
    return sentenceMatch[0].trim();
  }

  // Otherwise cut at the last whitespace before `max`.
  const lastSpace = slice.lastIndexOf(' ', max);
  if (lastSpace > 0) {
    return slice.slice(0, lastSpace).trim().replace(/[,;:–—-]+$/, '');
  }

  // Single very long word — fall back to a hard cut.
  return text.slice(0, max).trim();
}

function buildDescription(sourceText: string, max: number): string {
  const text = clean(sourceText);
  if (!text) return '';

  // Try to compose 1-3 full sentences that fit.
  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  let acc = '';
  for (const sentence of sentences) {
    const next = acc ? `${acc} ${sentence}` : sentence;
    if (next.length > max) break;
    acc = next;
  }

  if (acc.length >= SEO_DESCRIPTION_MIN) {
    return acc.trim();
  }

  // No clean sentence break found — truncate at word boundary, ensure
  // we end with a period for natural reading.
  const truncated = truncateAtWord(text, max);
  if (!truncated) return '';
  if (/[.!?]$/.test(truncated)) return truncated;
  // If we have at least one extra char of room, append a period.
  if (truncated.length < max) return `${truncated}.`;
  // Otherwise drop one word so we can append the period.
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > 0 && lastSpace > truncated.length - 20) {
    return `${truncated.slice(0, lastSpace).trim()}.`;
  }
  return truncated;
}

function hashInput(input: SeoInput): string {
  const normalised = JSON.stringify({
    t: clean(input.title),
    s: clean(input.subtitle),
    i: clean(input.intro),
    c: clean(input.content).slice(0, 4000),
    sec: input.section || '',
    k: (input.keywords || []).slice(0, 10).map((k) => k.toLowerCase().trim()),
  });
  return createHash('sha256').update(normalised).digest('hex').slice(0, 24);
}

function cacheAndReturn(key: string, value: SeoOutput): SeoOutput {
  apiCache.set(key, value, CACHE_TTL.VERY_LONG);
  return value;
}
