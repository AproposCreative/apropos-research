import fs from 'node:fs';
import path from 'node:path';

export interface AproposStyleSample {
  id: string;
  title: string;
  subtitle?: string;
  author: string;
  category: string;
  intro: string;
  bodyText: string;
  date: string;
  wordCount: number;
  slug?: string;
  seoTitle?: string;
  metaDescription?: string;
  rating?: number | null;
  platform?: string;
  topic?: string;
  readTime?: number | null;
}

const SAMPLES_PATH = path.resolve(process.cwd(), 'data', 'apropos-style-samples.jsonl');

let _cache: AproposStyleSample[] | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5 * 60 * 1000;

function loadAll(): AproposStyleSample[] {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) return _cache;

  try {
    if (!fs.existsSync(SAMPLES_PATH)) return [];
    const content = fs.readFileSync(SAMPLES_PATH, 'utf8');
    const samples: AproposStyleSample[] = [];
    for (const line of content.split('\n')) {
      if (!line.trim()) continue;
      try {
        samples.push(JSON.parse(line));
      } catch {}
    }
    _cache = samples;
    _cacheTime = now;
    return samples;
  } catch {
    return [];
  }
}

export function invalidateStyleCache(): void {
  _cache = null;
  _cacheTime = 0;
}

/**
 * Get relevant Apropos style samples for the given category/topic.
 * Returns 2-3 samples that match the category, falling back to random if none match.
 */
export function getRelevantStyleSamples(
  category?: string,
  maxSamples = 3
): AproposStyleSample[] {
  const all = loadAll();
  if (all.length === 0) return [];

  const needle = (category || '').toLowerCase().trim();

  if (needle) {
    const matched = all.filter((s) => {
      const cat = (s.category || '').toLowerCase();
      return cat.includes(needle) || needle.includes(cat);
    });

    if (matched.length >= maxSamples) {
      return pickRandom(matched, maxSamples);
    }
    if (matched.length > 0) {
      const remaining = maxSamples - matched.length;
      const others = all.filter((s) => !matched.includes(s));
      return [...matched, ...pickRandom(others, remaining)];
    }
  }

  return pickRandom(all, maxSamples);
}

/**
 * Build a compact style reference string for inclusion in a system prompt.
 * Includes article text samples AND SEO/CMS field examples so the AI learns
 * real patterns for titles, meta-descriptions, subtitles, etc.
 */
export function buildStyleReferenceBlock(
  category?: string,
  maxSamples = 3
): string {
  const samples = getRelevantStyleSamples(category, maxSamples);
  if (samples.length === 0) return '';

  const parts = [
    `\n**APROPOS MAGAZINE SKRIVESTIL (STIL-EKSEMPLER FRA PUBLICEREDE ARTIKLER):**`,
    `Brug nedenstående som reference for tone, sætningsrytme, intro-opbygning, SEO-felter og generel skrivestil.`,
    `Kopier IKKE direkte — lad stilen inspirere din egen tekst.\n`,
  ];

  for (let i = 0; i < samples.length; i++) {
    const s = samples[i];
    const introExcerpt = s.intro ? s.intro.slice(0, 250) : s.bodyText.slice(0, 250);
    const bodyExcerpt = s.bodyText.slice(0, 400);

    parts.push(`--- Eksempel ${i + 1} (${s.category || 'Generel'}, af ${s.author}) ---`);
    parts.push(`Titel: "${s.title}"`);
    if (s.subtitle) parts.push(`Undertitel: "${s.subtitle}"`);
    if (s.seoTitle) parts.push(`SEO-titel: "${s.seoTitle}"`);
    if (s.metaDescription) parts.push(`Meta-beskrivelse: "${s.metaDescription}"`);
    if (s.platform) parts.push(`Platform: ${s.platform}`);
    if (s.rating != null) parts.push(`Stjerner: ${s.rating}/6`);
    if (introExcerpt) parts.push(`Intro: ${introExcerpt}${introExcerpt.length >= 250 ? '…' : ''}`);
    parts.push(`Brødtekst (uddrag): ${bodyExcerpt}${bodyExcerpt.length >= 400 ? '…' : ''}`);
    parts.push('');
  }

  return parts.join('\n');
}

function pickRandom<T>(arr: T[], n: number): T[] {
  if (arr.length <= n) return [...arr];
  const copy = [...arr];
  const result: T[] = [];
  for (let i = 0; i < n; i++) {
    const idx = Math.floor(Math.random() * copy.length);
    result.push(copy.splice(idx, 1)[0]);
  }
  return result;
}
