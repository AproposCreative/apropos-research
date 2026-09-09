/** Pure analytics interpretation. Traffic is an editorial signal, never factual evidence. */
export type ArticleTraffic = { path: string; title: string; views: number };
export type AudienceSignal = ArticleTraffic & {
  baselineDailyViews: number;
  growthRatio: number;
  additionalViews: number;
};

export function normalizeArticlePath(input: string): string | null {
  const path = input.split(/[?#]/)[0].replace(/\/+$/, '');
  return /^\/articles\/[^/]+$/.test(path) ? path : null;
}

function aggregate(rows: ArticleTraffic[]): Map<string, ArticleTraffic> {
  const result = new Map<string, ArticleTraffic>();
  for (const row of rows) {
    const path = normalizeArticlePath(row.path);
    if (!path || !Number.isFinite(row.views) || row.views < 0) continue;
    const previous = result.get(path);
    result.set(path, { path, title: row.title || previous?.title || path, views: (previous?.views || 0) + row.views });
  }
  return result;
}

export function buildAudienceSignals(recent: ArticleTraffic[], baseline: ArticleTraffic[]): AudienceSignal[] {
  const previous = aggregate(baseline);
  return [...aggregate(recent).values()].map(row => {
    const baselineDailyViews = (previous.get(row.path)?.views || 0) / 7;
    return {
      ...row,
      baselineDailyViews,
      growthRatio: row.views / Math.max(5, baselineDailyViews),
      additionalViews: row.views - baselineDailyViews,
    };
  }).filter(row => row.views >= 20 && row.growthRatio >= 1.5 && row.additionalViews >= 10)
    .sort((a, b) => b.additionalViews - a.additionalViews || a.path.localeCompare(b.path))
    .slice(0, 20);
}

export function audienceMatch(title: string, signals: AudienceSignal[]): AudienceSignal | undefined {
  const words = (text: string) => new Set(text.toLocaleLowerCase('da').match(/[\p{L}\p{N}]{4,}/gu) || []);
  const target = words(title);
  return signals.find(signal => {
    const candidate = words(signal.title);
    const overlap = [...target].filter(word => candidate.has(word)).length;
    return overlap >= 2 && overlap / Math.max(1, Math.min(target.size, candidate.size)) >= 0.4;
  });
}

export function canonicalSourceUrl(raw?: string | null): string | null {
  try {
    const url = new URL(raw || '');
    if (!['https:', 'http:'].includes(url.protocol) || url.username || url.password) return null;
    url.hash = '';
    for (const key of [...url.searchParams.keys()]) {
      if (/^(utm_|fbclid$|gclid$)/i.test(key)) url.searchParams.delete(key);
    }
    url.searchParams.sort();
    url.hostname = url.hostname.replace(/^www\./, '');
    url.pathname = url.pathname.replace(/\/+$/, '') || '/';
    return url.toString();
  } catch { return null; }
}
