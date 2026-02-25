'use client';

export type SocialCardSize = 'og' | 'square';

const DIMENSIONS: Record<SocialCardSize, { width: number; height: number }> = {
  og: { width: 1200, height: 630 },
  square: { width: 1080, height: 1080 },
};

/** Top section ~55% (Figma 1031:796), then CTA button, then image. */
const TOP_SECTION_RATIO = 0.55;
const CTA_HEIGHT = 56;

/** Figma 1080×1080: logo 150×60, 60px from top; 32px gap Head/Eyebrow → H1; H1 80px, line-height 120%, padding H 65px */
const SQUARE_LOGO_TOP = 60;
const SQUARE_LOGO_W = 150;
const SQUARE_LOGO_H = 60;
const SQUARE_GAP_EYEBROW_H1 = 32;
const SQUARE_H1_FONT_SIZE = 80;
const SQUARE_H1_LINE_HEIGHT = 1.2;
const SQUARE_H1_PADDING_H = 65;
const LOGO_SRC = '/images/AproposMagazineLogoInstagram.svg';

export interface SocialCardData {
  title: string;
  excerpt?: string;
  imageUrl?: string | null;
  /** e.g. "Koncert", "Anmeldelse" – shown as "Koncert | Anmeldelse" or single */
  category?: string;
  /** Second tag/category (optional) */
  categorySecondary?: string;
  /** Head & Eyebrow: labels from CMS (Section, Primary Topic, Topics, Author). Overrides category when set. */
  eyebrowLabels?: string[];
  /** 0–6 star rating */
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
  const imageTop = ctaY;
  const imageH = height - ctaY;

  const categoryLabel =
    (data.eyebrowLabels && data.eyebrowLabels.length > 0)
      ? data.eyebrowLabels.join(' | ')
      : [data.category, data.categorySecondary].filter(Boolean).join(' | ') || '';

  return (
    <div
      ref={cardRef as React.RefObject<HTMLDivElement>}
      className={`relative overflow-visible ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        imageRendering: 'auto',
        fontFamily: 'var(--font-amiri), Amiri, serif',
      }}
    >
      {/* Top section: hvid kun til CTA (Figma); CTA overlapper billedet */}
      <div
        className="relative flex flex-col items-center justify-start pb-6 text-black bg-white"
        style={{
          height: `${ctaY}px`,
          minHeight: `${ctaY}px`,
          paddingTop: size === 'square' ? SQUARE_LOGO_TOP : 40,
          paddingLeft: size === 'square' ? SQUARE_H1_PADDING_H : 40,
          paddingRight: size === 'square' ? SQUARE_H1_PADDING_H : 40,
        }}
      >
        {/* Logo: SVG 150×60 centreret, 60px fra top (square) / ellers tekst-logo */}
        {size === 'square' ? (
          <div className="absolute left-1/2 -translate-x-1/2" style={{ top: SQUARE_LOGO_TOP }}>
            <img
              src={LOGO_SRC}
              alt="Apropos Magazine"
              width={SQUARE_LOGO_W}
              height={SQUARE_LOGO_H}
              className="object-contain"
              style={{ width: SQUARE_LOGO_W, height: SQUARE_LOGO_H }}
            />
          </div>
        ) : (
          <div className="text-center mb-4">
            <div className="font-bold uppercase tracking-[0.2em]" style={{ fontSize: 22, letterSpacing: '0.15em', fontFamily: 'system-ui, sans-serif' }}>APROPOS</div>
            <div className="italic" style={{ fontSize: 14, marginTop: 2 }}>Magazine</div>
          </div>
        )}

        {/* Eyebrow: Amiri 35px, 400, line-height 140%, #000, center */}
        <div
          className="flex items-center justify-center gap-2 shrink-0"
          style={{
            marginTop: size === 'square' ? SQUARE_LOGO_H + SQUARE_GAP_EYEBROW_H1 : 16,
            marginBottom: size === 'square' ? SQUARE_GAP_EYEBROW_H1 : 16,
            color: '#000',
            textAlign: 'center',
            fontFamily: 'var(--font-amiri), Amiri, serif',
            fontSize: size === 'square' ? 35 : 28,
            fontStyle: 'normal',
            fontWeight: 400,
            lineHeight: '140%',
          }}
        >
          {categoryLabel && <span>{categoryLabel}</span>}
          {(data.rating ?? 0) > 0 && (
            <>
              {categoryLabel && <span className="opacity-50">|</span>}
              <div
                className="flex items-center self-stretch"
                style={{ gap: 9.33 }}
              >
                {[1, 2, 3, 4, 5, 6].map((star) => (
                  <img
                    key={star}
                    src={star <= (data.rating ?? 0) ? '/images/star-filled.svg' : '/images/star-outline.svg'}
                    alt=""
                    width={23}
                    height={23}
                    className="shrink-0"
                  />
                ))}
              </div>
            </>
          )}
        </div>

        {/* H1 – Amiri Regular, 80px, line-height 120%, padding H 65px (square) */}
        <h2
          className="text-center max-w-full leading-tight text-black"
          style={{
            fontFamily: 'var(--font-amiri), Amiri, serif',
            fontWeight: 400,
            fontSize: size === 'square' ? SQUARE_H1_FONT_SIZE : size === 'og' ? 38 : 44,
            lineHeight: size === 'square' ? SQUARE_H1_LINE_HEIGHT : 1.2,
            maxWidth: size === 'square' ? width - SQUARE_H1_PADDING_H * 2 : undefined,
          }}
        >
          {data.title || 'Overskrift'}
        </h2>

        {/* Byline – under H1: #353535, Amiri italic 57px, 400, line-height 120% */}
        {data.excerpt && (
          <p
            className="text-center italic mt-2 line-clamp-2"
            style={{
              color: '#353535',
              textAlign: 'center',
              fontFamily: 'var(--font-amiri), Amiri, serif',
              fontSize: size === 'square' ? 57 : size === 'og' ? 36 : 40,
              fontStyle: 'italic',
              fontWeight: 400,
              lineHeight: '120%',
              maxWidth: size === 'square' ? width - SQUARE_H1_PADDING_H * 2 : '36rem',
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
