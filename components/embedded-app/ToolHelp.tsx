import type { ReactNode } from 'react';
import styles from '../tool-surface.module.css';

export default function ToolHelp({ title = 'Om værktøjet', children }: { title?: string; children: ReactNode }) {
  return <details className={styles.help}><summary>{title}</summary><div className={styles.helpBody}>{children}</div></details>;
}
