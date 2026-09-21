'use client';
import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { readEditorialOperations } from '@/lib/editorial-operations';
import { operationsBudgetLabel } from '@/lib/editorial-operations-view';
import LivAlertHistory from './LivAlertHistory';
import { preparationMessage } from '@/lib/liv/preparation-message';

type Snapshot = Awaited<ReturnType<typeof readEditorialOperations>>;
const states: Record<string, string> = { sent: 'Afsendelse registreret', failed: 'Afsendelse fejlede', skipped: 'Sprunget over', processing: 'Behandles', not_recorded: 'Ingen afsendelse registreret', unknown: 'Ukendt status' };
export default function LivOperations() {
  const { user } = useAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSnapshot(null);
    void (async () => {
      try {
        if (!user) throw new Error('Log ind for at se drift.');
        const token = await user.getIdToken();
        if (controller.signal.aborted) return;
        const response = await fetch('/api/editorial/operations', { signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error('Driftsstatus kunne ikke hentes.');
        const data = await response.json();
        if (!controller.signal.aborted) setSnapshot(data);
      } catch (e) { if (!controller.signal.aborted) setError(e instanceof Error ? e.message : 'Status er utilgængelig.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [user, revision]);
  const liv = snapshot?.liv.available ? snapshot.liv.data : null;
  const mail = snapshot?.newsletter.available ? snapshot.newsletter.data : null;
  const budget = snapshot?.budget.available ? snapshot.budget.data : null;
  const alert = snapshot?.alerts?.available ? snapshot.alerts.data : null;
  const alertLabels: Record<string, string> = { not_recorded: 'Ingen alarm registreret i dag', failure_accepted: 'Fejlmail accepteret af mailudbyderen', resolved_accepted: 'Løsningsmail accepteret af mailudbyderen', unconfirmed: 'Mailafsendelse endnu ikke bekræftet', reconciliation_required: 'Mailafsendelse kræver afklaring', unknown: 'Ukendt alarmstatus' };
  return <section className="space-y-3 rounded-xl border border-white/15 p-5" aria-label="Driftsstatus">
    <div className="flex items-center justify-between gap-3"><h3 className="font-medium">Driftsstatus</h3><button type="button" disabled={loading} onClick={() => setRevision(n => n + 1)} className="min-h-11 px-2 text-sm underline disabled:opacity-40">Opdater</button></div>
    <p className="text-xs text-white/55">Kun aflæsning. Starter ikke AI, udgivelser eller mails.</p>
    {loading && <p role="status">Henter status…</p>}
    {error && <p role="alert" className="text-sm text-amber-200">{error}</p>}
    {snapshot && <div className="space-y-3 text-sm">
      {liv && <div><h4>Dagens artikel · {liv.day}</h4>
        {liv.today.publicUrl ? <><a href={liv.today.publicUrl} target="_blank" rel="noopener noreferrer" className="block break-words text-emerald-200 underline">{liv.today.title || 'Åbn dagens artikel'} ↗</a><p className="text-xs text-white/50">Live verificeret {new Date(liv.today.verifiedAt!).toLocaleString('da-DK')}</p></> :
          <p className="text-white/65">{liv.today.status === 'recorded_unverified' ? 'Udgivelse registreret, men live-bekræftelse mangler.' : liv.today.status === 'missing' ? 'Dagens artikel er ikke bekræftet live.' : 'Planlagt til kl. 10 dansk tid.'}</p>}
      </div>}
      {liv && <div><h4>Næste udgivelse · {liv.nextDay}</h4><p className="break-words text-white/65">{liv.nextStory?.title || 'Ingen udgivelsesklar historie endnu'}</p><p className="text-xs text-white/50">Kl. 10 dansk tid. Valget kan ændres indtil udgivelsen starter.</p></div>}
      <div><h4>Driftsalarmer</h4><p className="text-white/65">{alert ? alertLabels[alert.status] || alertLabels.unknown : 'Alarmstatus utilgængelig'}</p><p className="text-xs text-white/50">Udbyderens accept er ikke bevis for levering til indbakken.</p></div>
      <div><h4>Liv</h4><p className="text-white/65">{liv ? `${liv.autoPublishEnabled ? 'Automatik aktiv' : 'Automatik inaktiv'} · ${liv.published ? 'Dagens udgivelse registreret' : liv.overdue ? 'Dagens udgivelse mangler' : 'Afventer kl. 10'}` : 'Status utilgængelig'}</p>{liv && (liv.blockedItems.length > 0 || liv.needsReconciliation) && <p className="text-amber-200">Gemte udgivelser kræver kontrol.</p>}</div>
      {liv && <div><h4>Forberedelse</h4><p className="text-white/65">{preparationMessage(liv.preparation)}</p></div>}
      <div><h4>Nyhedsbrev</h4><p className="text-white/65">{mail ? `${mail.enabled ? 'Ugeautomatik aktiv' : 'Ugeautomatik inaktiv'} · ${states[mail.status] || states.unknown}` : 'Status utilgængelig'}</p>{mail && <p className="text-xs text-white/50">{mail.week} · {mail.sentCount ?? 'Ukendt antal'} afsendt · {mail.failedCount ?? 'Ukendt antal'} fejl</p>}</div>
      <div><h4>AI-budget</h4><p className="text-white/65">{operationsBudgetLabel(budget)}</p>{budget && !budget.fullMonthlyCapVerified && <p className="text-xs text-amber-200">Delvis dækning. Ikke en komplet faktura.</p>}</div>
      <p className="text-xs text-white/40">Aflæst {new Date(snapshot.checkedAt).toLocaleString('da-DK')}</p>
      <LivAlertHistory key={user?.uid} />
    </div>}
  </section>;
}
