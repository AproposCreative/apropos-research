import { NextRequest, NextResponse } from 'next/server';
import { Webhook } from 'svix';
import { env } from '@/lib/config/env';
import { ga4ClientIdFromEmail, sendGa4MeasurementEvent } from '@/lib/newsletter/ga4-measurement';

export const runtime = 'nodejs';

function tagsToParams(tags: unknown): Record<string, string> {
  if (!tags || typeof tags !== 'object') return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(tags as Record<string, unknown>)) {
    if (v == null) continue;
    out[`resend_tag_${k}`.slice(0, 40)] = String(v).slice(0, 100);
  }
  return out;
}

function firstToEmail(data: Record<string, unknown>): string | null {
  const to = data.to;
  if (Array.isArray(to) && typeof to[0] === 'string') return to[0];
  if (typeof to === 'string') return to;
  return null;
}

/** Parse UTM-parametre fra et klik-link, så GA4 kan rapportere per-artikel CTR. */
function utmParamsFromLink(link: string | undefined): Record<string, string> {
  if (!link) return {};
  try {
    const url = new URL(link);
    const out: Record<string, string> = {};
    const keys = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'];
    for (const k of keys) {
      const v = url.searchParams.get(k);
      if (v) out[k] = v.slice(0, 100);
    }
    out.click_host = url.hostname.slice(0, 80);
    return out;
  } catch {
    return {};
  }
}

/**
 * Resend → Svix-signeret webhook. Mapper hele mail-funnel til GA4 MP:
 *  - email.delivered, email.opened, email.clicked
 *  - email.bounced, email.complained, email.unsubscribed
 *
 * Konfigurer URL i Resend dashboard og sæt RESEND_WEBHOOK_SECRET + GA4 MP env.
 * Dokumentation: docs/NEWSLETTER_GA4_SETUP.md
 */
export async function POST(req: NextRequest) {
  const secret = env.RESEND_WEBHOOK_SECRET?.trim();
  if (!secret) {
    return NextResponse.json({ ok: false, error: 'Webhook ikke konfigureret' }, { status: 503 });
  }

  const payload = await req.text();
  const svixId = req.headers.get('svix-id');
  const svixTimestamp = req.headers.get('svix-timestamp');
  const svixSignature = req.headers.get('svix-signature');
  if (!svixId || !svixTimestamp || !svixSignature) {
    return NextResponse.json({ error: 'Manglende Svix-headers' }, { status: 400 });
  }

  let evt: { type?: string; data?: Record<string, unknown> };
  try {
    const wh = new Webhook(secret);
    evt = wh.verify(payload, {
      'svix-id': svixId,
      'svix-timestamp': svixTimestamp,
      'svix-signature': svixSignature,
    }) as { type?: string; data?: Record<string, unknown> };
  } catch {
    return NextResponse.json({ error: 'Ugyldig signatur' }, { status: 400 });
  }

  const type = evt.type || '';
  const data = evt.data || {};
  const to = firstToEmail(data);
  const clientId = to ? ga4ClientIdFromEmail(to) : `anon_${svixId.replace(/[^a-z0-9]/gi, '').slice(0, 24)}`;

  const baseParams: Record<string, string | undefined> = {
    email_id: typeof data.email_id === 'string' ? data.email_id : undefined,
    subject: typeof data.subject === 'string' ? data.subject.slice(0, 120) : undefined,
    ...tagsToParams(data.tags),
  };
  const baseClean = Object.fromEntries(
    Object.entries(baseParams).filter(([, v]) => v != null && v !== '')
  ) as Record<string, string>;

  // Mapping fra Resend event-type → GA4 event-navn (snake_case er GA4-konvention).
  const eventMap: Record<string, string> = {
    'email.sent': 'email_sent',
    'email.delivered': 'email_delivered',
    'email.delivery_delayed': 'email_delivery_delayed',
    'email.opened': 'email_open',
    'email.clicked': 'email_click',
    'email.bounced': 'email_bounce',
    'email.complained': 'email_complaint',
    'email.unsubscribed': 'email_unsubscribed',
    'email.failed': 'email_failed',
  };

  const ga4Name = eventMap[type];
  if (!ga4Name) {
    // Ukendt event-type — accepteres men ikke videresendt.
    return NextResponse.json({ ok: true, received: type, forwarded: false });
  }

  // Klik-events: træk link + UTM ud så vi får per-artikel CTR i GA4.
  let extra: Record<string, string> = {};
  if (type === 'email.clicked') {
    const click = data.click as Record<string, unknown> | undefined;
    const link = click && typeof click.link === 'string' ? click.link.slice(0, 500) : undefined;
    if (link) extra.link = link;
    Object.assign(extra, utmParamsFromLink(link));
  }

  // Bounce-events: medsend bounce-type/årsag hvis Resend leverer det.
  if (type === 'email.bounced') {
    const bounce = data.bounce as Record<string, unknown> | undefined;
    if (bounce) {
      if (typeof bounce.type === 'string') extra.bounce_type = bounce.type.slice(0, 60);
      if (typeof bounce.reason === 'string') extra.bounce_reason = bounce.reason.slice(0, 200);
    }
  }

  await sendGa4MeasurementEvent({
    name: ga4Name,
    clientId,
    params: {
      ...baseClean,
      ...extra,
      engagement_time_msec: 1,
    },
  });

  return NextResponse.json({ ok: true, received: type, forwarded: ga4Name });
}
