'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './tool-chrome.module.css';

export type EmbeddedAppHeaderProps = {
  embedded: boolean;
  /** Opt-in compact controls beside the close button. */
  inlineControls?: boolean;
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
  inlineControls = false,
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
      className={`${styles.header} ${embedded ? styles.compact : ''}`}
    >
      <div className={styles.rows}>
        {/* Row 1: title (left) + close/back (top-right) — always. */}
        <div className={`${styles.row} ${inlineControls ? styles.inline : ''}`}>
          <div className={styles.heading}>
            {leading ? <div className="shrink-0">{leading}</div> : null}
            <div className={styles.headingCopy}>
              <h1
                className={styles.title}
              >
                {title}
              </h1>
              {subtitle ? (
                <p className={styles.subtitle}>{subtitle}</p>
              ) : null}
            </div>
          </div>
          {inlineControls && trailing ? <div className={styles.inlineTrailing}>{trailing}</div> : null}
          {onClose || (!embedded && showBackLink !== false) ? (
            <div className={styles.actions}>
              {onClose ? (
                <button type="button" onClick={onClose} className={styles.close} aria-label="Luk">
                  <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              ) : null}
              {!embedded && showBackLink !== false ? (
                <Link href={backHref} className={styles.back}>
                  Til værktøjer
                </Link>
              ) : null}
            </div>
          ) : null}
        </div>

        {/* Row 2: controls (segmented tabs, toggles). Full width, wraps on
            mobile so it never squeezes the title; right-aligned on desktop. */}
        {trailing && !inlineControls ? (
          <div className={styles.controls}>
            {trailing}
          </div>
        ) : null}
      </div>
    </header>
  );
}
