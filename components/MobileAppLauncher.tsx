'use client';
import ToolList from './ToolList';
import styles from './tool-list.module.css';

export default function MobileAppLauncher({ onSelectApp, onOpenShelf }: {
  onSelectApp: (appId: string) => void; onOpenShelf: () => void;
}) {
  return <section className={styles.landing} aria-label="Apropos værktøjer">
    <div className={styles.content}>
      <header className={styles.masthead}>
        <img src="/images/apropos-research-white.svg" alt="Apropos Research" className={styles.brand} />
        <h1 className={styles.title}>Værktøjer</h1>
      </header>
      <ToolList onSelectApp={onSelectApp} onOpenShelf={onOpenShelf} />
    </div>
  </section>;
}
