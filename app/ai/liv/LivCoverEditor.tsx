'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';

type Baseline = { itemId: string; dayKey: string; expectedPayloadHash: string; expectedCmsHash: string };
type Fields = { imageUrl: string; sourcePageUrl: string; alt: string; caption: string };
type Revision = Baseline & Fields & { requestId: string; reason: string; replaceMobile: boolean };
const endpoint = '/api/liv/revisions/cover';
const initial: Fields = { imageUrl: '', sourcePageUrl: '', alt: '', caption: '' };
const hash = (value: unknown) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function isBaseline(value: Baseline, itemId: string) {
  return value?.itemId === itemId && /^\d{4}-\d{2}-\d{2}$/.test(value.dayKey) &&
    hash(value.expectedPayloadHash) && hash(value.expectedCmsHash);
}

export default function LivCoverEditor({ itemId, disabled, onSaved }: {
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
  const epoch = useRef(0), busy = useRef(false);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null);
  const [fields, setFields] = useState<Fields>(initial);
  const [pending, setPending] = useState<Revision | null>(null);
  const [message, setMessage] = useState('');
  const storageKey = `liv-cover-revision:v1:${encodeURIComponent(uid)}:${itemId}`;
  useEffect(() => { epoch.current++; return () => { epoch.current++; }; }, []);
  async function call(body?: Revision, cancel = false) {
    const current = epoch.current, token = await getToken();
    if (current !== epoch.current) throw new Error('account_changed');
    return readJsonResponse(await fetch(body ? endpoint : `${endpoint}?itemId=${itemId}`, {
      method: body ? (cancel ? 'DELETE' : 'POST') : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}),
    }));
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
        if (!isBaseline(saved, itemId) || !/^[a-zA-Z0-9_-]{8,100}$/.test(saved.requestId) ||
          typeof saved.reason !== 'string' || typeof saved.replaceMobile !== 'boolean' ||
          !Object.keys(initial).every(key => typeof saved[key as keyof Fields] === 'string')) throw new Error('invalid_saved_revision');
        setPending(saved); setFields({ imageUrl: saved.imageUrl, sourcePageUrl: saved.sourcePageUrl, alt: saved.alt, caption: saved.caption });
        setMessage('En coverrettelse mangler bekræftelse. Genoptag samme rettelse, eller annuller hvis CMS-gemningen ikke er startet.');
        return;
      }
      const data = await call() as Baseline;
      if (current !== epoch.current) return;
      if (!isBaseline(data, itemId)) throw new Error('invalid_baseline');
      setBaseline({ itemId, dayKey: data.dayKey, expectedCmsHash: data.expectedCmsHash, expectedPayloadHash: data.expectedPayloadHash });
    } catch {
      if (current === epoch.current) setMessage('Kunne ikke åbne coverredigering. Historien kan være under redigering eller valgt til udgivelse. Opdater listen og prøv igen.');
    } finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  async function submit(cancel = false) {
    if (busy.current || disabled || (cancel ? !pending : !baseline && !pending)) return;
    const current = epoch.current;
    busy.current = true; setLoading(true); setMessage('');
    try {
      const body: Revision = pending || { ...baseline!, ...fields, requestId: crypto.randomUUID(),
        replaceMobile: true, reason: 'Frederiks redaktionelle valg af nyt coverbillede.' };
      // Store before dispatch so reloads and lost responses reuse the same paid work.
      localStorage.setItem(storageKey, JSON.stringify(body)); setPending(body);
      const result = await call(body, cancel);
      if (current !== epoch.current) return;
      if (cancel ? result.status !== 'cover_cancelled' || result.requestId !== body.requestId :
        result.status !== 'cover_staged' || result.itemId !== itemId || result.publicationVerified !== false) throw new Error('unverified_receipt');
      if (cancel) localStorage.setItem(`${storageKey}:cancelled:${body.requestId}`, JSON.stringify(body));
      localStorage.removeItem(storageKey);
      setPending(null); setBaseline(null); setFields(initial); setOpen(false);
      setMessage(cancel ? 'Coverrettelsen er annulleret. Det eksisterende cover er bevaret.' : 'Coveret er gemt. Tekst og billeder i brødteksten er bevaret. Historien er ikke udgivet af rettelsen.');
      onSaved();
    } catch {
      if (current === epoch.current) setMessage(cancel ? 'Kunne ikke annullere sikkert. CMS-gemningen kan være startet. Genoptag samme rettelse for at få status bekræftet.' :
        'Coveret kunne ikke bekræftes. Rettelsen er bevaret. Genoptag samme rettelse; vælg ikke et nyt billede, før denne er afsluttet eller annulleret.');
    } finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  return <section className="border-t border-white/10 px-5 py-4" aria-label="Rediger cover">
    <button type="button" disabled={disabled || loading} onClick={() => open ? setOpen(false) : void show()}
      aria-expanded={open} aria-controls={id} className="min-h-11 text-sm text-white/80 underline underline-offset-4 disabled:opacity-40">
      {open ? 'Luk coverredigering' : 'Rediger cover'}
    </button>
    {open && <form id={id} className="space-y-4 py-3" onSubmit={event => { event.preventDefault(); void submit(); }}>
      <p className="text-xs leading-6 text-white/60">Brug et officielt pressebillede og dets kildeside. Kreditering hentes fra kilden. Cover og mobilcover opdateres sammen. Ét billedtjek kan bruge API; artiklen researches ikke igen.</p>
      {(Object.keys(initial) as (keyof Fields)[]).map((key, index) => <label key={key} className="block text-sm text-white/80">
        {['Link til billedet', 'Link til kildesiden', 'Alt-tekst', 'Billedtekst'][index]}
        <input type={index < 2 ? 'url' : 'text'} required minLength={index < 2 ? undefined : 10}
          maxLength={index < 2 ? 2000 : key === 'alt' ? 240 : 350} value={fields[key]}
          disabled={loading || !!pending || !baseline} onChange={event => setFields(old => ({ ...old, [key]: event.target.value }))}
          className="apropos-input-dark mt-2 w-full min-w-0 rounded-xl border border-white/25 bg-[#141414] p-3 text-base text-white disabled:opacity-50" />
      </label>)}
      <button type="submit" disabled={disabled || loading || (!pending && !baseline)} className="min-h-12 w-full rounded-xl bg-white px-4 py-3 text-sm font-medium text-black disabled:opacity-40">
        {loading ? 'Arbejder…' : pending ? 'Genoptag samme coverrettelse' : 'Gem cover'}
      </button>
      {!pending && !baseline && !loading && <button type="button" onClick={() => void show()} className="min-h-11 underline">Prøv at hente igen</button>}
      {pending && <button type="button" disabled={disabled || loading} onClick={() => void submit(true)} className="min-h-11 text-sm underline disabled:opacity-40">Annuller, hvis CMS-gemningen ikke er startet</button>}
    </form>}
    {loading && <p role="status" className="text-sm text-white/60">{pending ? 'Behandler coverrettelsen…' : 'Henter historien…'}</p>}
    {message && <p role="status" className="py-2 text-sm leading-6 text-white/70">{message}</p>}
  </section>;
}
