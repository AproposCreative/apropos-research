'use client';

import styles from './tool-tabs.module.css';

/** Native selector on narrow tool panels, segmented buttons when space allows. */
export default function ToolTabs<T extends string>({ value, options, onChange, label = 'Visning' }: {
  value: T; options: readonly { id: NoInfer<T>; label: string }[]; onChange: (value: NoInfer<T>) => void; label?: string;
}) {
  return <div className={styles.tabs}>
    <div className={styles.buttons} role="group" aria-label={label}>
      {options.map(option => <button key={option.id} type="button" aria-pressed={value === option.id} onClick={() => onChange(option.id)}>{option.label}</button>)}
    </div>
    <select className={styles.select} value={value} aria-label={label} onChange={e => {
      const selected = options.find(option => option.id === e.target.value);
      if (selected) onChange(selected.id);
    }}>{options.map(option => <option key={option.id} value={option.id}>{option.label}</option>)}</select>
  </div>;
}
