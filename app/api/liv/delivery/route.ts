import { NextRequest, NextResponse } from 'next/server';
import { getNewsletterUserIdFromRequest } from '@/lib/newsletter/auth-request';
import { readDeliveryState } from '@/lib/liv/delivery-store';
import { deliveryHealth } from '@/lib/liv/delivery-policy';

export async function GET(req: NextRequest) {
  if (!await getNewsletterUserIdFromRequest(req)) return NextResponse.json({ error: 'Ikke autoriseret' }, { status: 401 });
  const queueConfigured = process.env.LIV_DELIVERY_QUEUE_ENABLED === 'true';
  const preparationConfigured = process.env.LIV_DELIVERY_PREPARE_ENABLED === 'true';
  const paused = /^(1|true)$/i.test(process.env.LIV_DAILY_PAUSED || '');
  const queueEnabled = queueConfigured && !paused && process.env.LIV_DAILY_PUBLICATION_MODE === 'auto_publish';
  const preparationEnabled = preparationConfigured && !paused;
  if (!queueConfigured && !preparationConfigured) return NextResponse.json({ queueEnabled, preparationEnabled, health: null, entries: [] });
  try {
    const state = await readDeliveryState();
    return NextResponse.json({ queueEnabled, preparationEnabled, health: deliveryHealth(state),
      entries: state.entries.filter(e => ['ready', 'selected'].includes(e.state)).map(e => ({ title: e.title,
        scheduledDay: e.scheduledDay, expiresDay: e.expiresDay, kind: e.kind, state: e.state })) },
      { headers: { 'Cache-Control': 'no-store' } });
  } catch { return NextResponse.json({ error: 'Udgivelseskøen kunne ikke læses. Status er ukendt.' }, { status: 503 }); }
}
