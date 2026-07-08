'use client';

import { useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { useRouter } from 'next/navigation';
import PrimaryLimeButton from './PrimaryLimeButton';
import { BILLING_PLANS, type BillingPlanId } from '@/lib/billing/plans';

export default function PricingTable() {
  const { user } = useAuth();
  const router = useRouter();
  const [loadingPlan, setLoadingPlan] = useState<BillingPlanId | null>(null);
  const [error, setError] = useState('');

  async function startCheckout(planId: BillingPlanId) {
    setError('');
    setLoadingPlan(planId);

    try {
      if (!user) {
        router.push(`/login?next=/landing/pricing&plan=${planId}`);
        return;
      }

      const token = await user.getIdToken();
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ planId }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || 'Could not start checkout');
      }
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      throw new Error('Missing checkout URL');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong');
    } finally {
      setLoadingPlan(null);
    }
  }

  return (
    <div>
      {error ? <p className="text-sm text-red-400/95 mb-6 text-center">{error}</p> : null}
      <div className="grid md:grid-cols-3 gap-4 md:gap-5">
        {BILLING_PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`research-card p-6 flex flex-col ${
              plan.highlighted ? 'border-[var(--research-steel)] ring-1 ring-white/10' : ''
            }`}
          >
            <div className="flex items-center gap-2 mb-4">
              <h2 className="text-lg font-medium text-[var(--research-snow)]">{plan.name}</h2>
              {plan.badge ? (
                <span className="research-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded border border-[var(--research-graphite)] text-[var(--research-fog)]">
                  {plan.badge}
                </span>
              ) : null}
            </div>
            <p className="flex items-baseline gap-1">
              <span className="text-2xl font-medium text-[var(--research-snow)]">{plan.priceLabel}</span>
              <span className="text-sm text-[var(--research-slate)]">{plan.priceNote}</span>
            </p>
            <p className="text-sm text-[var(--research-fog)] mt-3 mb-5">{plan.description}</p>
            <ul className="space-y-2 mb-6 flex-1">
              {plan.features.map((f) => (
                <li key={f} className="text-sm text-[var(--research-mist)] flex items-start gap-2">
                  <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-[var(--research-slate)]" />
                  {f}
                </li>
              ))}
            </ul>
            <PrimaryLimeButton
              onClick={() => startCheckout(plan.id)}
              disabled={loadingPlan !== null}
              className="w-full"
            >
              {loadingPlan === plan.id ? 'Starting…' : 'Choose plan'}
            </PrimaryLimeButton>
          </div>
        ))}
      </div>
    </div>
  );
}
