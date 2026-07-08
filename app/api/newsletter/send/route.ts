import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 300;

import { authorizeNewsletterRequest, getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { recordManualNewsletterLog } from '@/lib/newsletter/manual-send-log';
import { buildWeeklyNewsletterDraft, HEADLINE_FALLBACK_DA } from '@/lib/newsletter/build-draft';
import { newsletterUtmCampaignFromWeek } from '@/lib/newsletter/newsletter-utm';
import { getPreviousIsoWeekRange, type WeekRange } from '@/lib/newsletter/week-range';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { sendNewsletterEmail, sendNewsletterToMany } from '@/lib/newsletter/send-resend';
import { rewriteNewsletterLogoSrcForOutgoingEmail } from '@/lib/newsletter/email-theme';
import { getRecentNewsletterExclusionSets } from '@/lib/newsletter/send-selection-history';

const DEFAULT_EXCLUDE_SENDS = 16;
const DEFAULT_RELAX_SENDS = 4;

function parseLookback(raw: string | undefined, fallback: number): number {
  const n = Number.parseInt(String(raw ?? '').trim(), 10);
  if (!Number.isFinite(n) || n < 1) return fallback;
  return Math.min(n, 52);
}

export async function POST(req: NextRequest) {
  if (!(await authorizeNewsletterRequest(req))) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const uid = await getNewsletterUserIdFromRequest(req);

  try {
    const body = await req.json().catch(() => ({}));
    const testOnly = body.testOnly === true;
    const testEmail = typeof body.testEmail === 'string' ? body.testEmail.trim() : '';
    const providedHtml = typeof body.html === 'string' && body.html.length > 0 ? body.html : null;
    const providedArticleIds = Array.isArray(body.articleIds)
      ? body.articleIds.map((id: unknown) => String(id).trim()).filter(Boolean).slice(0, 20)
      : [];
    let subject = typeof body.subject === 'string' ? body.subject.trim() : '';
    const intro = typeof body.intro === 'string' ? body.intro : '';
    const skipAiIntro = body.skipAiIntro === true;

    const ref =
      typeof body.referenceDate === 'string' && !Number.isNaN(Date.parse(body.referenceDate))
        ? new Date(body.referenceDate)
        : new Date();
    const week: WeekRange = getPreviousIsoWeekRange(ref);

    let html: string;
    let sentArticleIds: string[] = providedArticleIds;
    if (providedHtml) {
      html = rewriteNewsletterLogoSrcForOutgoingEmail(providedHtml);
      if (!subject) subject = HEADLINE_FALLBACK_DA;
    } else {
      const fullLb = parseLookback(process.env.NEWSLETTER_WEEKLY_EXCLUDE_SEND_LOOKBACK, DEFAULT_EXCLUDE_SENDS);
      const relaxLb = parseLookback(process.env.NEWSLETTER_WEEKLY_RELAX_SEND_LOOKBACK, DEFAULT_RELAX_SENDS);
      const { excludeFull, excludeRelax } = await getRecentNewsletterExclusionSets(fullLb, relaxLb);
      const draft = await buildWeeklyNewsletterDraft({
        week,
        introOverride: intro || undefined,
        skipAiIntro,
        excludeArticleIds: excludeFull,
        relaxedExcludeArticleIds: excludeRelax,
      });
      html = rewriteNewsletterLogoSrcForOutgoingEmail(draft.html);
      sentArticleIds = draft.articles.map((a) => a.id);
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
        if (uid) {
          await recordManualNewsletterLog({
            uid,
            kind: 'test',
            status: 'failed',
            subject: subject || HEADLINE_FALLBACK_DA,
            detail: `Test til ${testEmail}`,
            error: r.error || 'Send fejlede',
          });
        }
        return NextResponse.json({ error: r.error || 'Send fejlede' }, { status: 502 });
      }
      if (uid) {
        await recordManualNewsletterLog({
          uid,
          kind: 'test',
          status: 'sent',
          subject,
          detail: `Test til ${testEmail}`,
        });
      }
      return NextResponse.json({ ok: true, mode: 'test', to: testEmail });
    }

    const recipients = await getNewsletterRecipients();
    if (recipients.emails.length === 0) {
      const errMsg = recipients.error || 'Ingen aktive modtagere (alle frameldt eller ingen tilmeldinger)';
      if (uid) {
        await recordManualNewsletterLog({
          uid,
          kind: 'broadcast',
          status: 'failed',
          subject: subject || HEADLINE_FALLBACK_DA,
          detail: 'Ingen modtagere',
          error: errMsg,
        });
      }
      return NextResponse.json({ error: errMsg }, { status: 400 });
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

    if (uid) {
      if (result.sent === 0 && result.failed > 0) {
        await recordManualNewsletterLog({
          uid,
          kind: 'broadcast',
          status: 'failed',
          subject,
          detail: `${result.failed} fejlede`,
          error: result.errors.slice(0, 8).join('; ') || 'Alle afsendelser fejlede',
        });
      } else if (result.sent > 0) {
        await recordManualNewsletterLog({
          uid,
          kind: 'broadcast',
          status: 'sent',
          subject,
          detail: `${result.sent} sendt${result.failed > 0 ? ` · ${result.failed} fejl` : ''}`,
          articleIds: sentArticleIds.length > 0 ? sentArticleIds : undefined,
        });
      }
    }

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
