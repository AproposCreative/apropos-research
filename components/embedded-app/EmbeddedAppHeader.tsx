'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';

const closeBtn =
  'flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.12] active:scale-[0.97]';

const pillLink =
  'px-3 py-1.5 rounded-lg border border-white/12 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-200 active:scale-[0.98]';

export type EmbeddedAppHeaderProps = {
  embedded: boolean;
  title: string;
  /** Én linje kontekst under titlen */
  subtitle?: string;
  onClose?: () => void;
  /** Fx segmenterede faner — renderes før luk-knap */
  trailing?: ReactNode;
  /** Venstre side før titel (fx mobil-menu i SoMe Posting) */
  leading?: ReactNode;
  /** Ekstra link når ikke embedded (fx Tilbage) */
  showBackLink?: boolean;
  backHref?: string;
};

/**
 * Fælles header til Nyhedsbrev, AI-posting m.fl. — matcher
 * `.cursor/rules/apropos-design-system.mdc` panel header.
 */
export function EmbeddedAppHeader({
  embedded,
  title,
  subtitle,
  onClose,
  trailing,
  leading,
  showBackLink,
  backHref = '/ai',
}: EmbeddedAppHeaderProps) {
  return (
    <header
      className={
        embedded
          ? 'border-b border-white/10 px-3 lg:px-4 py-2.5 lg:py-3 shrink-0 bg-black/25 backdrop-blur-md'
          : 'border-b border-white/10 px-4 lg:px-5 py-3 lg:py-4 shrink-0 bg-[#0c0c0c]'
      }
    >
      <div className="flex flex-col gap-2 min-w-0">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            {leading ? <div className="shrink-0">{leading}</div> : null}
            <div className="min-w-0 flex-1">
              <h1
                className={`font-medium tracking-tight text-white ${embedded ? 'text-[15px]' : 'text-[17px]'}`}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className="text-[11px] text-white/45 leading-relaxed mt-1 max-w-[52ch]">{subtitle}</p>
              ) : null}
            </div>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-1.5 md:gap-2 shrink-0">
            {trailing}
            {onClose ? (
              <button type="button" onClick={onClose} className={closeBtn} aria-label="Luk">
                <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            ) : null}
            {!embedded && showBackLink !== false ? (
              <Link href={backHref} className={pillLink}>
                ← Tilbage
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </header>
  );
}
