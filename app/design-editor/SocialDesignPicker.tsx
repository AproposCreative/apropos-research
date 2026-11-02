'use client';

import type { SocialCardDesign } from '@/lib/social/card-layout';
import styles from './SocialEditor.module.css';

export default function SocialDesignPicker({ design, onChange, disabled }: {
  design: SocialCardDesign; onChange: (design: SocialCardDesign) => void; disabled?: boolean;
}) {
  return <fieldset className={styles.designPicker} disabled={disabled}>
    <legend>Design</legend>
    <div className={styles.designOptions}>
      <button type="button" aria-pressed={design === 'classic'} onClick={() => onChange('classic')}>
        <span className={styles.classicSwatch} aria-hidden="true"><i /><b /><em /></span>
        <span>Klassisk</span>
      </button>
      <button type="button" aria-pressed={design === 'photo'} onClick={() => onChange('photo')}>
        <span className={styles.photoSwatch} aria-hidden="true"><i /><b /><em /></span>
        <span>Foto</span>
      </button>
    </div>
  </fieldset>;
}
