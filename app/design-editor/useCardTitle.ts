'use client';

import { useEffect, useRef, useState } from 'react';
import { auth } from '@/lib/firebase';
import type { SocialCardSize } from './SocialCardCanvas';

const MAX_VARIANT = 5;
type TitleResult = { state: 'ready'; candidates: string[] } | { state: 'failed'; error: string; code?: string };

/** Card-only title. The CMS title and post caption remain untouched. AI runs
 * only after a click, using the same version-bound, one-time SoMe budget. */
export function useCardTitle(id: string, original: string, subtitle: string, size: SocialCardSize) {
  const key = JSON.stringify([id, original, subtitle, size]);
  const sharedKey = JSON.stringify([id, original, subtitle]);
  const [manual, setManual] = useState<Record<string, string>>({});
  const [chosen, setChosen] = useState<Record<string, string>>({});
  const [latest, setLatest] = useState<Record<string, number>>({});
  const [results, setResults] = useState<Record<string, TitleResult>>({});
  const inFlight = useRef(new Set<string>());
  const requestLocked = useRef(false);
  const variant = latest[key] ?? -1;
  const resultKey = JSON.stringify([key, variant]);
  const result = results[resultKey];

  useEffect(() => {
    if (variant < 0 || !id || !original.trim() || results[resultKey] || inFlight.current.has(resultKey)) return;
    inFlight.current.add(resultKey);
    const manualAtRequest = manual[sharedKey];
    (async () => {
      try {
        await auth?.authStateReady();
        const token = await auth?.currentUser?.getIdToken();
        if (!token) throw new Error('Log ind som redaktør for at bruge AI-forslag.');
        let response: Response | null = null;
        for (let attempt = 0; attempt < 30; attempt++) {
          response = await fetch('/api/design-editor/shorten-subtitle', {
            method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ articleId: id, title: original, subtitle, size, field: 'title', variant }), cache: 'no-store',
          });
          if (response.status !== 202) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (!response || response.status === 202) throw new Error('AI-forslaget tager for lang tid. Åbn artiklen igen senere.');
        const payload = await response.json();
        if (!response.ok || !Array.isArray(payload.candidates)) {
          const failure = new Error(payload.error || 'AI-forslaget kunne ikke hentes.') as Error & { code?: string };
          failure.code = payload.code;
          throw failure;
        }
        setResults(prev => ({ ...prev, [resultKey]: { state: 'ready', candidates: payload.candidates } }));
        if (payload.candidates.length) setChosen(prev => ({ ...prev, [sharedKey]: payload.candidates[0] }));
        setManual(prev => { if (prev[sharedKey] !== manualAtRequest) return prev;
          const next = { ...prev }; delete next[sharedKey]; return next; });
      } catch (error) {
        const failure = error as Error & { code?: string };
        setResults(prev => ({ ...prev, [resultKey]: { state: 'failed',
          error: error instanceof Error ? error.message : 'AI-forslaget kunne ikke hentes.', code: failure.code } }));
      } finally { inFlight.current.delete(resultKey); requestLocked.current = false; }
    })();
  }, [key, sharedKey, id, original, subtitle, size, variant, resultKey, results, manual]);

  const options = Array.from({ length: variant + 1 }, (_, index) => {
    const saved = results[JSON.stringify([key, index])];
    return saved?.state === 'ready' ? saved.candidates : [];
  }).flat().filter((value, index, all) => all.indexOf(value) === index);
  const terminal = result?.state === 'failed' && ['quota_exhausted', 'authentication_failed', 'access_denied'].includes(result.code ?? '');
  const requestMore = () => {
    if (requestLocked.current || inFlight.current.has(resultKey) || (variant >= 0 && !result) || terminal || variant >= MAX_VARIANT) return;
    requestLocked.current = true;
    setLatest(prev => ({ ...prev, [key]: (prev[key] ?? -1) + 1 }));
  };
  return {
    key, text: manual[sharedKey] ?? chosen[sharedKey] ?? original,
    edit: (text: string) => setManual(prev => ({ ...prev, [sharedKey]: text })),
    restore: () => { setManual(prev => { const next = { ...prev }; delete next[sharedKey]; return next; });
      setChosen(prev => { const next = { ...prev }; delete next[sharedKey]; return next; }); },
    options, choose: (text: string) => { if (!options.includes(text)) return;
      setChosen(prev => ({ ...prev, [sharedKey]: text }));
      setManual(prev => { const next = { ...prev }; delete next[sharedKey]; return next; }); },
    requestMore, canGetMore: !requestLocked.current && (variant < 0 || !!result) && !terminal && variant < MAX_VARIANT,
    loading: variant >= 0 && !result, error: result?.state === 'failed' ? result.error : null,
    maxVariantsReached: variant >= MAX_VARIANT,
  };
}
