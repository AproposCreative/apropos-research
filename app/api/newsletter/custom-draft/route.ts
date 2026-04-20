import { NextRequest, NextResponse } from 'next/server';
import { authorizeNewsletterRequest } from '@/lib/newsletter/auth-request';
import { buildCustomNewsletterDraft } from '@/lib/newsletter/build-draft';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';

export async function POST(req: NextRequest) {
  if (!(await authorizeNewsletterRequest(req))) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const rawIds = body.articleIds;
    if (!Array.isArray(rawIds)) {
      return NextResponse.json({ error: 'articleIds skal være et array af id-strenge' }, { status: 400 });
    }
    const articleIds = rawIds
      .map((x: unknown) => (typeof x === 'string' ? x.trim() : ''))
      .filter(Boolean);
    if (articleIds.length === 0) {
      return NextResponse.json({ error: 'Vælg mindst én artikel' }, { status: 400 });
    }

    const intro = typeof body.intro === 'string' ? body.intro : '';
    const skipAiIntro = body.skipAiIntro === true;
    const headline = typeof body.headline === 'string' ? body.headline : '';
    const subject = typeof body.subject === 'string' ? body.subject : '';

    const draft = await buildCustomNewsletterDraft({
      articleIds,
      intro,
      skipAiIntro,
      headline: headline || undefined,
      subject: subject || undefined,
      logoAssetBaseUrl: req.nextUrl.origin,
    });

    const recipients = await getNewsletterRecipients();

    return NextResponse.json({
      kind: 'custom' as const,
      subject: draft.subject,
      html: draft.html,
      intro: draft.intro,
      headline: draft.headline,
      weekLabel: 'Tilpasset udsendelse',
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
        authorName: a.authorName ?? null,
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
    const msg = e instanceof Error ? e.message : 'Ukendt fejl';
    const status =
      msg.includes('højst') || msg.includes('Ingen') || msg.includes('artikel')
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
