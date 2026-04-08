import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

import { authorizeNewsletterRequest } from '@/lib/newsletter/auth-request';
import { buildWeeklyNewsletterDraft, newsletterSubject } from '@/lib/newsletter/build-draft';
import { newsletterUtmCampaignFromWeek } from '@/lib/newsletter/newsletter-utm';
import { getPreviousIsoWeekRange, type WeekRange } from '@/lib/newsletter/week-range';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { sendNewsletterEmail, sendNewsletterToMany } from '@/lib/newsletter/send-resend';
import { rewriteNewsletterLogoSrcForOutgoingEmail } from '@/lib/newsletter/email-theme';

export async function POST(req: NextRequest) {
  if (!(await authorizeNewsletterRequest(req))) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const testOnly = body.testOnly === true;
    const testEmail = typeof body.testEmail === 'string' ? body.testEmail.trim() : '';
    const providedHtml = typeof body.html === 'string' && body.html.length > 0 ? body.html : null;
    let subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const intro = typeof body.intro === 'string' ? body.intro : '';
    const skipAiIntro = body.skipAiIntro === true;

    const ref =
      typeof body.referenceDate === 'string' && !Number.isNaN(Date.parse(body.referenceDate))
        ? new Date(body.referenceDate)
        : new Date();
    const week: WeekRange = getPreviousIsoWeekRange(ref);

    let html: string;
    if (providedHtml) {
      html = rewriteNewsletterLogoSrcForOutgoingEmail(providedHtml);
      if (!subject) subject = newsletterSubject(week);
    } else {
      const draft = await buildWeeklyNewsletterDraft({
        week,
        introOverride: intro || undefined,
        skipAiIntro,
      });
      html = rewriteNewsletterLogoSrcForOutgoingEmail(draft.html);
      if (!subject) subject = draft.subject;
    }

    if (testOnly) {
      if (!testEmail) {
        return NextResponse.json({ error: 'testEmail kræves ved testOnly' }, { status: 400 });
      }
      const r = await sendNewsletterEmail({
        to: testEmail,
        subject,
        html,
        tags: [
          { name: 'channel', value: 'newsletter' },
          { name: 'campaign', value: newsletterUtmCampaignFromWeek(week).slice(0, 128) },
        ],
      });
      if (!r.ok) {
        return NextResponse.json({ error: r.error || 'Send fejlede' }, { status: 502 });
      }
      return NextResponse.json({ ok: true, mode: 'test', to: testEmail });
    }

    const recipients = await getNewsletterRecipients();
    if (recipients.emails.length === 0) {
      return NextResponse.json(
        { error: recipients.error || 'Ingen aktive modtagere (alle frameldt eller ingen tilmeldinger)' },
        { status: 400 }
      );
    }

    const campaign = newsletterUtmCampaignFromWeek(week);
    const result = await sendNewsletterToMany({
      recipients: recipients.emails,
      subject,
      html,
      tags: [
        { name: 'channel', value: 'newsletter' },
        { name: 'campaign', value: campaign.slice(0, 128) },
      ],
    });

    return NextResponse.json({
      ok: result.failed === 0,
      mode: 'broadcast',
      sent: result.sent,
      failed: result.failed,
      errors: result.errors.slice(0, 20),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Ukendt fejl' },
      { status: 500 }
    );
  }
}
