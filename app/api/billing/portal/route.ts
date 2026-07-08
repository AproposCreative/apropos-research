import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseUidFromRequest } from '@/lib/billing/auth-request';
import { getStripe, siteOrigin } from '@/lib/billing/stripe';
import { getSubscription } from '@/lib/billing/subscription-store';

export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const auth = await getFirebaseUidFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe er ikke konfigureret' }, { status: 503 });
  }

  const sub = await getSubscription(auth.uid);
  if (!sub?.stripeCustomerId) {
    return NextResponse.json({ error: 'Ingen Stripe-kunde fundet' }, { status: 404 });
  }

  const origin = siteOrigin();
  const portal = await stripe.billingPortal.sessions.create({
    customer: sub.stripeCustomerId,
    return_url: `${origin}/settings`,
  });

  return NextResponse.json({ url: portal.url });
}
