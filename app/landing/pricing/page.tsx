import type { Metadata } from 'next';
import PricingTable from '@/components/marketing/PricingTable';

export const metadata: Metadata = {
  title: 'Pricing',
};

export default function LandingPricingPage() {
  return (
    <section className="research-container py-16 md:py-24">
      <p className="research-mono text-xs uppercase tracking-[0.2em] text-[var(--research-slate)] mb-4">
        Pricing
      </p>
      <h1 className="research-section-title">Choose your plan</h1>
      <p className="research-section-sub mt-4 mb-12">
        Self-serve subscriptions via Stripe. Change or cancel anytime.
      </p>
      <PricingTable />
    </section>
  );
}
