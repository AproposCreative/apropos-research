/**
 * Liv Brandt — daglig auto-publish (cron).
 *
 * Pipeline:
 *   1. Idempotent claim på dagens UTC-key (Firestore).
 *   2. Vælg trending-emne der matcher Liv's temaer.
 *   3. Generér artikel + AI-SEO via den fælles modelkonfiguration.
 *   4. Kør sikkerhedsporte (moderation → factcheck → TOV).
 *   5. Gem og kontrollér CMS; auto-mode publicerer og verificerer live-versionen.
 *   6. Send GA4-status-event + log resultat i Firestore.
 *
 * Schedule: 08:00 UTC daglig (`0 8 * * *`) — registrér i `vercel.json`.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { getAdminDb } from '@/lib/firebase-admin';
import { livInternalOrigin } from '@/lib/liv/internal-origin';
import { logger } from '@/lib/logger';
import {
  claimLivDaily as claimDaily,
  finishLivDaily as finishDaily,
  checkpointLivDailyCmsItem as checkpointCms,
  checkpointLivDailyArticle as checkpointArticle,
  type LivDailyScope,
  checkpointPreparationProof,
  todayDayKeyUTC,
  type GateResult,
  livDailyDocId,
  yieldLivPreparation,
} from '@/lib/liv/daily-history-store';
import { pickLivTopic } from '@/lib/liv/pick-topic';
import { generateLivArticle } from '@/lib/liv/generate-article';
import type { GeneratedArticle } from '@/lib/liv/generate-article';
import { prepareLivAutomaticMedia } from '@/lib/liv/automatic-media';
import { buildLivCmsPayload } from '@/lib/liv/build-cms-payload';
import { checkCmsDraft } from '@/lib/editorial/cms-preflight';
import { inspectLivCmsDraft } from '@/lib/liv/cms-readback';
import { runSafetyGates } from '@/lib/liv/run-safety-gates';
import { buildResearchQaSummary } from '@/lib/liv/research-qa';
import { publishArticleDraftToWebflow } from '@/lib/articles/publish';
import { ArticleSaveError } from '@/lib/articles/save-receipt';
import { publishVerifiedLivArticle } from '@/lib/liv/publish-verified';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { sendGa4MeasurementEvent } from '@/lib/newsletter/ga4-measurement';
import {
  getLivDailyPlan,
  markPlanFailed as failPlan,
  markPlanUsed,
} from '@/lib/liv/daily-plan-store';
import { resolveLivTopicInputsFromPlan } from '@/lib/liv/resolve-liv-topic-hints';
import { admitPreparedArticle, type PreparationProof } from '@/lib/liv/prepared-admission';
import { cmsFieldHash } from '@/lib/liv/cms-field-hash';
import { editorialPlanHash } from '@/lib/liv/rolling-plan';
import { addDays, copenhagenClock } from '@/lib/liv/delivery-policy';
import type { LivDailyPlan } from '@/lib/liv/daily-plan-store';

export const maxDuration = 300;
const MIN_VERIFIED_RESEARCH_SOURCES = 2;
const MIN_LINEUP_NAMES = 2;

type LivPublicationMode = 'draft' | 'human_approval' | 'auto_publish';

function resolveLivPublicationMode(): LivPublicationMode {
  const raw = (process.env.LIV_DAILY_PUBLICATION_MODE || '').trim().toLowerCase();
  if (raw === 'human_approval' || raw === 'auto_publish') return raw;
  // Safe default. The legacy LIV_DAILY_WEBFLOW_STATUS is intentionally ignored
  // so an old env value cannot silently turn on live publication.
  return 'draft';
}

async function reportGa4(
  status: 'draft' | 'published' | 'skipped' | 'failed',
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

export async function runLivDaily(req: NextRequest, preparation?: {
  dayKey: string; kind: 'scheduled' | 'reserve'; defaultPlan: LivDailyPlan;
}) {
  const scope: LivDailyScope = preparation ? preparation.kind === 'reserve' ? 'reserve' : 'prepare' : 'daily';
  const claimLivDaily = (day: string) => preparation ? claimDaily(day, scope) : claimDaily(day);
  const finishLivDaily: typeof finishDaily = (day, input) => preparation ? finishDaily(day, input, scope) : finishDaily(day, input);
  const checkpointLivDailyCmsItem: typeof checkpointCms = (day, item) => preparation ? checkpointCms(day, item, scope) : checkpointCms(day, item);
  const checkpointLivDailyArticle: typeof checkpointArticle = (day, article) => preparation ? checkpointArticle(day, article, scope) : checkpointArticle(day, article);
  const markPlanFailed = (day: string, reason: string) => preparation?.kind === 'reserve' ? Promise.resolve() : failPlan(day, reason);
  // Preparation has a bounded media budget so the remaining safety/CMS checks
  // still finish inside Vercel's 300 second function limit.
  const mediaDeadline = Date.now() + (preparation ? 210_000 : 240_000);
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  const sp = req.nextUrl.searchParams;
  const dryRun = sp.get('dryRun') === '1' || sp.get('dryRun')?.toLowerCase() === 'true';
  const dayKey = preparation?.dayKey ?? todayDayKeyUTC();
  const baseUrl = livInternalOrigin(req.nextUrl.origin);
  const publicationMode = resolveLivPublicationMode();
  // The shared CMS writer saves staged drafts, not live items. Requested mode
  // must never be mistaken for an observed publication result.
  const livWebflowStatus = 'draft' as const;

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
    try {
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
    } catch (e) {
      const msg = e instanceof Error && /^liv_trending_(http_\d{3}|invalid_response|unavailable)$/.test(e.message)
        ? e.message : 'liv_dry_run_failed';
      return NextResponse.json({ ok: false, dryRun: true, error: msg, dayKey },
        { status: 503, headers: { 'Cache-Control': 'no-store' } });
    }
  }

  const claim = await claimLivDaily(dayKey);
  if (claim.ok === false) {
    logger.info('[cron/liv-daily] skipped (claim)', { dayKey, reason: claim.reason });
    return NextResponse.json({ ok: true, skipped: true, reason: claim.reason, dayKey });
  }

  let pickedTopicTitle: string | undefined;
  let savedWebflowItemId: string | undefined;
  let gateResults: GateResult[] = [];
  const savedPlan = await getLivDailyPlan(dayKey);
  // A transport failure must not silently replace an editor's selected topic.
  const plan = preparation?.kind === 'reserve'
    ? preparation.defaultPlan
    : preparation
      ? (savedPlan ?? preparation.defaultPlan)
      : savedPlan;
  const { topicHint, mustUseTrending } = resolveLivTopicInputsFromPlan(plan);

  try {
    const prepRow = preparation ? await getAdminDb()?.collection('livDailyArticles')
      .doc(livDailyDocId(dayKey, scope)).get() : null;
    const checkpoint = prepRow?.data()?.articleCheckpoint as GeneratedArticle | undefined;
    const resumeWritingRunId = prepRow?.data()?.resumeWritingRunId as string | undefined;
    const pickedTopic = resumeWritingRunId && prepRow?.data()?.topic && !checkpoint
      ? { title: prepRow.data()!.topic as string, score: 0 }
      : checkpoint
      ? { title: prepRow?.data()?.topic || checkpoint.title, score: 0,
          source: checkpoint.researchSources?.[0] ? {
            title: checkpoint.researchSources[0].title,
            url: checkpoint.researchSources[0].url || undefined,
            excerpt: checkpoint.researchSources[0].snippet,
            sourceName: checkpoint.researchSources[0].source,
            publishedAt: checkpoint.researchSources[0].publishedAt || undefined,
          } : undefined }
      : await pickLivTopic({ baseUrl, topicHint, mustUseTrending, currentRunId: livDailyDocId(dayKey, scope) });
    // Picker owns exclusions, including explicit hints. Do not reintroduce an
    // excluded topic via a second synthetic fallback here.
    const topic = pickedTopic;
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

    let article = checkpoint ?? await generateLivArticle({
      topic,
      expandedDirective: plan?.expandedDirective,
      directiveHint: plan?.directiveHint,
      articleFormat: plan?.articleFormat,
      sourceScope: 'liv-daily',
      baseUrl,
      preparation: !!preparation,
      resumeWritingRunId,
      targetWordCount: preparation ? 650 : undefined,
    });
    await checkpointLivDailyArticle(dayKey, article);
    if (preparation && !checkpoint) {
      await yieldLivPreparation(dayKey, scope as 'prepare' | 'reserve');
      return NextResponse.json({ status: 'text_prepared', dayKey, title: article.title });
    }

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

    if (publicationMode === 'auto_publish' || preparation) {
      const hadMedia = (article.preparedMedia?.length ?? 0) >= 3;
      article = await prepareLivAutomaticMedia(article, { dayKey, deadline: mediaDeadline });
      await checkpointLivDailyArticle(dayKey, article);
      if (preparation && !hadMedia) {
        await yieldLivPreparation(dayKey, scope as 'prepare' | 'reserve');
        return NextResponse.json({ status: 'media_prepared', dayKey, title: article.title });
      }
    }

    // Check the final body including generated captions, not a text-only revision.
    const gates = await runSafetyGates({
      baseUrl,
      title: article.title,
      content: article.content,
      intro: article.intro,
      authorName: 'Liv Brandt',
      sourceExcerpt: topic.source?.excerpt || article.researchSources?.[0]?.snippet,
      sourceUrls: [...new Set([topic.source?.url, ...(article.researchSources || []).map(source => source.url)].filter((url): url is string => !!url))].slice(0, 8),
      additionalTexts: [article.subtitle, article.excerpt, article.seoTitle, article.seoDescription, article.ratingReason].filter(Boolean),
      requireCompleteVerification: publicationMode === 'auto_publish' || !!preparation,
      timeoutMs: preparation ? 90_000 : undefined,
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
      aiModel: article.aiModel,
    });

    // Structure is only one part of approval. CMS fields and assets are checked
    // after saving, and live publication has its own verified receipt.
    const cmsCheck = checkCmsDraft(article, preparation ? 650 : 1000);
    let preparationProof: PreparationProof | undefined;
    if (preparation) {
      if (!cmsCheck.structureReady) throw new Error('liv_preparation_structure_failed');
      preparationProof = { expected: payload, hash: cmsFieldHash(payload as unknown as Record<string, unknown>),
        editorialPassed: true, structurePassed: true,
        ...(preparation.kind === 'scheduled' ? { planHash: editorialPlanHash(plan ?? null) } : {}) };
      await checkpointPreparationProof(dayKey, preparation.kind === 'reserve' ? 'reserve' : 'prepare', preparationProof);
    }

    const { articleId: webflowItemId, receipt } = await publishArticleDraftToWebflow(payload, {
      source: 'liv',
      defaultAuthor: 'Liv Brandt',
      defaultCategory: 'Kultur',
      onSaved: async itemId => {
        savedWebflowItemId = itemId;
        await checkpointLivDailyCmsItem(dayKey, itemId);
      },
    });
    savedWebflowItemId = webflowItemId;
    const cmsReadback = await inspectLivCmsDraft({ itemId: webflowItemId, expected: payload });
    gateResults.push({
      name: 'cms-draft-readback',
      pass: cmsReadback.draftConfirmed,
      detail: `Dansk kladde læst tilbage: ${webflowItemId}. Ikke live.`,
    });
    gateResults.push({
      name: 'cms-draft-fields',
      pass: cmsReadback.checks.length > 0 && cmsReadback.checks.every(check => check.ok),
      detail: cmsReadback.checks.filter(check => !check.ok).map(check => check.id).join(', '),
    });

    const canPublish = cmsCheck.structureReady && cmsReadback.publicationReady &&
      cmsReadback.checks.length > 0 && cmsReadback.checks.every(check => check.ok);
    let liveReceipt: Awaited<ReturnType<typeof publishVerifiedLivArticle>> | undefined;
    if (publicationMode === 'auto_publish') {
      gateResults.push({ name: 'cms-publication', pass: canPublish,
        detail: canPublish ? 'Struktur, CMS og billedkontroller bestået.' : [
          ...cmsCheck.checks.filter(check => !check.ok).map(check => check.id),
          ...cmsReadback.checks.filter(check => !check.ok).map(check => check.id),
        ].join(', ') || 'CMS-kontrol er ikke færdig.' });
      if (canPublish && !preparation) liveReceipt = await publishVerifiedLivArticle({ itemId: webflowItemId, expected: payload });
    }
    if (preparation && canPublish) {
      const today = copenhagenClock().day;
      await admitPreparedArticle({ itemId: webflowItemId, slug: article.slug, title: article.title,
        scheduledDay: preparation.kind === 'reserve' ? today : dayKey,
        expiresDay: preparation.kind === 'reserve' ? addDays(dayKey, 5) : dayKey,
        kind: preparation.kind }, preparationProof!);
    }
    const publicationVerified = liveReceipt?.publicationVerified === true;
    const observedStatus = publicationVerified ? 'published' as const : 'draft' as const;

    await finishLivDaily(dayKey, {
      status: observedStatus,
      topic: topic.title,
      title: article.title,
      slug: article.slug,
      webflowItemId,
      gateResults,
      sourceUrl: topic.source?.url,
    });
    if (plan && !preparation) {
      await markPlanUsed(dayKey);
    }

    await reportGa4(observedStatus, {
      day_key: dayKey,
      topic: topic.title.slice(0, 100),
      slug: article.slug,
      word_count: article.content.split(/\s+/).filter(Boolean).length,
    });

    logger.info('[cron/liv-daily] completed with verified status', {
      dayKey,
      slug: article.slug,
      webflowItemId,
      webflowStatus: observedStatus,
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
      webflowStatus: observedStatus,
      publicationMode,
      publicationBlocked: !publicationVerified,
      publicationVerified,
      queued: !!preparation && canPublish,
      ...(liveReceipt ? { liveReceipt } : {}),
      saveState: receipt.saveState,
      saveVerified: receipt.saveVerified,
      gateResults,
      qa,
      cmsCheck,
      cmsReadback,
    });
  } catch (e) {
    if (e instanceof ArticleSaveError && e.articleId) savedWebflowItemId = e.articleId;
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    const stack = e instanceof Error ? e.stack : undefined;
    await finishLivDaily(dayKey, {
      status: 'failed',
      topic: pickedTopicTitle,
      reason: msg,
      gateResults,
      ...(savedWebflowItemId ? { webflowItemId: savedWebflowItemId } : {}),
    });
    await reportGa4('failed', { reason: msg.slice(0, 100), day_key: dayKey });
    if (plan) {
      await markPlanFailed(dayKey, msg);
    }
    logger.error('[cron/liv-daily] unhandled error', e instanceof Error ? e : new Error(msg), { dayKey, stack });
    return NextResponse.json({ error: msg, dayKey }, { status: 500 });
  }
}
