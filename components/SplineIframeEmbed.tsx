'use client';

type Props = {
  src: string;
  title?: string;
  className?: string;
  /** Corner mask fill — match the surrounding surface */
  maskClassName?: string;
  iframeKey?: string;
};

/**
 * Spline viewer iframe with free-tier "Made with Spline" chip hidden.
 * The watermark lives inside a cross-origin iframe, so we cannot style it —
 * we crop the bottom-right footprint and cover residual pixels.
 */
export default function SplineIframeEmbed({
  src,
  title = 'Background',
  className = '',
  maskClassName = 'bg-black',
  iframeKey,
}: Props) {
  return (
    <div className={`absolute inset-0 overflow-hidden ${className}`}>
      <iframe
        key={iframeKey}
        src={src}
        title={title}
        frameBorder={0}
        loading="lazy"
        allow="autoplay; fullscreen"
        className="absolute left-0 top-0 max-w-none border-0"
        style={{
          width: 'calc(100% + 168px)',
          height: 'calc(100% + 72px)',
        }}
      />
      {/* Solid backup if crop misses a few px (link is ~89×13 + padding) */}
      <div
        aria-hidden
        className={`pointer-events-none absolute bottom-0 right-0 z-[1] h-[72px] w-[168px] ${maskClassName}`}
      />
    </div>
  );
}
