import { NextRequest, NextResponse } from 'next/server';
import { getFirebaseUidFromRequest } from '@/lib/billing/auth-request';
import { priceIdForPlan, type BillingPlanId } from '@/lib/billing/plans';
import { getStripe, siteOrigin } from '@/lib/billing/stripe';
import { getSubscription } from '@/lib/billing/subscription-store';

export const runtime = 'nodejs';

const VALID_PLANS: BillingPlanId[] = ['starter', 'pro', 'studio'];

export async function POST(request: NextRequest) {
  const auth = await getFirebaseUidFromRequest(request);
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const stripe = getStripe();
  if (!stripe) {
    return NextResponse.json({ error: 'Stripe er ikke konfigureret' }, { status: 503 });
  }

  let body: { planId?: string; priceId?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Ugyldig JSON' }, { status: 400 });
  }

  const planId = body.planId as BillingPlanId | undefined;
  const priceId = body.priceId || (planId ? priceIdForPlan(planId) : undefined);

  if (!priceId) {
    return NextResponse.json({ error: 'Manglende eller ugyldig plan' }, { status: 400 });
  }

  if (planId && !VALID_PLANS.includes(planId)) {
    return NextResponse.json({ error: 'Ukendt plan' }, { status: 400 });
  }

  const existing = await getSubscription(auth.uid);
  const origin = siteOrigin();

  const session = await stripe.checkout.sessions.create({
    mode: 'subscription',
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${origin}/landing/pricing/success?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/landing/pricing`,
    customer: existing?.stripeCustomerId || undefined,
    customer_email: existing?.stripeCustomerId ? undefined : auth.email,
    client_reference_id: auth.uid,
    metadata: {
      firebaseUid: auth.uid,
      planId: planId || '',
    },
    subscription_data: {
      metadata: {
        firebaseUid: auth.uid,
        planId: planId || '',
      },
    },
  });

  if (!session.url) {
    return NextResponse.json({ error: 'Kunne ikke oprette checkout session' }, { status: 500 });
  }

  return NextResponse.json({ url: session.url });
}
