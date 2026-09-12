'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import LivContentColumn from './LivContentColumn';

interface Publication {
  id: string;
  status: string;
  title?: string | null;
  topic?: string | null;
  slug?: string | null;
  finishedAt?: string | null;
}

function publicationDate(value?: string | null) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Dato ikke registreret';
  return new Intl.DateTimeFormat('da-DK', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Copenhagen',
  }).format(new Date(value));
}

/** Read-only history: opening this view must never prepare or generate an article. */
export default function LivPublicationHistory() {
  const { user } = useAuth();
  const [entries, setEntries] = useState<Publication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const requestVersion = useRef(0);
  const pending = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    const version = ++requestVersion.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setLoading(true);
    setError('');
    try {
      if (!user) throw new Error('Log ind for at se udgivelserne.');
      const token = await user.getIdToken();
      if (controller.signal.aborted) return;
      const response = await fetch('/api/liv/status?limit=60&includeCms=1', {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
      });
      const data = await readJsonResponse(response);
      if (!response.ok) throw new Error(data.error || 'Udgivelserne kunne ikke hentes.');
      if (!Array.isArray(data.entries) || !data.entries.every((entry: Publication | null) =>
        entry && typeof entry.id === 'string' && typeof entry.status === 'string')) {
        throw new Error('Serveren returnerede ikke en gyldig udgivelsesliste.');
      }
      if (version === requestVersion.current) {
        setEntries(data.entries.filter((entry: Publication) => entry.status === 'published'));
      }
    } catch (e) {
      if (version === requestVersion.current && !controller.signal.aborted) {
        setError(e instanceof Error ? e.message : 'Prøv igen.');
      }
    } finally {
      if (version === requestVersion.current) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    setEntries([]);
    void refresh();
    return () => { requestVersion.current++; pending.current?.abort(); };
  }, [refresh]);

  return <div data-liv-story-scroll style={{ paddingTop: 'var(--liv-tabs-height, 0px)' }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <LivContentColumn className="space-y-5 py-6">
      <header>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-medium">Udgivne artikler</h2>
          <button className="min-h-11 px-2 text-sm text-white/70 underline underline-offset-4 disabled:opacity-40"
            disabled={loading} onClick={() => void refresh()}>Opdater</button>
        </div>
        <p className="mt-2 text-sm leading-relaxed text-white/60">Udgivelser fra Livs seneste historik og CMS. Kladder og fejlede kørsler ligger under Avanceret drift.</p>
      </header>
      {error && <p role="alert" className="rounded-xl border border-amber-200/20 p-4 text-sm text-amber-200">{error}</p>}
      {loading && <p role="status" className="text-sm text-white/60">Henter udgivelser…</p>}
      {!loading && !error && !entries.length && <p className="rounded-xl border border-white/15 p-6 text-sm text-white/60">Ingen udgivne artikler i den seneste historik.</p>}
      <ul className="space-y-3" aria-label="Udgivne artikler">
        {entries.map(entry => <li key={entry.id} className="rounded-xl border border-white/15 p-5">
          <p className="text-xs text-white/50">{publicationDate(entry.finishedAt)}</p>
          <h3 className="mt-2 break-words text-lg leading-snug">{entry.title || entry.topic || 'Artikel uden titel'}</h3>
          {entry.slug && <a className="mt-3 inline-flex min-h-11 items-center text-sm underline underline-offset-4"
            href={`https://aproposmagazine.com/articles/${encodeURIComponent(entry.slug)}`} target="_blank" rel="noreferrer">Læs på Apropos ↗</a>}
        </li>)}
      </ul>
    </LivContentColumn>
  </div>;
}
