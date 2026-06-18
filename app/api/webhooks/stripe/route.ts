import { NextRequest, NextResponse } from 'next/server';
import Stripe from 'stripe';
import { getStripe } from '@/lib/billing/stripe';
import { planFromPriceId } from '@/lib/billing/plans';
import {
  findUidByStripeCustomerId,
  findUidByStripeSubscriptionId,
  upsertSubscription,
  type SubscriptionStatus,
} from '@/lib/billing/subscription-store';

export const runtime = 'nodejs';

function mapStatus(status: string): SubscriptionStatus {
  const allowed: SubscriptionStatus[] = [
    'active',
    'trialing',
    'past_due',
    'canceled',
    'unpaid',
    'incomplete',
    'incomplete_expired',
    'paused',
  ];
  return allowed.includes(status as SubscriptionStatus) ? (status as SubscriptionStatus) : 'canceled';
}

async function syncSubscription(sub: Stripe.Subscription, uidHint?: string) {
  const uid =
    uidHint ||
    sub.metadata?.firebaseUid ||
    (await findUidByStripeSubscriptionId(sub.id)) ||
    (typeof sub.customer === 'string'
      ? await findUidByStripeCustomerId(sub.customer)
      : null);

  if (!uid) return;

  const priceId = sub.items.data[0]?.price?.id;
  const plan = priceId ? planFromPriceId(priceId) : null;

  await upsertSubscription(uid, {
    stripeCustomerId: typeof sub.customer === 'string' ? sub.customer : sub.customer.id,
    stripeSubscriptionId: sub.id,
    plan: plan ?? undefined,
    status: mapStatus(sub.status),
    currentPeriodEnd: sub.current_period_end
      ? new Date(sub.current_period_end * 1000).toISOString()
      : null,
  });
}

export async function POST(request: NextRequest) {
  const stripe = getStripe();
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET?.trim();
  if (!stripe || !webhookSecret) {
    return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
  }

  const signature = request.headers.get('stripe-signature');
  if (!signature) {
    return NextResponse.json({ error: 'Missing signature' }, { status: 400 });
  }

  const body = await request.text();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Invalid signature';
    return NextResponse.json({ error: message }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const uid = session.client_reference_id || session.metadata?.firebaseUid;
        if (uid && session.customer && session.subscription) {
          const customerId =
            typeof session.customer === 'string' ? session.customer : session.customer.id;
          const subId =
            typeof session.subscription === 'string'
              ? session.subscription
              : session.subscription.id;
          const fullSub = await stripe.subscriptions.retrieve(subId);
          await syncSubscription(fullSub, uid);
          if (!fullSub.metadata?.firebaseUid) {
            await stripe.subscriptions.update(subId, {
              metadata: { firebaseUid: uid, planId: session.metadata?.planId || '' },
            });
          }
          await upsertSubscription(uid, {
            stripeCustomerId: customerId,
            stripeSubscriptionId: subId,
          });
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted': {
        const sub = event.data.object as Stripe.Subscription;
        await syncSubscription(sub);
        break;
      }
      default:
        break;
    }
  } catch (err) {
    console.error('[stripe webhook]', err);
    return NextResponse.json({ error: 'Webhook handler failed' }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
