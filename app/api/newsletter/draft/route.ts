import { NextRequest, NextResponse } from 'next/server';
import { authorizeNewsletterRequest } from '@/lib/newsletter/auth-request';
import {
  composeWeeklyNewsletterDraft,
  prepareWeeklyArticlesForDraft,
  type BuildDraftResult,
} from '@/lib/newsletter/build-draft';
import { getPreviousIsoWeekRange, type WeekRange } from '@/lib/newsletter/week-range';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import {
  buildWeeklyDraftInputHash,
  readLatestWeeklyDraftCache,
  readWeeklyDraftCacheByWeek,
  readWeeklyDraftCache,
  saveWeeklyDraftCache,
} from '@/lib/newsletter/draft-cache';
import { getRecentNewsletterExclusionSets } from '@/lib/newsletter/send-selection-history';

const DEFAULT_EXCLUDE_SENDS = 16;
const DEFAULT_RELAX_SENDS = 4;

function parseLookback(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 52);
}
export async function GET(req: NextRequest) {
  if (!(await authorizeNewsletterRequest(req))) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const thisWeek = getPreviousIsoWeekRange(new Date());
    let cached = await readWeeklyDraftCacheByWeek(thisWeek);
    if (!cached.hit) {
      cached = await readLatestWeeklyDraftCache();
    }
    if (!cached.hit) {
      return NextResponse.json({ found: false });
    }
    const recipients = await getNewsletterRecipients();
    const draft = cached.draft;
    return NextResponse.json({
      found: true,
      cacheHit: true,
      generatedAt: cached.generatedAt,
      subject: draft.subject,
      html: draft.html,
      intro: draft.intro,
      headline: draft.headline,
      week: {
        labelDa: draft.week.labelDa,
        start: draft.week.start.toISOString(),
        end: draft.week.end.toISOString(),
      },
      articles: draft.articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        url: a.url,
        excerpt: a.excerpt,
        thumbUrl: a.thumbUrl,
        subtitle: a.subtitle ?? null,
        ratingStars: a.ratingStars ?? null,
        metaCategoryLine: a.metaCategoryLine ?? null,
      })),
      recipientCount: recipients.emails.length,
      totalSignups: recipients.total,
      unsubscribedCount: recipients.unsubscribedCount,
      recipientSource: recipients.source,
      formName: recipients.formName || null,
      signupError: recipients.error || null,
      warnings: draft.warnings,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}

export async function POST(req: NextRequest) {
  if (!(await authorizeNewsletterRequest(req))) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const introOverride = typeof body.intro === 'string' ? body.intro : undefined;
    const skipAiIntro = body.skipAiIntro === true;
    const ref =
      typeof body.referenceDate === 'string' && !Number.isNaN(Date.parse(body.referenceDate))
        ? new Date(body.referenceDate)
        : new Date();
    const week: WeekRange = getPreviousIsoWeekRange(ref);
    const fullLb = parseLookback(process.env.NEWSLETTER_WEEKLY_EXCLUDE_SEND_LOOKBACK, DEFAULT_EXCLUDE_SENDS);
    const relaxLb = parseLookback(process.env.NEWSLETTER_WEEKLY_RELAX_SEND_LOOKBACK, DEFAULT_RELAX_SENDS);
    const { excludeFull, excludeRelax } = await getRecentNewsletterExclusionSets(fullLb, relaxLb);

    const prepared = await prepareWeeklyArticlesForDraft({
      week,
      referenceDate: ref,
      excludeArticleIds: excludeFull,
      relaxedExcludeArticleIds: excludeRelax,
    });
    const { articles, articleError: articleError, minimumNote } = prepared;
    const inputHash = buildWeeklyDraftInputHash({
      week: prepared.week,
      articles,
      introOverride,
      skipAiIntro,
      logoAssetBaseUrl: req.nextUrl.origin,
    });

    let cacheHit = false;
    let generatedAt: string | null = null;
    const cached = await readWeeklyDraftCache(prepared.week, inputHash);
    let draft: BuildDraftResult;
    if (cached.hit === true) {
      cacheHit = true;
      generatedAt = cached.generatedAt;
      draft = cached.draft;
    } else {
      draft = await composeWeeklyNewsletterDraft({
        week: prepared.week,
        articles,
        introOverride,
        skipAiIntro,
        logoAssetBaseUrl: req.nextUrl.origin,
        articleError,
        minimumNote,
        articlePoolStats: prepared.articlePoolStats,
      });
    }

    if (!cacheHit) {
      await saveWeeklyDraftCache(draft, inputHash);
    }

    const recipients = await getNewsletterRecipients();

    return NextResponse.json({
      cacheHit,
      generatedAt,
      subject: draft.subject,
      /** Med %%UNSUBSCRIBE_URL%% — klienten stripper kun til iframe-preview; send/plan bruger samme HTML. */
      html: draft.html,
      intro: draft.intro,
      headline: draft.headline,
      week: {
        labelDa: draft.week.labelDa,
        start: draft.week.start.toISOString(),
        end: draft.week.end.toISOString(),
      },
      articles: draft.articles.map((a) => ({
        id: a.id,
        title: a.title,
        slug: a.slug,
        url: a.url,
        excerpt: a.excerpt,
        thumbUrl: a.thumbUrl,
        subtitle: a.subtitle ?? null,
        ratingStars: a.ratingStars ?? null,
        metaCategoryLine: a.metaCategoryLine ?? null,
      })),
      recipientCount: recipients.emails.length,
      totalSignups: recipients.total,
      unsubscribedCount: recipients.unsubscribedCount,
      recipientSource: recipients.source,
      formName: recipients.formName || null,
      signupError: recipients.error || null,
      warnings: draft.warnings,
      articlePoolStats: prepared.articlePoolStats,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}
