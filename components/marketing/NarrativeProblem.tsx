'use client';

import { motion } from 'framer-motion';
import { STORY } from '@/lib/landing/story';
import { PIPELINE_STEPS } from '@/lib/landing/product-modules';
import { fadeUp } from './motion';

export default function NarrativeProblem() {
  return (
    <section className="research-container py-14 md:py-20">
      <motion.div
        className="research-card p-8 md:p-12"
        variants={fadeUp}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <div className="flex flex-wrap gap-2 mb-8">
          {PIPELINE_STEPS.map((s) => (
            <span
              key={s}
              className="text-[11px] px-2 py-1 rounded border border-[var(--research-graphite)] text-[var(--research-fog)]"
            >
              {s}
            </span>
          ))}
        </div>
        <h2 className="research-heading text-[var(--research-snow)]">{STORY.problem.title}</h2>
        <p className="research-body-lg mt-4 max-w-2xl">{STORY.problem.body}</p>
      </motion.div>
    </section>
  );
}
