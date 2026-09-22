'use client';

import { useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import type { ObservationBaseline } from '@/lib/liv/observation-contract';

const plain = (text: string) => text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
/** Deliberate opening only: no background requests and no AI calls. */
export default function LivObservations() {
  const { user } = useAuth();
  const [opened, setOpened] = useState(false), [busy, setBusy] = useState(false);
  const [stories, setStories] = useState<Array<{ runId: string; title: string }>>([]);
  const [baseline, setBaseline] = useState<ObservationBaseline | null>(null);
  const [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [event, setEvent] = useState(''), [date, setDate] = useState('');
  const [quote, setQuote] = useState(''), [observation, setObservation] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const pending = useRef(false);
  async function request(runId?: string, body?: object) {
    if (!user) throw Error('Log ind igen.');
    const response = await fetch(`/api/liv/observations${runId ? `?runId=${encodeURIComponent(runId)}` : ''}`, {
      method: body ? 'POST' : 'GET', cache: 'no-store', headers: {
        Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json',
      }, ...(body ? { body: JSON.stringify(body) } : {}),
    });
    if (!response.ok) throw Error(response.status === 409
      ? 'Teksten er ændret, lukket eller allerede bekræftet. Hent den aktuelle version, før du fortsætter.'
      : response.status === 400 ? 'Kontrollér dato, tekstudsnit og bekræftelse. Udsnittet skal være kopieret præcist fra artiklen.'
      : 'Oplevelsesnoterne kunne ikke hentes eller gemmes. Prøv igen.');
    return readJsonResponse(response);
  }
  async function act(fn: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true; setBusy(true); setError(''); setNotice('');
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : 'Prøv igen.'); }
    finally { pending.current = false; setBusy(false); }
  }
  async function select(runId: string) {
    setBaseline(null); setConfirmed(false); setQuote(''); setObservation(''); setEvent(''); setDate('');
    setBaseline(await request(runId) as ObservationBaseline);
  }
  const field = 'w-full rounded-lg border border-white/20 bg-[#141414] p-3 text-base text-white';
  return <section className="rounded-xl border border-white/15 p-4 text-sm text-white/75">
    <button type="button" disabled={busy} aria-expanded={opened} className="min-h-11 text-left underline underline-offset-4"
      onClick={() => { if (opened) setOpened(false); else { setOpened(true); void act(async () => { setStories((await request()).stories); }); } }}>
      {opened ? 'Luk oplevelsesnoter' : 'Bekræft egne oplevelser til Liv'}
    </button>
    {opened && <div className="space-y-4">
      <p>Kun historier under forberedelse. Du bekræfter dine egne oplysninger, ikke hele artiklen. Noterne deles med redaktionen og gemmes på denne tekstversion.</p>
      {!busy && !stories.length && <p>Ingen gemte tekster afventer oplevelsesnoter lige nu.</p>}
      <ul>{stories.map(story => <li key={story.runId}><button disabled={busy} type="button" className="min-h-11 text-left underline"
        onClick={() => void act(() => select(story.runId))}>{story.title}</button></li>)}</ul>
      {baseline && <div className="space-y-3">
        <h3 className="text-lg text-white">{baseline.title}</h3>
        <details><summary className="min-h-11 cursor-pointer">Læs den gemte artikel</summary>
          <p className="whitespace-pre-wrap leading-7">{plain(baseline.intro)} {plain(baseline.content)}</p></details>
        {baseline.confirmed ? <p role="status">Din bekræftelse er gemt på denne version. Den udgiver ikke artiklen.</p> : <>
          <p>Du bekræfter som {baseline.witness}. Udsnittet skal nævne dig ved dette navn. Ingen automatisk omskrivning.</p>
          <label className="block">Arrangement/værk og set omfang<input className={field} value={event} maxLength={200} onChange={e => setEvent(e.target.value)} disabled={busy} /></label>
          <label className="block">Dato for oplevelsen<input type="date" className={field} value={date} onChange={e => setDate(e.target.value)} disabled={busy} /></label>
          <label className="block">Præcist tekstudsnit du kan bekræfte<textarea rows={3} className={field} value={quote} maxLength={600} onChange={e => setQuote(e.target.value)} disabled={busy} /></label>
          <label className="block">Hvad oplevede du konkret?<textarea rows={4} className={field} value={observation} maxLength={600} onChange={e => setObservation(e.target.value)} disabled={busy} /></label>
          <label className="flex min-h-11 items-start gap-3"><input type="checkbox" className="mt-1" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} disabled={busy} />
            Jeg bekræfter min egen oplevelse og deler oplysningerne med Apropos-redaktionen. Bekræftelsen gemmes som et uændret kilderecord for denne version.</label>
          <button type="button" disabled={busy || !confirmed || !date || event.trim().length < 5 || quote.trim().length < 20 || observation.trim().length < 20}
            className="min-h-12 rounded-xl bg-white px-4 py-3 text-[#000000] disabled:opacity-40" onClick={() => void act(async () => {
              await request(undefined, { runId: baseline.runId, expectedCheckpointHash: baseline.checkpointHash, event,
                experiencedOn: date, articleQuote: quote, observation, confirmOwnExperience: true, shareWithEditorial: true });
              setBaseline(await request(baseline.runId) as ObservationBaseline);
              setNotice('Bekræftelsen er gemt. Liv kan bruge den ved næste normale faktakontrol. Intet er udgivet, og ingen AI er bestilt.');
            })}>Gem min bekræftelse</button>
        </>}
      </div>}
      {busy && <p role="status">Henter eller gemmer…</p>}
      {error && <p role="alert" className="text-amber-200">{error}</p>}
      {notice && <p role="status">{notice}</p>}
    </div>}
  </section>;
}
