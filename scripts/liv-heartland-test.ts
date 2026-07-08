#!/usr/bin/env npx tsx
/**
 * End-to-end test af Liv-flow:
 * 1) Hent web-research for Heartland 2026
 * 2) Generér Liv-artikel med redaktionel vinkel
 * 3) Kør safety gates
 * 4) (valgfrit) skriv draft til Webflow CMS
 *
 * Kør:
 *   npx tsx scripts/liv-heartland-test.ts
 *   npx tsx scripts/liv-heartland-test.ts --publish
 *   npx tsx scripts/liv-heartland-test.ts --publish --webflow-id=<cms-item-id>
 *     (PATCH eksisterende item — undgår dublet; genbruger samme CMS-række med rettede felter)
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';
import type { PickedTopic } from '@/lib/liv/pick-topic';

type SearchResult = {
  title?: string;
  content?: string;
  source?: string;
  url?: string | null;
};

async function fetchPlainText(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AproposBot/1.0)' },
      cache: 'no-store',
    });
    if (!res.ok) return '';
    const html = await res.text();
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 1800);
  } catch {
    return '';
  }
}

async function fetchResearch(baseUrl: string, query: string): Promise<SearchResult[]> {
  const res = await fetch(new URL('/api/web-search', baseUrl), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, maxResults: 6 }),
  });
  if (!res.ok) {
    throw new Error(`web-search failed: HTTP ${res.status}`);
  }
  const data = await res.json();
  const rows = data?.data?.results || data?.results || [];
  return Array.isArray(rows) ? (rows as SearchResult[]) : [];
}

async function main() {
  loadEnv({ path: path.join(process.cwd(), '.env.local') });
  loadEnv({ path: path.join(process.cwd(), '.env') });

  const [
    { generateLivArticle },
    { runSafetyGates },
    { buildLivCmsPayload },
    { publishArticleToWebflow },
    { buildResearchQaSummary },
  ] = await Promise.all([
    import('@/lib/liv/generate-article'),
    import('@/lib/liv/run-safety-gates'),
    import('@/lib/liv/build-cms-payload'),
    import('@/lib/webflow-service'),
    import('@/lib/liv/research-qa'),
  ]);

  const shouldPublish = process.argv.includes('--publish');
  const webflowIdArg =
    process.argv.find((a) => a.startsWith('--webflow-id='))?.split('=').slice(1).join('=')?.trim() ||
    process.env.WEBFLOW_PATCH_ITEM_ID?.trim() ||
    '';
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
  const query = 'Heartland Festival 2026 lineup kunstnere sommer';
  const research = await fetchResearch(baseUrl, query);
  const seedUrls = [
    'https://heartlandfestival.dk/program-2026/',
    'https://heartlandfestival.dk/news-5/',
    'http://songkick.com/festivals/149041-heartland/id/42654236-heartland-festival-2026',
  ];
  const seedTexts = await Promise.all(seedUrls.map((u) => fetchPlainText(u)));
  const seedFacts = seedTexts.filter(Boolean).slice(0, 3);
  const knownLineupNames = [
    'Duran Duran',
    'Nick Cave & The Bad Seeds',
    'The Minds of 99',
    '4 Non Blondes',
    'LP',
    'Manic Street Preachers',
  ];
  const seedJoined = seedFacts.join(' ').toLowerCase();
  const seedLineupNames = knownLineupNames.filter((name) => seedJoined.includes(name.toLowerCase()));

  const primary = research.find((r) => r.url && r.content) || research[0];
  const primaryExcerpt = [primary?.content || '', ...seedFacts].filter(Boolean).join('\n\n').slice(0, 1800);
  const topic: PickedTopic = {
    title: 'Sommerens lineup på Heartland 2026',
    score: 99,
    category: 'Musik',
    tags: ['Heartland', 'festival', 'lineup', 'dansk musik'],
    source: primary
      ? {
          title: primary.title || 'Heartland 2026 lineup',
          url: primary.url || undefined,
          excerpt: primaryExcerpt,
          sourceName: primary.source || 'Web research',
          publishedAt: new Date().toISOString(),
        }
      : undefined,
  };

  const expandedDirective = [
    'Vinkel: kritisk men empatisk.',
    'Aabningsbevaegelse: start i en sansning fra festivalpladsen.',
    'Spor: analyser lineup med fokus på kønsbalance, kunstnerisk risiko og dansk publikumskultur.',
    seedLineupNames.length
      ? `Spor: nævn konkrete navne fra lineupet (${seedLineupNames.join(', ')}) og vurder deres kulturelle betydning.`
      : 'Spor: nævn konkrete navne fra lineupet, når de er verificerbare i kilderne.',
    'Spor: inddrag hvad der føles som postkort-kultur versus reel kulturel nerve.',
    'Undgaa: rent plotreferat eller promo-sprog.',
  ].join('\n');

  const article = await generateLivArticle({
    topic,
    expandedDirective,
    baseUrl,
  });

  // Når /api/web-search lokalt returnerer for få rækker uden URL, har vi stadig
  // hentet klippetekst fra officielle lineup-kilder — tilføj dem som verificerbare kilder til QA + CMS.
  const seedResearchEntries = seedUrls
    .map((url, i) => {
      const text = seedTexts[i] || '';
      if (!text.trim()) return null;
      let host = '';
      try {
        host = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        return null;
      }
      return {
        title: i === 0 ? 'Heartland — program 2026' : `Kilde: ${host}`,
        source: host,
        url,
        snippet: text.slice(0, 420),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null);

  const seenUrls = new Set<string>();
  article.researchSources = [...(article.researchSources || []), ...seedResearchEntries].filter((r) => {
    const u = typeof r.url === 'string' ? r.url.trim() : '';
    if (!u || !/^https?:\/\//i.test(u)) return false;
    const key = u.toLowerCase();
    if (seenUrls.has(key)) return false;
    seenUrls.add(key);
    return true;
  });

  const gates = await runSafetyGates({
    baseUrl,
    title: article.title,
    content: article.content,
    intro: article.intro,
    authorName: 'Liv Brandt',
    sourceExcerpt: topic.source?.excerpt,
  });

  const qa = buildResearchQaSummary({
    articleContent: article.content,
    topic,
    researchSources: article.researchSources || [],
    gates: gates.results || [],
    topicHint: topic.title,
    directiveHint: expandedDirective,
    expandedDirective,
    minVerifiedSources: 2,
    minLineupNames: 2,
  });

  const payload = buildLivCmsPayload({
    article,
    topic,
    sectionFallback: 'Kultur',
    status: 'draft',
    aiModel: process.env.LIV_GENERATION_MODEL || 'claude-opus-4.7',
  });

  const payloadForWebflow = webflowIdArg
    ? { ...payload, webflowId: webflowIdArg }
    : payload;

  const out: Record<string, unknown> = {
    query,
    researchCount: research.length,
    seedFactsCount: seedFacts.length,
    seedLineupNames,
    researchSample: research.slice(0, 5).map((r) => ({
      title: r.title,
      source: r.source,
      url: r.url,
    })),
    generated: {
      title: article.title,
      slug: article.slug,
      wordCount: payload.wordCount,
      webflowPatchTarget: webflowIdArg || null,
      researchSourcesCount: article.researchSources?.length || 0,
      preview: article.content.slice(0, 700),
      tail: article.content.slice(-500),
      lineupNameMentions: ['Duran Duran', 'Nick Cave', 'The Minds of 99', '4 Non Blondes', 'LP', 'Manic Street Preachers']
        .filter((name) => article.content.toLowerCase().includes(name.toLowerCase())),
    },
    gates: {
      pass: gates.pass,
      failedGate: gates.failedGate || null,
      results: gates.results,
    },
    qa,
    publish: {
      attempted: shouldPublish,
      status: payload.status,
      webflowItemId: null as string | null,
      skippedReason: null as string | null,
    },
  };

  if (shouldPublish) {
    if (!gates.pass) {
      out.publish = {
        attempted: true,
        status: payload.status,
        webflowItemId: null,
        skippedReason: `safety gates: ${gates.failedGate || 'unknown'}`,
      };
    } else if (!qa.canAutoPublish) {
      out.publish = {
        attempted: true,
        status: payload.status,
        webflowItemId: null,
        skippedReason: qa.blockers.join(' | '),
      };
    } else {
      const webflowItemId = await publishArticleToWebflow(payloadForWebflow);
      out.publish = {
        attempted: true,
        status: payload.status,
        webflowItemId,
        skippedReason: null,
      };
    }
  }

  console.log(JSON.stringify(out, null, 2));

  if (shouldPublish) {
    const p = out.publish as { webflowItemId?: string | null; skippedReason?: string | null };
    if (!p.webflowItemId) {
      process.stderr.write(`\nPublish skipped: ${p.skippedReason || 'unknown'}\n`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
