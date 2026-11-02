'use client';
import Link from 'next/link';
import { useWebApps } from '@/lib/use-web-apps';
import type { ToolEntry } from '@/lib/tool-availability';
import styles from './tool-list.module.css';

export default function ToolList({ onSelectApp, onOpenShelf, onClose, showAllTools = false }: {
  onSelectApp?: (id: string) => void; onOpenShelf?: () => void; onClose?: () => void; showAllTools?: boolean;
}) {
  const { tools, isPending, isError, refetch } = useWebApps();
  // Mobile grouping is presentation only. Podcast/push remain enabled and the
  // separate desktop catalogue keeps its original ordering and cards.
  const otherTools = tools.filter(app => app.hidden || ['push-desk', 'podcast'].includes(app.id));
  const primaryTools = showAllTools ? tools : tools.filter(app => !otherTools.includes(app));
  const row = (app: ToolEntry) => {
    const content = <><span className={styles.copy}><span className={styles.name}>{app.name}</span>
      <span className={styles.srOnly}>{app.description}</span>
      {app.status && <span className={styles.note}>{app.status}</span>}
      {app.external && <span className={styles.srOnly}>Åbner i en ny fane</span>}</span>
      <span className={styles.chevron} aria-hidden="true">{app.external ? '↗' : '›'}</span></>;
    return <li key={app.id}>{app.external ?
      <a className={styles.row} href={app.path} target="_blank" rel="noopener noreferrer">{content}</a> :
      onSelectApp ? <button type="button" className={styles.row} onClick={() => { onSelectApp(app.id); onClose?.(); }}>{content}</button> :
      <Link className={styles.row} href={app.path} onClick={onClose}>{content}</Link>}</li>;
  };
  return <nav className={styles.list} aria-label="Værktøjer">
    {isPending && <span className={styles.srOnly} role="status">Kontrollerer værktøjernes status</span>}
    {isError && <div className={styles.notice} role="status">Aktuel status kunne ikke hentes. Du kan stadig åbne værktøjerne; nogle kan være sat på pause. <button type="button" onClick={() => void refetch()}>Hent status igen</button></div>}
    <ul>{primaryTools.map(row)}
      {onOpenShelf && <li><button type="button" className={styles.row} onClick={() => { onOpenShelf(); onClose?.(); }}>
        <span className={styles.copy}><span className={styles.name}>Mine artikler</span><span className={styles.srOnly}>Find dine gemte arbejdsrum og fortsæt, hvor du slap.</span></span><span className={styles.chevron} aria-hidden="true">›</span>
      </button></li>}
    </ul>
    {!showAllTools && otherTools.length > 0 && <details className={styles.hidden}>
      <summary>Andre værktøjer ({otherTools.length})</summary>
      <p className={styles.notice}>Podcast, pushbeskeder og øvrige funktioner. Pauset automatik starter ikke ved åbning.</p>
      <ul>{otherTools.map(row)}</ul>
    </details>}
  </nav>;
}
