/**
 * Liv Brandt — daglig auto-publish (cron).
 *
 * Pipeline:
 *   1. Idempotent claim på dagens UTC-key (Firestore).
 *   2. Vælg trending-emne der matcher Liv's temaer.
 *   3. Generér artikel + AI-SEO via gpt-4o.
 *   4. Kør sikkerhedsporte (moderation → factcheck → TOV).
 *   5. Send til Webflow (draft/published via env).
 *   6. Send GA4-status-event + log resultat i Firestore.
 *
 * Schedule: 08:00 UTC daglig (`0 8 * * *`) — registrér i `vercel.json`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { env } from '@/lib/config/env';
import { logger } from '@/lib/logger';
import {
  claimLivDaily,
  finishLivDaily,
  todayDayKeyUTC,
  type GateResult,
} from '@/lib/liv/daily-history-store';
import { pickLivTopic } from '@/lib/liv/pick-topic';
import { generateLivArticle } from '@/lib/liv/generate-article';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';
import { runSafetyGates } from '@/lib/liv/run-safety-gates';
import { buildResearchQaSummary } from '@/lib/liv/research-qa';
import { publishArticleToWebflow, type WebflowArticleFields } from '@/lib/webflow-service';
import { sendGa4MeasurementEvent } from '@/lib/newsletter/ga4-measurement';
import {
  getLivDailyPlan,
  markPlanFailed,
  markPlanUsed,
} from '@/lib/liv/daily-plan-store';
import { resolveLivTopicInputsFromPlan } from '@/lib/liv/resolve-liv-topic-hints';

export const maxDuration = 300;
const MIN_VERIFIED_RESEARCH_SOURCES = 2;
const MIN_LINEUP_NAMES = 2;

function resolveLivWebflowStatus(): 'draft' | 'published' {
  const raw = (process.env.LIV_DAILY_WEBFLOW_STATUS || '').trim().toLowerCase();
  if (raw === 'published') return 'published';
  // Default to draft so items always land in Webflow CMS first.
  return 'draft';
}

function resolveBaseUrl(req: NextRequest): string {
  const fromHeader = req.nextUrl.origin;
  if (fromHeader && /^https?:\/\//.test(fromHeader)) return fromHeader;
  const prodHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, '');
  if (prodHost) return `https://${prodHost}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
  return env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000';
}

async function reportGa4(
  status: 'published' | 'skipped' | 'failed',
  params: Record<string, string | number | undefined>
): Promise<void> {
  try {
    await sendGa4MeasurementEvent({
      name: 'liv_daily_article',
      clientId: 'liv-cron',
      params: { status, ...params, engagement_time_msec: 1 },
    });
  } catch (e) {
    logger.warn('[cron/liv-daily] GA4 event failed', { err: e instanceof Error ? e.message : String(e) });
  }
}

export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  const sp = req.nextUrl.searchParams;
  const dryRun = sp.get('dryRun') === '1' || sp.get('dryRun')?.toLowerCase() === 'true';
  const dayKey = todayDayKeyUTC();
  const baseUrl = resolveBaseUrl(req);
  const livWebflowStatus = resolveLivWebflowStatus();

  // Kill-switch: sæt LIV_DAILY_PAUSED=1 på Vercel for at stoppe alle
  // auto-publish runs uden deploy. dryRun ignorerer kill-switch så vi
  // stadig kan teste topic-valg.
  const paused = process.env.LIV_DAILY_PAUSED;
  if (!dryRun && (paused === '1' || paused?.toLowerCase() === 'true')) {
    logger.warn('[cron/liv-daily] paused via LIV_DAILY_PAUSED env var', { dayKey });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'paused',
      dayKey,
      hint: 'Fjern LIV_DAILY_PAUSED i Vercel env vars for at genoptage.',
    });
  }

  if (dryRun) {
    const plan = await getLivDailyPlan(dayKey);
    const { topicHint, mustUseTrending } = resolveLivTopicInputsFromPlan(plan);
    const topic = await pickLivTopic({
      baseUrl,
      topicHint,
      mustUseTrending,
    });
    logger.info('[cron/liv-daily] dryRun', {
      dayKey,
      picked: topic?.title || null,
      score: topic?.score,
      usingPlan: !!plan,
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      dayKey,
      plan,
      pickedTopic: topic,
      hint: 'dryRun springer claim/publish over. Fjern ?dryRun=1 for at køre rigtigt.',
    });
  }

  const claim = await claimLivDaily(dayKey);
  if (claim.ok === false) {
    logger.info('[cron/liv-daily] skipped (claim)', { dayKey, reason: claim.reason });
    return NextResponse.json({ ok: true, skipped: true, reason: claim.reason, dayKey });
  }

  let pickedTopicTitle: string | undefined;
  let gateResults: GateResult[] = [];
  const plan = await getLivDailyPlan(dayKey);
  const { topicHint, mustUseTrending } = resolveLivTopicInputsFromPlan(plan);

  try {
    const topic = await pickLivTopic({
      baseUrl,
      topicHint,
      mustUseTrending,
    });
    if (!topic) {
      await finishLivDaily(dayKey, {
        status: 'skipped_no_topic',
        reason: 'Ingen trending-artikler matcher Liv\'s temaer i dag.',
      });
      if (plan) {
        await markPlanFailed(dayKey, 'Ingen emner matchede planens hint.');
      }
      await reportGa4('skipped', { reason: 'no_topic', day_key: dayKey });
      logger.info('[cron/liv-daily] skipped — no_topic', { dayKey });
      return NextResponse.json({ ok: true, skipped: true, reason: 'no_topic', dayKey });
    }
    pickedTopicTitle = topic.title;

    const article = await generateLivArticle({
      topic,
      expandedDirective: plan?.expandedDirective,
      baseUrl,
    });

    const verifiedResearchSources = (article.researchSources || []).filter(
      (r) =>
        typeof r?.url === 'string' &&
        /^https?:\/\//i.test(r.url) &&
        (r.source || '').toLowerCase() !== 'ai guidance'
    );
    if (verifiedResearchSources.length < MIN_VERIFIED_RESEARCH_SOURCES) {
      gateResults = [
        {
          name: 'research-sources',
          pass: false,
          detail: `Kun ${verifiedResearchSources.length} verificerbare kilder med URL (krav: ${MIN_VERIFIED_RESEARCH_SOURCES}).`,
        },
      ];
      await finishLivDaily(dayKey, {
        status: 'skipped_factcheck',
        topic: topic.title,
        reason: `research_sources_insufficient: ${verifiedResearchSources.length}/${MIN_VERIFIED_RESEARCH_SOURCES}`,
        gateResults,
      });
      if (plan) {
        await markPlanFailed(
          dayKey,
          `research_sources_insufficient: ${verifiedResearchSources.length}/${MIN_VERIFIED_RESEARCH_SOURCES}`
        );
      }
      await reportGa4('skipped', {
        reason: 'research_sources_insufficient',
        day_key: dayKey,
        topic: topic.title.slice(0, 100),
      });
      logger.info('[cron/liv-daily] skipped — insufficient research sources', {
        dayKey,
        topic: topic.title,
        verifiedResearchSources: verifiedResearchSources.length,
        required: MIN_VERIFIED_RESEARCH_SOURCES,
      });
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'research_sources_insufficient',
        dayKey,
        topic: topic.title,
        required: MIN_VERIFIED_RESEARCH_SOURCES,
        got: verifiedResearchSources.length,
      });
    }

    const gates = await runSafetyGates({
      baseUrl,
      title: article.title,
      content: article.content,
      intro: article.intro,
      authorName: 'Liv Brandt',
      sourceExcerpt: topic.source?.excerpt,
    });
    gateResults = gates.results;

    if (!gates.pass) {
      const failed = gates.failedGate || 'unknown';
      // Source-similarity-fejl logges som "skipped_moderation" — vi har ikke
      // en separat status, men `gateResults` bevarer det nøjagtige gate-navn.
      const status: 'skipped_factcheck' | 'skipped_moderation' | 'skipped_tov' =
        failed === 'factcheck'
          ? 'skipped_factcheck'
          : failed === 'tov'
            ? 'skipped_tov'
            : 'skipped_moderation';
      const detail = gates.results.find((r) => r.name === failed)?.detail || 'gate failed';

      await finishLivDaily(dayKey, {
        status,
        topic: topic.title,
        reason: `${failed}: ${detail}`,
        gateResults,
      });
      if (plan) {
        await markPlanFailed(dayKey, `${failed}: ${detail}`);
      }
      await reportGa4('skipped', {
        reason: `gate_${failed}`,
        day_key: dayKey,
        topic: topic.title.slice(0, 100),
      });
      logger.info('[cron/liv-daily] skipped — gate failed', { dayKey, failed, detail });
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: `gate_${failed}`,
        dayKey,
        topic: topic.title,
        gateResults,
      });
    }

    const qa = buildResearchQaSummary({
      articleContent: article.content,
      topic,
      researchSources: article.researchSources || [],
      gates: gates.results || [],
      topicHint: plan?.topicHint,
      directiveHint: plan?.directiveHint,
      expandedDirective: plan?.expandedDirective,
      minVerifiedSources: MIN_VERIFIED_RESEARCH_SOURCES,
      minLineupNames: MIN_LINEUP_NAMES,
    });
    if (!qa.canAutoPublish) {
      const reason = qa.blockers.join(' | ');
      gateResults = [
        ...gateResults,
        {
          name: 'research-qa',
          pass: false,
          detail: reason,
        },
      ];
      await finishLivDaily(dayKey, {
        status: 'skipped_factcheck',
        topic: topic.title,
        reason,
        gateResults,
      });
      if (plan) {
        await markPlanFailed(dayKey, reason);
      }
      await reportGa4('skipped', {
        reason: 'research_qa_insufficient',
        day_key: dayKey,
        topic: topic.title.slice(0, 100),
      });
      logger.info('[cron/liv-daily] skipped — research QA insufficient', {
        dayKey,
        topic: topic.title,
        blockers: qa.blockers,
      });
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'research_qa_insufficient',
        dayKey,
        topic: topic.title,
        qa,
      });
    }

    const payload: WebflowArticleFields = buildLivCmsPayload({
      article,
      topic,
      sectionFallback: 'Kultur',
      status: livWebflowStatus,
      aiModel: process.env.LIV_GENERATION_MODEL || 'claude-opus-4.7',
    });

    const webflowItemId = await publishArticleToWebflow(payload);

    await finishLivDaily(dayKey, {
      status: livWebflowStatus === 'published' ? 'published' : 'draft',
      topic: topic.title,
      title: article.title,
      slug: article.slug,
      webflowItemId,
      gateResults,
      sourceUrl: topic.source?.url,
    });
    if (plan) {
      await markPlanUsed(dayKey);
    }

    await reportGa4('published', {
      day_key: dayKey,
      topic: topic.title.slice(0, 100),
      slug: article.slug,
      word_count: article.content.split(/\s+/).filter(Boolean).length,
    });

    logger.info('[cron/liv-daily] published', {
      dayKey,
      slug: article.slug,
      webflowItemId,
      webflowStatus: livWebflowStatus,
      score: topic.score,
    });

    return NextResponse.json({
      ok: true,
      dayKey,
      usedPlan: !!plan,
      topic: topic.title,
      title: article.title,
      slug: article.slug,
      webflowItemId,
      webflowStatus: livWebflowStatus,
      gateResults,
      qa,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    const stack = e instanceof Error ? e.stack : undefined;
    await finishLivDaily(dayKey, {
      status: 'failed',
      topic: pickedTopicTitle,
      reason: msg,
      gateResults,
    });
    await reportGa4('failed', { reason: msg.slice(0, 100), day_key: dayKey });
    if (plan) {
      await markPlanFailed(dayKey, msg);
    }
    logger.error('[cron/liv-daily] unhandled error', e instanceof Error ? e : new Error(msg), { dayKey, stack });
    return NextResponse.json({ error: msg, dayKey }, { status: 500 });
  }
}
