import { NextRequest, NextResponse } from 'next/server';
import { requireCronBearer } from '@/lib/cron/cron-auth';
import { env } from '@/lib/config/env';
import {
  getCopenhagenHour,
  getCopenhagenIsoWeekKey,
  getCopenhagenIsoWeekday,
  getCopenhagenMinute,
  isCopenhagenWeekdayAtOrAfterSchedule,
} from '@/lib/newsletter/copenhagen-time';
import { getWeeklyAutoSettings } from '@/lib/newsletter/weekly-auto-settings';
import { buildWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { sendNewsletterToMany } from '@/lib/newsletter/send-resend';
import { rewriteNewsletterLogoSrcForOutgoingEmail } from '@/lib/newsletter/email-theme';
import { buildWeeklyDraftInputHash, saveWeeklyDraftCache } from '@/lib/newsletter/draft-cache';
import {
  claimWeeklyAutoSend,
  finishWeeklyAutoSend,
  getRecentWeeklyAutoExclusionSets,
} from '@/lib/newsletter/weekly-send-history';

export const maxDuration = 300;

const DEFAULT_EXCLUDE_SENDS = 16;
const DEFAULT_RELAX_SENDS = 4;

function parseLookback(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 52);
}

/**
 * Auto-nyhedsbrev: konfigurerbar ugedag + tid (Europe/Copenhagen), idempotent pr. ISO-uge.
 * Vercel: cron hvert 15. minut så valgt tidspunkt kan ramme (standard: fredag 12:00).
 */
export async function GET(req: NextRequest) {
  const authFail = requireCronBearer(req);
  if (authFail) return authFail;

  const sp = req.nextUrl.searchParams;
  const dryRun =
    sp.get('dryRun') === '1' || sp.get('dryRun')?.toLowerCase() === 'true';
  const dryRunWithAi = sp.get('withAi') === '1' || sp.get('withAi')?.toLowerCase() === 'true';

  const now = new Date();
  const weekKey = getCopenhagenIsoWeekKey(now);
  const weeklyAuto = await getWeeklyAutoSettings();
  const timeGateOk = isCopenhagenWeekdayAtOrAfterSchedule(
    now,
    weeklyAuto.weekdayIso,
    weeklyAuto.hour,
    weeklyAuto.minute
  );
  const devBypassTimeGate =
    env.NODE_ENV === 'development' && env.NEWSLETTER_WEEKLY_BYPASS_TIME_GATE === 'true';

  if (dryRun) {
    const fullLb = parseLookback(process.env.NEWSLETTER_WEEKLY_EXCLUDE_SEND_LOOKBACK, DEFAULT_EXCLUDE_SENDS);
    const relaxLb = parseLookback(process.env.NEWSLETTER_WEEKLY_RELAX_SEND_LOOKBACK, DEFAULT_RELAX_SENDS);
    const { excludeFull, excludeRelax } = await getRecentWeeklyAutoExclusionSets(fullLb, relaxLb);
    const draft = await buildWeeklyNewsletterDraft({
      excludeArticleIds: excludeFull,
      relaxedExcludeArticleIds: excludeRelax,
      skipAiIntro: !dryRunWithAi,
    });
    const recipients = await getNewsletterRecipients();
    console.info('[cron/newsletter-weekly]', {
      dryRun: true,
      weekKey,
      timeGateOk,
      articleCount: draft.articles.length,
      recipientCount: recipients.emails.length,
    });
    return NextResponse.json({
      ok: true,
      dryRun: true,
      weekKey,
      timeGateOk,
      weeklyAuto,
      devBypassTimeGateAvailable: devBypassTimeGate,
      newsletterContentWeek: draft.week,
      subject: draft.subject,
      headline: draft.headline,
      introPreview: draft.intro.slice(0, 400),
      skipAiIntro: !dryRunWithAi,
      articles: draft.articles.map((a) => ({
        id: a.id,
        title: a.title,
        url: a.url,
      })),
      warnings: draft.warnings,
      recipientCount: recipients.emails.length,
      recipientError: recipients.error ?? null,
      excludeFullCount: excludeFull.size,
      excludeRelaxCount: excludeRelax.size,
      hint: 'dryRun: ?withAi=1 for AI-intro. Development: NEWSLETTER_WEEKLY_BYPASS_TIME_GATE.',
    });
  }

  if (!weeklyAuto.enabled && !devBypassTimeGate) {
    console.info('[cron/newsletter-weekly]', {
      skipped: true,
      reason: 'weekly_auto_disabled',
      weekKey,
      weeklyAuto,
      hint: 'Slå til under Nyhedsbrev → Automatisk hver uge, eller sæt enabled i Firestore newsletterSettings/weeklyAuto.',
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'weekly_auto_disabled',
      weekKey,
      weeklyAuto,
    });
  }

  if (!timeGateOk && !devBypassTimeGate) {
    console.info('[cron/newsletter-weekly]', {
      skipped: true,
      reason: 'time_gate',
      weekKey,
      weeklyAuto: {
        enabled: weeklyAuto.enabled,
        weekdayIso: weeklyAuto.weekdayIso,
        hour: weeklyAuto.hour,
        minute: weeklyAuto.minute,
      },
      copenhagen: {
        weekdayIso: getCopenhagenIsoWeekday(now),
        hour: getCopenhagenHour(now),
        minute: getCopenhagenMinute(now),
      },
      hint: 'Cron kører hvert 15. min (UTC). Send sker først når København har ramt valgt ugedag og klokken ≥ planlagt tid. Tjek at weekdayIso (1=man…7=søn) matcher UI.',
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'time_gate',
      weekKey,
      weeklyAuto,
    });
  }

  const claim = await claimWeeklyAutoSend(weekKey);

  if (claim.ok === false) {
    console.info('[cron/newsletter-weekly]', {
      skipped: true,
      reason: claim.reason,
      weekKey,
      hint:
        claim.reason === 'already_done'
          ? 'Denne ISO-uge er allerede sendt/skippet — se Firestore newsletterWeeklySends/auto-{uge}.'
          : claim.reason === 'already_processing'
            ? 'Et send kører allerede (eller for nylig); vent på timeout/retry.'
            : claim.reason === 'no_db'
              ? 'Firestore admin mangler — sæt Firebase Admin env på Vercel.'
              : undefined,
    });
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: claim.reason,
      weekKey,
    });
  }

  const fullLb = parseLookback(process.env.NEWSLETTER_WEEKLY_EXCLUDE_SEND_LOOKBACK, DEFAULT_EXCLUDE_SENDS);
  const relaxLb = parseLookback(process.env.NEWSLETTER_WEEKLY_RELAX_SEND_LOOKBACK, DEFAULT_RELAX_SENDS);

  try {
    const { excludeFull, excludeRelax } = await getRecentWeeklyAutoExclusionSets(fullLb, relaxLb);

    const draft = await buildWeeklyNewsletterDraft({
      excludeArticleIds: excludeFull,
      relaxedExcludeArticleIds: excludeRelax,
    });

    const prodHost = env.VERCEL_PROJECT_PRODUCTION_URL?.trim().replace(/\/$/, '').replace(/^https?:\/\//, '');
    const logoBase =
      env.NEXT_PUBLIC_BASE_URL?.trim().replace(/\/$/, '') ||
      (prodHost ? `https://${prodHost}` : '') ||
      (env.VERCEL_URL ? `https://${env.VERCEL_URL.replace(/^https?:\/\//, '')}` : '');
    const cacheHash = buildWeeklyDraftInputHash({
      week: draft.week,
      articles: draft.articles,
      skipAiIntro: false,
      logoAssetBaseUrl: logoBase,
    });
    await saveWeeklyDraftCache(draft, cacheHash);

    const recipients = await getNewsletterRecipients();

    if (!recipients.emails.length) {
      await finishWeeklyAutoSend(weekKey, {
        status: 'skipped',
        reason: recipients.error || 'Ingen aktive modtagere',
      });
      console.info('[cron/newsletter-weekly]', {
        weekKey,
        skipped: true,
        reason: 'no_recipients',
        articleCount: draft.articles.length,
        warnings: draft.warnings,
        vercelCron: req.headers.get('x-vercel-cron') ?? undefined,
        hint: 'Tjek Webflow-formular / CMS til tilmeldinger og getNewsletterRecipients.',
      });
      return NextResponse.json({
        ok: true,
        skipped: true,
        reason: 'no_recipients',
        weekKey,
        articleCount: draft.articles.length,
        warnings: draft.warnings,
      });
    }

    const html = rewriteNewsletterLogoSrcForOutgoingEmail(draft.html);
    const result = await sendNewsletterToMany({
      recipients: recipients.emails,
      subject: draft.subject,
      html,
      tags: [
        { name: 'channel', value: 'newsletter' },
        { name: 'send_type', value: 'weekly_auto' },
        { name: 'week_key', value: weekKey.slice(0, 32) },
      ],
    });

    const articleIds = draft.articles.map((a) => a.id);

    const warnExtra =
      result.failed > 0
        ? [`${result.failed} modtager(e) fejlede: ${result.errors.slice(0, 3).join('; ')}`]
        : [];

    if (result.sent > 0) {
      await finishWeeklyAutoSend(weekKey, {
        status: 'sent',
        articleIds,
        subject: draft.subject,
        recipientCount: recipients.emails.length,
        sent: result.sent,
        failed: result.failed,
        warnings: [...draft.warnings, ...warnExtra],
      });
    } else {
      await finishWeeklyAutoSend(weekKey, {
        status: 'failed',
        error: `${result.failed} fejlede — ${result.errors.slice(0, 5).join('; ')}`,
      });
    }

    console.info('[cron/newsletter-weekly]', {
      weekKey,
      ok: result.failed === 0,
      subject: draft.subject,
      articleIds,
      articleCount: articleIds.length,
      recipientCount: recipients.emails.length,
      sent: result.sent,
      failed: result.failed,
      warnings: draft.warnings,
      vercelCron: req.headers.get('x-vercel-cron') ?? undefined,
    });

    return NextResponse.json({
      ok: result.failed === 0,
      weekKey,
      subject: draft.subject,
      sent: result.sent,
      failed: result.failed,
      articleCount: draft.articles.length,
      warnings: draft.warnings,
      errors: result.errors.slice(0, 30),
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    const stack = e instanceof Error ? e.stack : undefined;
    await finishWeeklyAutoSend(weekKey, { status: 'failed', error: msg });
    console.error('[cron/newsletter-weekly] unhandled error', { weekKey, error: msg, stack });
    return NextResponse.json({ error: msg, weekKey }, { status: 500 });
  }
}
