import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { buildWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { getRecentWeeklyAutoArticleIds } from '@/lib/newsletter/weekly-send-history';

const DEFAULT_EXCLUDE_SENDS = 16;
const DEFAULT_RELAX_SENDS = 4;

function parseLookback(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 52);
}

/** Samme kladde som det automatiske ugentlige cron (ekskluderinger + indhold). */
export async function POST(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const skipAiIntro = body.skipAiIntro === true;

    const fullLb = parseLookback(process.env.NEWSLETTER_WEEKLY_EXCLUDE_SEND_LOOKBACK, DEFAULT_EXCLUDE_SENDS);
    const relaxLb = parseLookback(process.env.NEWSLETTER_WEEKLY_RELAX_SEND_LOOKBACK, DEFAULT_RELAX_SENDS);
    const [excludeFull, excludeRelax] = await Promise.all([
      getRecentWeeklyAutoArticleIds(fullLb),
      getRecentWeeklyAutoArticleIds(Math.min(relaxLb, fullLb)),
    ]);

    const draft = await buildWeeklyNewsletterDraft({
      excludeArticleIds: excludeFull,
      relaxedExcludeArticleIds: excludeRelax,
      skipAiIntro,
      logoAssetBaseUrl: req.nextUrl.origin,
    });

    const recipients = await getNewsletterRecipients();

    return NextResponse.json({
      kind: 'weekly_auto_next',
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
      skipAiIntro,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}
