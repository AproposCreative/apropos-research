/**
 * Kerne-logik for "Importér artikel"-templaten.
 *
 * Tager en færdig artikeltekst + de CMS-valgmuligheder der findes i Webflow,
 * og beder OpenAI om en struktureret JSON, der mapper 1:1 til vores interne
 * artikelfelter. Efterbehandler deterministisk (slug, read time, SEO-limits)
 * og indsætter de to brødtekst-billeder naturligt i rich-text-HTML'en i
 * Webflows præcise figure-format.
 */

import type OpenAI from 'openai';
import { models } from '@/lib/openai';
import { buildImageAltText } from '@/lib/images/seo-image-name';
import {
  buildSeoFields,
  calcReadTime,
  countWords,
  deriveSlug,
  stripHtml,
} from '@/lib/articles/seo-utils';

export interface CmsOption {
  id?: string;
  name: string;
  slug?: string;
}

export interface AnalyzeArticleInput {
  articleText: string;
  sections: CmsOption[];
  topics: CmsOption[];
  authors: CmsOption[];
  streamingServices: CmsOption[];
}

/** Rå JSON-struktur som modellen skal returnere. */
export interface ImportAnalysis {
  title: string;
  subtitle: string | null;
  intro: string;
  contentHtml: string;
  seoTitle: string | null;
  metaDescription: string | null;
  section: string | null;
  topicsSelected: string[];
  author: string | null;
  isReview: boolean;
  rating: number | null;
  fotoCredit: string | null;
  streaming_service: string | null;
  festival: string | null;
  location: string | null;
  startDate: string | null;
}

const optionNames = (options: CmsOption[]): string =>
  options
    .map((o) => o?.name)
    .filter((n): n is string => Boolean(n && n.trim()))
    .join(', ') || '(ingen tilgængelige)';

function buildSystemPrompt(input: AnalyzeArticleInput): string {
  return [
    'Du er redaktionel assistent for Apropos Magazine, et dansk kulturmagasin (film, serier, gaming, musik, kultur).',
    'Du får en FÆRDIG artikeltekst, som skal gøres publiceringsklar i Webflow CMS. Du må IKKE opfinde nyt indhold eller ændre fakta — kun strukturere, rydde op i formatering og udfylde metadata.',
    '',
    'Returnér KUN gyldig JSON med præcis disse nøgler:',
    '{',
    '  "title": string,              // skarp, præcis titel (ikke clickbait)',
    '  "subtitle": string|null,      // kort underrubrik hvis det giver mening',
    '  "intro": string,              // 1 fyldig hook-paragraf (ren tekst, ingen HTML)',
    '  "contentHtml": string,        // brødtekst som ren HTML i <p>-afsnit med <strong>/<em> hvor relevant. UDEN titel, UDEN intro, UDEN billeder, UDEN stjerne-linjer',
    '  "seoTitle": string|null,      // max 60 tegn. Ved anmeldelse gerne "Anmeldelse: …"-stil',
    '  "metaDescription": string|null, // max 155 tegn, typisk artiklens første sætning/hook',
    '  "section": string|null,       // VÆLG præcis én fra listen Sektioner',
    '  "topicsSelected": string[],   // 2-3 emner; vælg helst fra listen Emner, ellers korte præcise tags',
    '  "author": string|null,        // VÆLG præcis én fra listen Forfattere hvis muligt',
    '  "isReview": boolean,          // true hvis teksten er en anmeldelse',
    '  "rating": number|null,        // 1-6 KUN ved anmeldelse, ellers null',
    '  "fotoCredit": string|null,    // foto-kredit hvis nævnt i teksten, ellers null',
    '  "streaming_service": string|null, // VÆLG fra listen Streaming hvis relevant, ellers null',
    '  "festival": string|null,      // event/festival-navn hvis relevant, ellers null',
    '  "location": string|null,      // sted hvis relevant (events), ellers null',
    '  "startDate": string|null      // ISO-dato hvis et event har en startdato, ellers null',
    '}',
    '',
    'Regler:',
    '- contentHtml skal bevare al original substans. Ryd kun op i spacing/linjeskift og pak afsnit i <p>…</p>.',
    '- Skriv intro/SEO på dansk i Apropos-tone: præcis, kultiveret, ikke svulstig.',
    '- Vælg ALTID en section og mindst 2 topics.',
    '',
    `Sektioner (vælg én): ${optionNames(input.sections)}`,
    `Emner (vælg 2-3): ${optionNames(input.topics)}`,
    `Forfattere (vælg én): ${optionNames(input.authors)}`,
    `Streaming-tjenester: ${optionNames(input.streamingServices)}`,
  ].join('\n');
}

/** Kald OpenAI og parse den strukturerede JSON. Kaster ved fejl. */
export async function analyzeArticleForImport(
  openai: OpenAI,
  input: AnalyzeArticleInput
): Promise<ImportAnalysis> {
  const completion = await openai.chat.completions.create({
    model: models.default,
    temperature: 0.3,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: buildSystemPrompt(input) },
      { role: 'user', content: input.articleText.slice(0, 24000) },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) {
    throw new Error('Tomt svar fra AI ved analyse af artiklen.');
  }

  let parsed: Partial<ImportAnalysis>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returnerede ugyldig JSON ved import-analyse.');
    parsed = JSON.parse(match[0]);
  }

  return normalizeAnalysis(parsed, input.articleText);
}

function normalizeAnalysis(parsed: Partial<ImportAnalysis>, articleText: string): ImportAnalysis {
  const title = String(parsed.title || '').trim() || deriveTitleFromText(articleText);
  const intro = String(parsed.intro || '').trim() || deriveIntroFromText(articleText);
  const contentHtml = ensureParagraphHtml(String(parsed.contentHtml || '').trim() || articleText);

  const topics = Array.isArray(parsed.topicsSelected)
    ? parsed.topicsSelected.map((t) => String(t).trim()).filter(Boolean)
    : [];

  const ratingRaw = typeof parsed.rating === 'number' ? parsed.rating : Number(parsed.rating);
  const isReview = Boolean(parsed.isReview);
  const rating = isReview && Number.isFinite(ratingRaw) && ratingRaw > 0
    ? Math.min(6, Math.max(1, Math.round(ratingRaw)))
    : null;

  return {
    title,
    subtitle: cleanNullable(parsed.subtitle),
    intro,
    contentHtml,
    seoTitle: cleanNullable(parsed.seoTitle),
    metaDescription: cleanNullable(parsed.metaDescription),
    section: cleanNullable(parsed.section),
    topicsSelected: topics,
    author: cleanNullable(parsed.author),
    isReview,
    rating,
    fotoCredit: cleanNullable(parsed.fotoCredit),
    streaming_service: cleanNullable(parsed.streaming_service),
    festival: cleanNullable(parsed.festival),
    location: cleanNullable(parsed.location),
    startDate: cleanNullable(parsed.startDate),
  };
}

function cleanNullable(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  if (!s || s.toLowerCase() === 'null' || s.toLowerCase() === 'n/a') return null;
  return s;
}

function deriveTitleFromText(text: string): string {
  const firstLine = stripHtml(text).split(/\n|\.\s/).map((l) => l.trim()).find(Boolean) || 'Importeret artikel';
  return firstLine.slice(0, 110);
}

function deriveIntroFromText(text: string): string {
  const firstParagraph = stripHtml(text)
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .find((p) => p.length > 40) || stripHtml(text).slice(0, 280);
  return firstParagraph.trim();
}

/**
 * Sørg for at brødteksten er gyldig HTML i <p>-afsnit. Hvis modellen
 * returnerede ren tekst (ingen tags), pakkes hvert afsnit i <p>.
 */
export function ensureParagraphHtml(input: string): string {
  const text = (input || '').trim();
  if (!text) return '';
  if (/<(p|h[1-6]|ul|ol|figure|blockquote)\b/i.test(text)) {
    return text;
  }
  return text
    .split(/\n{2,}/)
    .map((para) => para.trim())
    .filter(Boolean)
    .map((para) => `<p>${escapeHtml(para).replace(/\n/g, '<br>')}</p>`)
    .join('');
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Indsæt 2 brødtekst-billeder naturligt (ca. 1/3 og 2/3 nede) i Webflows
 * præcise rich-text figure-format. Falder tilbage til at appende billederne
 * hvis HTML'en ikke har nok afsnits-grænser.
 */
export function insertBodyImagesIntoHtml(
  html: string,
  imageUrls: string[],
  meta: { altBase?: string | null; credit?: string | null }
): string {
  const urls = imageUrls.filter(Boolean);
  if (!urls.length) return html;

  const figures = urls.map((url, i) =>
    buildFigure(url, buildImageAltText({
      seoTitle: meta.altBase || null,
      articleTitle: meta.altBase || null,
      role: `inline-0${i + 1}`,
    }), meta.credit || null)
  );

  // Find <p>…</p> blokke at indsætte imellem.
  const paragraphs = html.match(/<p\b[\s\S]*?<\/p>/gi);
  if (!paragraphs || paragraphs.length < 2) {
    return `${html}\n${figures.join('\n')}`;
  }

  const total = paragraphs.length;
  // Indsæt EFTER disse paragraf-indekser (ca. 1/3 og 2/3 nede).
  const insertAfter = [
    Math.max(0, Math.floor(total / 3) - 1),
    Math.max(1, Math.floor((total * 2) / 3) - 1),
  ];

  let result = html;
  // Indsæt bagfra så tidligere indeks ikke forskydes.
  const insertions = figures
    .map((figure, i) => ({ figure, afterIndex: insertAfter[i] }))
    .filter((x) => x.afterIndex !== undefined)
    .sort((a, b) => b.afterIndex - a.afterIndex);

  for (const { figure, afterIndex } of insertions) {
    const anchor = paragraphs[afterIndex];
    if (!anchor) continue;
    const pos = result.indexOf(anchor);
    if (pos === -1) continue;
    const end = pos + anchor.length;
    result = `${result.slice(0, end)}\n${figure}\n${result.slice(end)}`;
  }

  return result;
}

function buildFigure(url: string, alt: string, credit: string | null): string {
  const caption = credit && credit.trim() ? `<figcaption>${escapeHtml(credit.trim())}</figcaption>` : '';
  return (
    '<figure class="w-richtext-figure-type-image w-richtext-align-center" data-rt-type="image" data-rt-align="center">' +
    `<div><img alt="${escapeHtml(alt)}" src="${url}" width="auto" height="auto" loading="lazy"></div>` +
    caption +
    '</figure>'
  );
}

export interface BuildArticleUpdateInput {
  analysis: ImportAnalysis;
  heroImageUrl: string;
  mobileImageUrl?: string | null;
  bodyImageUrls: string[];
}

export interface ImportArticleUpdate {
  title: string;
  slug: string;
  subtitle?: string;
  intro: string;
  content: string;
  seoTitle: string;
  seoDescription: string;
  readTime: number;
  wordCount: number;
  category?: string;
  section?: string;
  topicsSelected?: string[];
  tags?: string[];
  author?: string;
  rating?: number;
  featuredImage: string;
  mobileImage?: string;
  fotoCredit?: string;
  streaming_service?: string;
  platform?: string;
  festival?: string;
  location?: string;
  startDate?: string;
  aiGenerated: boolean;
  imageSourceUrls?: string[];
}

/**
 * Saml den endelige `articleUpdate`: indsæt body-billeder, sæt hero som
 * featuredImage og bereg deterministiske felter (slug, read time, SEO).
 */
export function buildImportArticleUpdate(input: BuildArticleUpdateInput): ImportArticleUpdate {
  const { analysis, heroImageUrl, mobileImageUrl, bodyImageUrls } = input;

  const contentWithImages = insertBodyImagesIntoHtml(analysis.contentHtml, bodyImageUrls, {
    altBase: analysis.seoTitle || analysis.title,
    credit: analysis.fotoCredit,
  });

  const wordCount = countWords(`${analysis.intro} ${analysis.contentHtml}`);
  const readTime = calcReadTime(wordCount);
  const slug = deriveSlug(analysis.title) || `artikel-${Date.now().toString(36)}`;

  const { seoTitle, seoDescription } = buildSeoFields({
    title: analysis.title,
    subtitle: analysis.subtitle,
    intro: analysis.intro,
    content: analysis.contentHtml,
    seoTitle: analysis.seoTitle,
    seoDescription: analysis.metaDescription,
  });

  const tags = Array.from(
    new Set([
      ...(analysis.section ? [analysis.section] : []),
      ...analysis.topicsSelected,
    ].filter(Boolean))
  );

  const update: ImportArticleUpdate = {
    title: analysis.title,
    slug,
    intro: analysis.intro,
    content: contentWithImages,
    seoTitle,
    seoDescription,
    readTime,
    wordCount,
    featuredImage: heroImageUrl,
    topicsSelected: analysis.topicsSelected,
    tags,
    aiGenerated: false,
    imageSourceUrls: [heroImageUrl, ...bodyImageUrls].filter(Boolean),
  };

  if (analysis.subtitle) update.subtitle = analysis.subtitle;
  if (analysis.section) {
    update.category = analysis.section;
    update.section = analysis.section;
  }
  if (analysis.author) update.author = analysis.author;
  if (analysis.rating) update.rating = analysis.rating;
  if (mobileImageUrl) update.mobileImage = mobileImageUrl;
  if (analysis.fotoCredit) update.fotoCredit = analysis.fotoCredit;
  if (analysis.streaming_service) {
    update.streaming_service = analysis.streaming_service;
    update.platform = analysis.streaming_service;
  }
  if (analysis.festival) update.festival = analysis.festival;
  if (analysis.location) update.location = analysis.location;
  if (analysis.startDate) update.startDate = analysis.startDate;

  return update;
}
