'use client';
import { useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { workspaceSnapshotSchema, type WorkspaceSnapshot, type WorkspaceVersionSelector } from '@/lib/writer-workspace';

type Version = { id: string; kind: 'history' | 'conflicts'; title: string; updatedAt: string; revision: number };
/** Reads are non-mutating. Restore explicitly preserves local and server work. */
export default function WorkspaceVersions({ onClose, onRestore }: {
  onClose: () => void; onRestore: (selection: WorkspaceVersionSelector) => Promise<void>;
}) {
  const { user } = useAuth();
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => { const element = dialog.current; element?.showModal(); return () => element?.close(); }, []);
  const [versions, setVersions] = useState<Version[]>([]);
  const [selected, setSelected] = useState<WorkspaceSnapshot | null>(null);
  const [choice, setChoice] = useState<Version | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState(false);
  async function restore() {
    if (!choice) return;
    setRestoring(true); setError('');
    try { await onRestore({ kind: choice.kind, id: choice.id }); onClose(); }
    catch (error) { setError(error instanceof Error ? error.message : 'Prøv igen.'); }
    finally { setRestoring(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(''); setSelected(null);
    void (async () => {
      try {
        if (!user) throw new Error();
        const query = choice ? `?kind=${choice.kind}&id=${encodeURIComponent(choice.id)}` : '';
        const response = await fetch(`/api/writer/workspace/versions${query}`, {
          headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store', signal: controller.signal });
        if (!response.ok) throw new Error();
        const body = await response.json();
        if (controller.signal.aborted) return;
        if (choice) setSelected(workspaceSnapshotSchema.parse(body.snapshot));
        else if (Array.isArray(body.versions)) setVersions(body.versions);
        else throw new Error();
      } catch { if (!controller.signal.aborted) setError('Versionerne kunne ikke hentes. Dit arbejde er ikke ændret.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [user, choice]);
  function download() {
    if (!selected) return;
    const url = URL.createObjectURL(new Blob([JSON.stringify(selected, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a'); link.href = url; link.download = `arbejdsrum-version-${selected.revision}.json`;
    link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return <dialog ref={dialog} onCancel={event => { if (restoring) event.preventDefault(); else onClose(); }} aria-labelledby="workspace-versions-title" className="fixed inset-4 m-0 h-[calc(100%-2rem)] max-h-none w-[calc(100%-2rem)] max-w-none flex-col overflow-hidden rounded-xl border border-white/20 bg-[#101010] p-5 text-white shadow-2xl backdrop:bg-black/70 open:flex md:inset-16 md:h-[calc(100%-8rem)] md:w-[calc(100%-8rem)]">
    <header className="flex items-center justify-between gap-3"><h2 id="workspace-versions-title" className="text-lg">Mine gemte versioner</h2><button autoFocus disabled={restoring} className="min-h-11 px-3" onClick={onClose}>Luk</button></header>
    <p className="mb-4 text-sm text-white/60">Kun dine egne versioner. Visning og download ændrer ikke dit aktuelle arbejde. De 20 seneste af hver type vises.</p>
    {loading && <p role="status">Henter…</p>}
    {error && <p role="alert">{error}</p>}
    <div className="min-h-0 overflow-y-auto">
      {choice && <button disabled={restoring} className="min-h-11 underline" onClick={() => setChoice(null)}>← Til listen</button>}
      {!choice && !loading && !versions.length && !error && <p>Ingen tidligere versioner endnu.</p>}
      {!choice && <ul className="divide-y divide-white/15">{versions.map(version => <li key={`${version.kind}:${version.id}`}>
        <button className="min-h-11 w-full py-3 text-left" onClick={() => setChoice(version)}>
          <span className="block">{version.title || 'Arbejdsrum uden titel'}</span>
          <span className="text-xs text-white/60">{version.kind === 'conflicts' ? 'Bevaret konfliktkopi' : 'Tidligere arbejdsrum'} · {version.updatedAt}</span>
        </button>
      </li>)}</ul>}
      {selected && <div className="space-y-4"><h3>{selected.data.chatTitle}</h3>
        <button className="min-h-11 underline" onClick={download}>Download hele versionen</button>
        <button disabled={restoring} className="ml-4 min-h-11 underline" onClick={() => void restore()}>{restoring ? 'Gendanner…' : 'Åbn som ny kopi i Writer'}</button>
        <p className="text-sm text-white/60">Ved gendannelse gemmes både din nuværende lokale tekst og serverversionen i historikken.</p>
        <p className="whitespace-pre-wrap break-words">{selected.data.notes}</p>
        <pre className="whitespace-pre-wrap break-words text-sm">{String(selected.data.articleData.content || '')}</pre>
        {selected.data.messages.map(message => <p key={message.id} className="whitespace-pre-wrap break-words text-sm"><strong>{message.role === 'user' ? 'Dig' : 'Writer'}: </strong>{message.content}</p>)}
      </div>}
    </div>
  </dialog>;
}
