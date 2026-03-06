'use client';

export type SocialCardSize = 'story' | 'square';

const DIMENSIONS: Record<SocialCardSize, { width: number; height: number }> = {
  story: { width: 1080, height: 1920 },
  square: { width: 1080, height: 1080 },
};

const CTA_OFFSET = 10;
const CTA_FONT_SIZE_SQUARE = 32.547;
const CTA_LINE_HEIGHT_MULTIPLIER = 1.4;
const CTA_PADDING_Y_SQUARE = 24;
const CTA_PADDING_X_SQUARE = 78;
const BOX1_BOTTOM_PADDING_SQUARE = 12;
const BOX1_BOTTOM_PADDING_OG = 8;
const BOX2_BOTTOM_PADDING_SQUARE = 20;
const BOX2_BOTTOM_PADDING_OG = 14;
const HEADLINE_TOP_MARGIN_SQUARE = 14;
const HEADLINE_TOP_MARGIN_OG = 14;
const BYLINE_TOP_MARGIN_SQUARE = -10;
const BYLINE_TOP_MARGIN_OG = -10;
const BYLINE_FONT_SIZE_SQUARE = 48;
const BYLINE_LINE_HEIGHT = 1.2;
const BYLINE_COLOR = '#353535';
const EYEBROW_STAR_GAP = 9.33;
const EYEBROW_BADGE_GAP = 20;

/** Figma 1080×1080: logo 150×60, 60px from top; 32px gap Head/Eyebrow → H1; H1 80px, line-height 120%, padding H 65px */
const SQUARE_LOGO_TOP = 60;
const SQUARE_LOGO_W = 150;
const SQUARE_LOGO_H = 60;
const SQUARE_LOGO_TO_EYEBROW_GAP = 14.922;
const SQUARE_H1_FONT_SIZE = 80;
const SQUARE_H1_LINE_HEIGHT = 1.2;
const SQUARE_H1_PADDING_H = 100;
const SQUARE_EYEBROW_PADDING_H = 130;
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

function isWebflowReferenceId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value.trim());
}

export default function SocialCardCanvas({ data, size, className = '', cardRef }: SocialCardCanvasProps) {
  const { width, height } = DIMENSIONS[size];
  const imageMinH = size === 'square' ? 380 : 220;
  const ctaScale = size === 'square' ? 1 : 0.58;
  const ctaFontSize = CTA_FONT_SIZE_SQUARE * ctaScale;
  const ctaPaddingY = CTA_PADDING_Y_SQUARE * ctaScale;
  const ctaPaddingX = CTA_PADDING_X_SQUARE * ctaScale;

  const eyebrowParts =
    (data.eyebrowLabels && data.eyebrowLabels.length > 0)
      ? data.eyebrowLabels.filter((label) => !!label && !isWebflowReferenceId(label))
      : [data.category, data.categorySecondary]
          .filter((label): label is string => !!label && !isWebflowReferenceId(label));

  return (
    <div
      ref={cardRef as React.RefObject<HTMLDivElement>}
      className={`relative overflow-visible flex flex-col ${className}`}
      style={{
        width: `${width}px`,
        height: `${height}px`,
        backgroundColor: '#ffffff',
        imageRendering: 'auto',
        fontFamily: 'var(--font-amiri), Amiri, serif',
        fontSynthesis: 'none',
      }}
    >
      {/* Box 1: Head & Eyebrow */}
      <div
        className="relative shrink-0 flex flex-col items-center justify-start text-black"
        style={{
          minHeight: size === 'square' ? 196 : undefined,
          paddingTop: size === 'square' ? SQUARE_LOGO_TOP : 40,
          paddingLeft: size === 'square' ? SQUARE_EYEBROW_PADDING_H : 40,
          paddingRight: size === 'square' ? SQUARE_EYEBROW_PADDING_H : 40,
          paddingBottom: size === 'square' ? BOX1_BOTTOM_PADDING_SQUARE : BOX1_BOTTOM_PADDING_OG,
          rowGap: size === 'square' ? SQUARE_LOGO_TO_EYEBROW_GAP : 0,
          justifyContent: size === 'square' ? 'flex-end' : 'flex-start',
        }}
      >
        {/* Logo: SVG 150×60 centreret, 60px fra top (square) / ellers tekst-logo */}
        {size === 'square' ? (
          <div>
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
          className="flex items-center justify-center shrink-0"
          style={{
            marginTop: size === 'square' ? 0 : 16,
            marginBottom: size === 'square' ? 0 : 16,
            color: '#000',
            textAlign: 'center',
            fontFamily: 'var(--font-amiri), Amiri, serif',
            fontSize: size === 'square' ? 35 : 28,
            fontStyle: 'normal',
            fontWeight: 400,
            lineHeight: '140%',
          }}
        >
          {eyebrowParts.map((part, idx) => (
            <span key={`${part}-${idx}`} className="inline-flex items-center">
              {idx > 0 && (
                <span
                  className="opacity-60 inline-flex"
                  style={{ marginLeft: EYEBROW_BADGE_GAP / 2, marginRight: EYEBROW_BADGE_GAP / 2 }}
                >
                  |
                </span>
              )}
              <span>{part}</span>
            </span>
          ))}
          {(data.rating ?? 0) > 0 && (
            <>
              {eyebrowParts.length > 0 && (
                <span
                  className="opacity-60 inline-flex"
                  style={{ marginLeft: EYEBROW_BADGE_GAP / 2, marginRight: EYEBROW_BADGE_GAP / 2 }}
                >
                  |
                </span>
              )}
              <div
                className="flex items-center self-stretch"
                style={{ gap: EYEBROW_STAR_GAP }}
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
      </div>

      {/* Box 2: Text (headline + byline) */}
      <div
        className="shrink-0 text-black"
        style={{
          paddingLeft: size === 'square' ? SQUARE_H1_PADDING_H : 40,
          paddingRight: size === 'square' ? SQUARE_H1_PADDING_H : 40,
          paddingBottom: size === 'square' ? BOX2_BOTTOM_PADDING_SQUARE : BOX2_BOTTOM_PADDING_OG,
        }}
      >
        <h2
          className="text-center max-w-full leading-tight text-black line-clamp-2"
          style={{
            fontFamily: 'var(--font-amiri), Amiri, serif',
            fontWeight: 400,
            fontSize: size === 'square' ? SQUARE_H1_FONT_SIZE : size === 'story' ? 38 : 44,
            lineHeight: size === 'square' ? SQUARE_H1_LINE_HEIGHT : 1.2,
            maxWidth: size === 'square' ? width - SQUARE_H1_PADDING_H * 2 : undefined,
            marginTop: size === 'square' ? HEADLINE_TOP_MARGIN_SQUARE : HEADLINE_TOP_MARGIN_OG,
          }}
        >
          {data.title || 'Overskrift'}
        </h2>

        {/* Byline – under H1: #353535, Amiri italic 57px, 400, line-height 120% */}
        {data.excerpt && (
          <p
            className="text-center italic mt-2 line-clamp-2"
            style={{
              color: BYLINE_COLOR,
              textAlign: 'center',
              fontFamily: 'var(--font-amiri), Amiri, serif',
              fontSize: size === 'square' ? BYLINE_FONT_SIZE_SQUARE : size === 'story' ? 36 : 40,
              fontStyle: 'italic',
              fontWeight: 400,
              lineHeight: `${BYLINE_LINE_HEIGHT * 100}%`,
              maxWidth: size === 'square' ? width - SQUARE_H1_PADDING_H * 2 : '36rem',
              marginTop: size === 'square' ? BYLINE_TOP_MARGIN_SQUARE : BYLINE_TOP_MARGIN_OG,
            }}
          >
            {data.excerpt}
          </p>
        )}
      </div>

      {/* Box 3: Image (grows/shrinks naturally when text changes) */}
      <div
        className="relative flex-1 min-h-0 bg-neutral-200"
        style={{ minHeight: imageMinH }}
      >
        <div className="absolute inset-0 overflow-hidden">
        {data.imageUrl ? (
          <img
            src={data.imageUrl}
            alt=""
            className="w-full h-full object-cover object-center"
            style={{ objectFit: 'cover' }}
            crossOrigin="anonymous"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-neutral-300 to-neutral-400" />
        )}
        </div>

        {/* CTA button follows image, offset over top edge */}
        <div
          className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center z-20 rounded-full bg-black text-white font-medium"
          style={{
            top: `${CTA_OFFSET}px`,
            maxWidth: `${Math.min(width - 64, width * 0.82)}px`,
            padding: `${ctaPaddingY}px ${ctaPaddingX}px`,
            fontSize: ctaFontSize,
            fontWeight: 500,
            lineHeight: `${CTA_LINE_HEIGHT_MULTIPLIER}`,
            backgroundColor: '#000000',
            opacity: 1,
            boxShadow: '0 4px 14px rgba(0,0,0,0.2)',
            fontFamily: 'Inter, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
          }}
        >
          <span className="whitespace-nowrap">Læs nu på Apropos Magazine</span>
        </div>
      </div>
    </div>
  );
}

export { DIMENSIONS };
