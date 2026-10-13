'use client';
import ToolList from './ToolList';
import styles from './tool-list.module.css';

export default function WebAppsPanel({ isOpen, onClose, onSelectApp, onOpenShelf }: {
  isOpen: boolean; onClose: () => void; onSelectApp?: (appId: string) => void; onOpenShelf?: () => void;
}) {
  if (!isOpen) return null;
  return <section className={styles.panel}>
    <header className={styles.header}><h2>Værktøjer</h2><button type="button" onClick={onClose}>Luk</button></header>
    <div className={styles.scroll}><ToolList onSelectApp={onSelectApp} onOpenShelf={onOpenShelf} onClose={onClose} /></div>
  </section>;
}
