'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import type { readCostActions } from '@/lib/ai/cost-actions';
import { providerFailureLabel } from '@/lib/ai/provider-error';
import { costOverview, costStageLabel } from '@/lib/ai/cost-overview';
type Snapshot = Awaited<ReturnType<typeof readCostActions>>;
const amount = (value: number) => `${value.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
export default function CostActions() {
  const { user } = useAuth();
  const [opened, setOpened] = useState(false), [revision, setRevision] = useState(0);
  const [month, setMonth] = useState(() => new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Copenhagen' }).slice(0, 7));
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null), [error, setError] = useState('');
  const [loading, setLoading] = useState(false), [limit, setLimit] = useState(20);
  const [hold, setHold] = useState<{ blocked: boolean; revision: number } | null>(null);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setSnapshot(null); setHold(null);
    void (async () => {
      try {
        if (!user) throw Error('Log ind for at se forbruget.');
        const token = await user.getIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch(`/api/ai-cost/actions?month=${encodeURIComponent(month)}`, { cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` } });
        const data = await readJsonResponse(response);
        if (!response.ok || !Array.isArray(data.actions)) throw Error('Forbruget kunne ikke hentes.');
        if (!controller.signal.aborted) setSnapshot(data);
        const status = await fetch('/api/ai-cost/provider', { cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` } });
        const provider = await readJsonResponse(status);
        if (status.ok && !controller.signal.aborted) setHold(provider);
      } catch { if (!controller.signal.aborted) setError('Forbruget kunne ikke hentes.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [opened, revision, user, month]);
  async function resume() {
    if (!user || !hold?.blocked || loading) return;
    setLoading(true); setError('');
    try {
      const response = await fetch('/api/ai-cost/provider', { method: 'POST',
        headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resume-after-billing-change', revision: hold.revision }) });
      if (!response.ok) throw Error('resume_failed');
      setHold(await readJsonResponse(response)); setRevision(n => n + 1);
    } catch { setError('Kunne ikke genoptage. Opdatér status og prøv igen.'); }
    finally { setLoading(false); }
  }
  return <section className="border-t border-white/10 pt-3">
    {!opened ? <button className="min-h-11 text-sm underline" onClick={() => setOpened(true)}>Vis forbrug pr. handling</button> : <>
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm">Forbrug pr. handling</h4><button disabled={loading} className="min-h-11 px-2 underline disabled:opacity-40" onClick={() => setRevision(n => n + 1)}>Opdater</button></div>
      <p>Kun registrerede kald. Estimater, ikke faktura. Image-gen beholder sit separate budget.</p>
      <label className="flex flex-wrap items-center gap-2 py-2">Måned
        <input type="month" value={month} min="2026-09" className="min-h-11 rounded-lg border border-white/15 bg-transparent px-3"
          onChange={e => { if (/^20\d{2}-(0[1-9]|1[0-2])$/.test(e.target.value)) { setMonth(e.target.value); setLimit(20); } }} />
      </label>
      {loading && <p role="status">Henter registrerede handlinger…</p>}
      {error && <p role="alert" className="text-amber-200">{error}</p>}
      {snapshot && snapshot.actions.length > 0 && <section aria-label="Forbrug fordelt på formål" className="py-3">
        <h5 className="text-white/85">Hvor går pengene hen?</h5>
        <p>{snapshot.month} · Registreret forbrug og reservationer vises hver for sig.</p>
        <ul>{costOverview(snapshot.actions).map(group => <li key={group.label} className="py-2">
          <p className="text-white/85">{group.label}</p>
          <p>{amount(group.estimatedDkk)} · {group.calls} kald · {amount(group.reservedDkk)} reserveret</p>
        </li>)}</ul>
      </section>}
      {hold?.blocked && <div className="py-3 text-amber-200">
        <p>Nye AI-kald er sat på pause efter manglende credits. Færdige historier kan stadig udgives.</p>
        <button disabled={loading} className="min-h-11 underline disabled:opacity-40" onClick={() => void resume()}>Jeg har opdateret betalingen · tillad nye AI-kald</button>
        <p>Ingen testkøb. Allerede stoppede forløb beholder deres gemte status.</p>
      </div>}
      {!!snapshot?.stories?.length && <details className="py-3"><summary className="min-h-11 cursor-pointer">Samlet pr. historie eller forløb</summary>
        <p>Udgivet betyder gemt CMS- og offentlig læsekvittering, ikke en ny livekontrol. Omkostninger er månedens registrerede arbejde, ikke nødvendigvis hele artiklens livstid. Uden sikker artikelidentitet vises forløbet separat.</p>
        <ul>{snapshot.stories.map(s => <li key={`${s.bucket}:${s.id}`} className="py-2">
          <details>
            <summary className="min-h-11 cursor-pointer break-words">
              {s.title || s.id}: {amount(s.estimatedDkk)}
            </summary>
            <p>{s.publicationState === 'published' ? 'Udgivet · verificeret kvittering' : s.publicationState === 'ready' ? 'Klar til udgivelse' : s.publicationState === 'unfinished' ? 'Ikke færdig / afventer' : 'Forløb uden dokumenteret færdig artikel'}</p>
            {s.checkedAt && <p>Verificeret {new Date(s.checkedAt).toLocaleString('da-DK')}</p>}
            <p>{s.bucket === 'image-gen' ? 'Image-gen' : 'Fælles budget'} · {s.calls} kald · {amount(s.reservedDkk)} reserveret</p>
            <p>Inklusive registreret arbejde fra mislykkede forsøg. {s.unknownCalls} kald har uafklaret forbrug.</p>
            <ul className="divide-y divide-white/10">{s.stages.map(stage => <li key={stage.stage} className="py-2">
              <p>{costStageLabel(stage.stage)}: {amount(stage.estimatedDkk)}</p>
              <p>{stage.calls} kald · {amount(stage.reservedDkk)} reserveret</p>
            </li>)}</ul>
          </details>
        </li>)}</ul>
      </details>}
      {snapshot && <ul className="divide-y divide-white/10">
        {snapshot.actions.slice(0, limit).map(a => <li key={`${a.bucket}:${a.scope}:${a.runId}:${a.stage}:${a.purpose}:${a.contentVersion}`} className="space-y-1 py-3">
          <p className="break-words text-white/85">{a.scope} · {costStageLabel(a.stage)}</p>
          {a.purpose && <p>{a.purpose === 'development-pilot' ? 'Udviklingstest' : a.purpose === 'editorial-change' ? 'Redaktionel ændring' : 'Drift'}</p>}
          <p>{amount(a.estimatedDkk)} registreret · {a.calls} kald{a.unknownCalls ? ` · ${a.unknownCalls} uafklarede (${amount(a.reservedDkk)} reserveret)` : ''}</p>
          {a.failure && <p className="text-amber-200">{providerFailureLabel[a.failure]}</p>}
          {a.repeatedRequests > 0 && <p className="text-amber-200">{a.repeatedRequests} gentagelser med samme indhold. Kan være tilsigtet; bør undersøges.</p>}
          <p className="break-all text-white/40">{new Date(a.lastAt).toLocaleString('da-DK')} · {a.runId}</p>
        </li>)}
      </ul>}
      {snapshot && !snapshot.actions.length && <p>Ingen registrerede handlinger denne måned.</p>}
      {snapshot && snapshot.actions.length > limit && <button className="min-h-11 underline" onClick={() => setLimit(n => n + 20)}>Vis flere</button>}
    </>}
  </section>;
}
