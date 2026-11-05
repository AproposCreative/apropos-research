/**
 * DK → EN editorial translation for Webflow CMS (Apropos English voice).
 */

import fs from 'fs';
import path from 'path';
import { load } from 'cheerio';
import type OpenAI from 'openai';
import { ARTICLE_TRANSLATION_MODEL, ARTICLE_TRANSLATION_OUTPUT_LIMIT } from '@/lib/articles/translation-policy';
import { assertEnglishProse, richTextStructure } from '@/lib/articles/english-language';
import { containsLongDash, isReviewText } from '@/lib/editorial/review-typography';
import {
  buildSeoFields,
  calcReadTime,
  countWords,
  deriveSlug,
  stripHtml,
  clampLength,
  SEO_TITLE_MAX,
  SEO_DESCRIPTION_MAX,
} from '@/lib/articles/seo-utils';

export interface EnglishTranslation {
  name: string;
  slug: string;
  subtitle: string | null;
  intro: string;
  content: string;
  seoTitle: string;
  metaDescription: string;
  fotoCredit: string | null;
  location: string | null;
  minutesToRead: number;
}

function loadSystemPrompt(): string {
  const p = path.join(process.cwd(), 'prompts', 'apropos_english_translator.prompt');
  try {
    return fs.readFileSync(p, 'utf8').trim();
  } catch {
    return 'You are an editorial translator for Apropos Magazine. Return JSON only.';
  }
}

function strField(fd: Record<string, unknown>, key: string): string {
  const v = fd[key];
  return typeof v === 'string' ? v.trim() : '';
}

function reviewPunctuation(value: string, html: boolean): string {
  if (!containsLongDash(value)) return value;
  const replace = (text: string) => text.replace(/(\d)\s*[\u2013\u2014]\s*(?=\d)/gu, '$1 to ')
    .replace(/\s*[\u2013\u2014]\s*/gu, ', ');
  if (!html) return replace(value.replace(/&(?:[mn]dash|#821[12]|#x201[34]);/giu, '\u2014'));
  const $ = load(value);
  const elements = $('body').add($('body *').not('script, style, script *, style *'));
  elements.contents().each((_index, node) => { if (node.type === 'text') node.data = replace(node.data); });
  $('img[alt]').each((_index, node) => { $(node).attr('alt', replace($(node).attr('alt') || '')); });
  return $('body').html() ?? value;
}

function buildUserPayload(dk: Record<string, unknown>): string {
  const imageUrls = [...String(dk.content || '').matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) => m[1]);
  return JSON.stringify(
    {
      name: strField(dk, 'name'),
      subtitle: strField(dk, 'subtitle') || null,
      intro: strField(dk, 'intro'),
      content: strField(dk, 'content'),
      seoTitle: strField(dk, 'seo-title') || null,
      metaDescription: strField(dk, 'meta-description') || null,
      fotoCredit: strField(dk, 'foto-credit') || null,
      location: strField(dk, 'location') || null,
      stjerne: typeof dk.stjerne === 'number' ? dk.stjerne : null,
      presseakkreditering: dk.presseakkreditering === true,
      preserveImageSrcUrls: imageUrls,
    },
    null,
    2
  );
}

function normalizeTranslation(
  parsed: Partial<EnglishTranslation> & Record<string, unknown>,
  dk: Record<string, unknown>
): EnglishTranslation {
  const review = isReviewText({ title: dk.name, rating: dk.stjerne });
  const clean = (value: unknown, html = false) => {
    const text = String(value ?? '').trim();
    return review ? reviewPunctuation(text, html) : text;
  };
  const name = clean(parsed.name || parsed.title || dk.name);
  const content = clean(parsed.content, true);
  const intro = clean(parsed.intro);
  const subtitle = clean(parsed.subtitle) || null;

  const seo = buildSeoFields({
    title: name,
    subtitle,
    intro,
    content,
    seoTitle: clean(parsed.seoTitle) || null,
    seoDescription: clean(parsed.metaDescription) || null,
  });

  const slug = deriveSlug(String(parsed.slug || name || ''));
  const wordCount = countWords(`${intro} ${stripHtml(content)}`);

  return {
    name,
    slug: slug || deriveSlug(name),
    subtitle,
    intro,
    content,
    seoTitle: clampLength(seo.seoTitle, SEO_TITLE_MAX),
    metaDescription: clampLength(seo.seoDescription, SEO_DESCRIPTION_MAX),
    fotoCredit: clean(parsed.fotoCredit) || null,
    location: clean(parsed.location) || null,
    minutesToRead: calcReadTime(wordCount),
  };
}

/** Kald OpenAI og returnér struktureret EN-oversættelse. */
export async function translateArticleToEnglish(
  openai: OpenAI,
  dkFieldData: Record<string, unknown>
): Promise<EnglishTranslation> {
  const userPayload = buildUserPayload(dkFieldData);
  if (!strField(dkFieldData, 'name') && !strField(dkFieldData, 'content')) {
    throw new Error('Artiklen mangler titel og indhold at oversætte.');
  }

  if (userPayload.length > 48000) throw new Error('Artiklen er for lang til én oversættelse. Kilden er ikke ændret.');

  const completion = await openai.chat.completions.create({
    model: ARTICLE_TRANSLATION_MODEL,
    max_completion_tokens: ARTICLE_TRANSLATION_OUTPUT_LIMIT,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: `${loadSystemPrompt()}\nIn reviews, never use U+2013 or U+2014 in prose or metadata. Use standard sentence punctuation and spell out numerical ranges.` },
      {
        role: 'user',
        content: `Translate this Danish Apropos Magazine article to English. Input JSON:\n${userPayload}`,
      },
    ],
  }, { maxRetries: 0, timeout: 60000 });
  if (completion.choices[0]?.finish_reason !== 'stop') throw new Error('Oversættelsen blev ikke færdig. CMS er ikke ændret.');

  const raw = completion.choices[0]?.message?.content?.trim();
  if (!raw) throw new Error('Tomt svar fra AI ved oversættelse.');

  let parsed: Partial<EnglishTranslation> & Record<string, unknown>;
  try {
    parsed = JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('AI returnerede ugyldig JSON ved oversættelse.');
    parsed = JSON.parse(match[0]);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed) ||
    typeof parsed.name !== 'string' || !parsed.name.trim() ||
    typeof parsed.content !== 'string' || !parsed.content.trim() ||
    (strField(dkFieldData, 'intro') && (typeof parsed.intro !== 'string' || !parsed.intro.trim()))) {
    throw new Error('Oversættelsen mangler nødvendige tekstfelter. CMS er ikke ændret.');
  }
  const translation = normalizeTranslation(parsed, dkFieldData);
  const fields = buildEnglishFieldData(dkFieldData, translation);
  assertEnglishProse(dkFieldData, fields);
  if (richTextStructure(strField(dkFieldData, 'content')) !== richTextStructure(translation.content)) {
    throw new Error('Oversættelsen ændrede artiklens struktur, links eller billeder.');
  }
  return translation;
}

/** CMS-felter der kopieres uændret fra DK (referencer, billeder, metadata). */
const COPY_KEYS = [
  'thumb',
  'mobile-image',
  'section',
  'topic',
  'topics',
  'author',
  'stjerne',
  'presseakkreditering',
  'festival',
  'simple-rerfence',
  'muiltiref',
  'watch-now-link',
  'featured',
  'video-trailer',
  'start-dato',
  'slut-dato',
  'buy-tickets',
  'unique-watch-now-title',
  'unique-stream-now-cover',
  'unique-label-for-tickets',
  'ai-generated',
] as const;

/** Byg Webflow fieldData til EN-locale: oversatte tekster + kopierede refs/billeder. */
export function buildEnglishFieldData(
  dk: Record<string, unknown>,
  en: EnglishTranslation
): Record<string, unknown> {
  const out: Record<string, unknown> = {
    name: en.name,
    slug: en.slug,
    intro: en.intro,
    content: en.content,
    'seo-title': en.seoTitle,
    'meta-description': en.metaDescription,
    'minutes-to-read': en.minutesToRead,
  };

  if (en.subtitle) out.subtitle = en.subtitle;
  if (en.fotoCredit) out['foto-credit'] = en.fotoCredit;
  if (en.location) out.location = en.location;

  for (const key of COPY_KEYS) {
    if (dk[key] !== undefined && dk[key] !== null && dk[key] !== '') {
      out[key] = dk[key];
    }
  }

  return out;
}
