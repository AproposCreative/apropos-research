'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';

type Baseline = { itemId: string; expectedPayloadHash: string; expectedCmsHash: string;
  title: string; seoTitle: string; seoDescription: string };
type Revision = Pick<Baseline, 'itemId' | 'expectedPayloadHash' | 'expectedCmsHash'> & {
  requestId: string; reason: string; patch: Pick<Baseline, 'title' | 'seoTitle' | 'seoDescription'> };
const endpoint = '/api/liv/revisions/presentation';
const fieldClass = 'apropos-input-dark mt-2 w-full rounded-xl border border-white/25 bg-[#141414] p-3 text-base text-white disabled:opacity-50';

export default function LivPresentationEditor({ itemId, disabled, onSaved }: {
  itemId: string; disabled?: boolean; onSaved: () => void;
}) {
  const { user, capabilities } = useAuth();
  if (!user || !capabilities.owner) return null;
  return <Editor key={`${user.uid}:${itemId}`} itemId={itemId} uid={user.uid}
    getToken={() => user.getIdToken()} disabled={disabled} onSaved={onSaved} />;
}

function Editor({ itemId, uid, getToken, disabled, onSaved }: {
  itemId: string; uid: string; getToken: () => Promise<string>; disabled?: boolean; onSaved: () => void;
}) {
  const id = useId();
  const epoch = useRef(0);
  const busy = useRef(false);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [patch, setPatch] = useState({ title: '', seoTitle: '', seoDescription: '' });
  const [pending, setPending] = useState<Revision | null>(null);
  const [message, setMessage] = useState('');
  const unchanged = baseline && (['title', 'seoTitle', 'seoDescription'] as const)
    .every(key => patch[key].trim() === baseline[key].trim());
  const storageKey = `liv-presentation-revision:v1:${encodeURIComponent(uid)}:${itemId}`;
  useEffect(() => { epoch.current++; return () => { epoch.current++; }; }, []);
  async function call(body?: Revision, cancel = false) {
    const current = epoch.current;
    const token = await getToken();
    if (current !== epoch.current) throw new Error('account_changed');
    return readJsonResponse(await fetch(body ? endpoint : `${endpoint}?itemId=${itemId}`, {
      method: body ? (cancel ? 'DELETE' : 'POST') : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
  }
  async function cancelPending() {
    if (!pending || busy.current) return;
    const current = epoch.current;
    busy.current = true; setLoading(true); setMessage('');
    try {
      const result = await call(pending, true);
      if (current !== epoch.current) return;
      if (result.status !== 'presentation_cancelled' || result.requestId !== pending.requestId) throw new Error('unverified_cancel');
      // Preserve the proposed wording for recovery, independently of the active request.
      localStorage.setItem(`${storageKey}:cancelled:${pending.requestId}`, JSON.stringify(pending));
      localStorage.removeItem(storageKey);
      setPending(null); setBaseline(null); setOpen(false);
      setMessage('Rettelsen blev annulleret før gemning. Din tekst er bevaret lokalt. Åbn redigering igen for at hente den aktuelle historie.');
    } catch {
      if (current === epoch.current) setMessage('Rettelsen kunne ikke annulleres sikkert. Den kan allerede være påbegyndt. Den er bevaret; prøv samme rettelse igen for at få dens status bekræftet.');
    } finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  async function show() {
    setOpen(true);
    if (baseline || pending || busy.current) return;
    const current = epoch.current;
    busy.current = true; setLoading(true); setMessage('');
    try {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Revision;
        if (saved.itemId !== itemId || !/^[a-f0-9]{64}$/.test(saved.expectedCmsHash) ||
          !/^[a-f0-9]{64}$/.test(saved.expectedPayloadHash) || !/^[a-zA-Z0-9_-]{8,100}$/.test(saved.requestId) ||
          !saved.patch || !['title', 'seoTitle', 'seoDescription'].every(k => typeof saved.patch[k as keyof Revision['patch']] === 'string'))
          throw new Error('invalid_saved_revision');
        setPending(saved); setPatch(saved.patch);
        setMessage('En tidligere gemning mangler bekræftelse. Prøv samme rettelse igen.');
        return;
      }
      const data = await call() as Baseline;
      if (current !== epoch.current) return;
      if (data.itemId !== itemId || !['title', 'seoTitle', 'seoDescription'].every(k => typeof data[k as keyof Baseline] === 'string')) throw new Error('invalid_baseline');
      setBaseline(data); setPatch({ title: data.title, seoTitle: data.seoTitle, seoDescription: data.seoDescription });
    } catch {
      if (current === epoch.current) setMessage('Kunne ikke åbne redigeringen. Historien kan være valgt til udgivelse. Prøv igen eller opdater listen.');
    } finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  async function save() {
    if (busy.current || (!baseline && !pending) || (!pending && unchanged)) return;
    const current = epoch.current;
    busy.current = true; setLoading(true); setMessage('');
    try {
      const body: Revision = pending || { itemId, expectedCmsHash: baseline!.expectedCmsHash,
        expectedPayloadHash: baseline!.expectedPayloadHash, requestId: crypto.randomUUID(),
        reason: 'Frederiks redaktionelle rettelse af titel og SEO.', patch };
      // Persist before dispatch: a lost response or reload must not mint another operation.
      localStorage.setItem(storageKey, JSON.stringify(body));
      setPending(body);
      const result = await call(body);
      if (current !== epoch.current) return;
      if (result.status !== 'presentation_staged' || result.publicationVerified !== false) throw new Error('unverified_save');
      localStorage.removeItem(storageKey);
      setPending(null); setBaseline(null); setOpen(false);
      setMessage('Titel og SEO er gemt. Artiklen er ikke udgivet af denne rettelse.');
      onSaved();
    } catch {
      if (current === epoch.current) setMessage('Gemningen kunne ikke bekræftes. Rettelsen er bevaret; Prøv igen sender samme revision. Ved en vedvarende konflikt skal den afklares før en ny rettelse.');
    } finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  return <section className="border-t border-white/10 px-5 py-4" aria-label="Rediger titel og SEO">
    <button type="button" disabled={disabled || loading} onClick={() => open ? setOpen(false) : void show()}
      aria-expanded={open} aria-controls={id} className="min-h-11 text-sm text-white/80 underline underline-offset-4 disabled:opacity-40">
      {open ? 'Luk redigering' : 'Rediger titel og SEO'}
    </button>
    {open && <form id={id} className="space-y-4 py-3" onSubmit={event => { event.preventDefault(); void save(); }}>
      <p className="text-xs leading-6 text-white/60">Ret den eksisterende historie uden nye researchkald. Tekst, billeder og udgivelsesdag bevares.</p>
      {(['title', 'seoTitle', 'seoDescription'] as const).map((key, index) => <label key={key} className="block text-sm text-white/80">
        {['Artiklens titel', 'SEO-titel', 'Meta-beskrivelse'][index]}
        <textarea rows={key === 'seoDescription' ? 4 : 2} minLength={10} required maxLength={key === 'title' ? 160 : key === 'seoTitle' ? 100 : 320}
          className={fieldClass} disabled={loading || !!pending || !baseline} value={patch[key]}
          onChange={event => setPatch(old => ({ ...old, [key]: event.target.value }))} />
      </label>)}
      <button type="submit" disabled={loading || disabled || (!baseline && !pending) || (!pending && !!unchanged)} className="min-h-12 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40">
        {loading ? 'Arbejder…' : pending ? 'Prøv samme rettelse igen' : 'Gem titel og SEO'}
      </button>
      {!baseline && !pending && !loading && <button type="button" onClick={() => void show()} className="min-h-11 underline">Prøv at hente igen</button>}
      {pending && <button type="button" disabled={loading} onClick={() => void cancelPending()} className="min-h-11 text-sm underline disabled:opacity-40">Annuller, hvis gemningen ikke er startet</button>}
    </form>}
    {loading && <p role="status" className="text-sm text-white/60">{pending ? 'Gemmer rettelsen…' : 'Henter den aktuelle tekst…'}</p>}
    {message && <p role="status" className="py-2 text-sm leading-6 text-white/70">{message}</p>}
  </section>;
}
