'use client';
import { storyConnectionMessage, type StoryConnectionStatus } from '@/lib/social/story-connection-status';
import styles from './SocialEditor.module.css';

export default function StoryConnectionNotice({ status, owner, checking, refresh, unlinkedAvailable = false }: {
  status: StoryConnectionStatus | null; owner: boolean; checking: boolean; refresh: () => void; unlinkedAvailable?: boolean;
}) {
  const message = storyConnectionMessage(status, owner);
  if (!message) return null;
  return <section className={styles.syncNotice} aria-label="Story-forbindelse">
    {unlinkedAvailable && <p>Du kan udgive Stories normalt uden klikbart artikellink.</p>}
    <p role="status">{message}</p>
    <div className={styles.copyActions}>
      {owner && status === 'not_connected' && <a className={styles.textButton} href="/social-story-connection" target="_blank" rel="noopener noreferrer">Tilslut Story-forbindelse</a>}
      <button type="button" className={styles.textButton} disabled={checking} onClick={refresh}>{checking ? 'Kontrollerer…' : 'Kontrollér forbindelse'}</button>
    </div>
  </section>;
}
