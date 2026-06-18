'use client';

import { motion } from 'framer-motion';
import { fadeUp } from './motion';

type Props = {
  articleCount?: number;
  magazineUrl?: string;
};

export default function StatsRow({ articleCount = 0, magazineUrl }: Props) {
  const stats = [
    { value: articleCount > 0 ? `${articleCount}+` : '1', label: 'stories in your CMS pipeline' },
    { value: 'Webflow', label: 'native field mapping & publish' },
    { value: '4', label: 'motions — signal to audience' },
  ];

  return (
    <section className="research-container py-14 md:py-16">
      <div className="grid md:grid-cols-3 gap-8 md:gap-4">
        {stats.map((s, i) => (
          <motion.div
            key={s.label}
            className="text-center md:text-left border-t md:border-t-0 md:border-l border-[var(--research-graphite)] pt-6 md:pt-0 md:pl-8 first:md:pl-0 first:md:border-l-0"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i}
          >
            <p className="research-heading text-[var(--research-snow)]">{s.value}</p>
            <p className="text-[13px] text-[var(--research-slate)] mt-2">{s.label}</p>
          </motion.div>
        ))}
      </div>
      {magazineUrl ? (
        <p className="text-center md:text-left text-[12px] text-[var(--research-slate)] mt-8 research-mono">
          Output ships to{' '}
          <a href={magazineUrl} className="research-ghost-link hover:underline">
            {magazineUrl.replace(/^https?:\/\//, '')}
          </a>
        </p>
      ) : null}
    </section>
  );
}
