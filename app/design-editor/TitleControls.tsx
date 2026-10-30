'use client';

import type { useCardTitle } from './useCardTitle';
import { CopyChevron, CopyHelp, CopySuggestions, CopyTextarea } from './CopyControlParts';
import styles from './SocialEditor.module.css';

export default function TitleControls({ title }: { title: ReturnType<typeof useCardTitle> }) {
  return <details className={styles.copySection} data-copy-control="title">
    <summary className={styles.copySummary}><span>Overskrift</span>
      {title.loading && <span className={styles.copyStatus} role="status">Henter…</span>}<CopyChevron />
    </summary>
    <div className={styles.copyBody}>
      <CopyTextarea label="Overskrift på billedet" value={title.text} onChange={title.edit} />
      <div className={styles.copyActions}>
        <button type="button" onClick={title.requestMore} disabled={!title.canGetMore} className={styles.textButton} aria-label={title.options.length ? 'Nye overskrifter med AI' : 'Forkort med AI'}>
          {title.loading ? 'Henter…' : title.options.length ? 'Nye forslag' : 'Forkort'}
        </button>
        <button type="button" onClick={title.restore} className={styles.textButton} aria-label="Gendan original">Original</button>
        <CopyHelp />
      </div>
      <CopySuggestions options={title.options} selected={title.text} onChoose={title.choose} label="Forslag til overskrift" />
      {title.maxVariantsReached && <p className={styles.copyNote}>Alle forslag er hentet.</p>}
      {title.error && <p role="alert" className={styles.copyError}>{title.error}</p>}
    </div>
  </details>;
}
