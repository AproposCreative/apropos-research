/**
 * Liv Brandt — artikel-generator.
 *
 * Sammensætter Liv's prompt (`data/author-prompts/liv-brandt.txt`) med en
 * kort kontekst fra det valgte trending-emne og kalder OpenAI direkte
 * (vi vil ikke gå gennem `/api/ai-chat` som er bygget til chat-flow).
 *
 * Returnerer en struktureret artikel klar til Webflow-publish + SEO-modul.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { getOpenAIClient, models } from '@/lib/openai';
import { logger } from '@/lib/logger';
import type { PickedTopic } from '@/lib/liv/pick-topic';
import { generateSeoMetaAI } from '@/lib/seo/generate-seo-meta';

export interface GeneratedArticle {
  title: string;
  subtitle: string;
  intro: string;
  content: string;
  slug: string;
  excerpt: string;
  section: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  primaryKeyword?: string;
  rawResponse: string;
}

let _livPromptCache: string | null = null;
async function loadLivPrompt(): Promise<string> {
  if (_livPromptCache) return _livPromptCache;
  const file = path.join(process.cwd(), 'data', 'author-prompts', 'liv-brandt.txt');
  try {
    _livPromptCache = await fs.readFile(file, 'utf8');
  } catch (e) {
    logger.warn('[liv/generate-article] could not load liv-brandt prompt — using fallback');
    _livPromptCache = 'Du er Liv Brandt, en feministisk dansk kulturkritiker. Skriv poetisk og ærligt.';
  }
  return _livPromptCache!;
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/æ/g, 'ae')
    .replace(/ø/g, 'oe')
    .replace(/å/g, 'aa')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 100)
    .replace(/^-|-$/g, '');
}

interface ParsedSections {
  title: string;
  subtitle: string;
  intro: string;
  content: string;
}

function parseStructuredResponse(raw: string): ParsedSections {
  const text = raw.trim();
  const labelMatch = (label: string) =>
    new RegExp(`^\\s*${label}\\s*[:\\-–—]\\s*(.+)$`, 'im').exec(text);

  const titleMatch = labelMatch('title') || labelMatch('titel');
  const subtitleMatch = labelMatch('subtitle') || labelMatch('undertitel');

  let title = titleMatch?.[1]?.trim() || '';
  let subtitle = subtitleMatch?.[1]?.trim() || '';

  // Brødtekst kan være markeret med "Brødtekst:" eller "BRØDTEKST:" — split der.
  const brodMarker = /^\s*br[øo]dtekst\s*[:\-–—]?\s*$/im;
  const brodIdx = text.search(brodMarker);
  let intro = '';
  let content = '';

  if (brodIdx >= 0) {
    const before = text.slice(0, brodIdx);
    const after = text.slice(brodIdx).replace(brodMarker, '').trim();
    const introMatch =
      labelMatch('intro') || labelMatch('indledning') || /^Intro\s*[:\-–—]\s*(.+)$/im.exec(before);
    if (introMatch) {
      intro = introMatch[1].trim();
    } else {
      // Tag første hele paragraf før brødtekst-markøren.
      const firstParagraph = before
        .replace(/^\s*(?:title|titel|subtitle|undertitel)\s*[:\-–—].*$/gim, '')
        .split(/\n{2,}/)
        .map((p) => p.trim())
        .find(Boolean);
      intro = firstParagraph || '';
    }
    content = after;
  } else {
    // Ingen explicit markør — brug første afsnit som intro, resten som content.
    const cleaned = text
      .replace(/^\s*(?:title|titel|subtitle|undertitel)\s*[:\-–—].*$/gim, '')
      .replace(/^\s*intro\s*[:\-–—]\s*/im, '')
      .trim();
    const paragraphs = cleaned.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean);
    intro = paragraphs[0] || '';
    content = paragraphs.slice(1).join('\n\n');
  }

  // Hvis ingen titel er parseret, brug første ikke-tomme linje.
  if (!title) {
    const firstLine = text.split(/\n/).map((l) => l.trim()).find(Boolean) || '';
    title = firstLine.replace(/^[#*\s]+/, '').slice(0, 120);
  }

  return { title, subtitle, intro, content };
}

export interface GenerateArticleOptions {
  topic: PickedTopic;
  /** Webflow section/category til at sætte. Default "Kultur". */
  section?: string;
}

/**
 * Step 1 — destillér kildens uddrag til en neutral fakta-bullet-liste.
 * Vi separerer "fakta" fra "tekst" så Liv aldrig ser kildens
 * sætningsstruktur eller dramaturgiske åbning. Det er den vigtigste
 * defense-in-depth mod paraphrasing-plagiat.
 */
async function extractFactsFromSource(opts: {
  client: ReturnType<typeof getOpenAIClient>;
  sourceTitle: string;
  sourceExcerpt?: string;
  sourceName?: string;
}): Promise<string[]> {
  if (!opts.client || !opts.sourceExcerpt) return [];
  const trimmed = opts.sourceExcerpt.slice(0, 1500);

  try {
    const res = await opts.client.chat.completions.create({
      model: 'gpt-4o-mini',
      temperature: 0.1,
      max_completion_tokens: 600,
      messages: [
        {
          role: 'system',
          content: [
            'Du er en research-assistent. Du må KUN udtrække neutrale fakta.',
            'Returnér 4–10 punkter i formatet "- <fakta i ÉN kort sætning>".',
            'Skriv på dansk. Hver bullet skal være:',
            '- Selvstændig, kontekst-fri, neutralt formuleret.',
            '- Ingen citater, ingen vendinger fra originalteksten.',
            '- Ingen vurderinger, dramatik eller stilistiske greb.',
            'Hvis et fakta er usikkert, udelad det.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: `Kilde: ${opts.sourceName || 'ukendt'} — "${opts.sourceTitle}"\n\nUddrag:\n${trimmed}\n\nUdtræk fakta:`,
        },
      ],
    });
    const text = res.choices[0]?.message?.content?.trim() || '';
    return text
      .split(/\n+/)
      .map((l) => l.replace(/^\s*[-*•]\s*/, '').trim())
      .filter((l) => l.length >= 8);
  } catch (e) {
    logger.warn('[liv/generate-article] fact extraction failed — vi falder tilbage til kun titel', {
      err: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

export async function generateLivArticle(options: GenerateArticleOptions): Promise<GeneratedArticle> {
  const { topic, section = 'Kultur' } = options;
  const client = getOpenAIClient();
  if (!client) {
    throw new Error('OPENAI_API_KEY mangler — kan ikke generere Liv-artikel.');
  }

  const livPrompt = await loadLivPrompt();

  // Step 1: Destillér kilden til neutrale fakta. Liv ser ALDRIG selve uddraget.
  const facts = await extractFactsFromSource({
    client,
    sourceTitle: topic.source?.title || topic.title,
    sourceExcerpt: topic.source?.excerpt,
    sourceName: topic.source?.sourceName,
  });

  const systemPrompt = [
    livPrompt,
    '',
    '— STRUKTUR —',
    'Returnér artiklen i dette format (præcist, uden ekstra forklaring):',
    'Title: <max 60 tegn, fængende, dansk>',
    'Subtitle: <8-14 ord, poetisk eller reflekterende>',
    'Intro: <2-4 sætninger, sanselig åbning der trækker læseren ind>',
    'Brødtekst:',
    '<7-12 fyldige paragraffer i Liv Brandts stil — sanselige, ærlige, med holdning. Brug \\n\\n mellem paragraffer.>',
    '',
    'Krav:',
    '- Skriv på dansk.',
    '- Mindst 600 ord i brødteksten.',
    '- Ingen overskrifter (h1/h2) — kun løbende tekst.',
    '- Ingen markdown-syntax (* _ # `).',
    '- Vær præcis med fakta — opfind ikke navne, datoer eller citater.',
    '',
    '— ANTI-PLAGIAT —',
    'Disse regler er ABSOLUTTE og overrider alt andet:',
    '- Du må kun bruge fakta fra punkterne nedenfor. Du må IKKE genbruge formuleringer.',
    '- Find en HELT anden vinkel end en typisk nyhedsartikel om emnet.',
    '- Åbn IKKE med "Der tegner sig et mønster", "Endnu en gang", "X er aflyst", "Det startede med…" eller andre standardiserede nyhedsåbninger.',
    '- Åbn med en personlig observation, en sansning, en metafor eller et spørgsmål — aldrig en faktum-opremsning.',
    '- Bring fakta i en anden RÆKKEFØLGE end en lineær nyhedsfortælling. Spred dem ud i refleksioner.',
    '- Hvis et faktum kan udelades uden at miste essensen, så udelad det.',
  ].join('\n');

  const factsBlock = facts.length > 0
    ? facts.map((f) => `- ${f}`).join('\n')
    : '(Ingen ekstra fakta tilgængelige — skriv på baggrund af titlen alene og dine egne refleksioner.)';

  const userPrompt = [
    `Emne: ${topic.title}`,
    '',
    'Brug KUN følgende fakta som råmateriale (du må omformulere alt — du må aldrig kopiere ordlyd):',
    factsBlock,
    '',
    'Vinkel: Brug Liv\'s personlige, sanselige stemme. Tag stilling. Reflektér over samtid, identitet eller femininitet hvor relevant.',
    'Begynd ikke artiklen med samme rytme eller åbningsfigur som en typisk nyhedsartikel om emnet ville bruge.',
  ].join('\n');

  const completion = await client.chat.completions.create({
    model: models.default,
    temperature: 0.85,
    max_completion_tokens: 4000,
    messages: [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt },
    ],
  });

  const raw = completion.choices[0]?.message?.content?.trim() || '';
  if (!raw) {
    throw new Error('OpenAI returnerede tom respons.');
  }

  const parsed = parseStructuredResponse(raw);
  if (!parsed.title || !parsed.content) {
    throw new Error('Kunne ikke parse title/brødtekst fra OpenAI-respons.');
  }

  const slug = slugify(parsed.title);
  const excerpt = (parsed.intro || parsed.content)
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 220);

  // Generér AI-baseret SEO/meta i samme operation — bruger gpt-4o-mini (billigt).
  const seo = await generateSeoMetaAI({
    title: parsed.title,
    subtitle: parsed.subtitle,
    intro: parsed.intro,
    content: parsed.content,
    section,
    keywords: topic.tags,
  });

  return {
    title: parsed.title,
    subtitle: parsed.subtitle,
    intro: parsed.intro,
    content: parsed.content,
    slug,
    excerpt,
    section,
    tags: topic.tags?.slice(0, 8) || [],
    seoTitle: seo.seoTitle,
    seoDescription: seo.seoDescription,
    primaryKeyword: seo.primaryKeyword,
    rawResponse: raw,
  };
}
