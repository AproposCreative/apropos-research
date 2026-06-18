'use client';

import Image from 'next/image';
import dynamic from 'next/dynamic';
import { motion, useScroll } from 'framer-motion';
import { useEffect, useRef, useState } from 'react';
import { PRODUCT_MODULES, PIPELINE_STEPS } from '@/lib/landing/product-modules';
import { STORY } from '@/lib/landing/story';
import { SPLINE_BACKGROUNDS } from '@/lib/spline-backgrounds';
import { fadeUp } from './motion';

const SplineAnimation = dynamic(() => import('@/components/SplineAnimation'), { ssr: false });

function PipelineStrip() {
  return (
    <div className="flex flex-wrap gap-2 mb-10">
      {PIPELINE_STEPS.map((step, i) => (
        <span
          key={step}
          className="research-mono text-[10px] px-2.5 py-1 rounded-md border border-[var(--research-graphite)] text-[var(--research-slate)]"
        >
          <span className="text-[var(--research-fog)] mr-1.5">{String(i + 1).padStart(2, '0')}</span>
          {step}
        </span>
      ))}
    </div>
  );
}

export default function ProductStoryShowcase() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const module = PRODUCT_MODULES[active];

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      const idx = Math.min(
        PRODUCT_MODULES.length - 1,
        Math.floor(v * PRODUCT_MODULES.length)
      );
      setActive(idx);
    });
    return () => unsub();
  }, [scrollYProgress]);

  const splineUrl =
    SPLINE_BACKGROUNDS.find((b) => b.id === module?.splineId)?.url ??
    SPLINE_BACKGROUNDS[2].url;

  return (
    <section className="research-container py-16 md:py-24" id="features">
      <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }}>
        <p className="research-mono text-[11px] uppercase tracking-[0.2em] text-[var(--research-slate)] mb-3">
          Product story
        </p>
        <h2 className="research-section-title">{STORY.product.title}</h2>
        <p className="research-section-sub mt-4">{STORY.product.subtitle}</p>
        <PipelineStrip />
      </motion.div>

      {/* Mobile: stacked */}
      <div className="md:hidden space-y-12">
        {PRODUCT_MODULES.map((m) => (
          <article key={m.id} className="space-y-4">
            <p className="research-mono text-[11px] text-[var(--research-slate)]">{m.step}</p>
            <h3 className="research-subheading text-[var(--research-snow)]">{m.title}</h3>
            <p className="text-[15px] text-[var(--research-fog)] leading-relaxed">{m.body}</p>
            <div className="rounded-xl overflow-hidden border border-[var(--research-graphite)] bg-black">
              <Image src={m.screenshot} alt="" width={1200} height={675} className="w-full h-auto" unoptimized />
            </div>
          </article>
        ))}
      </div>

      {/* Desktop: sticky story */}
      <div
        ref={containerRef}
        className="hidden md:grid md:grid-cols-2 md:gap-14"
        style={{ minHeight: `${PRODUCT_MODULES.length * 55}vh` }}
      >
        <div className="md:sticky md:top-24 md:self-start space-y-12 py-4">
          {PRODUCT_MODULES.map((m, i) => (
            <motion.div
              key={m.id}
              animate={{ opacity: active === i ? 1 : 0.28 }}
              transition={{ duration: 0.35 }}
            >
              <p className="research-mono text-[11px] text-[var(--research-slate)] mb-2">{m.step}</p>
              <h3 className="research-subheading text-[var(--research-snow)]">{m.title}</h3>
              <p className="text-[15px] text-[var(--research-fog)] mt-3 leading-relaxed max-w-md">{m.body}</p>
            </motion.div>
          ))}
        </div>

        <div className="md:sticky md:top-20 md:self-start">
          <div className="relative rounded-xl overflow-hidden border border-[var(--research-graphite)] bg-black aspect-[16/10]">
            {/* Spline glow behind active module — matches studio */}
            <div className="absolute inset-0 opacity-30 pointer-events-none hidden lg:block" aria-hidden>
              <SplineAnimation sceneUrl={splineUrl} className="w-full h-full" style={{ width: '100%', height: '100%' }} />
            </div>
            {PRODUCT_MODULES.map((m, i) => (
              <motion.div
                key={m.id}
                className="absolute inset-0"
                initial={false}
                animate={{
                  opacity: active === i ? 1 : 0,
                  scale: active === i ? 1 : 0.985,
                }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                style={{ pointerEvents: active === i ? 'auto' : 'none' }}
              >
                <Image
                  src={m.screenshot}
                  alt=""
                  fill
                  className="object-cover object-top relative z-10"
                  sizes="(max-width: 1200px) 100vw, 50vw"
                  unoptimized
                />
              </motion.div>
            ))}
          </div>
          <p className="research-mono text-[10px] text-[var(--research-slate)] mt-3 text-center">
            {module?.title} · Built with Spline
          </p>
        </div>
      </div>
    </section>
  );
}
