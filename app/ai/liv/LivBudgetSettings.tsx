'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import type { ApprovalFeed } from '@/lib/liv/approval-types';

/** Settings-only, read-only status. Never starts preparation or a paid call. */
export default function LivBudgetSettings() {
  const { user } = useAuth();
  const [cost, setCost] = useState<ApprovalFeed['cost']>();
  const [error, setError] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCost(undefined); setError('');
    void (async () => {
      try {
        if (!user) throw new Error('Log ind for at se API-budgettet.');
        const token = await user.getIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch('/api/liv/delivery/feed', { cache: 'no-store', signal: controller.signal,
          headers: { Authorization: `Bearer ${token}` } });
        const data = await readJsonResponse(response);
        if (!response.ok || !data.cost) throw new Error('Budgetstatus kunne ikke hentes.');
        if (!controller.signal.aborted) setCost(data.cost);
      } catch (e) {
        if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Budgetstatus kunne ikke hentes.');
      }
    })();
    return () => controller.abort();
  }, [user, attempt]);
  return <details className="rounded-xl border border-white/15 p-4 text-xs leading-relaxed text-white/60">
    <summary className="min-h-11 cursor-pointer text-sm text-white/80">Daglig Liv · API-budget{cost ? ` ${cost.monthlyLimitDkk} kr./måned` : ''}</summary>
    <div className="mt-3 space-y-2">
      {!cost && !error && <p role="status">Henter budgetstatus…</p>}
      {error && <div><p role="alert">{error}</p><button className="min-h-11 underline underline-offset-4" onClick={() => setAttempt(value => value + 1)}>Prøv igen</button></div>}
      {cost && <>
        <p>{cost.usageBasedUpperDkk === null ? 'Registreret forbrug er endnu ukendt.' :
          `Estimat for registrerede kald: ${cost.usageBasedUpperDkk.toLocaleString('da-DK', { maximumFractionDigits: 2 })} kr.`}</p>
        {cost.reservedUpperDkk !== null && <p>Reserveret til igangværende eller uafklarede kald: {cost.reservedUpperDkk.toLocaleString('da-DK', { maximumFractionDigits: 2 })} kr.</p>}
        {cost.status !== 'ready_partial' && <p className="text-amber-200">{cost.status === 'unavailable' ? 'Budgetstatus kunne ikke hentes.' : cost.status === 'unconfigured' ? 'Budgetstyringen mangler opsætning.' : 'Budgetstyringen kræver afklaring før nye betalte kald.'}</p>}
        <p>Kun registrerede kald fra det daglige flow. Manuel Writer, særskilte previews, øvrige AI-funktioner og tidligere forbrug er ikke medregnet. Dette er et estimat, ikke API-udbyderens faktura eller et loft på hele kontoen.</p>
      </>}
    </div>
  </details>;
}
