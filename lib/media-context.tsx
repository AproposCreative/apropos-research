'use client';
import { createContext, useContext, useState, useEffect, useCallback, useRef, ReactNode } from 'react';
import { useAuth } from './auth-context';
import { mediaSelection, type PersonalMediaSource } from './media-selection';
import { MEDIA_SOURCES_CHANGED } from './media-source-events';

interface MediaContextType {
  mediaSources: PersonalMediaSource[];
  articleCounts: Record<string, number>;
  error: string;
  getEnabledMedias: () => string[];
  getDisabledMedias: () => string[];
  refreshMediaSources: () => void;
  refreshArticleCounts: () => void;
}
const MediaContext = createContext<MediaContextType | undefined>(undefined);
const empty = { uid: '', sources: [] as PersonalMediaSource[], counts: {} as Record<string, number>, error: '' };

export function MediaProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid || '';
  const [state, setState] = useState(empty);
  const lifetime = useRef(0);
  const requests = useRef({ sources: 0, counts: 0 });
  const read = useCallback(async (kind: 'sources' | 'counts') => {
    if (!user) return;
    const epoch = lifetime.current;
    const sequence = ++requests.current[kind];
    const current = () => lifetime.current === epoch && sequence === requests.current[kind];
    try {
      const token = await user.getIdToken();
      if (!current()) return;
      const response = await fetch(kind === 'sources' ? '/api/media-sources' : '/api/article-counts', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      if (!response.ok) throw new Error('read_failed');
      const body = await response.json();
      const data = body.data ?? body;
      const patch = kind === 'sources' ? { sources: mediaSelection(data.sources), error: '' } : { counts: parseCounts(data.counts) };
      if (current()) setState(previous => ({ ...(previous.uid === user.uid ? previous : empty), uid: user.uid, ...patch }));
    } catch {
      if (current()) setState(previous => ({ ...(previous.uid === user.uid ? previous : empty), uid: user.uid,
        ...(kind === 'sources' ? { sources: [], error: 'Dine mediekilder kunne ikke hentes. Prøv igen.' } : { counts: {} }) }));
    }
  }, [user]);
  useEffect(() => {
    ++lifetime.current;
    if (user) { void read('sources'); void read('counts'); }
    return () => { ++lifetime.current; };
  }, [read, user]);
  useEffect(() => {
    const changed = (event: Event) => {
      if (uid && (event as CustomEvent).detail?.uid === uid) void read('sources');
    };
    window.addEventListener(MEDIA_SOURCES_CHANGED, changed);
    return () => window.removeEventListener(MEDIA_SOURCES_CHANGED, changed);
  }, [read, uid]);
  // The API is authoritative. Leave the old, account-ambiguous mediaStates key
  // untouched, but never read/write it. Gate before effect cleanup on UID changes.
  const visible = uid && state.uid === uid ? state : empty;
  return <MediaContext.Provider value={{
    mediaSources: visible.sources, articleCounts: visible.counts, error: visible.error,
    getEnabledMedias: () => visible.sources.filter(s => s.enabled).map(s => s.id),
    getDisabledMedias: () => visible.sources.filter(s => !s.enabled).map(s => s.id),
    refreshMediaSources: () => { void read('sources'); },
    refreshArticleCounts: () => { void read('counts'); },
  }}>{children}</MediaContext.Provider>;
}
function parseCounts(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('invalid_counts');
  return Object.fromEntries(Object.entries(value).filter(([key, count]) =>
    key !== 'total' && typeof count === 'number' && Number.isSafeInteger(count) && count >= 0));
}
export function useMedia() {
  const context = useContext(MediaContext);
  if (!context) throw new Error('useMedia must be used within a MediaProvider');
  return context;
}
