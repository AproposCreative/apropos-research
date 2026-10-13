'use client';

import type { ReactNode } from 'react';
import styles from './tool-chrome.module.css';

/** Nummereret sektionstitler i AI-posting el.l. */
export function EmbeddedSectionLabel({
  step,
  children,
}: {
  step: number;
  children: ReactNode;
}) {
  return (
    <div className={styles.step}>
      <span className={styles.stepNumber}>
        {step}
      </span>
      <p className={styles.stepDescription}>{children}</p>
    </div>
  );
}
