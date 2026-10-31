'use client';

import type { useCardTitle } from './useCardTitle';
import { CopyChevron, CopyHelp, CopySuggestions, CopyTextarea, CopyTextSize } from './CopyControlParts';
import styles from './SocialEditor.module.css';
import type { TextSizeControl, TextSpacingControl } from './useCardTextSize';
import { DEFAULT_TITLE_SUBTITLE_GAP, MAX_TITLE_SUBTITLE_GAP } from '@/lib/social/card-layout';

export default function TitleControls({ title, sizing, spacing }: { title: ReturnType<typeof useCardTitle>; sizing?: TextSizeControl; spacing?: TextSpacingControl }) {
  return <details className={styles.copySection} data-copy-control="title">
    <summary className={styles.copySummary}><span>Overskrift</span>
      {title.loading && <span className={styles.copyStatus} role="status">Henter…</span>}<CopyChevron />
    </summary>
    <div className={styles.copyBody}>
      <CopyTextarea label="Overskrift på billedet" value={title.text} onChange={title.edit} />
      <div className={styles.copyActions}>
        <div className={styles.copyPrimaryActions}>
        <button type="button" onClick={title.requestMore} disabled={!title.canGetMore} className={styles.textButton} aria-label={title.options.length ? 'Nye overskrifter med AI' : 'Forkort med AI'}>
          {title.loading ? 'Henter…' : title.options.length ? 'Nye forslag' : 'Forkort'}
        </button>
        <button type="button" onClick={() => { title.restore(); sizing?.reset(); }} className={styles.textButton} aria-label="Gendan original">Original</button>
        </div>
        <div className={styles.copySizeActions}>{sizing && <CopyTextSize control={sizing} label="overskriften" />}<CopyHelp /></div>
      </div>
      {spacing && <div className={styles.copySpacingActions} role="group" aria-label="Afstand mellem overskrift og undertekst">
        <span>Afstand</span>
        <button type="button" className={styles.textButton} onClick={spacing.decrease} disabled={spacing.gap <= 0} aria-label="Mindre afstand til underteksten">Tættere</button>
        <button type="button" className={styles.textButton} onClick={spacing.increase} disabled={spacing.gap >= MAX_TITLE_SUBTITLE_GAP} aria-label="Større afstand til underteksten">Mere luft</button>
        {spacing.gap !== DEFAULT_TITLE_SUBTITLE_GAP && <button type="button" className={styles.textButton} onClick={spacing.reset} aria-label="Gendan normal afstand">Auto</button>}
      </div>}
      <CopySuggestions options={title.options} selected={title.text} onChoose={title.choose} label="Forslag til overskrift" />
      {title.maxVariantsReached && <p className={styles.copyNote}>Alle forslag er hentet.</p>}
      {title.error && <p role="alert" className={styles.copyError}>{title.error}</p>}
    </div>
  </details>;
}
