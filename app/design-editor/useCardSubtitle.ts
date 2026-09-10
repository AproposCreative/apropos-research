'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { fitCardText } from './fitCardText';
import type { SocialCardSize } from './SocialCardCanvas';

export function subtitleIsReadable(text: string, size: SocialCardSize, family: string) {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  const story = size === 'story';
  return fitCardText(ctx, text, story ? 1000 : 880, story ? 3 : 2, story ? 60 : 48, n => `italic ${n}px ${family}`).fontSize >= (story ? 48 : 38);
}

export function useCardSubtitle(id: string, title: string, original: string, size: SocialCardSize, family: string) {
  const key = JSON.stringify([id, title, original, size]);
  const [entries, setEntries] = useState<Record<string, { text: string; status: string; error?: string }>>({});
  const entry = entries[key];
  const text = entry?.text ?? original;
  const [checked, setChecked] = useState({ key: '', text: '', readable: false });
  const generation = useRef(0);
  const activeKey = useRef(key);
  const controller = useRef<AbortController | null>(null);
  useEffect(() => {
    activeKey.current = key;
    generation.current++;
    controller.current?.abort();
    return () => { generation.current++; controller.current?.abort(); };
  }, [key]);
  const shorten = useCallback(async () => {
    controller.current?.abort();
    const request = ++generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setEntries(prev => ({ ...prev, [key]: { text, status: 'loading' } }));
    try {
      const response = await fetch('/api/design-editor/shorten-subtitle', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, subtitle: text, size }), signal: abort.signal });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || 'Kunne ikke forkorte underteksten.');
      await document.fonts.load(`italic 48px ${family}`);
      const candidate = result.candidates?.find((value: unknown) => typeof value === 'string' && subtitleIsReadable(value, size, family));
      if (!candidate) throw new Error('Forslaget er stadig for langt. Forkort teksten manuelt eller prøv igen.');
      if (request === generation.current && activeKey.current === key) setEntries(prev => ({ ...prev, [key]: { text: candidate, status: 'ai' } }));
    } catch (error) {
      if (request === generation.current && !abort.signal.aborted) setEntries(prev => ({ ...prev, [key]: { text, status: 'error', error: error instanceof Error ? error.message : 'AI kunne ikke forkorte teksten.' } }));
    }
  }, [key, text, title, size, family]);
  useEffect(() => {
    let cancelled = false;
    document.fonts.load(`italic 48px ${family}`).then(() => {
      if (cancelled) return;
      const readable = !text.trim() || subtitleIsReadable(text, size, family);
      setChecked({ key, text, readable });
      if (id && !readable && !entry) void shorten();
    }).catch(() => { if (!cancelled) setChecked({ key, text, readable: false }); });
    return () => { cancelled = true; };
  }, [key, text, size, family, id, entry, shorten]);
  const edit = (value: string, status = 'manual') => {
    generation.current++;
    controller.current?.abort();
    setEntries(prev => ({ ...prev, [key]: { text: value, status } }));
  };
  // An interrupted article request is retried when that article is selected again.
  useEffect(() => {
    setEntries(prev => prev[key]?.status === 'loading' ? { ...prev, [key]: { ...prev[key], status: 'error', error: 'Forkortelsen blev afbrudt. Prøv igen.' } } : prev);
  }, [key]);
  return { text, status: entry?.status, error: entry?.error, shorten, edit, restore: () => edit(original, 'original'), ready: checked.key === key && checked.text === text && checked.readable && entry?.status !== 'loading' };
}
