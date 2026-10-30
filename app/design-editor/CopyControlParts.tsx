'use client';

import { useLayoutEffect, useRef } from 'react';
import styles from './SocialEditor.module.css';

export function CopyTextarea({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const input = ref.current;
    if (!input) return;
    const resize = () => {
      if (!input.clientWidth) return;
      input.style.height = 'auto';
      input.style.height = `${input.scrollHeight}px`;
    };
    resize();
    let width = input.clientWidth;
    const observer = new ResizeObserver(() => {
      if (input.clientWidth === width) return;
      width = input.clientWidth;
      resize();
    });
    observer.observe(input);
    return () => observer.disconnect();
  }, [value]);
  return <label><span className="sr-only">{label}</span><textarea ref={ref} aria-label={label} value={value}
    onChange={event => onChange(event.target.value)} rows={1} className={styles.copyInput} /></label>;
}

export function CopyChevron() {
  return <svg className={styles.chevron} aria-hidden="true" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="m6 4 4 4-4 4" /></svg>;
}

export function CopyHelp() {
  return <details className={styles.help}>
    <summary aria-label="Om AI-forslag" title="Om AI-forslag"><svg aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"><circle cx="12" cy="12" r="9" /><path d="M12 11v6m0-10v1" /></svg></summary>
    <p className={styles.helpText}>Kun billedets tekst ændres. Nye AI-forslag bruger det fælles engangsloft på 10 kr.</p>
  </details>;
}

export function CopySuggestions({ options, selected, onChoose, label }: {
  options: string[]; selected: string; onChoose: (text: string) => void; label: string;
}) {
  if (!options.length) return null;
  return <details className={styles.suggestions}>
    <summary>Forslag <span>{options.length}</span><CopyChevron /></summary>
    <div className={styles.suggestionList} role="group" aria-label={label}>
      {options.map((option, index) => <button key={`${index}-${option}`} type="button" className={styles.suggestion}
        onClick={() => onChoose(option)} aria-pressed={selected === option}>
        <span>{option}</span>{selected === option && <svg aria-hidden="true" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m4 10 4 4 8-8" /></svg>}
      </button>)}
    </div>
  </details>;
}
