/**
 * DK → EN editorial translation for Webflow CMS (Apropos English voice).
 */

import fs from 'fs';
import path from 'path';
import type OpenAI from 'openai';
import { models } from '@/lib/openai';
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
  const name = String(parsed.name || parsed.title || dk.name || '').trim();
  const content = String(parsed.content || '').trim();
  const intro = String(parsed.intro || '').trim();
  const subtitle = parsed.subtitle != null ? String(parsed.subtitle).trim() || null : null;

  const seo = buildSeoFields({
    title: name,
    subtitle,
    intro,
    content,
    seoTitle: parsed.seoTitle != null ? String(parsed.seoTitle) : null,
    seoDescription: parsed.metaDescription != null ? String(parsed.metaDescription) : null,
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
    fotoCredit: parsed.fotoCredit != null ? String(parsed.fotoCredit).trim() || null : null,
    location: parsed.location != null ? String(parsed.location).trim() || null : null,
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

  const completion = await openai.chat.completions.create({
    model: models.default,
    temperature: 0.35,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: loadSystemPrompt() },
      {
        role: 'user',
        content: `Translate this Danish Apropos Magazine article to English. Input JSON:\n${userPayload.slice(0, 48000)}`,
      },
    ],
  });

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

  return normalizeTranslation(parsed, dkFieldData);
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
