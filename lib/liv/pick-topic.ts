/**
 * Liv Brandt — automatisk emnevalg.
 *
 * Henter trending-artikler fra `/api/trending` (samme datasæt som UI'et bruger),
 * filtrerer efter Liv's temaer (kultur, koncerter, identitet, samtid,
 * femininitet) og dropper emner som allerede er dækket af tidligere
 * auto-publishes (Firestore `livDailyArticles`).
 */

import { logger } from '@/lib/logger';
import { getRecentLivDailySlugs, getRecentLivDailyTopics } from '@/lib/liv/daily-history-store';

export interface PickedTopic {
  title: string;
  /** Score Liv-tema-tilpasset (højere = bedre). */
  score: number;
  /** True når emnet er givet af redaktionen uden match i trending. */
  synthetic?: boolean;
  /** Råt body-text fra kilde — bruges som inspiration i prompten. */
  source?: {
    title: string;
    url?: string;
    excerpt?: string;
    sourceName?: string;
    publishedAt?: string;
  };
  category?: string;
  tags?: string[];
}

export interface PickTopicOptions {
  /** Absolut origin (https://...) til at kalde `/api/trending` med. */
  baseUrl: string;
  /** Valgfrit emnehint fra redaktionen (fx "Sabrina Carpenter"). */
  topicHint?: string;
  /**
   * Hvis true, skal emnet matche en trending-kilde.
   * Hvis false, kan vi returnere synthetic emne når hint ikke matcher.
   */
  mustUseTrending?: boolean;
  /** Maks antal kandidater at returnere. Default 1. */
  limit?: number;
  /** Antal dages historik der bruges til dedupe. Default 14. */
  dedupeDays?: number;
  /** Titler som redaktionen aktivt har afvist i den nuværende session. */
  excludedTitles?: string[];
}

/* Liv's primære temaer — vægtes højest. */
const LIV_THEMES = [
  'koncert',
  'koncerter',
  'musik',
  'live',
  'kultur',
  'kunst',
  'litteratur',
  'identitet',
  'femininitet',
  'kvinde',
  'kvinder',
  'samtid',
  'feminist',
  'feministisk',
  'krop',
];

/* Sekundære temaer — Liv kan skrive om dem hvis primære ikke findes. */
const LIV_SECONDARY = [
  'film',
  'serie',
  'serier',
  'mode',
  'queer',
  'klima',
  'samtale',
  'essay',
  'portræt',
  'interview',
];

function lower(value: unknown): string {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9æøå\s-]/gi, ' ')
    .split(/\s+/)
    .map((x) => x.trim())
    .filter((x) => x.length > 2);
}

function overlapScore(a: string, b: string): number {
  const as = new Set(tokenize(a));
  const bs = new Set(tokenize(b));
  if (as.size === 0 || bs.size === 0) return 0;
  let inter = 0;
  as.forEach((v) => {
    if (bs.has(v)) inter++;
  });
  return inter / Math.max(as.size, bs.size);
}

function scoreCandidate(article: { title?: unknown; tags?: unknown; category?: unknown; content?: unknown }): number {
  const hay = `${lower(article.title)} ${lower(article.category)} ${
    Array.isArray(article.tags) ? article.tags.map(lower).join(' ') : ''
  } ${lower(article.content).slice(0, 600)}`;

  let score = 0;
  for (const theme of LIV_THEMES) {
    if (hay.includes(theme)) score += 4;
  }
  for (const theme of LIV_SECONDARY) {
    if (hay.includes(theme)) score += 1;
  }
  // Lille bonus for kvindelige kunstnere/forfattere — Liv-tematik.
  if (/\b(hun|hende|kvinde|kvindelig)\b/.test(hay)) score += 1;
  return score;
}

/** Komma-separeret liste i env (små bogstaver under match): fx `kanye west,donald trump` — springer trending-kandidater over i UI + cron. */
function parseTitleBlocklistFragments(): string[] {
  const raw = process.env.LIV_TOPIC_TITLE_BLOCKLIST?.trim();
  if (!raw) return [];
  return raw
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 2);
}

function titleMatchesBlocklist(title: string): boolean {
  const lower = title.trim().toLowerCase();
  if (!lower) return false;
  return parseTitleBlocklistFragments().some((frag) => lower.includes(frag));
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

interface TrendingArticle {
  title?: string;
  category?: string;
  tags?: string[];
  source?: string;
  date?: string;
  content?: string;
  url?: string;
}

/**
 * Vælg et emne til Liv. Returnerer null hvis ingen kandidater opfylder
 * minimumstærsklen — cron'en springer dagen over og prøver igen i morgen.
 */
export async function pickLivTopic(options: PickTopicOptions): Promise<PickedTopic | null> {
  const { baseUrl, topicHint, mustUseTrending = true, limit = 1, dedupeDays = 14, excludedTitles = [] } = options;
  const excludedSet = new Set(
    excludedTitles
      .map((x) => x?.trim().toLowerCase())
      .filter((x): x is string => !!x)
  );

  const trendingUrl = new URL('/api/trending', baseUrl).toString();
  let articles: TrendingArticle[] = [];
  try {
    const res = await fetch(trendingUrl, { cache: 'no-store' });
    if (!res.ok) {
      logger.warn('[liv/pick-topic] /api/trending returned non-ok', { status: res.status });
      return null;
    }
    const data = await res.json();
    if (Array.isArray(data?.articles)) {
      articles = data.articles as TrendingArticle[];
    }
  } catch (e) {
    logger.error('[liv/pick-topic] failed to fetch trending', e instanceof Error ? e : new Error(String(e)));
    return null;
  }

  if (articles.length === 0) {
    if (topicHint && !mustUseTrending) {
      return {
        title: topicHint.trim(),
        score: 0,
        synthetic: true,
      };
    }
    return null;
  }

  const [recentSlugs, recentTopics] = await Promise.all([
    getRecentLivDailySlugs(dedupeDays),
    getRecentLivDailyTopics(dedupeDays),
  ]);

  const ranked = articles
    .map((a) => {
      const title = (a.title || '').trim();
      const score = title ? scoreCandidate(a) : 0;
      const hintScore = topicHint
        ? Math.max(
            overlapScore(title, topicHint),
            overlapScore(`${a.category || ''} ${(a.tags || []).join(' ')}`, topicHint)
          )
        : 0;
      return { article: a, title, score, hintScore, slug: slugify(title) };
    })
    .filter(({ title }) => title.length > 8)
    .filter(({ title }) => !titleMatchesBlocklist(title))
    .filter(({ title, slug }) => {
      if (recentSlugs.has(slug)) return false;
      if (recentTopics.has(title.toLowerCase())) return false;
      if (excludedSet.has(title.toLowerCase())) return false;
      return true;
    })
    .sort((a, b) => {
      if (topicHint) {
        if (b.hintScore !== a.hintScore) return b.hintScore - a.hintScore;
      }
      return b.score - a.score;
    });

  // Kræver minimum-score for at sikre tematisk relevans.
  const top =
    topicHint && ranked.length > 0
      ? ranked[0]
      : ranked.find((r) => r.score >= 3) || ranked[0];

  if (topicHint) {
    const hintGood = top && top.hintScore >= 0.2;
    if (!hintGood) {
      if (mustUseTrending) return null;
      return {
        title: topicHint.trim(),
        score: 0,
        synthetic: true,
      };
    }
  }
  if (!top) return null;
  if (!topicHint && top.score < 1) return null;

  void limit; // p.t. returnerer vi top-1 — limit reservedt til fremtiden.

  return {
    title: top.title,
    score: top.score,
    category: typeof top.article.category === 'string' ? top.article.category : undefined,
    tags: Array.isArray(top.article.tags) ? top.article.tags.filter((t) => typeof t === 'string') : undefined,
    source: {
      title: top.title,
      url: typeof top.article.url === 'string' ? top.article.url : undefined,
      excerpt:
        typeof top.article.content === 'string' ? top.article.content.slice(0, 800) : undefined,
      sourceName: typeof top.article.source === 'string' ? top.article.source : undefined,
      publishedAt: typeof top.article.date === 'string' ? top.article.date : undefined,
    },
  };
}
