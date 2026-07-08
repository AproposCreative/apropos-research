import { getSubscription, isSubscriptionActive, type SubscriptionRecord } from './subscription-store';

export function isBillingDisabled(): boolean {
  return process.env.BILLING_DISABLED === 'true';
}

export function billingBypassUids(): Set<string> {
  const raw = process.env.BILLING_BYPASS_UIDS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

export function hasBillingAccess(uid: string, record?: SubscriptionRecord | null): boolean {
  if (isBillingDisabled()) return true;
  if (billingBypassUids().has(uid)) return true;
  if (record === undefined) return false;
  return isSubscriptionActive(record);
}

export async function checkBillingAccess(uid: string): Promise<{
  allowed: boolean;
  subscription: SubscriptionRecord | null;
  billingDisabled: boolean;
}> {
  if (isBillingDisabled() || billingBypassUids().has(uid)) {
    return { allowed: true, subscription: null, billingDisabled: true };
  }
  try {
    const subscription = await getSubscription(uid);
    return {
      allowed: isSubscriptionActive(subscription),
      subscription,
      billingDisabled: false,
    };
  } catch {
    if (process.env.NODE_ENV !== 'production') {
      return { allowed: true, subscription: null, billingDisabled: true };
    }
    return { allowed: false, subscription: null, billingDisabled: false };
  }
}
