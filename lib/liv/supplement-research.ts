import { getResearch } from '@/lib/research/service';
import { livModels } from '@/lib/liv/model-config';
import { retrieveSource, sourceUrl } from '@/lib/factcheck/source-reader';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';
import type { GeneratedArticle } from './generate-article';

/** One bounded evidence-only supplement. Search snippets/dates are leads, not
 * evidence. Actual pages are fetched again by the final fact checker. */
export async function supplementLivResearch(article: GeneratedArticle, topic: string): Promise<GeneratedArticle> {
  if (article.researchSupplementedAt) return article;
  const existing = article.researchSources || [];
  if (existing.length > 8) throw new Error('liv_research_supplement_source_limit');
  if (existing.length === 8) return { ...article, researchSupplementedAt: new Date().toISOString() };
  const identities = new Set(existing.flatMap(source => {
    try { return source.url ? [canonicalSourceUrl(sourceUrl(source.url).href)] : []; } catch { return []; }
  }));
  const hosts = [...new Set(existing.flatMap(source => {
    try { return source.url ? [sourceUrl(source.url).hostname.replace(/^www\./, '')] : []; } catch { return []; }
  }))];
  const subject = topic.replace(/["\n\r]/g, ' ').slice(0, 300);
  const excluded = hosts.map(host => `-site:${host}`).join(' ');
  const searches = await Promise.allSettled([
    `"${subject}" officiel nyhed presse dato ${excluded}`,
    `"${subject}" kultur dokumentar omtale udgivet ${excluded}`,
  ].map(query => getResearch(query, { maxResults: 5, model: livModels().utility, timeoutMs: 30_000 })));
  const urls = new Map<string, string>();
  for (const result of searches) {
    if (result.status !== 'fulfilled') continue;
    for (const lead of result.value.sources) {
      try {
        if (!lead.url) continue;
        const url = sourceUrl(lead.url);
        const host = url.hostname.replace(/^www\./, '');
        if (hosts.some(existingHost => host === existingHost || host.endsWith(`.${existingHost}`))) continue;
        const canonical = canonicalSourceUrl(url.href);
        if (!canonical || identities.has(canonical) || urls.has(canonical)) continue;
        for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
        urls.set(canonical, url.href);
      } catch { /* Unsafe leads never reach retrieval. */ }
    }
  }
  const retrieved = await Promise.allSettled([...urls.values()].slice(0, 10)
    .map((url, i) => retrieveSource(url, `supplement-${i + 1}`)));
  const sources = retrieved.flatMap(result => result.status === 'fulfilled' && result.value.text.trim().length >= 200
    ? [result.value] : []).sort((a, b) => Number(!!b.publishedAt) - Number(!!a.publishedAt));
  const added = sources.slice(0, Math.max(0, 8 - existing.length)).map(source => ({
    title: source.title, source: new URL(source.url).hostname, url: source.url,
    snippet: source.text.slice(0, 240), contentHash: source.contentHash,
    retrievedAt: source.retrievedAt, publishedAt: source.publishedAt,
  }));
  return { ...article, researchSources: [...existing, ...added], researchSupplementedAt: new Date().toISOString() };
}
