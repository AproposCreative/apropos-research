export type BillingPlanId = 'starter' | 'pro' | 'studio';

export type BillingPlan = {
  id: BillingPlanId;
  name: string;
  priceLabel: string;
  priceNote: string;
  description: string;
  features: string[];
  highlighted?: boolean;
  badge?: string;
  envPriceKey: 'STRIPE_PRICE_STARTER' | 'STRIPE_PRICE_PRO' | 'STRIPE_PRICE_STUDIO';
};

export const BILLING_PLANS: BillingPlan[] = [
  {
    id: 'starter',
    name: 'Starter',
    priceLabel: '€49',
    priceNote: '/mo',
    description: 'AI research and articles for a solo editor.',
    features: ['AI research + articles', '1 seat', 'Full studio access'],
    envPriceKey: 'STRIPE_PRICE_STARTER',
  },
  {
    id: 'pro',
    name: 'Pro',
    priceLabel: '€149',
    priceNote: '/mo',
    description: 'Publish and newsletter for active publishers.',
    features: [
      'Everything in Starter',
      'Webflow publish',
      'Newsletter pipeline',
      'Editorial cockpit',
    ],
    highlighted: true,
    envPriceKey: 'STRIPE_PRICE_PRO',
  },
  {
    id: 'studio',
    name: 'Studio',
    priceLabel: '€399',
    priceNote: '/mo',
    description: 'Full distribution and whitelabel (coming).',
    features: [
      'Everything in Pro',
      'Social distribution',
      'Funding desk',
      'Whitelabel — early access',
    ],
    badge: 'Early access',
    envPriceKey: 'STRIPE_PRICE_STUDIO',
  },
];

export function planFromPriceId(priceId: string): BillingPlanId | null {
  const starter = process.env.STRIPE_PRICE_STARTER?.trim();
  const pro = process.env.STRIPE_PRICE_PRO?.trim();
  const studio = process.env.STRIPE_PRICE_STUDIO?.trim();
  if (priceId === starter) return 'starter';
  if (priceId === pro) return 'pro';
  if (priceId === studio) return 'studio';
  return null;
}

export function priceIdForPlan(planId: BillingPlanId): string | undefined {
  const map: Record<BillingPlanId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_STARTER?.trim(),
    pro: process.env.STRIPE_PRICE_PRO?.trim(),
    studio: process.env.STRIPE_PRICE_STUDIO?.trim(),
  };
  return map[planId];
}
