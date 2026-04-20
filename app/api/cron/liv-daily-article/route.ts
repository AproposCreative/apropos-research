/**
 * Liv Brandt — daglig auto-publish (cron).
 *
 * Pipeline:
 *   1. Idempotent claim på dagens UTC-key (Firestore).
 *   2. Vælg trending-emne der matcher Liv's temaer.
 *   3. Generér artikel + AI-SEO via gpt-4o.
 *   4. Kør sikkerhedsporte (moderation → factcheck → TOV).
 *   5. Publish til Webflow (status: published).
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
import { runSafetyGates } from '@/lib/liv/run-safety-gates';
import { publishArticleToWebflow, type WebflowArticleFields } from '@/lib/webflow-service';
import { sendGa4MeasurementEvent } from '@/lib/newsletter/ga4-measurement';
import {
  getLivDailyPlan,
  markPlanFailed,
  markPlanUsed,
} from '@/lib/liv/daily-plan-store';

export const maxDuration = 300;

function resolveBaseUrl(req: NextRequest): string {
  const fromHeader = req.nextUrl.origin;
  if (fromHeader && /^https?:\/\//.test(fromHeader)) return fromHeader;
  const prodHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/^https?:\/\//, '');
  if (prodHost) return `https://${prodHost}`;
  if (env.VERCEL_URL) return `https://${env.VERCEL_URL.replace(/^https?:\/\//, '')}`;
  return env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') || 'http://localhost:3000';
}

function articleIdFromSlug(slug: string): string {
  return `liv-daily-${slug}-${Date.now().toString(36)}`.slice(0, 80);
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
    const topic = await pickLivTopic({
      baseUrl,
      topicHint: plan?.topicHint,
      mustUseTrending: plan?.mustUseTrending ?? true,
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

  try {
    const topic = await pickLivTopic({
      baseUrl,
      topicHint: plan?.topicHint,
      mustUseTrending: plan?.mustUseTrending ?? true,
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

    const payload: WebflowArticleFields = {
      id: articleIdFromSlug(article.slug),
      title: article.title,
      slug: article.slug,
      subtitle: article.subtitle,
      content: article.content,
      intro: article.intro,
      excerpt: article.excerpt,
      category: article.section || 'Kultur',
      tags: article.tags,
      author: 'Liv Brandt',
      seoTitle: article.seoTitle,
      seoDescription: article.seoDescription,
      status: 'published',
      publishDate: new Date().toISOString(),
      presseakkreditering: false,
      // AI-content sporbarhed: ai-generated er primært flag,
      // ai-source-url og ai-model er metadata til transparens og debug.
      aiGenerated: true,
      aiSourceUrl: topic.source?.url || null,
      aiModel: process.env.LIV_GENERATION_MODEL || 'claude-opus-4.7',
      featuredImage: article.imageSuggestions?.[0]?.url,
    };

    const webflowItemId = await publishArticleToWebflow(payload);

    await finishLivDaily(dayKey, {
      status: 'published',
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
      gateResults,
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
