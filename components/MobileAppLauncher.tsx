'use client';
import ToolList from './ToolList';
import styles from './tool-list.module.css';

export default function MobileAppLauncher({ onSelectApp, onOpenShelf }: {
  onSelectApp: (appId: string) => void; onOpenShelf: () => void;
}) {
  return <section className={styles.landing} aria-label="Apropos værktøjer">
    <div className={styles.content}>
      <img src="/images/Apropos Research White.png" alt="Apropos Research" className={styles.brand} />
      <p className={styles.intro}>Fra idé til artikel, godkendelse og deling.</p>
      <ToolList onSelectApp={onSelectApp} onOpenShelf={onOpenShelf} />
    </div>
  </section>;
}
