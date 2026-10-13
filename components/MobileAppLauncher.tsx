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
        <h1 className={styles.title}>Dit redaktionelle arbejdsrum</h1>
        <p className={styles.intro}>Skriv, godkend og del. Fortsæt i det værktøj, du har brug for.</p>
      </header>
      <ToolList onSelectApp={onSelectApp} onOpenShelf={onOpenShelf} />
    </div>
  </section>;
}
