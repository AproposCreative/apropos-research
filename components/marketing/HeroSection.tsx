import PrimaryLimeButton from './PrimaryLimeButton';

export default function HeroSection() {
  return (
    <section className="research-container pt-16 pb-12 md:pt-24 md:pb-16">
      <p className="research-mono text-xs uppercase tracking-widest text-white/35 mb-4">
        Research command deck
      </p>
      <h1 className="research-section-title max-w-2xl">
        Start dit eget medie med AI-redaktion
      </h1>
      <p className="research-section-sub mt-5">
        Fra research til færdig artikel — publicér til Webflow, send nyhedsbrev og distribuér på sociale medier. Én pipeline, engineering-native.
      </p>
      <div className="flex flex-wrap items-center gap-4 mt-8">
        <PrimaryLimeButton href="/landing/pricing">Se planer</PrimaryLimeButton>
        <a href="/login" className="research-ghost-link">
          Log ind →
        </a>
      </div>
    </section>
  );
}
