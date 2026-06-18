'use client';

import { motion } from 'framer-motion';
import { STORY } from '@/lib/landing/story';
import { fadeUp, staggerContainer } from './motion';

const TILES = [
  { title: 'Editorial cockpit', desc: 'Signals, queues, and research threads in one view.' },
  { title: 'Prompt library', desc: 'Tone-of-voice presets per author and section.' },
  { title: 'Preflight checks', desc: 'Catch missing CMS fields before publish.' },
  { title: 'Funding desk', desc: 'Track grants and inbound replies (Studio tier).' },
  { title: 'Cron automation', desc: 'Daily articles, weekly newsletters — on schedule.', span: 'md:col-span-2' },
];

export default function BentoGrid() {
  return (
    <section className="research-container py-16 md:py-24 border-t border-[var(--research-graphite)]">
      <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-10">
        <h2 className="research-section-title">{STORY.platform.title}</h2>
        <p className="research-section-sub mt-4">{STORY.platform.body}</p>
      </motion.div>

      <motion.div
        className="grid md:grid-cols-3 gap-3"
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true, margin: '-40px' }}
      >
        {TILES.map((tile, i) => (
          <motion.div
            key={tile.title}
            variants={fadeUp}
            custom={i}
            className={`research-card p-5 md:p-6 hover:bg-[var(--research-card-elevated)] transition-colors ${tile.span || ''}`}
          >
            <h3 className="text-[15px] font-medium text-[var(--research-snow)]">{tile.title}</h3>
            <p className="text-[13px] text-[var(--research-fog)] mt-2 leading-relaxed">{tile.desc}</p>
          </motion.div>
        ))}
      </motion.div>
    </section>
  );
}
