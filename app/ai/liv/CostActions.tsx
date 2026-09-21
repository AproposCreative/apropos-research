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
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setLoading(true); setError(''); setSnapshot(null);
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
      } catch { if (!controller.signal.aborted) setError('Forbruget kunne ikke hentes.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [opened, revision, user]);
  return <section className="border-t border-white/10 pt-3">
    {!opened ? <button className="min-h-11 text-sm underline" onClick={() => setOpened(true)}>Vis forbrug pr. handling</button> : <>
      <div className="flex items-center justify-between gap-2"><h4 className="text-sm">Forbrug pr. handling</h4><button disabled={loading} className="min-h-11 px-2 underline disabled:opacity-40" onClick={() => setRevision(n => n + 1)}>Opdater</button></div>
      <p>Kun registrerede kald. Estimater, ikke faktura. Image-gen beholder sit separate budget.</p>
      {loading && <p role="status">Henter registrerede handlinger…</p>}
      {error && <p role="alert" className="text-amber-200">{error}</p>}
      {snapshot && <ul className="divide-y divide-white/10">
        {snapshot.actions.slice(0, limit).map(a => <li key={`${a.bucket}:${a.scope}:${a.runId}:${a.stage}`} className="space-y-1 py-3">
          <p className="break-words text-white/85">{a.scope} · {a.stage}</p>
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
