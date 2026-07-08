/**
 * Liv Brandt — preview-endpoint til UI'et i web-apps panelet.
 *
 * Returnerer dagens planlagte emne (samme `pickLivTopic` som cron'en bruger)
 * og — når `?generate=1` er sat — også en fuld AI-genereret forhåndsvisning
 * af artiklen + SEO-felter, uden at publish'e til Webflow.
 *
 * Auth: Firebase ID-token (samme mønster som /api/liv/status og nyhedsbrevet).
 */

import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { pickLivTopic, type PickedTopic } from '@/lib/liv/pick-topic';
import { generateLivArticle } from '@/lib/liv/generate-article';
import { todayDayKeyUTC } from '@/lib/liv/daily-history-store';
import { getLivDailyPlan } from '@/lib/liv/daily-plan-store';
import { resolveLivTopicInputsFromPlan } from '@/lib/liv/resolve-liv-topic-hints';
import { logger } from '@/lib/logger';
import { env } from '@/lib/config/env';
import { expandDirective } from '@/lib/liv/expand-directive';
import { runSafetyGates } from '@/lib/liv/run-safety-gates';
import { buildResearchQaSummary } from '@/lib/liv/research-qa';

export const maxDuration = 120;
const MIN_VERIFIED_RESEARCH_SOURCES = 2;

function resolveBaseUrl(req: NextRequest): string {
  const fromHeader = req.nextUrl.origin;
  if (fromHeader && /^https?:\/\//.test(fromHeader)) return fromHeader;
  const prodHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, '');
  if (prodHost) return `https://${prodHost}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
  return env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000';
}

function previewImageFor(topic: PickedTopic | null): string | null {
  const url = topic?.source?.url;
  if (!url) return null;
  try {
    const host = new URL(url).hostname.replace(/^www\./, '');
    // Google's S2 favicon-service — gratis, hurtigt, kræver ingen ekstra integration.
    return `https://www.google.com/s2/favicons?sz=128&domain=${encodeURIComponent(host)}`;
  } catch {
    return null;
  }
}

type PreviewRequestInput = {
  generate?: boolean;
  topicHint?: string;
  directiveHint?: string;
  mustUseTrending?: boolean;
  excludedTitles?: string[];
};

async function buildPreview(req: NextRequest, input: PreviewRequestInput, uid: string) {
  const baseUrl = resolveBaseUrl(req);
  const dayKey = todayDayKeyUTC();
  const generate = !!input.generate;
  const thInput = (input.topicHint || '').trim();
  const plan = await getLivDailyPlan(dayKey);
  const resolved = resolveLivTopicInputsFromPlan(plan);
  const topicHint = thInput
    ? thInput
    : resolved.topicHint || undefined;
  const mustUseTrending = thInput
    ? input.mustUseTrending !== false
    : resolved.mustUseTrending;
  const directiveHint = input.directiveHint?.trim();
  const excludedTitles = Array.isArray(input.excludedTitles)
    ? input.excludedTitles.filter((x): x is string => typeof x === 'string' && x.trim().length > 0)
    : [];

  try {
    const topic = await pickLivTopic({
      baseUrl,
      topicHint,
      mustUseTrending,
      excludedTitles,
    });

    if (!topic) {
      return NextResponse.json({
        ok: true,
        dayKey,
        topic: null,
        reason: mustUseTrending
          ? 'Ingen trending-artikler matcher Livs temaer lige nu.'
          : 'Ingen kandidater fundet.',
      });
    }

    const previewImageUrl = previewImageFor(topic);
    const warnings: string[] = [];
    if (!topic.source) {
      warnings.push(
        'Emnet er ikke matchet mod en konkret trending-kilde. Source-similarity gate kan derfor ikke beskytte på samme niveau.'
      );
    }

    const expanded = await expandDirective({
      topicHint: topicHint || topic.title,
      directiveHint,
    });

    if (!generate) {
      return NextResponse.json({
        ok: true,
        dayKey,
        topic,
        previewImageUrl,
        topicMatchedTrending: !!topic.source,
        previewExpandedDirective: expanded.expandedDirective || null,
        warnings,
      });
    }

    const article = await generateLivArticle({
      topic,
      expandedDirective: expanded.expandedDirective,
      baseUrl,
    });
    const gates = await runSafetyGates({
      baseUrl,
      title: article.title,
      content: article.content,
      intro: article.intro,
      authorName: 'Liv Brandt',
      sourceExcerpt: topic.source?.excerpt,
    });
    if (!gates.pass) {
      const failed = gates.failedGate || 'unknown';
      const detail = gates.results.find((r) => r.name === failed)?.detail || 'gate failed';
      warnings.push(`Gate-fejl (${failed}): ${detail}`);
    } else if (gates.anyGateSkipped) {
      warnings.push('Mindst én safety-gate blev sprunget over (infrastruktur eller manglende data) — se listen under.');
    }

    const qa = buildResearchQaSummary({
      articleContent: article.content,
      topic,
      researchSources: article.researchSources || [],
      gates: gates.results || [],
      topicHint,
      directiveHint,
      expandedDirective: expanded.expandedDirective,
      minVerifiedSources: MIN_VERIFIED_RESEARCH_SOURCES,
      minLineupNames: 2,
    });
    if (qa.verifiedResearchSourceCount < MIN_VERIFIED_RESEARCH_SOURCES) {
      warnings.push(
        `Kun ${qa.verifiedResearchSourceCount} verificerbare kilder med URL (krav for auto-publish: ${MIN_VERIFIED_RESEARCH_SOURCES}).`
      );
    }
    if (!qa.canAutoPublish) {
      warnings.push(`Auto-publish blokeres nu: ${qa.blockers.join(' · ')}`);
    }

    return NextResponse.json({
      ok: true,
      dayKey,
      topic,
      previewImageUrl,
      topicMatchedTrending: !!topic.source,
      previewExpandedDirective: expanded.expandedDirective || null,
      warnings,
      gatePass: gates.pass,
      gateResults: gates.results,
      article: {
        title: article.title,
        subtitle: article.subtitle,
        intro: article.intro,
        content: article.content,
        slug: article.slug,
        excerpt: article.excerpt,
        section: article.section,
        tags: article.tags,
        seoTitle: article.seoTitle,
        seoDescription: article.seoDescription,
        primaryKeyword: article.primaryKeyword,
        wordCount: article.content.split(/\s+/).filter(Boolean).length,
        imageSuggestions: article.imageSuggestions || [],
        researchSources: article.researchSources || [],
        qa: {
          verifiedResearchSourceCount: qa.verifiedResearchSourceCount,
          verifiedClaimsCount: qa.verifiedClaimsCount,
          researchConfidence: qa.researchConfidence,
          lineupNamesUsed: qa.lineupNamesUsed,
          requiresLineupNames: qa.requiresLineupNames,
          canAutoPublish: qa.canAutoPublish,
          blockers: qa.blockers,
        },
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    logger.error('[api/liv/preview] failed', e instanceof Error ? e : new Error(msg), {
      dayKey,
      generate,
      uid,
      topicHint,
    });
    return NextResponse.json({ error: msg, dayKey }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  return buildPreview(
    req,
    {
      generate: sp.get('generate') === '1' || sp.get('generate')?.toLowerCase() === 'true',
      topicHint: sp.get('topicHint') || undefined,
      directiveHint: sp.get('directiveHint') || undefined,
      mustUseTrending:
        sp.get('mustUseTrending') === null
          ? true
          : !(sp.get('mustUseTrending') === '0' || sp.get('mustUseTrending') === 'false'),
      excludedTitles: sp.getAll('excludedTitle'),
    },
    uid
  );
}

export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  let body: PreviewRequestInput = {};
  try {
    body = (await req.json()) as PreviewRequestInput;
  } catch {
    // Keep defaults
  }
  return buildPreview(req, body, uid);
}
