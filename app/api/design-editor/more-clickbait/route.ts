import { NextRequest, NextResponse } from 'next/server';
import type OpenAI from 'openai';
import { getOpenAIClient, models } from '@/lib/openai';
import { promises as fs } from 'fs';
import path from 'path';

const PROMPT_FILE = path.join(process.cwd(), 'prompts', 'design_editor_more_clickbait.md');

function clip(value: unknown, max: number): string {
  const text = String(value ?? '').trim();
  return text.length > max ? text.slice(0, max).trim() : text;
}

function clipAtWordBoundary(value: unknown, max: number): string {
  const text = String(value ?? '').replace(/\s+/g, ' ').trim();
  if (text.length <= max) return text;
  const sliced = text.slice(0, max);
  const trimmed = sliced.replace(/\s+\S*$/g, '').trim();
  return (trimmed || sliced).replace(/[,:;.!?-]+$/g, '').trim();
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{Diacritic}+/gu, '')
    .replace(/[^a-z0-9æøå\s-]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractJsonBlock(text: string): string {
  const trimmed = text.trim();
  if (trimmed.startsWith('{') && trimmed.endsWith('}')) return trimmed;
  const match = trimmed.match(/\{[\s\S]*\}/);
  return match ? match[0] : '{}';
}

function overlapRatio(a: string, b: string): number {
  const aw = new Set(normalizeText(a).split(' ').filter((w) => w.length > 2));
  const bw = new Set(normalizeText(b).split(' ').filter((w) => w.length > 2));
  if (!aw.size || !bw.size) return 0;
  let common = 0;
  for (const token of aw) {
    if (bw.has(token)) common += 1;
  }
  return common / Math.max(aw.size, bw.size);
}

function isFieldTooClose(nextValue: string, currentValue: string, threshold = 0.82): boolean {
  const n = normalizeText(nextValue);
  const c = normalizeText(currentValue);
  if (!n || !c) return false;
  if (n === c) return true;
  return overlapRatio(n, c) >= threshold;
}

function isTooCloseToOriginal(nextTitle: string, nextExcerpt: string, currentTitle: string, currentExcerpt: string): boolean {
  const titleTooClose = isFieldTooClose(nextTitle, currentTitle, 0.78);
  const excerptTooClose = isFieldTooClose(nextExcerpt, currentExcerpt || '', 0.74);
  return titleTooClose || excerptTooClose;
}

function looksLikeLazyPrefixRewrite(nextTitle: string, currentTitle: string): boolean {
  const n = normalizeText(nextTitle).replace(/^anmeldelse\s*/, '').trim();
  const c = normalizeText(currentTitle).replace(/^anmeldelse\s*/, '').trim();
  const overlap = overlapRatio(n, c);
  return /^anmeldelse\s*[:\-]/i.test(nextTitle.trim()) && overlap > 0.75;
}

function hasDanglingHeadlineEnding(title: string): boolean {
  const trailing = new Set(['med', 'et', 'en', 'at', 'på', 'for', 'og', 'i', 'til', 'som', 'der', 'når', 'hvor']);
  const words = normalizeText(title).split(' ').filter(Boolean);
  if (words.length < 2) return false;
  return trailing.has(words[words.length - 1]);
}

function extractContextSignal(input: { section?: string; topic?: string; content?: string; excerpt?: string; title?: string }): string {
  const corpus = `${input.section || ''} ${input.topic || ''} ${input.title || ''} ${input.excerpt || ''} ${input.content || ''}`.toLowerCase();
  if (/\b(koncert|musik|album|turne|tour|artist)\b/.test(corpus)) return 'musik';
  if (/\b(film|biograf|instruktor|premiere)\b/.test(corpus)) return 'film';
  if (/\b(serie|episode|sæson|streaming|netflix|hbo|prime)\b/.test(corpus)) return 'serie';
  if (/\b(spil|gaming|playstation|xbox|nintendo)\b/.test(corpus)) return 'gaming';
  return 'kultur';
}

function extractSubject(title: string): string {
  const cleaned = title
    .replace(/^anmeldelse\s*[:\-]\s*/i, '')
    .replace(/^review\s*[:\-]\s*/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!cleaned) return '';
  const withoutSuffix = cleaned.split(/:\s/)[0] || cleaned;
  const parts = withoutSuffix.split(/\s[-–—]\s/);
  const base = (parts[0] || withoutSuffix).trim();
  return base
    .replace(/\b(overrasker|løfter|rammer|finder)\b.*$/i, '')
    .replace(/[:\-–—]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function shortenSubject(subject: string): string {
  const s = subject.replace(/\s+/g, ' ').trim();
  if (!s) return s;
  // Remove common venue tail when it dominates width.
  const withoutVenue = s.replace(/\s+i\s+royal\s+arena$/i, '').trim();
  const base = withoutVenue || s;
  if (base.length <= 24) return base;
  const words = base.split(' ').filter(Boolean);
  if (words.length <= 3) return clipAtWordBoundary(base, 24);
  return words.slice(0, 3).join(' ');
}

function rebalanceTitleShape(title: string, originalTitle: string): string {
  const clean = clipAtWordBoundary(title, 70);
  const subject = extractSubject(originalTitle);
  if (!subject) return clean;
  const shortSubject = shortenSubject(subject);
  const normalizedClean = normalizeText(clean);
  const normalizedSubject = normalizeText(subject);
  if (!normalizedClean.startsWith(normalizedSubject)) return clean;

  const remainder = clean
    .slice(subject.length)
    .replace(/^[:\-–—,\s]+/g, '')
    .trim();
  if (!remainder) return clean;

  // Flip structure so the news angle comes first.
  const flipped = clipAtWordBoundary(`${remainder} – ${shortSubject}`, 70);
  return flipped || clean;
}

function extractShortKeyword(text: string): string {
  const tokens = normalizeText(text)
    .split(' ')
    .filter((w) => w.length > 3 && !['med', 'uden', 'efter', 'eller', 'fordi', 'derfor', 'hvor', 'som'].includes(w));
  return tokens.slice(0, 3).join(' ');
}

function splitSentences(text: string): string[] {
  return String(text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

function selectKeySentence(texts: string[], preferredRegex?: RegExp): string {
  const all = texts.flatMap((t) => splitSentences(t));
  if (!all.length) return '';
  if (preferredRegex) {
    const match = all.find((s) => preferredRegex.test(normalizeText(s)));
    if (match) return match;
  }
  return all[0];
}

function pickBySeed<T>(arr: T[], seed: string): T {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return arr[hash % arr.length];
}

function createFallbackClickbait(input: {
  title: string;
  excerpt: string;
  section?: string;
  topic?: string;
  content?: string;
}): { title: string; excerpt: string } {
  const t = input.title.trim();
  const e = input.excerpt.trim();
  const signal = extractContextSignal({ ...input, title: t, excerpt: e });
  const subject = extractSubject(t) || input.topic?.trim() || input.section?.trim() || (signal === 'musik' ? 'koncerten' : 'historien');
  const keyword = extractShortKeyword(`${e} ${input.content || ''}`);
  const keyPoint = selectKeySentence([input.content || '', e], /\b(final|vendepunkt|energi|nærvær|tempo|stærk|svag)\b/);
  const keyPointShort = clip(keyPoint.replace(/[.!?]+$/g, ''), 74);

  const hooksBySignal: Record<string, string[]> = {
    musik: ['rammer sit stærkeste punkt i finalen', 'finder balancen mellem energi og nærvær', 'løfter sig markant undervejs'],
    film: ['finder sin styrke i anden halvdel', 'samler fortællingen i de afgørende scener', 'løfter helheden med stærke valg'],
    serie: ['strammer grebet i de afgørende episoder', 'finder tempoet, når det gælder', 'samler trådene med større tyngde'],
    gaming: ['løfter niveauet under pres', 'finder balancen mellem tempo og præcision', 'vokser i de afgørende sekvenser'],
    kultur: ['finder sit stærkeste greb undervejs', 'samler helheden i et tydeligt vendepunkt', 'løfter indtrykket med skarpere fokus'],
  };

  const titleHook = pickBySeed(hooksBySignal[signal] || hooksBySignal.kultur, `${t}|${input.topic || ''}`);
  const bylinePatterns = [
    keyPointShort ? keyPointShort : '',
    'Efter en ujævn start løfter helheden sig med mere nærvær og retning.',
    'Oplevelsen vinder, når tempo og udtryk endelig finder samme spor.',
    keyword ? `Især ${keyword} bliver et vendepunkt for helhedsindtrykket.` : '',
  ].filter(Boolean);

  const nextTitle = clipAtWordBoundary(`${subject}: ${titleHook}`, 70);
  const nextExcerpt = clipAtWordBoundary(
    pickBySeed(bylinePatterns as string[], `${subject}|${keyword}|${signal}`),
    95
  );
  return { title: nextTitle || clip(t, 70), excerpt: nextExcerpt || clip(e, 95) };
}

function buildCoherentFallbackPair(input: {
  title: string;
  excerpt: string;
  section?: string;
  topic?: string;
  content?: string;
}): { title: string; excerpt: string } {
  const signal = extractContextSignal({
    title: input.title,
    excerpt: input.excerpt,
    section: input.section,
    topic: input.topic,
    content: input.content,
  });
  const subject = extractSubject(input.title) || input.topic?.trim() || input.section?.trim() || 'oplevelsen';
  const keyPoint = selectKeySentence(
    [input.content || '', input.excerpt || ''],
    /\b(final|vendepunkt|energi|nærvær|tempo|stærk|svag|løfter|ujævn)\b/
  );

  const angleBySignal: Record<string, string[]> = {
    musik: ['løfter sig markant, når tempoet skifter', 'finder sit vendepunkt i anden halvdel', 'vinder publikum i finalen'],
    film: ['finder sit greb i anden halvdel', 'løfter sig, når konflikterne strammes', 'rammer hårdt i de afgørende scener'],
    serie: ['strammer grebet i de afgørende afsnit', 'finder tempoet, når det gælder', 'løfter sig efter en ujævn åbning'],
    gaming: ['løfter niveauet under pres', 'finder rytmen i de afgørende sekvenser', 'bliver skarpere, jo længere man spiller'],
    kultur: ['løfter sig efter en ujævn åbning', 'finder nerven i andet akt', 'samler helheden i et klart vendepunkt'],
  };
  const titleAngle = pickBySeed(angleBySignal[signal] || angleBySignal.kultur, `${subject}|${signal}|${input.title}`);
  const title = clipAtWordBoundary(`${subject}: ${titleAngle}`, 70);

  const summarizedKeyPoint = clipAtWordBoundary(
    keyPoint
      ? keyPoint.replace(/\s+/g, ' ').replace(/[.!?]+$/g, '')
      : 'Helheden løfter sig, når tempo og nærvær finder samme spor',
    95
  );
  const excerpt = clipAtWordBoundary(
    summarizedKeyPoint.endsWith('.') ? summarizedKeyPoint : `${summarizedKeyPoint}.`,
    95
  );

  return { title, excerpt };
}

async function generatePair(
  client: OpenAI,
  prompt: string,
  payload: Record<string, unknown>,
  extraInstruction?: string
): Promise<{ title: string; excerpt: string } | null> {
  const completion = await client.chat.completions.create({
    model: models.default,
    temperature: 1,
    max_completion_tokens: 450,
    messages: [
      { role: 'system', content: prompt },
      ...(extraInstruction ? [{ role: 'system' as const, content: extraInstruction }] : []),
      { role: 'user', content: JSON.stringify(payload) },
    ],
  });
  const raw = completion.choices[0]?.message?.content || '{}';
  const parsed = JSON.parse(extractJsonBlock(raw));
  const title = clipAtWordBoundary(parsed.title || '', 70);
  const excerpt = clipAtWordBoundary(parsed.excerpt || '', 95);
  if (!title) return null;
  return { title, excerpt };
}

async function loadPrompt(): Promise<string> {
  try {
    const content = await fs.readFile(PROMPT_FILE, 'utf8');
    return content.trim();
  } catch {
    return 'Rewrite title and excerpt in Danish to be more clickbait but factual. Return strict JSON: {"title":"...","excerpt":"..."}';
  }
}

export async function POST(req: NextRequest) {
  try {
    const { title, excerpt, intro, content, section, topic, rating } = await req.json();
    const currentTitle = clip(title, 140);
    const currentExcerpt = clip(excerpt, 220);
    const sourceIntro = clip(intro, 240);
    const sourceContent = clip(content, 3000);
    const sourceSection = clip(section, 120);
    const sourceTopic = clip(topic, 120);
    const sourceRating = Number(rating || 0);

    if (!currentTitle) {
      return NextResponse.json({ error: 'title is required' }, { status: 400 });
    }

    const client = getOpenAIClient();
    if (!client) {
      const fallback = createFallbackClickbait({
        title: currentTitle,
        excerpt: currentExcerpt,
        section: sourceSection,
        topic: sourceTopic,
        content: sourceContent,
      });
      return NextResponse.json(fallback);
    }

    const prompt = await loadPrompt();

    const payload = {
      title: currentTitle,
      excerpt: currentExcerpt,
      intro: sourceIntro,
      content: sourceContent,
      section: sourceSection,
      topic: sourceTopic,
      rating: sourceRating,
    };

    let generated = await generatePair(client, prompt, payload);
    let nextTitle = generated?.title || currentTitle;
    let nextExcerpt = generated?.excerpt || currentExcerpt;
    nextTitle = rebalanceTitleShape(nextTitle, currentTitle);

    const weak = isTooCloseToOriginal(nextTitle, nextExcerpt, currentTitle, currentExcerpt)
      || looksLikeLazyPrefixRewrite(nextTitle, currentTitle)
      || hasDanglingHeadlineEnding(nextTitle);

    if (weak) {
      generated = await generatePair(
        client,
        prompt,
        payload,
        'Rewrite BOTH title and excerpt from scratch with a new angle. Do NOT start title with "Anmeldelse:". Do not reuse original sentence structure. Keep factual truth and relevance.'
      );
      if (generated) {
        nextTitle = rebalanceTitleShape(generated.title, currentTitle);
        nextExcerpt = generated.excerpt;
      }
    }

    // Final safety net.
    if (
      isTooCloseToOriginal(nextTitle, nextExcerpt, currentTitle, currentExcerpt) ||
      looksLikeLazyPrefixRewrite(nextTitle, currentTitle) ||
      hasDanglingHeadlineEnding(nextTitle)
    ) {
      const fallback = createFallbackClickbait({
        title: currentTitle,
        excerpt: currentExcerpt,
        section: sourceSection,
        topic: sourceTopic,
        content: sourceContent,
      });
      nextTitle = fallback.title;
      nextExcerpt = fallback.excerpt;
    }

    // Hard guarantee: if headline OR byline is still too close, replace both together.
    if (
      isFieldTooClose(nextTitle, currentTitle, 0.68) ||
      isFieldTooClose(nextExcerpt, currentExcerpt, 0.68)
    ) {
      const pair = buildCoherentFallbackPair({
        title: currentTitle,
        excerpt: currentExcerpt,
        section: sourceSection,
        topic: sourceTopic,
        content: sourceContent,
      });
      nextTitle = pair.title;
      nextExcerpt = pair.excerpt;
    }

    nextTitle = rebalanceTitleShape(nextTitle, currentTitle);

    return NextResponse.json({
      title: nextTitle || currentTitle,
      excerpt: nextExcerpt || currentExcerpt,
    });
  } catch (error) {
    console.error('more-clickbait route failed', error);
    return NextResponse.json({ error: 'Failed to generate clickbait copy' }, { status: 500 });
  }
}
