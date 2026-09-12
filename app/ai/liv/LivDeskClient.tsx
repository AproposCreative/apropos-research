'use client';

import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { DeskStory } from '@/lib/editorial/desk-types';
import type { AudienceSnapshot } from '@/lib/editorial/audience-research';
import { readJsonResponse } from '@/lib/api/read-json-response';
import LivImageSelection from './LivImageSelection';
import LivApprovalFeed from './LivApprovalFeed';
import LivPublicationHistory from './LivPublicationHistory';
import LivContentColumn from './LivContentColumn';
import LivBudgetSettings from './LivBudgetSettings';
import LivStoryNavigation from './LivStoryNavigation';

const LivPostingClient = lazy(() => import('./LivPostingClient'));
type View = 'upcoming' | 'published' | 'settings' | 'research' | 'manual';
const labels: Record<DeskStory['status'], string> = { discovered: 'Idé', researching: 'Research i gang', researched: 'Research klar', drafting: 'Liv skriver', draft: 'Udkast klar', failed: 'Kræver handling' };

export default function LivDeskClient({ onClose, onOpenWriter }: { onClose: () => void; onOpenWriter: (story: DeskStory) => void }) {
  const { user } = useAuth();
  const [view, setView] = useState<View>('upcoming');
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
  useEffect(() => { if (view === 'research') void refresh(); }, [refresh, view]);
  async function act(action: string, id?: string, extra?: object) {
    setBusy(true); setError('');
    try { await request({ action, id, ...extra }); await refresh(); }
    catch (e) { await refresh(); setError(e instanceof Error ? e.message : 'Der opstod en fejl.'); }
    finally { setBusy(false); }
  }
  const current = stories.find(s => s.id === selected);
  const button = 'min-h-11 rounded-lg border border-white/20 px-3 py-2 text-sm hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
  const mainView = view === 'upcoming' || view === 'published';
  return <section className="flex h-full min-h-0 min-w-0 w-full flex-col text-white font-poppins">
    <header className="relative z-30 shrink-0 border-b border-white/10 bg-[#080808]">
      <LivContentColumn className="flex items-center justify-between gap-2 py-4">
      <div className="min-w-0"><h1 className="text-lg font-medium">Liv · Redaktion</h1><p className="mt-1 text-xs text-white/50">Én historie ad gangen.</p></div>
      <div className="flex shrink-0 gap-1">
        <button className={`${button} min-w-11 border-transparent`} onClick={() => setView('settings')} aria-label="Indstillinger og værktøjer" aria-pressed={!mainView}>
          <svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="m9 3-.7 2.2-2 .9L4 5.6 2 9l1.6 1.7v2.6L2 15l2 3.4 2.3-.5 2 .9L9 21h4l.7-2.2 2-.9 2.3.5 2-3.4-1.6-1.7v-2.6L20 9l-2-3.4-2.3.5-2-.9L13 3Z"/><circle cx="11" cy="12" r="3"/></svg>
        </button>
        <button className={`${button} min-w-11 border-transparent`} onClick={onClose} aria-label="Luk Liv Redaktion">✕</button>
      </div>
      </LivContentColumn>
    </header>
    {mainView ? <LivStoryNavigation key={view} view={view} onChange={setView}>
      {view === 'upcoming' ? <LivApprovalFeed /> : <LivPublicationHistory />}
    </LivStoryNavigation> : <div className="shrink-0 border-b border-white/10"><LivContentColumn className="py-2"><button className={`${button} border-transparent`} onClick={() => setView(view === 'settings' ? 'upcoming' : 'settings')}>← {view === 'settings' ? 'Til historierne' : 'Til indstillinger'}</button></LivContentColumn></div>}
    {view === 'settings' && <div className="min-h-0 flex-1 overflow-y-auto"><LivContentColumn className="space-y-5 py-6">
      <h2 className="text-xl font-medium">Indstillinger og værktøjer</h2>
      <p className="text-sm leading-relaxed text-white/60">Til det redaktionelle arbejde bag historierne. Dine daglige valg ligger under Kommende.</p>
      <div className="divide-y divide-white/10 rounded-xl border border-white/15">
        <button onClick={() => setView('research')} className="block w-full space-y-2 p-5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-white"><span className="block font-medium">Research og kilder →</span><span className="block text-sm text-white/55">Idéer, kildegrundlag og udkast. Åbn en historie i Writer.</span></button>
        <button onClick={() => setView('manual')} className="block w-full space-y-2 p-5 text-left hover:bg-white/5 focus-visible:outline focus-visible:outline-white"><span className="block font-medium">Avanceret drift →</span><span className="block text-sm text-white/55">Udgivelsesstatus, fejllog og manuel planlægning.</span></button>
      </div>
      <LivBudgetSettings />
    </LivContentColumn></div>}
    {view === 'manual' && <div className="min-h-0 flex-1"><Suspense fallback={<p role="status" className="p-5 text-sm text-white/60">Henter drift…</p>}><LivPostingClient embedded initialTab="history" /></Suspense></div>}
    {view === 'research' && <div className="min-h-0 flex-1 overflow-y-auto"><LivContentColumn className="space-y-5 py-6">
      <h2 className="text-xl font-medium">Research og kilder</h2>
      {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
      <p className="text-sm text-white/60">{loaded ? `${stories.length} idéer · ${stories.filter(s => s.status === 'draft').length} udkast · ${stories.filter(s => s.status === 'failed').length} kræver handling` : 'Henter redaktionens udkast…'}</p>
      <button className={button} disabled={busy || !user} onClick={() => void act('discover')}>{busy ? 'Arbejder…' : 'Find kulturhistorier'}</button>
        <details className="rounded-xl border border-white/15 p-4 space-y-3">
          <summary className="cursor-pointer py-2 text-sm">Læserinteresse og dækning</summary>
          {Object.entries(stories.reduce<Record<string, number>>((acc, s) => { acc[s.signal.beat] = (acc[s.signal.beat] || 0) + 1; return acc; }, {})).map(([beat, count]) => <p key={beat} className="flex justify-between border-b border-white/10 pb-2">{beat}<span>{count} idéer</span></p>)}
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
        </details>
      <div className="flex justify-between items-center"><h2>Idéer og udkast</h2><button className={button} disabled={busy} onClick={() => void refresh()}>Opdater</button></div>
      {!loaded && !error && <p role="status">Henter historier…</p>}
      {loaded && !stories.length && <p className="text-sm text-white/50">Ingen idéer endnu. Vælg “Find kulturhistorier” ovenfor.</p>}
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
    </LivContentColumn></div>}
  </section>;
}
