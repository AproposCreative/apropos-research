'use client';
import { useEffect, useId, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';

type Baseline = { itemId: string; expectedCmsHash: string; expectedPayloadHash: string;
  wordCount: number; minTargetWords: number; maxTargetWords: number; suggestedTargetWords: number };
type Request = Pick<Baseline, 'itemId' | 'expectedCmsHash' | 'expectedPayloadHash'> & { requestId: string; targetWords: number };
type Pending = { request: Request; review?: { candidateHash: string; reviewedFactsAndMeaning: true } };
type Preview = { content: string; candidateHash: string; beforeWords: number; afterWords: number; status: string };
const endpoint = '/api/liv/revisions/shortening';

export default function LivShorteningEditor(props: { itemId: string; disabled?: boolean; onSaved: () => void }) {
  const { user, capabilities } = useAuth();
  if (!user || !capabilities.owner) return null;
  return <Editor key={`${user.uid}:${props.itemId}`} {...props} uid={user.uid} getToken={() => user.getIdToken()} />;
}
function Editor({ itemId, uid, getToken, disabled, onSaved }: {
  itemId: string; uid: string; getToken: () => Promise<string>; disabled?: boolean; onSaved: () => void;
}) {
  const id = useId(), epoch = useRef(0), busy = useRef(false);
  const [open, setOpen] = useState(false), [loading, setLoading] = useState(false);
  const [baseline, setBaseline] = useState<Baseline | null>(null), [target, setTarget] = useState(500);
  const [pending, setPending] = useState<Pending | null>(null), [preview, setPreview] = useState<Preview | null>(null);
  const [paragraphs, setParagraphs] = useState<string[]>([]), [reviewed, setReviewed] = useState(false);
  const [message, setMessage] = useState('');
  const storageKey = `liv-shortening:v1:${encodeURIComponent(uid)}:${itemId}`;
  useEffect(() => { epoch.current++; return () => { epoch.current++; }; }, []);
  async function call(suffix: string, body?: object) {
    const current = epoch.current, token = await getToken();
    if (current !== epoch.current) throw new Error('account_changed');
    return readJsonResponse(await fetch(`${endpoint}${suffix}`, { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) }));
  }
  async function run(action: (current: number) => Promise<void>) {
    if (busy.current || disabled) return;
    const current = epoch.current; busy.current = true; setLoading(true); setMessage('');
    try { await action(current); }
    catch { if (current === epoch.current) setMessage('Kunne ikke bekræfte handlingen. Et afsendt forslag er bevaret. Prøv samme handling igen; der bestilles ikke et nyt forslag.'); }
    finally { if (current === epoch.current) { busy.current = false; setLoading(false); } }
  }
  function show() {
    setOpen(true);
    if (baseline || pending) return;
    void run(async current => {
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const saved = JSON.parse(raw) as Pending, req = saved.request;
        if (!req || req.itemId !== itemId || !/^[a-zA-Z0-9_-]{8,100}$/.test(req.requestId) ||
          !/^[a-f0-9]{64}$/.test(req.expectedCmsHash) || !/^[a-f0-9]{64}$/.test(req.expectedPayloadHash) ||
          !Number.isInteger(req.targetWords) || req.targetWords < 450 || req.targetWords > 650 ||
          (saved.review && (saved.review.reviewedFactsAndMeaning !== true || !/^[a-f0-9]{64}$/.test(saved.review.candidateHash))))
          throw new Error('invalid_saved_request');
        setPending(saved); setTarget(req.targetWords);
        setMessage(saved.review ? 'Din accepterede rettelse mangler bekræftelse. Fortsæt samme gemning.' : 'Der findes et gemt forslag. Hent det igen uden en ny bestilling.');
        return;
      }
      const data = await call(`?itemId=${itemId}`) as Baseline;
      if (current !== epoch.current) return;
      if (data.itemId !== itemId || !Number.isInteger(data.suggestedTargetWords) || data.minTargetWords !== 450 || data.maxTargetWords > 650)
        throw new Error('invalid_baseline');
      setBaseline(data); setTarget(data.suggestedTargetWords);
    });
  }
  function generate() {
    if ((!baseline && !pending) || pending?.review) return;
    void run(async current => {
      const next: Pending = pending || { request: { itemId, requestId: crypto.randomUUID(), targetWords: target,
        expectedCmsHash: baseline!.expectedCmsHash, expectedPayloadHash: baseline!.expectedPayloadHash } };
      localStorage.setItem(storageKey, JSON.stringify(next)); setPending(next);
      const result = await call('', next.request) as Preview;
      if (current !== epoch.current) return;
      if (result.status !== 'preview' || typeof result.content !== 'string' || !/^[a-f0-9]{64}$/.test(result.candidateHash)) throw new Error('invalid_preview');
      // Render text nodes only, never execute or insert generated HTML.
      const doc = new DOMParser().parseFromString(result.content, 'text/html');
      doc.querySelectorAll('script,style,iframe,template').forEach(node => node.remove());
      setParagraphs(Array.from(doc.querySelectorAll('p,h2,h3,figcaption,blockquote')).filter(node =>
        !node.parentElement?.closest('p,blockquote')).map(node => node.textContent || '').filter(Boolean));
      setPreview(result); setReviewed(false);
    });
  }
  function accept() {
    if (!pending || (!pending.review && (!preview || !reviewed))) return;
    void run(async current => {
      const next: Pending = pending.review ? pending : { ...pending, review: { candidateHash: preview!.candidateHash, reviewedFactsAndMeaning: true } };
      localStorage.setItem(storageKey, JSON.stringify(next)); setPending(next);
      const body = { ...next.request, ...next.review };
      await call('/review', body);
      if (current !== epoch.current) return;
      const receipt = await call('/accept', body);
      if (current !== epoch.current) return;
      if (receipt.status !== 'shortening_staged' || receipt.itemId !== itemId || receipt.candidateHash !== next.review!.candidateHash || receipt.publicationVerified !== false)
        throw new Error('invalid_receipt');
      localStorage.removeItem(storageKey); setPending(null); setPreview(null); setBaseline(null); setReviewed(false); setOpen(false);
      setMessage('Forkortelsen er gemt i kladden. Denne rettelse udgiver ikke artiklen.'); onSaved();
    });
  }
  return <section className="border-t border-white/10 px-5 py-4" aria-label="Forkort artikel">
    <button type="button" aria-expanded={open} aria-controls={id} disabled={disabled || loading}
      onClick={() => open ? setOpen(false) : show()} className="min-h-11 text-sm text-white/80 underline underline-offset-4 disabled:opacity-40">
      {open ? 'Luk forkortelse' : 'Forkort artikel'}
    </button>
    {open && <div id={id} className="space-y-4 py-3">
      <p className="text-sm leading-6 text-white/60">Ét forslag fra den eksisterende tekst. Ingen ny research. Læs forslaget før du accepterer; billeder og credits bevares.</p>
      {baseline && <label className="block text-sm">Ønsket maksimum ({baseline.wordCount} ord nu)
        <input type="number" min={baseline.minTargetWords} max={baseline.maxTargetWords} step={1} value={target}
          disabled={loading || !!pending} onChange={event => setTarget(Number(event.target.value))}
          className="mt-2 w-full rounded-xl border border-white/25 bg-[#141414] p-3 text-base text-white" />
      </label>}
      {!pending?.review && <button type="button" onClick={generate} disabled={disabled || loading || (!baseline && !pending) ||
        (!pending && (!Number.isInteger(target) || target < baseline!.minTargetWords || target > baseline!.maxTargetWords))}
        className="min-h-12 w-full rounded-xl border border-white/25 p-3 disabled:opacity-40">{pending ? 'Hent samme forslag igen' : 'Lav forkortelsesforslag'}</button>}
      {preview && <>
        <p className="text-sm text-white/70">{preview.beforeWords} → {preview.afterWords} ord</p>
        <div className="space-y-4 break-words rounded-xl border border-white/15 p-4 text-base leading-7" aria-label="Forkortet tekst">
          {paragraphs.map((paragraph, index) => <p key={index}>{paragraph}</p>)}
        </div>
        <label className="flex items-start gap-3 text-sm leading-6"><input type="checkbox" checked={reviewed} disabled={loading || !!pending?.review}
          onChange={event => setReviewed(event.target.checked)} className="mt-1 h-5 w-5 shrink-0" />Jeg har læst den forkortede tekst og kontrolleret fakta og mening.</label>
      </>}
      {(preview || pending?.review) && <button type="button" onClick={accept} disabled={disabled || loading || (!pending?.review && !reviewed)}
        className="min-h-12 w-full rounded-xl bg-white p-3 font-medium text-black disabled:opacity-40">{pending?.review ? 'Fortsæt samme gemning' : 'Acceptér og gem forkortelsen'}</button>}
      {!baseline && !pending && <button type="button" disabled={loading} onClick={show} className="min-h-11 underline">Hent historien igen</button>}
    </div>}
    {loading && <p role="status" className="text-sm text-white/60">Arbejder… Dit forslag gemmes til genoptagelse.</p>}
    {message && <p role="status" className="py-2 text-sm leading-6 text-white/70">{message}</p>}
  </section>;
}
