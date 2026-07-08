import type { BillingPlanId } from './plans';
import { getAdminDb } from '@/lib/firebase-admin';

export type SubscriptionStatus =
  | 'active'
  | 'trialing'
  | 'past_due'
  | 'canceled'
  | 'unpaid'
  | 'incomplete'
  | 'incomplete_expired'
  | 'paused';

export type SubscriptionRecord = {
  stripeCustomerId: string;
  stripeSubscriptionId: string;
  plan: BillingPlanId;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  updatedAt: string;
};

const COLLECTION = 'subscriptions';

function db() {
  const d = getAdminDb();
  if (!d) throw new Error('Firestore Admin not available');
  return d;
}

function docRef(uid: string) {
  return db().collection(COLLECTION).doc(uid);
}

export async function getSubscription(uid: string): Promise<SubscriptionRecord | null> {
  const snap = await docRef(uid).get();
  if (!snap.exists) return null;
  return snap.data() as SubscriptionRecord;
}

export async function upsertSubscription(
  uid: string,
  data: Partial<SubscriptionRecord> & Pick<SubscriptionRecord, 'stripeCustomerId'>
): Promise<void> {
  const existing = await getSubscription(uid);
  const merged: SubscriptionRecord = {
    stripeCustomerId: data.stripeCustomerId,
    stripeSubscriptionId: data.stripeSubscriptionId ?? existing?.stripeSubscriptionId ?? '',
    plan: data.plan ?? existing?.plan ?? 'starter',
    status: data.status ?? existing?.status ?? 'incomplete',
    currentPeriodEnd: data.currentPeriodEnd ?? existing?.currentPeriodEnd ?? null,
    updatedAt: new Date().toISOString(),
  };
  await docRef(uid).set(merged, { merge: true });
}

export async function findUidByStripeCustomerId(customerId: string): Promise<string | null> {
  const snap = await db()
    .collection(COLLECTION)
    .where('stripeCustomerId', '==', customerId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export async function findUidByStripeSubscriptionId(subscriptionId: string): Promise<string | null> {
  const snap = await db()
    .collection(COLLECTION)
    .where('stripeSubscriptionId', '==', subscriptionId)
    .limit(1)
    .get();
  if (snap.empty) return null;
  return snap.docs[0].id;
}

export function isSubscriptionActive(record: SubscriptionRecord | null): boolean {
  if (!record) return false;
  return record.status === 'active' || record.status === 'trialing';
}
