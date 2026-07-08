'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef, useState, useEffect } from 'react';

const FEATURES = [
  {
    id: 'research',
    label: '01 · Research',
    title: 'Structured research, not a chat dump',
    body: 'Web search, source tracking, and editorial context feed directly into your draft pipeline — with prompts tuned to your voice.',
    panel: (
      <div className="space-y-2 p-4">
        {['soundvenue.com — festival lineup', 'dr.dk — culture desk', 'trending: nordic summer'].map((s) => (
          <div key={s} className="flex items-center gap-2 text-[12px] text-[var(--research-fog)] border border-[var(--research-graphite)] rounded-md px-3 py-2">
            <span className="size-1.5 rounded-full bg-[var(--research-indigo)]" />
            {s}
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'publish',
    label: '02 · Publish',
    title: 'Webflow publish without copy-paste',
    body: 'Map CMS fields once, run preflight, and push live articles from the same surface you write in.',
    panel: (
      <div className="p-4 space-y-2">
        <div className="research-mono text-[10px] text-[var(--research-slate)]">webflow / articles</div>
        {['title', 'content', 'thumb', 'section'].map((f) => (
          <div key={f} className="flex justify-between text-[12px] py-1.5 border-b border-[var(--research-graphite)]">
            <span className="text-[var(--research-fog)]">{f}</span>
            <span className="text-[var(--research-lime)]">mapped</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    id: 'distribute',
    label: '03 · Distribute',
    title: 'Newsletter and social as one motion',
    body: 'Draft newsletters from published pieces, publish to Instagram, and measure distribution — without leaving the deck.',
    panel: (
      <div className="p-4 grid grid-cols-2 gap-2">
        {['Newsletter draft', 'Instagram post', 'GA4 UTM', 'Weekly cron'].map((t) => (
          <div key={t} className="research-card p-3 text-[11px] text-[var(--research-mist)]">{t}</div>
        ))}
      </div>
    ),
  },
];

export default function StickyFeatures() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ['start start', 'end end'],
  });

  useEffect(() => {
    const unsub = scrollYProgress.on('change', (v) => {
      if (v < 0.33) setActive(0);
      else if (v < 0.66) setActive(1);
      else setActive(2);
    });
    return () => unsub();
  }, [scrollYProgress]);

  return (
    <section className="research-container py-16 md:py-24">
      <div className="mb-12 md:mb-16">
        <h2 className="research-section-title">Purpose-built for editorial teams</h2>
        <p className="research-section-sub mt-4">
          Three connected motions — research, publish, distribute — in one instrument panel.
        </p>
      </div>

      <div ref={containerRef} className="relative md:grid md:grid-cols-2 md:gap-16" style={{ minHeight: '140vh' }}>
        <div className="md:sticky md:top-24 md:self-start space-y-8 pb-12 md:pb-0">
          {FEATURES.map((f, i) => (
            <motion.div
              key={f.id}
              animate={{ opacity: active === i ? 1 : 0.35 }}
              transition={{ duration: 0.35 }}
            >
              <p className="research-mono text-[11px] text-[var(--research-slate)] mb-2">{f.label}</p>
              <h3 className="research-subheading text-[var(--research-snow)]">{f.title}</h3>
              <p className="text-[15px] text-[var(--research-fog)] mt-3 leading-relaxed">{f.body}</p>
            </motion.div>
          ))}
        </div>

        <div className="md:sticky md:top-24 md:self-start">
          <div className="research-card relative min-h-[280px] overflow-hidden">
            {FEATURES.map((f, i) => (
              <motion.div
                key={f.id}
                className="inset-0"
                initial={false}
                animate={{ opacity: active === i ? 1 : 0, y: active === i ? 0 : 8 }}
                transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                style={{
                  position: 'absolute',
                  pointerEvents: active === i ? 'auto' : 'none',
                }}
              >
                {f.panel}
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
