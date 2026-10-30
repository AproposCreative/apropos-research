'use client';
import ToolList from './ToolList';
import styles from './tool-list.module.css';
import DesktopToolsMenu from './DesktopToolsMenu';

export default function WebAppsPanel({ isOpen, onClose, onSelectApp, onOpenShelf, showAllTools = false }: {
  isOpen: boolean; onClose: () => void; onSelectApp?: (appId: string) => void; onOpenShelf?: () => void; showAllTools?: boolean;
}) {
  if (!isOpen) return null;
  if (showAllTools) return <DesktopToolsMenu onClose={onClose} onSelectApp={onSelectApp} onOpenShelf={onOpenShelf} />;
  return <section className={styles.panel}>
    <header className={styles.header}><h2>Værktøjer</h2><button type="button" onClick={onClose} aria-label="Luk værktøjer"><span aria-hidden="true">×</span></button></header>
    <div className={styles.scroll}><ToolList onSelectApp={onSelectApp} onOpenShelf={onOpenShelf} onClose={onClose} showAllTools={showAllTools} /></div>
  </section>;
}
