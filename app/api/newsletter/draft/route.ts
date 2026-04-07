import { NextRequest, NextResponse } from 'next/server';
import { authorizeNewsletterRequest } from '@/lib/newsletter/auth-request';
import { buildWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';
import { getPreviousIsoWeekRange, type WeekRange } from '@/lib/newsletter/week-range';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { stripUnsubscribePlaceholderForPreview } from '@/lib/newsletter/inject-unsubscribe';

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

    const draft = await buildWeeklyNewsletterDraft({
      week,
      introOverride,
      skipAiIntro,
      logoAssetBaseUrl: req.nextUrl.origin,
    });

    const recipients = await getNewsletterRecipients();

    return NextResponse.json({
      subject: draft.subject,
      html: stripUnsubscribePlaceholderForPreview(draft.html),
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
