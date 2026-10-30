'use client';

import type { useCardSubtitle } from './useCardSubtitle';
import { CopyChevron, CopyHelp, CopySuggestions, CopyTextarea } from './CopyControlParts';
import styles from './SocialEditor.module.css';

export default function SubtitleControls({ subtitle }: { subtitle: ReturnType<typeof useCardSubtitle> }) {
  const status = subtitle.checking ? 'Henter…' : subtitle.error || !subtitle.ready ? 'Tjek' :
    subtitle.status === 'ai' ? 'AI' : subtitle.status === 'excerpt' ? 'Uddrag' : subtitle.status === 'manual' ? 'Redigeret' : null;
  return <details className={styles.copySection} data-copy-control="subtitle">
    <summary className={styles.copySummary}><span>Undertekst</span>
      {status && <span className={styles.copyStatus} role="status">{status}</span>}<CopyChevron />
    </summary>
    <div className={styles.copyBody}>
      <CopyTextarea label="Undertekst på billedet" value={subtitle.text} onChange={subtitle.edit} />
      <div className={styles.copyActions}>
        <button type="button" onClick={subtitle.reset} className={styles.textButton} aria-label="Tilpas automatisk">Tilpas</button>
        <button type="button" onClick={subtitle.nextVariant} disabled={!subtitle.canGetMore} className={styles.textButton} aria-label="Nye forslag med AI">
          {subtitle.checking ? 'Henter…' : 'Nye forslag'}
        </button>
        <button type="button" onClick={subtitle.restore} className={styles.textButton} aria-label="Gendan original">Original</button>
        <CopyHelp />
      </div>
      <CopySuggestions options={subtitle.options} selected={subtitle.text} onChoose={subtitle.choose} label="Forslag til undertekst" />
      {subtitle.maxVariantsReached && <p className={styles.copyNote}>Alle forslag er hentet.</p>}
      {subtitle.error && <p className={styles.copyError} role="alert">{subtitle.error}</p>}
      {subtitle.canResume && <button type="button" onClick={subtitle.resume} disabled={subtitle.resuming} className={styles.textButton}>
        {subtitle.resuming ? 'Genoptager…' : 'Genoptag AI'}
      </button>}
      {!subtitle.ready && !subtitle.checking && !subtitle.error && <p className={styles.copyNote}>Forkort teksten, så den passer på billedet.</p>}
    </div>
  </details>;
}
