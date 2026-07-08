import Link from 'next/link';
import PrimaryLimeButton from '@/components/marketing/PrimaryLimeButton';

export default function LandingPricingSuccessPage() {
  return (
    <section className="research-container py-24 text-center max-w-lg mx-auto">
      <p className="research-mono text-xs uppercase tracking-[0.2em] text-[var(--research-slate)] mb-4">
        Success
      </p>
      <h1 className="research-section-title">Thanks for subscribing</h1>
      <p className="research-section-sub mt-4 mx-auto">
        Your payment was received. Sign in to get started.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center mt-8">
        <PrimaryLimeButton href="/login">Sign in</PrimaryLimeButton>
        <Link href="/landing" className="research-ghost-link py-3">
          Back to home →
        </Link>
      </div>
    </section>
  );
}
