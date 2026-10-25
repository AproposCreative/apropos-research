'use client';

import { useState, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { fitCardText } from './fitCardText';
import { fitSubtitleAutomatically, type SubtitleFit } from './subtitleCopy';
import type { SocialCardSize } from './SocialCardCanvas';
const MAX_VARIANTS = 5;

export function subtitleIsReadable(text: string, size: SocialCardSize, family: string) {
  const ctx = document.createElement('canvas').getContext('2d');
  if (!ctx) return false;
  const story = size === 'story';
  try {
    return fitCardText(ctx, text, story ? 1000 : 880, story ? 3 : 2, story ? 60 : 48, n => `italic ${n}px ${family}`).fontSize >= (story ? 48 : 38);
  } catch { return false; }
}

type AiCopy = { state: 'ready'; candidates: string[] } |
  { state: 'failed'; error: string; code?: string; generation?: number };

/** Generate only when the original and any version-bound saved copy do not fit.
 * Per-key local and server caches avoid another paid call on format switching.
 */
export function useCardSubtitle(id: string, title: string, original: string, size: SocialCardSize, family: string, prepared?: string) {
  const key = JSON.stringify([id, title, original, size, prepared ?? null]);
  const sharedKey = JSON.stringify([id, title, original]);
  const [entries, setEntries] = useState<Record<string, { text: string; status: 'manual' | 'original' }>>({});
  const [aiCopy, setAiCopy] = useState<Record<string, AiCopy>>({});
  const [variants, setVariants] = useState<Record<string, { active: number; latest: number; forced: boolean }>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [resuming, setResuming] = useState(false);
  const inFlight = useRef(new Set<string>());
  const requestLocked = useRef(false);
  const [refresh, setRefresh] = useState(0);
  const entry = entries[sharedKey];
  const variant = variants[key]?.active ?? 0;
  const aiKey = JSON.stringify([key, variant]);
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
    (variants[key]?.forced || checked.fit.source === 'excerpt' || !checked.fit.readable));
  useEffect(() => {
    if (!needsAi || aiCopy[aiKey] || inFlight.current.has(aiKey)) return;
    inFlight.current.add(aiKey);
    (async () => {
      try {
        await auth?.authStateReady();
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error('Log ind som redaktør for at bruge AI-forkortelse.');
        let response: Response | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          response = await fetch('/api/design-editor/shorten-subtitle', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ articleId: id, title, subtitle: original, size, variant }), cache: 'no-store',
          });
          if (response.status !== 202) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!response || response.status === 202) throw new Error('AI-forkortelsen tager for lang tid. Prøv at åbne artiklen igen.');
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.candidates)) {
          const failure = new Error(payload.error || 'AI-forkortelsen kunne ikke gennemføres.') as Error &
            { code?: string; generation?: number };
          failure.code = payload.code;
          failure.generation = payload.generation;
          throw failure;
        }
        setAiCopy(prev => ({ ...prev, [aiKey]: { state: 'ready', candidates: payload.candidates } }));
      } catch (error) {
        const failure = error as Error & { code?: string; generation?: number };
        setAiCopy(prev => ({ ...prev, [aiKey]: { state: 'failed', error: error instanceof Error ? error.message : 'AI-forkortelsen kunne ikke gennemføres.',
          code: failure?.code, generation: failure?.generation } }));
      } finally { inFlight.current.delete(aiKey); requestLocked.current = false; }
    })();
  }, [aiKey, needsAi, aiCopy, id, title, original, size, variant]);
  const edit = (value: string, status: 'manual' | 'original' = 'manual') => {
    setEntries(prev => ({ ...prev, [sharedKey]: { text: value, status } }));
  };
  const ai = aiCopy[aiKey];
  const latestCopy = aiCopy[JSON.stringify([key, variants[key]?.latest ?? 0])];
  const failedGeneration = ai?.state === 'failed' ? ai.generation : undefined;
  const canResume = ai?.state === 'failed' && ai.code === 'quota_exhausted' && Number.isSafeInteger(failedGeneration);
  const resume = async () => {
    if (!canResume || resuming) return;
    setResuming(true);
    try {
      await auth?.authStateReady();
      const token = await auth?.currentUser?.getIdToken();
      if (!token) throw new Error('Log ind som ejer for at genoptage AI-forkortelse.');
      const response = await fetch('/api/design-editor/resume-subtitle', {
        method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ expectedGeneration: failedGeneration }), cache: 'no-store',
      });
      const payload = await response.json();
      if (!response.ok || !payload.resumed) throw new Error(payload.error || 'Genoptagelsen mislykkedes.');
      setAiCopy(prev => { const next = { ...prev };
        for (let index = 0; index <= MAX_VARIANTS; index++) delete next[JSON.stringify([key, index])];
        return next; });
      setVariants(prev => ({ ...prev, [key]: { active: 0, latest: 0, forced: true } }));
      setRefresh(value => value + 1);
    } catch (error) {
      setAiCopy(prev => ({ ...prev, [aiKey]: { state: 'failed', error: error instanceof Error ? error.message : 'Genoptagelsen mislykkedes.' } }));
    } finally { setResuming(false); }
  };
  const available = Array.from({ length: (variants[key]?.latest ?? 0) + 1 }, (_, index) => {
    const copy = aiCopy[JSON.stringify([key, index])];
    return copy?.state === 'ready' ? copy.candidates : [];
  }).flat().filter((value, index, all) => all.indexOf(value) === index && subtitleIsReadable(value, size, family));
  const activeOptions = ai?.state === 'ready' ? ai.candidates.filter(value => subtitleIsReadable(value, size, family)) : [];
  const aiCandidate = current && automatic && needsAi ?
    (activeOptions.includes(chosen[key] || '') ? chosen[key] : activeOptions[0]) : undefined;
  const fit = aiCandidate
    ? { text: aiCandidate, source: 'ai' as const, readable: true, truncated: false }
    : current ? checked.fit : null;
  const error = ai?.state === 'failed' ? ai.error : ai?.state === 'ready' && !aiCandidate && needsAi
    ? 'AI-teksten passer ikke på kortet. Et ordret uddrag vises i stedet.' : null;
  const nextVariant = () => {
    if (requestLocked.current || inFlight.current.has(aiKey) || (needsAi && !ai) ||
      (latestCopy?.state === 'failed' && ['quota_exhausted', 'authentication_failed', 'access_denied'].includes(latestCopy.code ?? ''))) return;
    const latest = variants[key]?.latest ?? 0;
    const next = !aiCopy[JSON.stringify([key, 0])] ? 0 : latest + 1;
    if (next > MAX_VARIANTS) return;
    requestLocked.current = true;
    setEntries(prev => { const copy = { ...prev }; delete copy[sharedKey]; return copy; });
    setVariants(prev => ({ ...prev, [key]: { active: next, latest: Math.max(latest, next), forced: true } }));
    setRefresh(value => value + 1);
  };
  const choose = (value: string) => {
    if (!available.includes(value)) return;
    const index = Array.from({ length: (variants[key]?.latest ?? 0) + 1 }, (_, i) => i)
      .find(i => { const copy = aiCopy[JSON.stringify([key, i])]; return copy?.state === 'ready' && copy.candidates.includes(value); });
    if (index === undefined) return;
    setChosen(prev => ({ ...prev, [key]: value }));
    setEntries(prev => ({ ...prev, [sharedKey]: { text: value, status: 'manual' } }));
    setVariants(prev => ({ ...prev, [key]: { active: index, latest: prev[key]?.latest ?? index, forced: true } }));
  };
  return {
    key, text: fit?.text ?? input,
    status: entry?.status ?? fit?.source,
    truncated: fit?.truncated ?? false, error, edit, restore: () => edit(original, 'original'),
    canResume, resuming, resume, options: available, choose, nextVariant,
    canGetMore: !requestLocked.current && !inFlight.current.has(aiKey) &&
      (!latestCopy || latestCopy.state === 'ready' || (latestCopy.state === 'failed' &&
        !['quota_exhausted', 'authentication_failed', 'access_denied'].includes(latestCopy.code ?? ''))) &&
      (!needsAi || !!ai) && (variants[key]?.latest ?? 0) < MAX_VARIANTS,
    maxVariantsReached: (variants[key]?.latest ?? 0) >= MAX_VARIANTS,
    reset: () => { setEntries(prev => { const next = { ...prev }; delete next[sharedKey]; return next; });
      setVariants(prev => ({ ...prev, [key]: { active: 0, latest: prev[key]?.latest ?? 0, forced: false } }));
      setRefresh(value => value + 1); },
    ready: !!(fit?.readable && (!needsAi || !!ai)),
    checking: !current || (needsAi && !ai),
  };
}
