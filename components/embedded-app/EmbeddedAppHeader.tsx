'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import styles from './tool-chrome.module.css';

export type EmbeddedAppHeaderProps = {
  embedded: boolean;
  /** Compatibility: all tool headers now keep controls on one row. */
  inlineControls?: boolean;
  title: string;
  subtitle?: string;
  onClose?: () => void;
  trailing?: ReactNode;
  leading?: ReactNode;
  showBackLink?: boolean;
  backHref?: string;
};

export function EmbeddedAppHeader({ embedded, title, subtitle, onClose, trailing, leading, showBackLink, backHref = '/ai' }: EmbeddedAppHeaderProps) {
  const shortTitle = ({ 'Liv · Redaktion': 'Liv', 'Liv Indbakke': 'Mail', 'Akkreditering': 'Presse', 'SEO & Google': 'SEO', 'Nyhedsbrev': 'Nyhedsbrev', 'Trafik & overblik': 'Trafik', 'AI-redaktionschef': 'Redaktion', 'Liv · AI-posting': 'Drift', 'Indstillinger': 'Indstillinger', 'Prompt Architect': 'Prompts' } as Record<string, string>)[title] || title;
  return <header className={`${styles.header} ${embedded ? styles.compact : ''}`}>
    <div className={styles.rows}>
      <div className={`${styles.row} ${trailing ? styles.hasControls : ''}`}>
        <div className={styles.heading}>
          {leading && <div className="shrink-0">{leading}</div>}
          <div className={styles.headingCopy}><h1 className={styles.title} title={title} aria-label={title}><span className={styles.longTitle}>{title}</span><span className={styles.shortTitle} aria-hidden="true">{shortTitle}</span></h1></div>
        </div>
        {trailing && <div className={styles.inlineTrailing} aria-label="Værktøjslinje">{trailing}</div>}
        {subtitle && <details className={styles.headerHelp}>
          <summary aria-label={`Om ${title}`} title={`Om ${title}`}><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v1"/></svg></summary>
          <p>{subtitle}</p>
        </details>}
        <div className={styles.actions}>
          {onClose ? <button type="button" onClick={onClose} className={styles.close} aria-label="Luk"><svg fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden="true"><path strokeLinecap="round" d="m6 6 12 12M18 6 6 18"/></svg></button>
            : !embedded && showBackLink !== false ? <Link href={backHref} className={styles.back} aria-label="Til værktøjer" title="Til værktøjer"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m14 5-7 7 7 7"/></svg></Link> : null}
        </div>
      </div>
    </div>
  </header>;
}
