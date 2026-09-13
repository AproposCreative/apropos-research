'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { readDeliveryAlertHistory } from '@/lib/liv/alert-status';

type Page = Awaited<ReturnType<typeof readDeliveryAlertHistory>>;
const labels: Record<string, string> = {
  failure_accepted: 'Fejlmail accepteret', resolved_accepted: 'Løsningsmail accepteret',
  unconfirmed: 'Afsendelse uafklaret', reconciliation_required: 'Kræver afklaring', unknown: 'Ukendt status',
};
export default function LivAlertHistory() {
  const { user } = useAuth();
  const [cursor, setCursor] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [page, setPage] = useState<Page | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    const controller = new AbortController(); setPage(null); setError('');
    void (async () => {
      try {
        if (!user) throw new Error('Log ind for at læse historik.');
        const token = await user.getIdToken(); if (controller.signal.aborted) return;
        const response = await fetch('/api/editorial/operations/alerts' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''),
          { cache: 'no-store', signal: controller.signal, headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Historikken kunne ikke hentes.');
        const data = await response.json(); if (!controller.signal.aborted) setPage(data);
      } catch { if (!controller.signal.aborted) setError('Historikken kunne ikke hentes.'); }
    })();
    return () => controller.abort();
  }, [user, cursor, attempt]);
  return <div className="space-y-2 border-t border-white/10 pt-3 text-xs">
    <h4 className="text-sm">Alarmhistorik</h4>
    <p className="text-white/50">20 poster ad gangen. Gamle uafklarede afsendelser bevares. Accept er ikke bevis for levering.</p>
    {!page && !error && <p role="status">Henter historik…</p>}
    {error && <p role="alert" className="text-amber-200">{error}</p>}
    {page && (page.records.length ? <ul className="space-y-2">{page.records.map(record => <li key={record.day} className="flex flex-wrap justify-between gap-2"><span>{record.day}</span><span className={['unconfirmed', 'reconciliation_required', 'unknown'].includes(record.status) ? 'text-amber-200' : 'text-white/60'}>{labels[record.status] || 'Ukendt status'}</span></li>)}</ul> : <p>Ingen poster på denne side.</p>)}
    <div className="flex flex-wrap gap-4">
      <button type="button" className="min-h-11 underline" onClick={() => {setCursor(null);setAttempt(n => n + 1);}}>Vis nyeste</button>
      {page?.nextCursor && <button type="button" className="min-h-11 underline" onClick={() => setCursor(page.nextCursor)}>Vis ældre</button>}
      {error && <button type="button" className="min-h-11 underline" onClick={() => setAttempt(n => n + 1)}>Prøv igen</button>}
    </div>
  </div>;
}
