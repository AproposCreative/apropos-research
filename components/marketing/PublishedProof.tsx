'use client';

import { motion } from 'framer-motion';
import Image from 'next/image';
import type { LandingAssets } from '@/lib/landing/webflow-assets';
import { STORY } from '@/lib/landing/story';
import { fadeUp } from './motion';

type Props = Pick<LandingAssets, 'articles' | 'articleCount' | 'magazineUrl'>;

export default function PublishedProof({ articles, articleCount, magazineUrl }: Props) {
  if (articles.length === 0) return null;

  return (
    <section className="research-container py-16 md:py-20 border-t border-[var(--research-graphite)]">
      <motion.div variants={fadeUp} initial="hidden" whileInView="visible" viewport={{ once: true }} className="mb-10">
        <p className="research-mono text-[11px] uppercase tracking-[0.2em] text-[var(--research-slate)] mb-3">
          Live output
        </p>
        <h2 className="research-section-title">{STORY.proof.title}</h2>
        <p className="research-section-sub mt-4">{STORY.proof.body}</p>
        {articleCount > 0 ? (
          <p className="research-mono text-[12px] text-[var(--research-slate)] mt-3">
            {articleCount}+ stories in CMS ·{' '}
            <a href={magazineUrl} className="research-ghost-link underline-offset-2 hover:underline">
              {magazineUrl.replace(/^https?:\/\//, '')}
            </a>
          </p>
        ) : null}
      </motion.div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {articles.slice(0, 4).map((article, i) => (
          <motion.a
            key={article.id}
            href={article.url}
            target="_blank"
            rel="noopener noreferrer"
            className="research-card group overflow-hidden hover:border-[var(--research-steel)] transition-colors"
            variants={fadeUp}
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true }}
            custom={i}
          >
            <div className="aspect-[4/3] relative bg-[var(--research-nav)] overflow-hidden">
              {article.thumbUrl ? (
                <Image
                  src={article.thumbUrl}
                  alt=""
                  fill
                  className="object-cover opacity-90 group-hover:opacity-100 group-hover:scale-[1.02] transition-all duration-500"
                  sizes="(max-width: 768px) 50vw, 25vw"
                  unoptimized
                />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-[var(--research-slate)] text-xs">
                  Apropos
                </div>
              )}
            </div>
            <div className="p-4">
              {article.category ? (
                <p className="research-mono text-[10px] uppercase tracking-wider text-[var(--research-slate)] mb-2">
                  {article.category}
                </p>
              ) : null}
              <h3 className="text-[14px] font-medium text-[var(--research-snow)] line-clamp-2 leading-snug">
                {article.title}
              </h3>
            </div>
          </motion.a>
        ))}
      </div>
    </section>
  );
}
