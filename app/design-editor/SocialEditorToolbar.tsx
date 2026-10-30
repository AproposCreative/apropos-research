'use client';

import Link from 'next/link';
import type { SocialCardSize } from './SocialCardCanvas';
import styles from './SocialEditor.module.css';

type Props = {
  embedded?: boolean; articlesOpen: boolean; onArticles: () => void;
  size: SocialCardSize; onSize: (size: SocialCardSize) => void;
  dark: boolean; onTheme: () => void; publishing: boolean; publishDisabled: boolean; onPublish: () => void;
  exporting: boolean; exportDisabled?: boolean; editingDisabled?: boolean; onExport: () => void; onClose?: () => void;
};

export default function SocialEditorToolbar(props: Props) {
  const closeIcon = <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="m7 7 10 10M17 7 7 17" /></svg>;
  return <header className={`${styles.toolbar} ${props.embedded ? styles.embeddedToolbar : ''}`} aria-label="Sociale medier">
    <button type="button" className={`${styles.iconButton} ${styles.articleToggle}`} aria-label="Artikler" aria-pressed={props.articlesOpen} onClick={props.onArticles} title="Artikler">
      <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
    </button>
    <h1 className={styles.toolbarTitle} aria-label="Sociale medier"><span className={styles.shortTitle} aria-hidden="true">SoMe</span><span className={styles.longTitle} aria-hidden="true">Sociale medier</span></h1>
    <div className={styles.toolbarControls}>
      <div className={styles.format} role="group" aria-label="Kortformat">
        <button type="button" disabled={props.editingDisabled} onClick={() => props.onSize('square')} aria-pressed={props.size === 'square'} title="Kvadrat">1:1</button>
        <button type="button" disabled={props.editingDisabled} onClick={() => props.onSize('story')} aria-pressed={props.size === 'story'} title="Story">9:16</button>
      </div>
      <button type="button" disabled={props.editingDisabled} onClick={props.onTheme} className={styles.iconButton} aria-label={props.dark ? 'Skift til lyst design' : 'Skift til mørkt design'} aria-pressed={props.dark} title="Lyst eller mørkt design">
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="8" /><path d="M12 4a8 8 0 0 1 0 16Z" fill="currentColor" stroke="none" /></svg>
      </button>
      <button type="button" onClick={props.onPublish} disabled={props.publishDisabled} className={styles.publishButton}
        aria-label={props.size === 'story' ? 'Post til Instagram Story' : 'Post til Instagram'} title="Udgiv" aria-busy={props.publishing}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><path d="M12 17V7m-4 4 4-4 4 4" /></svg>
        <span className={styles.publishLabel}>{props.publishing ? '…' : 'Udgiv'}</span>
      </button>
      <button type="button" onClick={props.onExport} disabled={props.exporting || props.exportDisabled} className={styles.iconButton} aria-label={props.exporting ? 'Eksporterer…' : 'Eksporter PNG'} title="Download" aria-busy={props.exporting}>
        <svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M4 16v4h16v-4M12 3v12m-4-4 4 4 4-4" /></svg>
      </button>
    </div>
    {props.onClose ? <button type="button" onClick={props.onClose} className={`${styles.iconButton} ${styles.closeButton}`} aria-label="Luk" title="Luk">{closeIcon}</button>
      : <Link href="/ai" className={`${styles.iconButton} ${styles.closeButton}`} aria-label="Til værktøjer" title="Til værktøjer">{closeIcon}</Link>}
  </header>;
}
