'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import ArticleReading from './article-reading';
import type { ArticleReadingPreview } from '@/lib/editorial/submission-preview';
const button = 'min-h-12 rounded-xl border border-white/20 px-5 py-3 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
type Article = { title: string; subtitle?: string; intro?: string; content: string; seoTitle?: string; seoDescription?: string;
  category?: string; author?: string; rating?: number; ratingReason?: string; articleFormat?: string; slug?: string };
type State = {
  reading: ArticleReadingPreview;
  dependencyError?: string | null;
  row: { revision: number; status: string; article: Article; questions: Array<{ field: string; question: string }>;
    imageSelection?: { required: boolean; accepted: boolean; selectionHash: string;
      items: Array<{ assetId: string; url: string; role: string }>; warnings: Array<{ assetId: string; message: string }> };
    displayNames?: { author?: string; category?: string };
    missingMetadata: string[]; missingMedia?: string[]; blocker?: string; publication?: { receipt?: { publicUrl?: string }; publishAt?: string } };
  quote: null | { quoteId: string; canAccept: boolean; estimateDkk: number; ceilingDkkMicros: number; humanReview?: boolean;
    lines: Array<{ step: string; estimateDkk: number }>; provider: { blocked: boolean } };
  preview: null | { ready: boolean; preparedHash: string; article: Article;
    blocks: Array<{ kind: 'text' | 'image'; text?: string; url?: string; alt?: string; caption?: string }>;
    assets: Array<{ url: string; alt: string; caption: string; credit: string }> };
};
export default function SubmissionConfirmation({ id }: { id: string }) {
  const { user } = useAuth();
  const [state, setState] = useState<State | null>(null), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const [checked, setChecked] = useState(false), [schedule, setSchedule] = useState(false), [when, setWhen] = useState('');
  const [imageFailed, setImageFailed] = useState(false);
  const requestSequence = useRef(0);
  const refresh = useCallback(async () => {
    if (!user) return;
    const sequence = ++requestSequence.current;
    setBusy(true); setError(''); setChecked(false);
    try {
      const res = await fetch(`/api/editorial/submissions?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!res.ok) throw Error();
      const next = await res.json();
      if (sequence === requestSequence.current) { setState(next); setImageFailed(false); }
    } catch { if (sequence === requestSequence.current) { setState(null); setError('Forløbet kunne ikke hentes. Genindlæs status; start ikke en ny bestilling.'); } }
    finally { if (sequence === requestSequence.current) setBusy(false); }
  }, [id, user]);
  useEffect(() => { setState(null); void refresh(); return () => { requestSequence.current++; }; }, [refresh]);
  async function act() {
    if (!user || !state || !checked || busy || imageFailed || state.dependencyError) return;
    setBusy(true); setError('');
    try {
      const body = state.row.imageSelection?.required
        ? { action: 'accept_media', id, revision: state.row.revision, selectionHash: state.row.imageSelection.selectionHash }
        : state.preview?.ready
        ? { action: 'publish', id, preparedHash: state.preview.preparedHash, localTime: schedule ? when : 'now' }
        : { action: 'accept_quote', id, revision: state.row.revision, quoteId: state.quote?.quoteId };
      const res = await fetch('/api/editorial/submissions', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw Error();
      await refresh();
    } catch { setError('Handlingen er ikke bekræftet. Kontrollér status før du prøver igen. Ved ændret artikel skal du se et nyt preview.'); }
    finally { setBusy(false); }
  }
  if (!state) return <section aria-live="polite"><p>{error || 'Henter din artikel …'}</p><button className={`${button} mt-4`} disabled={busy} onClick={() => void refresh()}>Genindlæs</button></section>;
  const { row, quote, preview } = state;
  return <section className="space-y-5" aria-label="Læs og godkend artikel">
    <nav className="flex flex-wrap justify-between gap-3 text-sm text-white/65"><Link className="underline underline-offset-4" href="/connect/chatgpt?review=1">Alle kladder</Link><span>Version {row.revision} · {row.status === 'published' ? 'Udgivelseskvittering gemt' : 'Privat preview'}</span></nav>
    <ArticleReading article={state.reading} onImageError={() => setImageFailed(true)} />
    <div className="mx-auto max-w-[42rem] space-y-5 border-t border-white/20 pt-7">
    <h3 className="text-xl font-medium">Næste skridt</h3>
    {state.dependencyError && <p role="alert">{state.dependencyError}</p>}
    {imageFailed && <p role="alert">Et billede kunne ikke vises. Genindlæs før godkendelse.</p>}
    {row.imageSelection?.warnings.map(warning => <p role="status" key={warning.assetId}>{warning.message}{row.imageSelection?.accepted ? ' Dit personlige billedvalg er gemt for denne version.' : ''}</p>)}
    {row.imageSelection?.required ? <>
      {row.imageSelection.items.map(asset => <figure key={asset.assetId}>
        <Image unoptimized src={asset.url} alt={asset.role === 'cover' ? 'Valgt cover til gennemgang' : 'Valgt illustration til gennemgang'} width={960} height={540} onError={() => setImageFailed(true)} className="h-auto w-full rounded-xl" />
      </figure>)}
      <p>En hash-sammenligning er ikke bevis for billedgeneratorens faktiske input. Dit valg her godkender kun de viste billeder, ikke udgivelse eller betalte trin.</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Jeg har set billederne og vil bruge dem i denne version.</label>
      {imageFailed && <p role="alert">Et billede kunne ikke vises. Genindlæs før dit billedvalg.</p>}
      <button className={button} disabled={busy || !checked || imageFailed || !!state.dependencyError} onClick={() => void act()}>Jeg vælger disse billeder</button>
    </> : row.status === 'published' ? <p role="status">Artiklen har en verificeret udgivelseskvittering. <a className="underline" href={row.publication?.receipt?.publicUrl} target="_blank" rel="noreferrer">Åbn artiklen</a></p>
      : row.status === 'scheduled' ? <p role="status">Godkendt til udgivelse {row.publication?.publishAt ? new Date(row.publication.publishAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' }) : ''}. Serveren fortsætter, selv om du lukker chatten.</p>
      : row.status === 'processing' ? <p role="status">Klargør billeder og kontroller. Dit arbejde gemmes undervejs. Artiklen er ikke publiceret.</p>
      : row.status === 'blocked' ? <p role="alert">Arbejdet er gemt, men kræver opfølgning: {row.blocker}. Bed ChatGPT hente status for dette forløb.</p>
      : row.status === 'prepared' && !preview?.ready ? <p role="alert">Den gemte artikel vises ovenfor, men de aktuelle CMS-kontroller tillader endnu ikke udgivelse. Bed ChatGPT kontrollere denne version; der oprettes ikke en ny artikel.</p>
      : preview?.ready ? <>
        <label className="flex gap-3"><input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} />Planlæg udgivelse</label>
        {schedule && <label className="block">Dato og klokkeslæt i København<input className="mt-2 block min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>}
        <label className="flex items-start gap-3 leading-6"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Jeg har kontrolleret tekst, billeder og metadata og godkender denne version til udgivelse.</label>
        <button className={`${button} w-full bg-white/10`} disabled={busy || !checked || imageFailed || !!state.dependencyError || (schedule && !when)} onClick={() => void act()}>{schedule ? 'Godkend og planlæg' : 'Godkend og udgiv nu'}</button>
      </> : <>
        {row.questions.length > 0 && <div><p>Afklar i chatten:</p><ul className="mt-2 list-disc space-y-2 pl-5 text-white/70">{row.questions.map(q => <li key={q.field}>{q.question}</li>)}</ul></div>}
        {row.missingMetadata.length > 0 && <p className="text-white/65">Chatten skal udfylde: {row.missingMetadata.join(', ')}.</p>}
        {!!row.missingMedia?.length && <p className="text-white/65">Billeder mangler: {row.missingMedia.map(role => ({ cover: 'cover', 'body-1': 'første brødtekstbillede', 'body-2': 'andet brødtekstbillede' })[role] || role).join(', ')}. Teksten kan læses nu; klargøring må vente.</p>}
        {quote && <>
          {quote.humanReview ? <p className="text-white/70">Læs teksten, se billederne og kontrollér kilderne i chatten. Derefter kan du godkende den redaktionelle version til teknisk klargøring. Artiklen udgives ikke endnu.</p> : <><p>Estimeret klargøring: {quote.estimateDkk.toFixed(2)} kr.</p><p>Samlet reservationsloft: {(quote.ceilingDkkMicros / 1e6).toFixed(2)} kr. Ingen automatisk genbestilling.</p></>}
          <details className="text-sm text-white/60"><summary>Tekniske kontroller og omkostninger</summary><p className="mt-3">{quote.humanReview ? 'Ingen betalte AI-kald. Du står for den redaktionelle kontrol. Serveren kontrollerer CMS og billedfiler. Abonnement og hosting er ikke medregnet.' : 'Estimater er ikke fakturaer.'}</p><ul className="mt-3 space-y-2">{quote.lines.map(line => <li key={line.step}>{line.step}: {line.estimateDkk.toFixed(2)} kr. estimeret</li>)}</ul></details>
          {quote.provider.blocked && !quote.humanReview ? <p role="alert">Betalte trin er stoppet af den gemte providerblokering. Tekst og svar er bevaret; der bestilles intet. Du kan bede chatten om klargøring med menneskelig slutkontrol uden AI-kald.</p> : <>
            <label className="flex items-start gap-3 leading-6"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />{quote.humanReview ? 'Jeg har kontrolleret tekst, kilder, billeder og metadata og godkender denne version til klargøring.' : 'Klargør denne version inden for det viste loft. Dette publicerer ikke artiklen.'}</label>
            <button className={`${button} w-full bg-white/10`} disabled={busy || !checked || !quote.canAccept || imageFailed || !!state.dependencyError} onClick={() => void act()}>{quote.humanReview ? 'Godkend og klargør' : 'Acceptér og klargør'}</button>
          </>}
        </>}
      </>}
    {error && <p role="alert" className="text-red-200">{error}</p>}
    <button className={button} disabled={busy} onClick={() => void refresh()}>Kontrollér status</button>
    </div>
  </section>;
}
