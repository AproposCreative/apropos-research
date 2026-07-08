import { NextRequest, NextResponse } from 'next/server';
import { env } from '@/lib/config/env';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';

export const runtime = 'nodejs';

/**
 * GET /api/newsletter/ga4-status
 *
 * Validerer GA4 Measurement Protocol-credentials ved at sende en debug-event til
 * `/debug/mp/collect`. Returnerer `validationMessages` direkte fra Google så fejl
 * (forkert id, forkert secret, ukendt event, etc.) kan ses i UI.
 *
 * Sender INGEN rigtige events — kun validate-endpointet bruges.
 */
export async function GET(req: NextRequest) {
  const uid = await getNewsletterUserIdFromRequest(req);
  if (!uid) {
    return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  }

  const measurementId = (env.GA4_MEASUREMENT_ID || env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim();
  const secret = (env.GA4_MEASUREMENT_PROTOCOL_SECRET || '').trim();

  if (!measurementId || !secret) {
    return NextResponse.json({
      configured: false,
      missing: [
        !measurementId ? 'GA4_MEASUREMENT_ID' : null,
        !secret ? 'GA4_MEASUREMENT_PROTOCOL_SECRET' : null,
      ].filter(Boolean),
    });
  }

  const url = new URL('https://www.google-analytics.com/debug/mp/collect');
  url.searchParams.set('measurement_id', measurementId);
  url.searchParams.set('api_secret', secret);

  const body = {
    client_id: 'apropos_ga4_status_check',
    events: [
      {
        name: 'integration_test',
        params: { engagement_time_msec: 1, source: 'apropos_status_check' },
      },
    ],
  };

  try {
    const res = await fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    let parsed: unknown = null;
    const text = await res.text();
    try {
      parsed = JSON.parse(text);
    } catch {
      parsed = { raw: text };
    }

    const validationMessages =
      parsed && typeof parsed === 'object' && parsed !== null && 'validationMessages' in parsed
        ? (parsed as { validationMessages: unknown[] }).validationMessages
        : [];

    const valid = res.ok && Array.isArray(validationMessages) && validationMessages.length === 0;

    return NextResponse.json({
      configured: true,
      measurementId,
      valid,
      validationMessages,
      httpStatus: res.status,
      hint: valid
        ? 'GA4 MP credentials er gyldige. Events fra Resend-webhook bør lande i GA4 (bekræft i DebugView).'
        : 'GA4 returnerede valideringsfejl — tjek Measurement ID og API secret.',
      debugViewUrl:
        'https://analytics.google.com/analytics/web/#/p_/realtime/debug',
    });
  } catch (e) {
    return NextResponse.json(
      {
        configured: true,
        valid: false,
        error: e instanceof Error ? e.message : 'Ukendt netværksfejl',
      },
      { status: 502 }
    );
  }
}
