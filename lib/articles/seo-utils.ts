/**
 * Genbrugelige SEO/slug-helpers til artikel-oprettelse.
 *
 * Bygger oven på `lib/seo/*` (limits + smart heuristik) men samler de
 * deterministiske helpers (slug, read time, word count) ét sted, så både
 * AI Writer-chatten og "Importér artikel"-flowet kan dele dem.
 */

import { generateSeoMetaSmart } from '@/lib/seo/generate-seo-meta';
import {
  SEO_DESCRIPTION_MAX,
  SEO_TITLE_MAX,
} from '@/lib/seo/constants';

export { SEO_TITLE_MAX, SEO_DESCRIPTION_MAX } from '@/lib/seo/constants';

/** Webflow `minutes-to-read` feltgrænser (min 1, max 30). */
export const READ_TIME_MIN = 1;
export const READ_TIME_MAX = 30;

/** Gennemsnitlig dansk læsehastighed (ord pr. minut). */
const WORDS_PER_MINUTE = 200;

/** Kebab-slug fra titel — translittererer æøå og fjerner diakritik. */
export function deriveSlug(input: string): string {
  return (input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
    .replace(/^-|-$/g, '');
}

/** Tæl ord i ren tekst (HTML strippes først). */
export function countWords(input: string): number {
  return stripHtml(input)
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

/** Beregn læsetid i minutter ud fra ordantal, clampet til Webflow-grænser. */
export function calcReadTime(wordCount: number): number {
  const minutes = Math.ceil((wordCount || 0) / WORDS_PER_MINUTE);
  return clampReadTime(minutes);
}

export function clampReadTime(minutes: number): number {
  if (!Number.isFinite(minutes)) return READ_TIME_MIN;
  return Math.min(READ_TIME_MAX, Math.max(READ_TIME_MIN, Math.round(minutes)));
}

/** Strip HTML-tags til ren tekst (til word count, intro-udledning og SEO). */
export function stripHtml(input: string): string {
  return (input || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Byg seoTitle/seoDescription med ordgrænse-trunkering. Modellen leverer
 * gerne sine egne forslag; her sikrer vi at limits altid overholdes og at
 * tomme felter får et fornuftigt fallback.
 */
export function buildSeoFields(args: {
  title?: string | null;
  subtitle?: string | null;
  intro?: string | null;
  content?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}): { seoTitle: string; seoDescription: string } {
  const smart = generateSeoMetaSmart({
    title: args.title || null,
    subtitle: args.subtitle || null,
    intro: args.intro || null,
    content: args.content ? stripHtml(args.content) : null,
  });

  const seoTitle = clampLength(
    (args.seoTitle && args.seoTitle.trim()) || smart.seoTitle || args.title || '',
    SEO_TITLE_MAX
  );
  const seoDescription = clampLength(
    (args.seoDescription && args.seoDescription.trim()) || smart.seoDescription || args.intro || '',
    SEO_DESCRIPTION_MAX
  );

  return { seoTitle, seoDescription };
}

/** Trunkér ved ordgrænse uden at efterlade "..." midt i et ord. */
export function clampLength(input: string, max: number): string {
  const text = (input || '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const slice = text.slice(0, max + 1);
  const lastSpace = slice.lastIndexOf(' ', max);
  const cut = lastSpace > Math.floor(max * 0.5) ? slice.slice(0, lastSpace) : text.slice(0, max);
  return cut.trim().replace(/[,;:–—-]+$/, '').trim();
}
