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

/**
 * Resend → Svix-signeret webhook. Mapper email.opened / email.clicked til GA4 MP.
 * Konfigurer URL i Resend dashboard og sæt RESEND_WEBHOOK_SECRET + GA4 MP env.
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

  if (type === 'email.opened') {
    await sendGa4MeasurementEvent({
      name: 'email_open',
      clientId,
      params: {
        ...baseClean,
        engagement_time_msec: 1,
      },
    });
  } else if (type === 'email.clicked') {
    const click = data.click as Record<string, unknown> | undefined;
    const link = click && typeof click.link === 'string' ? click.link.slice(0, 500) : undefined;
    await sendGa4MeasurementEvent({
      name: 'email_click',
      clientId,
      params: {
        ...baseClean,
        ...(link ? { link } : {}),
        engagement_time_msec: 1,
      },
    });
  }

  return NextResponse.json({ ok: true, received: type });
}
