'use client';

import Image from 'next/image';
import { motion } from 'framer-motion';
import { fadeUp, staggerContainer } from './motion';

const STACK = ['Webflow', 'Resend', 'Firebase', 'OpenAI', 'Meta', 'GA4'];

type Props = {
  partnerLogos?: { name: string; url: string }[];
};

export default function LogoCloud({ partnerLogos = [] }: Props) {
  const items =
    partnerLogos.length > 0
      ? partnerLogos.map((p) => ({ type: 'image' as const, name: p.name, url: p.url }))
      : STACK.map((name) => ({ type: 'text' as const, name }));

  return (
    <section className="research-container py-12 md:py-16 border-y border-[var(--research-graphite)]">
      <motion.p
        className="text-center text-[12px] uppercase tracking-[0.18em] text-[var(--research-slate)] mb-8"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        Integrates with your stack
      </motion.p>
      <motion.div
        className="flex flex-wrap items-center justify-center gap-x-10 gap-y-6"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        {items.map((item, i) => (
          <motion.div key={item.name} variants={fadeUp} custom={i}>
            {item.type === 'image' ? (
              <Image
                src={item.url}
                alt={item.name}
                width={100}
                height={32}
                className="h-8 w-auto object-contain opacity-60 hover:opacity-90 transition-opacity"
                unoptimized
              />
            ) : (
              <span className="text-[15px] font-medium text-[var(--research-slate)]">{item.name}</span>
            )}
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
