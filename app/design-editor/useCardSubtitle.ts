'use client';

import { useState, useEffect } from 'react';
import { fitCardText } from './fitCardText';
import { firstSubtitleSentence } from './subtitleCopy';
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
export function useCardSubtitle(id: string, title: string, original: string, size: SocialCardSize, family: string) {
  const key = JSON.stringify([id, title, original, size]);
  const [entries, setEntries] = useState<Record<string, { text: string; status: 'manual' | 'excerpt' | 'original' }>>({});
  const entry = entries[key];
  const text = entry?.text ?? original;
  const [checked, setChecked] = useState({ key: '', text: '', family: '', readable: false, suggestion: null as string | null });
  useEffect(() => {
    let cancelled = false;
    document.fonts.load(`italic 48px ${family}`).then(() => {
      if (cancelled) return;
      const readable = !text.trim() || subtitleIsReadable(text, size, family);
      const first = !readable ? firstSubtitleSentence(text) : null;
      const suggestion = first && subtitleIsReadable(first, size, family) ? first : null;
      setChecked({ key, text, family, readable, suggestion });
    }).catch(() => { if (!cancelled) setChecked({ key, text, family, readable: false, suggestion: null }); });
    return () => { cancelled = true; };
  }, [key, text, size, family]);
  const edit = (value: string, status: 'manual' | 'excerpt' | 'original' = 'manual') => {
    setEntries(prev => ({ ...prev, [key]: { text: value, status } }));
  };
  const current = checked.key === key && checked.text === text && checked.family === family;
  return {
    key, text, status: entry?.status, edit, restore: () => edit(original, 'original'),
    ready: current && checked.readable,
    checking: !current,
    suggestion: current ? checked.suggestion : null,
  };
}
