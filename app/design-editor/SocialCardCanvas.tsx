'use client';

export type SocialCardSize = 'og' | 'square';

const DIMENSIONS: Record<SocialCardSize, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

/** Top section ~55% (Figma 1031:796), then CTA button, then image. */
const TOP_SECTION_RATIO = 0.55;
const CTA_HEIGHT = 56;

export interface SocialCardData {
  title: string;
  excerpt?: string;
  imageUrl?: string | null;
  /** e.g. "Koncert", "Anmeldelse" – shown as "Koncert | Anmeldelse" or single */
  category?: string;
  /** Second tag/category (optional) */
  categorySecondary?: string;
  /** 0–5 star rating */
  rating?: number;
  caption?: string;
}

interface SocialCardCanvasProps {
  data: SocialCardData;
  size: SocialCardSize;
  className?: string;
  cardRef?: React.RefObject<HTMLDivElement | null>;
}

export default function SocialCardCanvas({ data, size, className = '', cardRef }: SocialCardCanvasProps) {
  const { width, height } = DIMENSIONS[size];
  const topH = Math.round(height * TOP_SECTION_RATIO);
  const ctaY = topH;
  const imageTop = ctaY + CTA_HEIGHT;
  const imageH = height - imageTop;

  const categoryLabel = [data.category, data.categorySecondary].filter(Boolean).join(' | ') || 'Artikel';

  return (
    <div
      ref={cardRef as React.RefObject<HTMLDivElement>}
      className={`relative overflow-hidden bg-white ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        imageRendering: 'auto',
        fontFamily: 'var(--font-amiri), Amiri, serif',
      }}
    >
      {/* Top section: white, logo + meta + headline + blurb – sort tekst (Figma 1031:796) */}
      <div
        className="relative flex flex-col items-center justify-start pt-10 pb-6 px-10"
        style={{ height: `${topH}px`, minHeight: `${topH}px` }}
      >
        {/* Logo: APROPOS (sans) + Magazine (Amiri italic) */}
        <div className="text-center mb-4 text-black">
          <div
            className="font-bold uppercase tracking-[0.2em]"
            style={{
              fontSize: size === 'og' ? 22 : 26,
              letterSpacing: '0.15em',
              fontFamily: 'system-ui, -apple-system, sans-serif',
            }}
          >
            APROPOS
          </div>
          <div
            className="italic"
            style={{ fontSize: size === 'og' ? 14 : 16, marginTop: 2 }}
          >
            Magazine
          </div>
        </div>

        {/* Category | Tag and star rating – sort */}
        <div className="flex items-center justify-center gap-2 mb-4 text-black">
          <span
            className="font-medium"
            style={{ fontSize: size === 'og' ? 15 : 17 }}
          >
            {categoryLabel}
          </span>
          {(data.rating ?? 0) > 0 && (
            <>
              <span className="text-black/50" style={{ fontSize: 12 }}>|</span>
              <div className="flex items-center gap-0.5">
                {[1, 2, 3, 4, 5].map((star) => (
                  <span
                    key={star}
                    className={star <= (data.rating ?? 0) ? 'text-black' : 'text-black/30'}
                    style={{ fontSize: size === 'og' ? 14 : 16 }}
                  >
                    ★
                  </span>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Headline – stor serif, sort */}
        <h2
          className="text-center font-semibold max-w-2xl leading-tight text-black"
          style={{
            fontSize: size === 'og' ? 38 : 44,
            lineHeight: 1.2,
          }}
        >
          {data.title || 'Overskrift'}
        </h2>

        {/* Blurb – italic serif, sort */}
        {data.excerpt && (
          <p
            className="text-center italic mt-2 max-w-xl line-clamp-2 text-black"
            style={{
              fontSize: size === 'og' ? 18 : 20,
              lineHeight: 1.4,
            }}
          >
            {data.excerpt}
          </p>
        )}
      </div>

      {/* CTA button – sort bg, hvid tekst, pill-form (Figma) */}
      <div
        className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10 rounded-full bg-black text-white font-medium"
        style={{
          top: `${ctaY}px`,
          width: Math.min(width * 0.7, 520),
          height: CTA_HEIGHT,
          fontSize: size === 'og' ? 15 : 17,
          boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
          fontFamily: 'var(--font-amiri), Amiri, serif',
        }}
      >
        Læs nu på Apropos Magazine
      </div>

      {/* Bottom: full-bleed image */}
      <div
        className="absolute left-0 right-0 overflow-hidden bg-neutral-200"
        style={{ top: imageTop, height: imageH }}
      >
        {data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt=""
            className="w-full h-full object-cover"
            crossOrigin="anonymous"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
        )}
      </div>
    </div>
  );
}

export { DIMENSIONS };
