'use client';

import { useState, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
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

type AiCopy = { state: 'ready'; candidates: string[] } | { state: 'failed'; error: string };

/** Generate only when the original and any version-bound saved copy do not fit.
 * Per-key local and server caches avoid another paid call on format switching.
 */
export function useCardSubtitle(id: string, title: string, original: string, size: SocialCardSize, family: string, prepared?: string) {
  const key = JSON.stringify([id, title, original, size, prepared ?? null]);
  const [entries, setEntries] = useState<Record<string, { text: string; status: 'manual' | 'original' }>>({});
  const [aiCopy, setAiCopy] = useState<Record<string, AiCopy>>({});
  const inFlight = useRef(new Set<string>());
  const [refresh, setRefresh] = useState(0);
  const entry = entries[key];
  const input = entry?.text ?? original;
  const automatic = !entry;
  const [checked, setChecked] = useState<{ key: string; input: string; family: string; automatic: boolean; refresh: number; fit: SubtitleFit } | null>(null);
  useEffect(() => {
    let cancelled = false;
    document.fonts.load(`italic 48px ${family}`).then(() => {
      if (cancelled) return;
      const fits = (value: string) => !value.trim() || subtitleIsReadable(value, size, family);
      const fit = automatic ? fitSubtitleAutomatically(original, prepared, fits) :
        { text: input, readable: fits(input), source: 'original' as const, truncated: false };
      setChecked({ key, input, family, automatic, refresh, fit });
    }).catch(() => { if (!cancelled) setChecked({ key, input, family, automatic, refresh,
      fit: { text: input, readable: false, source: 'original', truncated: false } }); });
    return () => { cancelled = true; };
  }, [key, input, size, family, automatic, original, prepared, refresh]);
  const current = checked?.key === key && checked.input === input && checked.family === family && checked.automatic === automatic && checked.refresh === refresh;
  const needsAi = !!(current && automatic && id && original.trim() &&
    (checked.fit.source === 'excerpt' || !checked.fit.readable));
  useEffect(() => {
    if (!needsAi || aiCopy[key] || inFlight.current.has(key)) return;
    inFlight.current.add(key);
    (async () => {
      try {
        await auth?.authStateReady();
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error('Log ind som redaktør for at bruge AI-forkortelse.');
        let response: Response | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          response = await fetch('/api/design-editor/shorten-subtitle', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ articleId: id, title, subtitle: original, size }), cache: 'no-store',
          });
          if (response.status !== 202) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!response || response.status === 202) throw new Error('AI-forkortelsen tager for lang tid. Prøv at åbne artiklen igen.');
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.candidates)) throw new Error(payload.error || 'AI-forkortelsen kunne ikke gennemføres.');
        setAiCopy(prev => ({ ...prev, [key]: { state: 'ready', candidates: payload.candidates } }));
      } catch (error) {
        setAiCopy(prev => ({ ...prev, [key]: { state: 'failed', error: error instanceof Error ? error.message : 'AI-forkortelsen kunne ikke gennemføres.' } }));
      } finally { inFlight.current.delete(key); }
    })();
  }, [key, needsAi, aiCopy, id, title, original, size]);
  const edit = (value: string, status: 'manual' | 'original' = 'manual') => {
    setEntries(prev => ({ ...prev, [key]: { text: value, status } }));
  };
  const ai = aiCopy[key];
  const aiCandidate = current && automatic && needsAi && ai?.state === 'ready'
    ? ai.candidates.find(value => subtitleIsReadable(value, size, family)) : undefined;
  const fit = aiCandidate
    ? { text: aiCandidate, source: 'ai' as const, readable: true, truncated: false }
    : current ? checked.fit : null;
  const error = ai?.state === 'failed' ? ai.error : ai?.state === 'ready' && !aiCandidate && needsAi
    ? 'AI-teksten passer ikke på kortet. Et ordret uddrag vises i stedet.' : null;
  return {
    key, text: fit?.text ?? input,
    status: entry?.status ?? fit?.source,
    truncated: fit?.truncated ?? false, error, edit, restore: () => edit(original, 'original'),
    reset: () => { setEntries(prev => { const next = { ...prev }; delete next[key]; return next; }); setRefresh(value => value + 1); },
    ready: !!(fit?.readable && (!needsAi || !!ai)),
    checking: !current || (needsAi && !ai),
  };
}
