import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { buildWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { getRecentNewsletterExclusionSets } from '@/lib/newsletter/send-selection-history';
import { getIsoWeekRangeByOffset } from '@/lib/newsletter/week-range';

const DEFAULT_EXCLUDE_SENDS = 16;
const DEFAULT_RELAX_SENDS = 4;
const MAX_WEEK_OFFSET_BACK = -12;

function parseLookback(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 52);
}

/**
 * Preview for any week: `weekOffset` in body (0 = current week, -1 = previous, default -1).
 * Disable article exclusions for historical weeks so old content is shown faithfully.
 */
export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const skipAiIntro = body.skipAiIntro === true;
    const rawOffset = typeof body.weekOffset === 'number' ? Math.floor(body.weekOffset) : -1;
    const weekOffset = Math.max(MAX_WEEK_OFFSET_BACK, Math.min(0, rawOffset));
    const isCurrentWeek = weekOffset === -1;

    const week = getIsoWeekRangeByOffset(weekOffset);

    const fullLb = parseLookback(process.env.NEWSLETTER_WEEKLY_EXCLUDE_SEND_LOOKBACK, DEFAULT_EXCLUDE_SENDS);
    const relaxLb = parseLookback(process.env.NEWSLETTER_WEEKLY_RELAX_SEND_LOOKBACK, DEFAULT_RELAX_SENDS);
    const { excludeFull, excludeRelax } = isCurrentWeek
      ? await getRecentNewsletterExclusionSets(fullLb, relaxLb)
      : { excludeFull: new Set<string>(), excludeRelax: new Set<string>() };

    const draft = await buildWeeklyNewsletterDraft({
      week,
      excludeArticleIds: excludeFull,
      relaxedExcludeArticleIds: excludeRelax,
      skipAiIntro,
      logoAssetBaseUrl: req.nextUrl.origin,
    });

    const recipients = await getNewsletterRecipients();

    return NextResponse.json({
      kind: 'weekly_auto_next',
      weekOffset,
      subject: draft.subject,
      html: draft.html,
      intro: draft.intro,
      headline: draft.headline,
      week: {
        labelDa: draft.week.labelDa,
        start: draft.week.start.toISOString(),
        end: draft.week.end.toISOString(),
        isoWeek: draft.week.isoWeek,
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
      articlePoolStats: draft.articlePoolStats,
      skipAiIntro,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}
