import { retrieveSource, sourceUrl, type RetrievedSource } from '@/lib/factcheck/source-reader';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';

export function extractResearchUrls(text: string): string[] {
  const urls = new Set<string>();
  for (const match of text.matchAll(/https:\/\/[^\s<>"\]]+/g)) {
    try {
      const url = sourceUrl(match[0].replace(/[),.;!?]+$/, ''));
      if (!/(^|\.)(youtube\.com|youtu\.be)$/i.test(url.hostname)) urls.add(url.href);
    } catch { /* Invalid/private URLs are not research sources. */ }
  }
  return [...urls].slice(0, 8);
}

export async function buildResearchBundle(urls: string[], read = retrieveSource): Promise<RetrievedSource[]> {
  const unique = new Map<string, string>();
  for (const raw of urls) {
    try {
      const url = sourceUrl(raw);
      const canonical = canonicalSourceUrl(url.href);
      if (!canonical || unique.has(canonical)) continue;
      // Canonical identity folds www/trailing slashes; never use it as the
      // fetch address. Preserve the first supplied host/path to avoid redirects.
      for (const key of [...url.searchParams.keys()]) {
        if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
      }
      unique.set(canonical, url.href);
      if (unique.size === 8) break;
    } catch { /* Invalid/private URLs must not consume the retrieval budget. */ }
  }
  const results = await Promise.all([...unique.values()].map(async (url, i) => {
    try { return await read(url, `S${i + 1}`); }
    catch { return null; }
  }));
  const sources = results.filter((s): s is RetrievedSource => !!s && s.text.trim().length >= 200);
  if (new Set(sources.map(s => new URL(s.url).hostname.replace(/^www\./, ''))).size < 2) {
    throw new Error('research_sources_unavailable: Mindst to forskellige kildehosts med læsbar tekst kræves. Ingen artikel blev skrevet.');
  }
  return sources;
}

/** Full-text verbatim screen, not a guarantee against plagiarism or paraphrase. */
export function hasCopiedPassage(article: string, source: string, size = 12): boolean {
  return copiedPassage(article, source, size) !== null;
}

/** Exact normalized overlap for actionable rewrite feedback, never an exemption. */
export function copiedPassage(article: string, source: string, size = 12): string | null {
  const words = (text: string) => text.toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]+/gu) || [];
  const a = words(article), s = words(source);
  const phrases = new Set<string>();
  for (let i = 0; i <= s.length - size; i++) phrases.add(s.slice(i, i + size).join(' '));
  for (let i = 0; i <= a.length - size; i++) {
    const phrase = a.slice(i, i + size).join(' ');
    if (phrases.has(phrase)) return phrase;
  }
  return null;
}
