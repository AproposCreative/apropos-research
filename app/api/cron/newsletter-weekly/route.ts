import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { buildWeeklyNewsletterDraft } from '@/lib/newsletter/build-draft';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { sendNewsletterToMany } from '@/lib/newsletter/send-resend';
import { rewriteNewsletterLogoSrcForOutgoingEmail } from '@/lib/newsletter/email-theme';

export const maxDuration = 300;

/**
 * Vercel Cron: hver fredag 13:00 UTC (≈ 14:00 dansk vintertid CET; 15:00 under CEST).
 * Kræver `Authorization: Bearer CRON_SECRET`.
 */
export async function GET(req: NextRequest) {
  const authz = req.headers.get('authorization') || '';
  const bearer = authz.startsWith('Bearer ') ? authz.slice(7).trim() : '';
  if (!env.CRON_SECRET || bearer !== env.CRON_SECRET) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  try {
    const draft = await buildWeeklyNewsletterDraft({});
    const recipients = await getNewsletterRecipients();

    if (!recipients.emails.length) {
      return NextResponse.json(
        {
          ok: false,
          error: recipients.error || 'Ingen aktive modtagere',
          warnings: draft.warnings,
          articleCount: draft.articles.length,
        },
        { status: 400 }
      );
    }

    const result = await sendNewsletterToMany({
      recipients: recipients.emails,
      subject: draft.subject,
      html: rewriteNewsletterLogoSrcForOutgoingEmail(draft.html),
    });

    return NextResponse.json({
      ok: result.failed === 0,
      subject: draft.subject,
      sent: result.sent,
      failed: result.failed,
      articleCount: draft.articles.length,
      warnings: draft.warnings,
      errors: result.errors.slice(0, 30),
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Cron fejl' },
      { status: 500 }
    );
  }
}
