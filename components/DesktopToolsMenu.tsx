'use client';

import Link from 'next/link';
import { useWebApps } from '@/lib/use-web-apps';
import type { ToolEntry } from '@/lib/tool-availability';
import styles from './DesktopToolsMenu.module.css';

// The desktop menu's original order; newer entries remain available below it.
const desktopOrder = ['ai-writer', 'image-gen', 'design-editor', 'newsletter', 'push-desk',
  'liv-desk', 'akkreditering', 'liv-inbox', 'dashboard', 'podcast', 'seo-engine'];

function ToolIcon({ app }: { app: ToolEntry }) {
  return <span className={styles.icon} aria-hidden="true">{app.id === 'podcast' ?
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
      <path d="M12 2a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2M12 19v3" />
    </svg> : app.name.charAt(0)}</span>;
}

export default function DesktopToolsMenu({ onClose, onSelectApp, onOpenShelf }: {
  onClose: () => void; onSelectApp?: (id: string) => void; onOpenShelf?: () => void;
}) {
  const { tools, isPending, isError, refetch } = useWebApps();
  const rank = (id: string) => { const index = desktopOrder.indexOf(id); return index < 0 ? desktopOrder.length : index; };
  const sorted = [...tools].sort((a, b) => rank(a.id) - rank(b.id) || a.order - b.order);
  return <section className={styles.panel} aria-label="Desktopværktøjer">
    <header className={styles.header}>
      <h2>Web-apps</h2>
      <button type="button" onClick={onClose} className={styles.close} aria-label="Luk værktøjer">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="m18 6-12 12M6 6l12 12" /></svg>
      </button>
    </header>
    <nav className={styles.scroll} aria-label="Værktøjer">
      {isPending && <span className={styles.srOnly} role="status">Kontrollerer værktøjernes status</span>}
      {isError && <p className={styles.notice} role="status">Status kunne ikke hentes. <button type="button" onClick={() => void refetch()}>Prøv igen</button></p>}
      <ul className={styles.list}>{sorted.map(app => {
        const details = [app.description, app.status].filter(Boolean).join(' ');
        const content = <><ToolIcon app={app} /><span className={styles.name}>{app.name}</span>
          {app.hidden && <span className={styles.badge}>Pauset</span>}
          {app.external && <span className={styles.external} aria-hidden="true">↗</span>}
          <span className={styles.srOnly}>{app.status}{app.external ? ' Åbner i en ny fane' : ''}</span></>;
        return <li key={app.id}>{app.external ?
          <a className={styles.card} href={app.path} title={details} target="_blank" rel="noopener noreferrer" onClick={onClose}>{content}</a> :
          onSelectApp ? <button type="button" className={styles.card} title={details} onClick={() => { onSelectApp(app.id); onClose(); }}>{content}</button> :
          <Link className={styles.card} title={details} href={app.path} onClick={onClose}>{content}</Link>}</li>;
      })}
      {onOpenShelf && <li><button type="button" className={styles.card} onClick={() => { onOpenShelf(); onClose(); }}>
        <span className={styles.icon} aria-hidden="true">M</span><span className={styles.name}>Mine artikler</span>
      </button></li>}</ul>
    </nav>
  </section>;
}
