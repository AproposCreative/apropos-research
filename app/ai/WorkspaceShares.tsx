'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { EDITORIAL_EMAILS } from '@/lib/auth-policy';
import { workspaceSnapshotSchema, type WorkspaceSnapshot, type WorkspaceVersionSelector } from '@/lib/writer-workspace';

type Share = { id: string; title: string; own: boolean; createdAt: string };
export default function WorkspaceShares({ onClose, onCopy }: {
  onClose: () => void; onCopy: (selection: WorkspaceVersionSelector) => Promise<void>;
}) {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  const lifetime = useRef<AbortController | null>(null);
  const lock = useRef(false);
  const pending = useRef<{ operationId: string; revision: number; recipient: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [shares, setShares] = useState<Share[]>([]);
  const [snapshot, setSnapshot] = useState<WorkspaceSnapshot | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [recipient, setRecipient] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [loaded, setLoaded] = useState(false);
  async function request(path: string, body?: unknown) {
    if (!user || !lifetime.current) throw new Error('Log ind.');
    const signal = lifetime.current.signal;
    const token = await user.getIdToken(); signal.throwIfAborted();
    const response = await fetch(path, { method: body ? 'POST' : 'GET', signal, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) {
      if (body && [400, 409].includes(response.status)) pending.current = null;
      throw new Error(data.error || 'Handlingen kunne ikke gennemføres.');
    }
    signal.throwIfAborted(); return data;
  }
  async function act(action: () => Promise<void>) {
    if (lock.current) return;
    const signal = lifetime.current?.signal;
    lock.current = true; setBusy(true); setError(''); setNotice('');
    try { await action(); }
    catch (e) { if (!signal?.aborted) setError(e instanceof Error ? e.message : 'Prøv igen.'); }
    finally { if (!signal?.aborted) { lock.current = false; setBusy(false); } }
  }
  async function loadList() {
    const data = await request('/api/writer/workspace/shares'); setShares(data.shares); setLoaded(true);
  }
  useEffect(() => {
    lifetime.current = new AbortController();
    const element = dialog.current; element?.showModal();
    void act(loadList);
    return () => { lifetime.current?.abort(); lock.current = false; element?.close(); };
    // Account-keyed Writer remounts the dialog on account changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  async function preview(id: string | null) {
    await act(async () => {
      const data = await request(id ? `/api/writer/workspace/shares?id=${id}` : '/api/writer/workspace');
      const raw = id ? data.share.snapshot : data.workspace;
      if (!raw) throw new Error('Der er endnu ingen synkroniseret version at dele.');
      setSnapshot(workspaceSnapshotSchema.parse(raw)); setSelectedId(id); setConfirmed(false);
    });
  }
  async function share() {
    if (!snapshot || !recipient || !confirmed || selectedId) return;
    await act(async () => {
      pending.current ??= { operationId: crypto.randomUUID(), revision: snapshot.revision, recipient };
      await request('/api/writer/workspace/shares', pending.current);
      pending.current = null; setConfirmed(false); setNotice('Den gemte kopi er delt. Senere ændringer forbliver private.');
      await loadList();
    });
  }
  const button = 'min-h-11 rounded-lg border border-white/25 px-3 py-2 text-sm disabled:opacity-40';
  return <dialog ref={dialog} aria-labelledby="workspace-sharing-title" onCancel={e => { e.preventDefault(); if (!lock.current) onClose(); }}
    className="m-auto max-h-[90dvh] w-[calc(100%-2rem)] max-w-2xl overflow-y-auto rounded-2xl border border-white/20 bg-[#111] p-5 text-white backdrop:bg-black/70">
    <header className="flex items-center justify-between gap-3"><h2 id="workspace-sharing-title" className="text-xl">Delte kopier</h2><button autoFocus disabled={busy} className={button} onClick={onClose}>Luk</button></header>
    <p className="my-4 text-sm text-white/65">Dit arbejde er privat, også over for Frederik. Del kun en kopi, hvis den valgte kollega må se hele indholdet: artikel, chat, noter og referencer.</p>
    <div className="flex flex-wrap gap-2"><button className={button} disabled={busy || !!pending.current} onClick={() => void preview(null)}>Gennemse min gemte kopi</button><button className={button} disabled={busy} onClick={() => void act(loadList)}>Opdater listen</button></div>
    {error && <p role="alert" className="mt-3 text-amber-200">{error}</p>}{notice && <p role="status" className="mt-3 text-emerald-200">{notice}</p>}
    {busy && <p role="status">Arbejder…</p>}
    {snapshot && <section className="my-4 space-y-3 rounded-xl border border-white/20 p-4">
      <h3>{snapshot.data.chatTitle || 'Arbejdsrum'} · version {snapshot.revision}</h3>
      <details><summary className="min-h-11 cursor-pointer">Se alt indhold i kopien</summary><pre className="max-h-64 overflow-auto whitespace-pre-wrap break-all text-xs">{JSON.stringify(snapshot.data, null, 2)}</pre></details>
      {selectedId ? <><p className="text-sm text-white/65">Kopien åbnes som dit eget arbejde. Dit nuværende arbejde gemmes i versionshistorikken.</p><button className={button} disabled={busy} onClick={() => void act(async () => { await onCopy({ kind: 'shared', id: selectedId }); onClose(); })}>Lav min egen kopi i Writer</button></> : <>
        <label className="block">Modtager<select value={recipient} disabled={busy || !!pending.current} onChange={e => { setRecipient(e.target.value); setConfirmed(false); }} className="mt-1 block min-h-11 w-full rounded border border-white/25 bg-[#111] px-2"><option value="">Vælg kollega</option>{EDITORIAL_EMAILS.filter(email => email !== user?.email?.toLowerCase()).map(email => <option key={email} value={email}>{email}</option>)}</select></label>
        <label className="flex min-h-11 items-center gap-3 text-sm"><input type="checkbox" checked={confirmed} disabled={busy || !!pending.current} onChange={e => setConfirmed(e.target.checked)} />Jeg vil dele hele denne gemte kopi med modtageren.</label>
        <button className={button} disabled={busy || !confirmed || !recipient} onClick={() => void share()}>{pending.current ? 'Prøv samme deling igen' : 'Del denne version'}</button>
      </>}
    </section>}
    {loaded && shares.length === 0 && <p className="my-4 text-white/60">Ingen delte kopier endnu.</p>}
    <ul className="mt-4 space-y-2">{shares.map(item => <li key={item.id}><button disabled={busy || !!pending.current} onClick={() => void preview(item.id)} className={`${button} w-full text-left`}>{item.title} · {item.own ? 'Delt af dig' : 'Delt med dig'}</button></li>)}</ul>
  </dialog>;
}
