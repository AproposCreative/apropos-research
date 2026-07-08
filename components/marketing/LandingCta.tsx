'use client';

import { motion } from 'framer-motion';
import { STORY } from '@/lib/landing/story';
import PrimaryLimeButton from './PrimaryLimeButton';
import { fadeUp } from './motion';

export default function LandingCta() {
  return (
    <section className="research-container py-20 md:py-28">
      <motion.div
        className="research-card p-10 md:p-14 text-center relative overflow-hidden"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <div
          className="absolute inset-0 opacity-40 pointer-events-none"
          style={{
            background: 'radial-gradient(ellipse 80% 60% at 50% 100%, rgba(228,242,34,0.08), transparent)',
          }}
          aria-hidden
        />
        <h2 className="research-heading relative">{STORY.cta.title}</h2>
        <p className="research-body-lg max-w-lg mx-auto mt-4 relative">{STORY.cta.body}</p>
        <div className="mt-8 relative">
          <PrimaryLimeButton href="/landing/pricing">View pricing</PrimaryLimeButton>
        </div>
      </motion.div>
    </section>
  );
}
