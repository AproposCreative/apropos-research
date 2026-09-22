'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import type { readCostActions } from '@/lib/ai/cost-actions';
import { providerFailureLabel } from '@/lib/ai/provider-error';
type Snapshot = Awaited<ReturnType<typeof readCostActions>>;
const amount = (value: number) => `${value.toLocaleString('da-DK', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr.`;
export default function CostActions() {
  const { user } = useAuth();
  const [opened, setOpened] = useState(false), [revision, setRevision] = useState(0);
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
        const response = await fetch('/api/ai-cost/actions', { cache: 'no-store', signal: controller.signal,
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
  }, [opened, revision, user]);
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
      {loading && <p role="status">Henter registrerede handlinger…</p>}
      {error && <p role="alert" className="text-amber-200">{error}</p>}
      {hold?.blocked && <div className="py-3 text-amber-200">
        <p>Nye AI-kald er sat på pause efter manglende credits. Færdige historier kan stadig udgives.</p>
        <button disabled={loading} className="min-h-11 underline disabled:opacity-40" onClick={() => void resume()}>Jeg har opdateret betalingen · tillad nye AI-kald</button>
        <p>Ingen testkøb. Allerede stoppede forløb beholder deres gemte status.</p>
      </div>}
      {!!snapshot?.stories?.length && <details className="py-3"><summary className="min-h-11 cursor-pointer">Samlet pr. historie eller forløb</summary>
        <p>Ældre kald vises pr. forløb, hvor en fælles historieidentitet mangler.</p>
        <ul>{snapshot.stories.map(s => <li key={`${s.bucket}:${s.id}`} className="break-all py-2">
          {s.id}: {amount(s.estimatedDkk)} · {amount(s.reservedDkk)} reserveret
        </li>)}</ul>
      </details>}
      {snapshot && <ul className="divide-y divide-white/10">
        {snapshot.actions.slice(0, limit).map(a => <li key={`${a.bucket}:${a.scope}:${a.runId}:${a.stage}:${a.purpose}:${a.contentVersion}`} className="space-y-1 py-3">
          <p className="break-words text-white/85">{a.scope} · {a.stage}</p>
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
