'use client';

import type { useCardSubtitle } from './useCardSubtitle';
import { CopyChevron, CopyHelp, CopySuggestions, CopyTextarea, CopyTextSize } from './CopyControlParts';
import styles from './SocialEditor.module.css';
import type { TextSizeControl } from './useCardTextSize';

export default function SubtitleControls({ subtitle, sizing }: { subtitle: ReturnType<typeof useCardSubtitle>; sizing?: TextSizeControl }) {
  const status = subtitle.checking ? 'Henter…' : subtitle.error || !subtitle.ready ? 'Tjek' :
    subtitle.status === 'ai' ? 'AI' : subtitle.status === 'excerpt' ? 'Uddrag' : subtitle.status === 'manual' ? 'Redigeret' : null;
  return <details className={styles.copySection} data-copy-control="subtitle">
    <summary className={styles.copySummary}><span>Undertekst</span>
      {status && <span className={styles.copyStatus} role="status">{status}</span>}<CopyChevron />
    </summary>
    <div className={styles.copyBody}>
      <CopyTextarea label="Undertekst på billedet" value={subtitle.text} onChange={subtitle.edit} />
      <div className={styles.copyActions}>
        <div className={styles.copyPrimaryActions}>
        <button type="button" onClick={subtitle.reset} className={styles.textButton} aria-label="Tilpas automatisk">Tilpas</button>
        <button type="button" onClick={subtitle.nextVariant} disabled={!subtitle.canGetMore} className={styles.textButton} aria-label="Nye forslag med AI">
          {subtitle.checking ? 'Henter…' : 'Nye forslag'}
        </button>
        <button type="button" onClick={() => { subtitle.restore(); sizing?.reset(); }} className={styles.textButton} aria-label="Gendan original">Original</button>
        </div>
        <div className={styles.copySizeActions}>{sizing && <CopyTextSize control={sizing} label="underteksten" />}<CopyHelp /></div>
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
