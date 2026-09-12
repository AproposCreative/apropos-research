import { getResearch } from '@/lib/research/service';
import { livModels } from '@/lib/liv/model-config';
import { retrieveSource, sourceUrl } from '@/lib/factcheck/source-reader';
import { canonicalSourceUrl } from '@/lib/editorial/audience-signals';
import type { GeneratedArticle } from './generate-article';

/** Refresh stale retrieval metadata without another search or writer call. */
export async function refreshLivResearchDates(article: GeneratedArticle, seedUrls: readonly string[] = []): Promise<GeneratedArticle> {
  const sources = article.researchSources || [];
  if (sources.length > 8) throw new Error('liv_research_supplement_source_limit');
  const researchSources = await Promise.all(sources.map(async source => {
    try {
      if (!source.url) return source;
      const fetched = await retrieveSource(sourceUrl(source.url).href, 'refresh');
      return { ...source, publishedAt: fetched.publishedAt, retrievedAt: fetched.retrievedAt,
        contentHash: fetched.contentHash, snippet: fetched.text.slice(0, 240) };
    } catch { return { ...source, publishedAt: null }; }
  }));
  const datedHosts = new Set(researchSources.flatMap(source => {
    try { return source.url && source.publishedAt ? [sourceUrl(source.url).hostname.replace(/^www\./, '')] : []; }
    catch { return []; }
  }));
  if (datedHosts.size >= 2 || researchSources.length >= 8) return { ...article, researchSources };
  const identities = new Set(sources.flatMap(source => {
    try { return source.url ? [canonicalSourceUrl(sourceUrl(source.url).href)] : []; } catch { return []; }
  }));
  const missing = new Map<string, string>();
  // Server-owned plan seeds only. A prior failed fetch may have omitted a valid
  // seed; retry at most three without search, rewriting, or dropping history.
  for (const raw of seedUrls) {
    try {
      const url = sourceUrl(raw), canonical = canonicalSourceUrl(url.href);
      if (!canonical || identities.has(canonical) || missing.has(canonical)) continue;
      for (const key of [...url.searchParams.keys()]) if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
      missing.set(canonical, url.href);
      if (missing.size === 3) break;
    } catch { /* Invalid seeds never consume a source slot or become evidence. */ }
  }
  const fetched = await Promise.allSettled([...missing.values()].map((url, i) => retrieveSource(url, `seed-${i + 1}`)));
  const added = fetched.flatMap(result => result.status === 'fulfilled' && result.value.text.trim().length >= 200
    ? [result.value] : []).sort((a, b) => Number(!!b.publishedAt) - Number(!!a.publishedAt))
    .slice(0, 8 - researchSources.length).map(source => ({
      title: source.title, source: new URL(source.url).hostname, url: source.url,
      snippet: source.text.slice(0, 240), contentHash: source.contentHash,
      retrievedAt: source.retrievedAt, publishedAt: source.publishedAt,
    }));
  researchSources.push(...added);
  return { ...article, researchSources };
}

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
    getResearch(`"${subject}" officiel presse og uafhængig kultur omtale udgivet dato ${excluded}`,
      { maxResults: 5, model: livModels().utility, timeoutMs: 30_000, allowFallback: false }),
  ]);
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
