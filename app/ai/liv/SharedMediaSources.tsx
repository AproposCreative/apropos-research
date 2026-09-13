'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

type Source = { id: string; name: string; baseUrl: string; sitemapIndex: string; enabled: boolean; revision: number;
  check?: { checkedAt?: string; urlCount?: number; partial?: boolean } };

export default function SharedMediaSources() {
  const { user } = useAuth();
  const [sources, setSources] = useState<Source[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  useEffect(() => {
    const controller = new AbortController();
    setLoaded(false); setError('');
    void (async () => {
      try {
        if (!user) return;
        const token = await user.getIdToken();
        const response = await fetch('/api/liv/media-sources', { cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Kilder kunne ikke hentes.');
        if (!controller.signal.aborted) { setSources(data.sources); setLoaded(true); }
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Kilder kunne ikke hentes.'); }
    })();
    return () => controller.abort();
  }, [user, attempt]);
  async function save(source: Omit<Source, 'id' | 'check'>, refresh = false) {
    if (!user || busy) return;
    setBusy(true); setError('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/liv/media-sources', { method: 'PUT',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...source, refresh }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Kilden kunne ikke gemmes.');
      setName(''); setUrl(''); setAttempt(n => n + 1);
    } catch (e) { setError(e instanceof Error ? e.message : 'Kilden kunne ikke gemmes.'); }
    finally { setBusy(false); }
  }
  return <details className="rounded-xl border border-white/15 p-4 text-sm text-white/70">
    <summary className="min-h-11 cursor-pointer">Fælles mediekilder til Liv</summary>
    <p className="my-3">Kun Frederik ændrer disse kilder. Personlige kilder bliver ikke delt. Kontrol bruger ikke AI og genbruges i 24 timer.</p>
    {error && <p role="alert">{error}</p>}
    <button className="min-h-11 underline" disabled={busy} onClick={() => setAttempt(n => n + 1)}>Hent listen igen</button>
    {!loaded && !error && <p role="status">Henter kilder…</p>}
    {loaded && sources.length === 0 && <p>Ingen fælles kilder er valgt.</p>}
    <ul className="space-y-3">{sources.map(({ id, check, ...source }) => <li key={id} className="rounded-lg border border-white/15 p-3">
      <p>{source.name} · {source.enabled ? 'Aktiv' : 'Slået fra'}</p>
      <p className="break-all text-xs">{source.sitemapIndex}</p>
      <p className="text-xs">{check?.checkedAt ? `Kontrolleret ${new Date(check.checkedAt).toLocaleString('da-DK')}. ${check.urlCount ?? 0} fundne links, ikke verificerede artikler.${check.partial ? ' Delvis kontrol.' : ''}` : 'Ingen gemt kontrol.'}</p>
      <div className="flex flex-wrap gap-x-5">
        <button className="min-h-11 underline" disabled={busy} onClick={() => void save({ ...source, enabled: !source.enabled })}>{source.enabled ? 'Slå fra' : 'Slå til'}</button>
        <button className="min-h-11 underline" disabled={busy} onClick={() => void save(source, true)}>Kontrollér igen</button>
      </div>
    </li>)}</ul>
    <form className="mt-4 space-y-3" onSubmit={event => {
      event.preventDefault();
      try { void save({ name, baseUrl: new URL(url).origin, sitemapIndex: url, enabled: true, revision: 0 }); }
      catch { setError('Indtast en gyldig HTTPS-adresse.'); }
    }}>
      <label className="block">Navn<input required maxLength={120} value={name} onChange={e => setName(e.target.value)} className="mt-1 block min-h-11 w-full rounded border border-white/20 bg-transparent px-3" /></label>
      <label className="block">RSS- eller sitemap-adresse<input required type="url" maxLength={2048} value={url} onChange={e => setUrl(e.target.value)} className="mt-1 block min-h-11 w-full rounded border border-white/20 bg-transparent px-3" /></label>
      <button disabled={busy || !loaded} className="min-h-11 rounded border border-white/30 px-4">{busy ? 'Kontrollerer og gemmer…' : 'Tilføj fælles kilde'}</button>
    </form>
  </details>;
}
