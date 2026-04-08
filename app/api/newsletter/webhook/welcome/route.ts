import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { extractEmailFromWebflowFormData } from '@/lib/newsletter/webhook-form-email';
import { removeUnsubscribeRecordsForEmails } from '@/lib/newsletter/unsubscribe-store';
import { sendWelcomeSignupEmail } from '@/lib/newsletter/send-resend';

type WebflowFormSubmissionBody = {
  triggerType?: string;
  payload?: {
    name?: string;
    siteId?: string;
    data?: Record<string, unknown>;
    formId?: string;
  };
  data?: Record<string, unknown>;
};

function resolveFormData(body: WebflowFormSubmissionBody): Record<string, unknown> | undefined {
  const p = body.payload?.data;
  if (p && typeof p === 'object') return p;
  const d = body.data;
  if (d && typeof d === 'object') return d;
  return undefined;
}

/**
 * Webflow → velkomstmail via Resend (uden Zapier).
 * Af default på pause: sæt NEWSLETTER_WELCOME_WEBHOOK_ENABLED=true for at sende.
 * URL: POST https://<dit-domæne>/api/newsletter/webhook/welcome?secret=<NEWSLETTER_WEBHOOK_SECRET>
 */
export async function POST(req: NextRequest) {
  if (env.NEWSLETTER_WELCOME_WEBHOOK_ENABLED !== 'true') {
    return NextResponse.json(
      {
        ok: false,
        paused: true,
        error: 'Velkomstmail via webhook er sat på pause (NEWSLETTER_WELCOME_WEBHOOK_ENABLED≠true)',
      },
      { status: 503 }
    );
  }

  const secret = env.NEWSLETTER_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json(
      { ok: false, error: 'NEWSLETTER_WEBHOOK_SECRET er ikke konfigureret' },
      { status: 503 }
    );
  }

  const url = new URL(req.url);
  const qSecret = url.searchParams.get('secret')?.trim();
  const headerSecret = req.headers.get('x-newsletter-webhook-secret')?.trim();
  if (qSecret !== secret && headerSecret !== secret) {
    return NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 });
  }

  let body: WebflowFormSubmissionBody;
  try {
    body = (await req.json()) as WebflowFormSubmissionBody;
  } catch {
    return NextResponse.json({ ok: false, error: 'Ugyldig JSON' }, { status: 400 });
  }

  const siteId = body.payload?.siteId;
  const expectedSite = env.WEBFLOW_SITE_ID?.trim();
  if (expectedSite && siteId && siteId !== expectedSite) {
    return NextResponse.json({ ok: false, error: 'Forkert site' }, { status: 403 });
  }

  const formFilter = env.WEBFLOW_NEWSLETTER_FORM_ID?.trim();
  if (formFilter) {
    const f = formFilter.toLowerCase();
    const incomingId = (body.payload?.formId || '').trim().toLowerCase();
    const formName = (body.payload?.name || '').toLowerCase();
    const idMatch = incomingId.length > 0 && (incomingId === f || incomingId.includes(f));
    const nameMatch = formName.includes(f);
    if (!idMatch && !nameMatch) {
      return NextResponse.json({ ok: true, skipped: true, reason: 'form_filter_mismatch' });
    }
  }

  const formData = resolveFormData(body);
  const email = extractEmailFromWebflowFormData(formData);
  if (!email) {
    return NextResponse.json(
      { ok: false, error: 'Ingen gyldig e-mail i payload' },
      { status: 422 }
    );
  }

  await removeUnsubscribeRecordsForEmails([email]);

  const send = await sendWelcomeSignupEmail(email);
  if (!send.ok) {
    return NextResponse.json(
      { ok: false, error: send.error || 'Kunne ikke sende mail' },
      { status: 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
