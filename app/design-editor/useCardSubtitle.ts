'use client';

import { useState, useEffect } from 'react';
import { fitCardText } from './fitCardText';
import { fitSubtitleAutomatically, type SubtitleFit } from './subtitleCopy';
import type { SocialCardSize } from './SocialCardCanvas';

export function subtitleIsReadable(text: string, size: SocialCardSize, family: string) {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  const story = size === 'story';
  try {
    return fitCardText(ctx, text, story ? 1000 : 880, story ? 3 : 2, story ? 60 : 48, n => `italic ${n}px ${family}`).fontSize >= (story ? 48 : 38);
  } catch { return false; }
}

/** Card-local copy only. Opening, editing and fitting never request model generation. */
export function useCardSubtitle(id: string, title: string, original: string, size: SocialCardSize, family: string, prepared?: string) {
  const key = JSON.stringify([id, title, original, size, prepared ?? null]);
  const [entries, setEntries] = useState<Record<string, { text: string; status: 'manual' | 'original' }>>({});
  const entry = entries[key];
  const input = entry?.text ?? original;
  const automatic = !entry;
  const [checked, setChecked] = useState<{ key: string; input: string; family: string; automatic: boolean; fit: SubtitleFit } | null>(null);
  useEffect(() => {
    let cancelled = false;
    document.fonts.load(`italic 48px ${family}`).then(() => {
      if (cancelled) return;
      const fits = (value: string) => !value.trim() || subtitleIsReadable(value, size, family);
      const fit = automatic ? fitSubtitleAutomatically(original, prepared, fits) :
        { text: input, readable: fits(input), source: 'original' as const, truncated: false };
      setChecked({ key, input, family, automatic, fit });
    }).catch(() => { if (!cancelled) setChecked({ key, input, family, automatic,
      fit: { text: input, readable: false, source: 'original', truncated: false } }); });
    return () => { cancelled = true; };
  }, [key, input, size, family, automatic, original, prepared]);
  const edit = (value: string, status: 'manual' | 'original' = 'manual') => {
    setEntries(prev => ({ ...prev, [key]: { text: value, status } }));
  };
  const current = checked?.key === key && checked.input === input && checked.family === family && checked.automatic === automatic;
  return {
    key, text: current ? checked.fit.text : input,
    status: entry?.status ?? (current ? checked.fit.source : undefined),
    truncated: current && checked.fit.truncated, edit, restore: () => edit(original, 'original'),
    reset: () => setEntries(prev => { const next = { ...prev }; delete next[key]; return next; }),
    ready: current && checked.fit.readable,
    checking: !current,
  };
}
