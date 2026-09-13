'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

type Tip = { id: string; url: string; angle: string; status: string };
export default function LivTips() {
  const { user, capabilities } = useAuth();
  const [open, setOpen] = useState(false);
  const [tips, setTips] = useState<Tip[]>([]);
  const [url, setUrl] = useState('');
  const [angle, setAngle] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const pending = useRef<{ operationId: string; url: string; angle: string } | null>(null);
  const sending = useRef(false);
  async function select(id: string) {
    if (!user || sending.current) return;
    sending.current = true; setBusy(true); setMessage('');
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/editorial/tips/select', { method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ id }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Tipset kunne ikke vælges.');
      setMessage('Idéen ligger under tandhjul → Research og kilder. Research er ikke startet endnu.');
      setAttempt(n => n + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Prøv samme tip igen.'); }
    finally { sending.current = false; setBusy(false); }
  }
  useEffect(() => {
    if (!open || !user) return;
    const controller = new AbortController(); setLoaded(false);
    void (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/editorial/tips', { signal: controller.signal, cache: 'no-store', headers: { Authorization: `Bearer ${token}` } });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Tip kunne ikke hentes.');
        if (!controller.signal.aborted) { setTips(data.tips); setLoaded(true); }
      } catch { if (!controller.signal.aborted) setMessage('Tip kunne ikke hentes. Prøv Opdater tip.'); }
    })();
    return () => controller.abort();
  }, [open, user, attempt]);
  async function submit() {
    if (!user || sending.current) return;
    sending.current = true; setBusy(true); setMessage('');
    pending.current ??= { operationId: crypto.randomUUID(), url, angle };
    try {
      const token = await user.getIdToken();
      const response = await fetch('/api/editorial/tips', { method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify(pending.current) });
      const data = await response.json();
      if (!response.ok) {
        if ([400, 409, 413].includes(response.status)) pending.current = null;
        throw new Error(data.error || 'Prøv samme tip igen.');
      }
      pending.current = null; setUrl(''); setAngle(''); setMessage('Tip delt. Ingen research er startet.'); setAttempt(n => n + 1);
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Prøv samme tip igen.'); }
    finally { sending.current = false; setBusy(false); }
  }
  const field = 'mt-1 block w-full rounded border border-white/20 bg-transparent p-3';
  return <details className="rounded-xl border border-white/15 p-4 text-sm" onToggle={e => setOpen(e.currentTarget.open)}>
    <summary className="min-h-11 cursor-pointer">Send Liv et tip</summary>
    <p className="my-3 text-white/60">Link og vinkel deles med alle tre i redaktionen. Et tip starter ingen research eller betalte kald.</p>
    <form className="space-y-3" onSubmit={e => { e.preventDefault(); void submit(); }}>
      <label className="block">Link<input className={field} type="url" required maxLength={2048} disabled={busy || !!pending.current} value={url} onChange={e => setUrl(e.target.value)} /></label>
      <label className="block">Din vinkel<textarea className={`${field} min-h-24`} required minLength={10} maxLength={1500} disabled={busy || !!pending.current} value={angle} onChange={e => setAngle(e.target.value)} /></label>
      <button disabled={busy} className="min-h-11 rounded border border-white/30 px-4">{busy ? 'Sender…' : pending.current ? 'Prøv samme tip igen' : 'Del tip med redaktionen'}</button>
    </form>
    {message && <p role="status" className="mt-3">{message}</p>}
    <h3 className="mt-5 font-medium">Redaktionens seneste tip</h3>
    <button className="min-h-11 underline" onClick={() => setAttempt(n => n + 1)}>Opdater tip</button>
    {!loaded && !message && <p role="status">Henter…</p>}
    {loaded && !tips.length && <p className="text-white/60">Ingen tip endnu.</p>}
    <ul className="space-y-3">{tips.map(tip => <li key={tip.id} className="border-t border-white/15 pt-3">
      <p className="whitespace-pre-wrap break-words">{tip.angle}</p>
      <p className="text-xs text-white/60">{tip.status === 'selected' ? 'Valgt til redaktionen' : 'Foreslået'}</p>
      <a href={tip.url} target="_blank" rel="noopener noreferrer" className="block min-h-11 break-all py-2 text-white/60 underline">{tip.url}</a>
      {capabilities.owner && tip.status !== 'selected' && <button disabled={busy} className="min-h-11 underline" onClick={() => void select(tip.id)}>Vælg til redaktionen</button>}
    </li>)}</ul>
  </details>;
}
