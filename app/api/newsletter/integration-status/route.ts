import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { getNewsletterRecipients } from '@/lib/newsletter/get-recipients';
import { env } from '@/lib/config/env';

/**
 * Kræver Firebase ID-token. Tjekker om nyhedsbrevs-modtagere kan hentes fra Webflow (aproposmagazine)
 * og om GA4 + Resend-webhook er konfigureret korrekt.
 */
export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  // Tracking-/analytics-konfiguration (åbninger + klik via Resend → GA4 MP).
  const ga4MeasurementId = (env.GA4_MEASUREMENT_ID || env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim();
  const ga4Secret = (env.GA4_MEASUREMENT_PROTOCOL_SECRET || '').trim();
  const resendWebhookSecret = (env.RESEND_WEBHOOK_SECRET || '').trim();
  const resendApiKey = (env.RESEND_API_KEY || '').trim();

  const tracking = {
    ga4: {
      configured: Boolean(ga4MeasurementId && ga4Secret),
      hasMeasurementId: Boolean(ga4MeasurementId),
      hasMeasurementProtocolSecret: Boolean(ga4Secret),
    },
    resend: {
      configured: Boolean(resendApiKey),
      hasApiKey: Boolean(resendApiKey),
      webhookConfigured: Boolean(resendWebhookSecret),
    },
    pipeline: {
      // Hele pipeline ende-til-ende klar (sende mail + modtage events + sende til GA4).
      ready: Boolean(resendApiKey && resendWebhookSecret && ga4MeasurementId && ga4Secret),
      missing: [
        !resendApiKey ? 'RESEND_API_KEY' : null,
        !resendWebhookSecret ? 'RESEND_WEBHOOK_SECRET' : null,
        !ga4MeasurementId ? 'GA4_MEASUREMENT_ID (eller NEXT_PUBLIC_GA_MEASUREMENT_ID)' : null,
        !ga4Secret ? 'GA4_MEASUREMENT_PROTOCOL_SECRET' : null,
      ].filter(Boolean) as string[],
    },
  };

  try {
    const r = await getNewsletterRecipients();
    const connected =
      (r.source === 'forms-api' || r.source === 'cms-collection') && !r.error;
    return NextResponse.json({
      connected,
      recipientCount: r.emails.length,
      totalSignups: r.total,
      unsubscribedCount: r.unsubscribedCount,
      source: r.source,
      formName: r.formName ?? null,
      error: r.error ?? null,
      tracking,
    });
  } catch (e) {
    return NextResponse.json(
      {
        error: e instanceof Error ? e.message : 'Ukendt fejl',
        connected: false,
        tracking,
      },
      { status: 500 }
    );
  }
}
