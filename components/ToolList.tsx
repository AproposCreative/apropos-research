'use client';
import Link from 'next/link';
import { useWebApps } from '@/lib/use-web-apps';
import type { ToolEntry } from '@/lib/tool-availability';
import styles from './tool-list.module.css';

export default function ToolList({ onSelectApp, onOpenShelf, onClose }: {
  onSelectApp?: (id: string) => void; onOpenShelf?: () => void; onClose?: () => void;
}) {
  const { tools, isPending, isError, refetch } = useWebApps();
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
    <ul>{tools.filter(app => !app.hidden).map(row)}
      {onOpenShelf && <li><button type="button" className={styles.row} onClick={() => { onOpenShelf(); onClose?.(); }}>
        <span className={styles.copy}><span className={styles.name}>Mine artikler</span><span className={styles.srOnly}>Find dine gemte arbejdsrum og fortsæt, hvor du slap.</span></span><span className={styles.chevron} aria-hidden="true">›</span>
      </button></li>}
    </ul>
    {tools.some(app => app.hidden) && <details className={styles.hidden}>
      <summary>Skjulte værktøjer ({tools.filter(app => app.hidden).length})</summary>
      <p className={styles.notice}>Her finder du værktøjer med pauset eller blokeret automatik. Gemte data er bevaret. Åbning genstarter ikke automatikken.</p>
      <ul>{tools.filter(app => app.hidden).map(row)}</ul>
    </details>}
  </nav>;
}
