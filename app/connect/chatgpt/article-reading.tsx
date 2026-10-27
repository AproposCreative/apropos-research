import Image from 'next/image';
import type { ArticleReadingPreview } from '@/lib/editorial/submission-preview';

export default function ArticleReading({ article, onImageError }: {
  article: ArticleReadingPreview; onImageError?: () => void;
}) {
  return <article aria-label="Artikelpreview" className="space-y-9 pb-10 sm:space-y-12">
    <header className="mx-auto max-w-[44rem] space-y-5 pt-5 text-center sm:pt-10">
      {article.category && <p className="text-sm text-white/65">{article.category}</p>}
      <h2 className="break-words text-[2rem] font-medium leading-[1.15] tracking-tight sm:text-5xl">{article.title}</h2>
      {article.subtitle && <p className="text-lg leading-relaxed text-white/80 sm:text-xl">{article.subtitle}</p>}
      {article.aiGenerated && <p className="text-sm text-white/70">AI-skrevet researchanmeldelse</p>}
      <p className="text-sm text-white/60">{article.author && `Af ${article.author}`}{article.rating != null && ` · ${article.rating}/6 stjerner`}</p>
    </header>
    {article.featuredImage ? <figure>
      <Image unoptimized src={article.featuredImage} alt={article.featuredImageAlt || ''} width={1440} height={960}
        onError={onImageError} className="h-auto w-full rounded-lg" />
      {article.fotoCredit && <figcaption className="mt-3 text-sm text-white/60">{article.fotoCredit}</figcaption>}
    </figure> : <p className="border-y border-white/15 py-6 text-center text-sm text-white/60">Cover mangler i denne kladde.</p>}
    <div className="mx-auto max-w-[42rem] space-y-6 text-[1.0625rem] leading-[1.8] sm:text-lg">
      {article.intro && <p className="font-medium">{article.intro}</p>}
      {article.blocks.map((block, index) => block.kind === 'image' && block.url ? <figure key={`${block.url}-${index}`} className="py-4">
        <Image unoptimized src={block.url} alt={block.alt || ''} width={1200} height={800} onError={onImageError} className="h-auto w-full rounded-lg" />
        {block.caption && <figcaption className="mt-3 text-sm leading-relaxed text-white/60">{block.caption}</figcaption>}
      </figure> : block.heading === 'h2' ? <h3 key={index} className="pt-5 text-2xl font-medium leading-snug">{block.text}</h3>
        : block.heading === 'h3' ? <h4 key={index} className="pt-3 text-xl font-medium">{block.text}</h4>
        : <p key={index} className="whitespace-pre-line">{block.text}</p>)}
    </div>
    <details className="mx-auto max-w-[42rem] border-t border-white/15 pt-5 text-sm text-white/70">
      <summary className="cursor-pointer py-2">SEO og metadata</summary>
      <dl className="mt-4 space-y-4 break-words">
        <div><dt>SEO-titel</dt><dd className="text-white">{article.seoTitle || 'Mangler'}</dd></div>
        <div><dt>Metabeskrivelse</dt><dd className="text-white">{article.seoDescription || 'Mangler'}</dd></div>
        <div><dt>URL-navn</dt><dd>{article.slug || 'Mangler'}</dd></div>
        <div><dt>Artikeltype</dt><dd>{article.articleFormat || 'Ikke angivet'}</dd></div>
      </dl>
    </details>
  </article>;
}
