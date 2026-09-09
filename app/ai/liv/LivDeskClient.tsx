'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { DeskStory } from '@/lib/editorial/desk-types';
import LivPostingClient from './LivPostingClient';
import type { AudienceSnapshot } from '@/lib/editorial/audience-research';
import { readJsonResponse } from '@/lib/api/read-json-response';
import LivImageSelection from './LivImageSelection';

const tabs = ['Overblik', 'Historier', 'Kilder og dækning', 'Udgivelser', 'Indstillinger'] as const;
const labels: Record<DeskStory['status'], string> = { discovered: 'Idé', researching: 'Research i gang', researched: 'Research klar', drafting: 'Liv skriver', draft: 'Udkast klar', failed: 'Kræver handling' };

export default function LivDeskClient({ onClose, onOpenWriter }: { onClose: () => void; onOpenWriter: (story: DeskStory) => void }) {
  const { user } = useAuth();
  const [tab, setTab] = useState<typeof tabs[number]>('Overblik');
  const [stories, setStories] = useState<DeskStory[]>([]);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [audience, setAudience] = useState<AudienceSnapshot | null>(null);
  const request = useCallback(async (body?: object) => {
    if (!user) throw new Error('Log ind for at åbne redaktionen.');
    const token = await user.getIdToken();
    const response = await fetch('/api/editorial/desk', { method: body ? 'POST' : 'GET', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || 'Redaktionen kunne ikke hentes.');
    return data;
  }, [user]);
  const refresh = useCallback(async () => {
    try { const data = await request(); if (!Array.isArray(data.stories)) throw new Error('Serveren returnerede ikke en gyldig historiekø.'); setStories(data.stories); setAudience(data.audience || null); setLoaded(true); setError(''); }
    catch (e) { setLoaded(false); setError(e instanceof Error ? e.message : 'Der opstod en fejl.'); }
  }, [request]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function act(action: string, id?: string, extra?: object) {
    setBusy(true); setError('');
    try { await request({ action, id, ...extra }); await refresh(); }
    catch (e) { await refresh(); setError(e instanceof Error ? e.message : 'Der opstod en fejl.'); }
    finally { setBusy(false); }
  }
  const current = stories.find(s => s.id === selected);
  const button = 'rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 disabled:opacity-40';
  return <section className="flex h-full flex-col text-white font-poppins">
    <header className="flex items-center justify-between border-b border-white/10 p-5"><div><h1 className="text-lg">Liv · Redaktion</h1><p className="text-xs text-white/50">Research, egne vinkler og artikeludkast</p></div><button className={button} onClick={onClose} aria-label="Luk Liv Redaktion">✕</button></header>
    <nav aria-label="Redaktionens faner" className="flex gap-2 overflow-x-auto p-3 border-b border-white/10">{tabs.map(t => <button key={t} onClick={() => setTab(t)} aria-current={tab === t ? 'page' : undefined} className={`${button} shrink-0 ${tab === t ? 'bg-white/15' : ''}`}>{t}</button>)}</nav>
    {error && <p role="alert" className="p-4 text-sm text-amber-200">{error}</p>}
    {tab === 'Indstillinger' || tab === 'Udgivelser' ? <div className="min-h-0 flex-1"><LivPostingClient key={tab} embedded initialTab={tab === 'Udgivelser' ? 'history' : 'topic'} /></div> : <div className="flex-1 overflow-y-auto p-5 space-y-5">
      {tab === 'Overblik' && <><div className="rounded-xl border border-white/15 p-4"><h2>Dit redaktionelle overblik</h2><p className="text-sm text-white/60 mt-2">{loaded ? `${stories.length} historier · ${stories.filter(s => s.status === 'draft').length} udkast · ${stories.filter(s => s.status === 'failed').length} kræver handling` : 'Historik er ikke indlæst. Antal historier og udkast er ukendt.'}</p><p className="text-xs text-white/50 mt-3">Denne kø gemmer research og udkast. Åbn et udkast i Writer for redigering, billeder og kvalitetstjek. Daglig cron og CMS-historik findes under Indstillinger og Udgivelser.</p></div><button className={button} disabled={busy || !user} onClick={() => void act('discover')}>{busy ? 'Arbejder…' : 'Find kulturhistorier'}</button></>}
      {tab === 'Kilder og dækning' && <><h2>Kilder i dine historier</h2><p className="text-sm text-white/50">Antal registrerede idéer pr. kulturfelt. Dette er ikke en opgørelse over publicerede artikler.</p>{Object.entries(stories.reduce<Record<string, number>>((acc, s) => { acc[s.signal.beat] = (acc[s.signal.beat] || 0) + 1; return acc; }, {})).map(([beat, count]) => <p key={beat} className="flex justify-between border-b border-white/10 pb-2">{beat}<span>{count}</span></p>)}</>}
      {(tab === 'Overblik' || tab === 'Kilder og dækning') && (
        <section className="rounded-xl border border-white/15 p-4 space-y-3" aria-label="Læserinteresse">
          <h2>Stigende interesse hos Apropos</h2>
          <p className="text-xs text-white/60">{audience?.period || 'Analytics opdateres, når du vælger Find kulturhistorier.'}</p>
          {audience && <>
            <p className="text-xs text-white/60">{audience.note}</p>
            <p className="text-xs text-white/40">Hentet: {audience.fetchedAt}</p>
            {audience.status === 'available' && !audience.signals.length && <p className="text-sm">Ingen artikler opfylder tærsklen for stigende interesse i rapporten.</p>}
            {audience.signals.map(signal => <div key={signal.path} className="border-t border-white/10 pt-2">
              <p className="text-sm">{signal.title}</p>
              <p className="text-xs text-white/50">{signal.views} visninger i går · normalt {Math.round(signal.baselineDailyViews)} pr. dag</p>
            </div>)}
          </>}
        </section>
      )}
      <div className="flex justify-between items-center"><h2>{tab === 'Kilder og dækning' ? 'Historier og kildegrundlag' : 'Historiekø'}</h2><button className={button} disabled={busy} onClick={() => void refresh()}>Opdater</button></div>
      {!loaded && !error && <p role="status">Henter historier…</p>}
      {loaded && !stories.length && <p className="text-sm text-white/50">Ingen historier endnu. Vælg “Find kulturhistorier” under Overblik.</p>}
      {stories.map(story => <button key={story.id} className={`w-full text-left rounded-xl border p-4 ${selected === story.id ? 'border-white/50 bg-white/10' : 'border-white/15'}`} onClick={() => setSelected(story.id)}><p className="text-xs text-white/50">{story.signal.beat} · {labels[story.status]}</p><h3 className="mt-2">{story.article?.title || story.signal.title}</h3></button>)}
      {current && <article className="rounded-xl border border-white/20 p-4 space-y-3"><h2>{current.signal.title}</h2><p className="text-sm text-white/65">{current.signal.angle}</p>{current.error && <p role="alert">{current.error}</p>}
        {current.signal.priorityReason && <p className="text-xs text-white/50">Prioritering: {current.signal.priorityReason}</p>}
        {(current.research?.dossier.sources || current.signal.sources || []).map((s, i) => <div key={`${s.url}-${i}`} className="text-sm"><span className="text-white/50">{s.source}: </span>{s.url && /^https?:\/\//.test(s.url) ? <a className="underline" href={s.url} target="_blank" rel="noreferrer">{s.title}</a> : s.title}</div>)}
        {current.research && <><p className="text-sm">Researchgrundlag: {current.research.qualityGate.score}/100. Endeligt faktatjek af artiklen mangler.</p><ul className="text-xs text-white/60">{current.research.qualityGate.checks.filter(c => !c.ok).map(c => <li key={c.id}>{c.label}: {c.detail}</li>)}</ul></>}
        <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || current.status === 'draft'} onClick={() => void act('research', current.id)}>Research historien</button><button className={button} disabled={busy || !current.research?.qualityGate.ready || current.status === 'draft'} onClick={() => void act('draft', current.id)}>Lad Liv skrive</button>{current.article && <button className={button} onClick={() => onOpenWriter(current)}>Åbn i Writer · tekst og billeder</button>}</div>
        {busy && <p role="status" className="text-xs text-white/60">Arbejder på historien. Det kan tage nogle minutter.</p>}
        {current.article && <LivImageSelection key={`${current.id}:${current.updatedAt}`} article={current.article} busy={busy} onPrepare={input => act('prepare-image', current.id, input)} />}
        {current.article && <section className="border-t border-white/15 pt-3 space-y-2">
          <button className={button} disabled={busy} onClick={() => void act('preflight', current.id)}>Kontrollér CMS-kladden</button>
          {current.cmsPreflight && <>
            <p className="text-sm">{current.cmsPreflight.structureReady ? 'Strukturkontrol bestået' : 'Kladden kræver rettelser'} · {current.cmsPreflight.wordCount} ord · {current.cmsPreflight.readTime} min.</p>
            <ul className="text-xs space-y-1">{current.cmsPreflight.checks.map(check => <li key={check.id}>{check.ok ? 'OK' : 'Mangler'}: {check.label}</li>)}</ul>
          </>}
          <p className="text-xs text-amber-200">Ikke publiceringsgodkendt. Faktabelæg, billedrettigheder og de faktiske Webflow-referencer skal kontrolleres. Kontrollen gælder køens gemte udkast, ikke senere ændringer i Writer.</p>
        </section>}
      </article>}
    </div>}
  </section>;
}
