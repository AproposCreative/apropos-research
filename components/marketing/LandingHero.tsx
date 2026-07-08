'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import PrimaryLimeButton from './PrimaryLimeButton';
import SplineHeroBackdrop from './SplineHeroBackdrop';
import { STORY } from '@/lib/landing/story';
import { fadeUp } from './motion';

export default function LandingHero() {
  return (
    <section className="relative overflow-hidden">
      <SplineHeroBackdrop />
      <div className="research-container relative pt-20 pb-6 md:pt-28 md:pb-10 text-center">
        <motion.p
          className="research-mono text-[11px] uppercase tracking-[0.2em] text-[var(--research-slate)] mb-6"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={0}
        >
          {STORY.hero.eyebrow}
        </motion.p>

        <motion.h1
          className="research-display max-w-4xl mx-auto"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={1}
        >
          {STORY.hero.title}
        </motion.h1>

        <motion.p
          className="research-body-lg max-w-2xl mx-auto mt-6"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={2}
        >
          {STORY.hero.subtitle}
        </motion.p>

        <motion.div
          className="flex flex-wrap items-center justify-center gap-3 mt-10"
          variants={fadeUp}
          initial="hidden"
          animate="visible"
          custom={3}
        >
          <PrimaryLimeButton href="/landing/pricing">Get started</PrimaryLimeButton>
          <Link href="/login" className="research-outline-btn touch-target">
            Sign in to studio
          </Link>
        </motion.div>
      </div>
    </section>
  );
}
