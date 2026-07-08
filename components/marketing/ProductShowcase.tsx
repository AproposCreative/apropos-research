'use client';

import Image from 'next/image';
import { motion, useScroll, useTransform } from 'framer-motion';
import { useRef } from 'react';
import { scaleIn } from './motion';

export default function ProductShowcase() {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ['start end', 'end start'] });
  const y = useTransform(scrollYProgress, [0, 1], [56, -24]);
  const scale = useTransform(scrollYProgress, [0, 0.45, 1], [0.9, 1, 0.98]);

  return (
    <section ref={ref} className="research-container pb-12 md:pb-20">
      <motion.div style={{ y, scale }} variants={scaleIn} initial="hidden" whileInView="visible" viewport={{ once: true, margin: '-40px' }}>
        <div className="relative">
          <div
            className="absolute -inset-2 rounded-2xl opacity-80 blur-3xl pointer-events-none"
            style={{
              background:
                'radial-gradient(ellipse at 55% 20%, rgba(255,120,40,0.18), transparent 55%), radial-gradient(ellipse at 30% 80%, rgba(94,106,210,0.12), transparent 50%)',
            }}
            aria-hidden
          />
          <div className="relative rounded-xl overflow-hidden border border-[var(--research-graphite)] shadow-[var(--research-shadow-card)] bg-black">
            <Image
              src="/images/landing/product-article-writer.png"
              alt="Apropos Research article studio with Spline canvas"
              width={1920}
              height={1080}
              className="w-full h-auto"
              priority
              unoptimized
            />
          </div>
        </div>
      </motion.div>
      <p className="text-center text-[12px] text-[var(--research-slate)] mt-5 research-mono">
        Article studio · Spline canvas · same UI as production
      </p>
    </section>
  );
}
