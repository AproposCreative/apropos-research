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
import { checkCmsDraft } from '@/lib/editorial/cms-preflight';
import { isLivArticleFormat, type LivArticleFormat } from '@/lib/liv/review-format';
import { SourceSimilarityError } from '@/lib/liv/source-similarity-error';

// Generation plus bounded source retrieval/factcheck must fit in one preview run.
export const maxDuration = 300;
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
  articleFormat?: LivArticleFormat;
  generate?: boolean;
  topicHint?: string;
  directiveHint?: string;
  mustUseTrending?: boolean;
  excludedTitles?: string[];
};

async function buildPreview(req: NextRequest, input: PreviewRequestInput, uid: string) {
  if (input.articleFormat !== undefined && !isLivArticleFormat(input.articleFormat)) return NextResponse.json({ error: 'Ugyldigt artikelformat.' }, { status: 400 });
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
  const directiveHint = input.directiveHint?.trim() || (!thInput ? plan?.directiveHint : undefined);
  const articleFormat = input.articleFormat || (!thInput ? plan?.articleFormat : undefined) || 'article';
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
      directiveHint,
      baseUrl,
      articleFormat,
      sourceScope: uid,
    });
    const gates = await runSafetyGates({
      baseUrl,
      title: article.title,
      content: article.content,
      intro: article.intro,
      authorName: 'Liv Brandt',
      sourceExcerpt: topic.source?.excerpt || article.researchSources?.[0]?.snippet,
      sourceUrls: [...new Set([topic.source?.url, ...(article.researchSources || []).map(source => source.url)].filter((url): url is string => !!url))].slice(0, 8),
      additionalTexts: [article.subtitle, article.excerpt, article.seoTitle, article.seoDescription, article.ratingReason].filter(Boolean),
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
    const cmsCheck = checkCmsDraft(article);
    if (!cmsCheck.publicationReady) {
      warnings.push('Auto-publish afventer billedrettigheder og kontrol af de faktiske Webflow-referencefelter.');
    }

    return NextResponse.json({
      ok: true,
      dayKey,
      topic,
      previewImageUrl,
      topicMatchedTrending: !!topic.source,
      previewExpandedDirective: expanded.expandedDirective || null,
      warnings,
      gatePass: gates.pass && !gates.anyGateSkipped,
      gateResults: gates.results,
      article: {
        articleFormat: article.articleFormat,
        rating: article.rating,
        ratingReason: article.ratingReason,
        aiGenerated: true,
        aiModel: article.aiModel,
        voiceVersion: article.voiceVersion,
        voiceHash: article.voiceHash,
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
          canAutoPublish: qa.canAutoPublish && gates.pass && !gates.anyGateSkipped && cmsCheck.publicationReady,
          cmsCheck,
          blockers: [...qa.blockers,
            ...(!gates.pass || gates.anyGateSkipped ? ['Sikkerhedskontrollerne er ikke fuldt godkendt.'] : []),
            ...(!cmsCheck.publicationReady ? ['Billedrettigheder og Webflow-referencefelter er ikke verificeret.'] : []),
          ],
        },
      },
    });
  } catch (e) {
    if (e instanceof SourceSimilarityError) {
      return NextResponse.json({ ok: false, error: e.message, code: e.code,
        dayKey, gatePass: false, canAutoPublish: false, diagnostic: e.detail },
      { status: e.status, headers: { 'Cache-Control': 'no-store' } });
    }
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
      articleFormat: (sp.get('articleFormat') || undefined) as LivArticleFormat | undefined,
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
