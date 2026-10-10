'use client';
import { useCallback, useEffect, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
const button = 'min-h-12 rounded-xl border border-white/20 px-5 py-3 hover:bg-white/10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40';
type Article = { title: string; subtitle?: string; intro?: string; content: string; seoTitle?: string; seoDescription?: string;
  category?: string; author?: string; rating?: number; ratingReason?: string; articleFormat?: string; slug?: string };
type State = {
  dependencyError?: string | null;
  row: { revision: number; status: string; article: Article; questions: Array<{ field: string; question: string }>;
    imageSelection?: { required: boolean; accepted: boolean; selectionHash: string;
      items: Array<{ assetId: string; url: string; role: string }>; warnings: Array<{ assetId: string; message: string }> };
    displayNames?: { author?: string; category?: string };
    missingMetadata: string[]; blocker?: string; publication?: { receipt?: { publicUrl?: string }; publishAt?: string } };
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
  const refresh = useCallback(async () => {
    if (!user) return;
    setBusy(true); setError('');
    try {
      const res = await fetch(`/api/editorial/submissions?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!res.ok) throw Error();
      setState(await res.json()); setChecked(false); setImageFailed(false);
    } catch { setError('Forløbet kunne ikke hentes. Genindlæs status; start ikke en ny bestilling.'); }
    finally { setBusy(false); }
  }, [id, user]);
  useEffect(() => { void refresh(); }, [refresh]);
  async function act() {
    if (!user || !state || !checked || busy || (state.row.imageSelection?.required && imageFailed)) return;
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
  const { row, quote, preview } = state, article = preview?.article || row.article;
  const text = (s: string) => s.replace(/<\/(?:p|h2|h3|figure)>/g, '\n\n').replace(/<[^>]*>/g, ' ');
  return <section className="space-y-5" aria-label="Klargør artikel">
    <h2 className="text-2xl leading-tight">{article.title}</h2>
    {state.dependencyError && <p role="alert">{state.dependencyError}</p>}
    {article.subtitle && <p className="leading-relaxed text-white/70">{text(article.subtitle)}</p>}
    {row.imageSelection?.warnings.map(warning => <p role="status" key={warning.assetId}>{warning.message}{row.imageSelection?.accepted ? ' Dit personlige billedvalg er gemt for denne version.' : ''}</p>)}
    {row.imageSelection?.required ? <>
      {row.imageSelection.items.map(asset => <figure key={asset.assetId}>
        <Image unoptimized src={asset.url} alt={asset.role === 'cover' ? 'Valgt cover til gennemgang' : 'Valgt illustration til gennemgang'} width={960} height={540} onError={() => setImageFailed(true)} className="h-auto w-full rounded-xl" />
      </figure>)}
      <p>En hash-sammenligning er ikke bevis for billedgeneratorens faktiske input. Dit valg her godkender kun de viste billeder, ikke udgivelse eller betalte trin.</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Jeg har set billederne og vil bruge dem i denne version.</label>
      {imageFailed && <p role="alert">Et billede kunne ikke vises. Genindlæs før dit billedvalg.</p>}
      <button className={button} disabled={busy || !checked || imageFailed} onClick={() => void act()}>Jeg vælger disse billeder</button>
    </> : row.status === 'published' ? <p role="status">Artiklen har en verificeret udgivelseskvittering. <a className="underline" href={row.publication?.receipt?.publicUrl} target="_blank" rel="noreferrer">Åbn artiklen</a></p>
      : row.status === 'scheduled' ? <p role="status">Godkendt til udgivelse {row.publication?.publishAt ? new Date(row.publication.publishAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' }) : ''}. Serveren fortsætter, selv om du lukker chatten.</p>
      : row.status === 'processing' ? <p role="status">Klargør billeder og kontroller. Dit arbejde gemmes undervejs. Artiklen er ikke publiceret.</p>
      : row.status === 'blocked' ? <p role="alert">Arbejdet er gemt, men kræver opfølgning: {row.blocker}. Bed ChatGPT hente status for dette forløb.</p>
      : preview?.ready ? <>
        {preview.assets.slice(0, 1).map((asset, index) => <figure key={asset.url}>
          <Image unoptimized src={asset.url} alt={asset.alt} width={960} height={540} className="h-auto w-full rounded-xl" />
          <figcaption className="mt-2 text-sm text-white/60">{index === 0 ? 'Cover. ' : ''}{asset.caption} {asset.credit}</figcaption>
        </figure>)}
        <details className="border-y border-white/15 py-4"><summary>Læs hele artiklen</summary>
          {article.intro && <p className="mt-4 leading-relaxed">{text(article.intro)}</p>}
          <div className="mt-4 space-y-5 leading-relaxed">{preview.blocks.map((block, index) => block.kind === 'image' && block.url ? <figure key={index}>
            <Image unoptimized src={block.url} alt={block.alt || ''} width={960} height={540} className="h-auto w-full rounded-xl" />
            <figcaption className="mt-2 text-sm text-white/60">{block.caption}</figcaption>
          </figure> : <p key={index}>{block.text}</p>)}</div>
        </details>
        <details><summary>SEO og metadata</summary><p className="mt-3">{article.seoTitle}</p><p className="mt-2 text-white/65">{article.seoDescription}</p>
          <dl className="mt-3 space-y-2"><div><dt>Forfatter</dt><dd>{row.displayNames?.author || article.author}</dd></div><div><dt>Kategori</dt><dd>{row.displayNames?.category || article.category}</dd></div>
            <div><dt>Format</dt><dd>{article.articleFormat}</dd></div><div><dt>URL-navn</dt><dd>{article.slug}</dd></div>
            {article.rating !== undefined && <div><dt>Bedømmelse</dt><dd>{article.rating}/6 · {article.ratingReason}</dd></div>}</dl>
        </details>
        <label className="flex gap-3"><input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} />Planlæg udgivelse</label>
        {schedule && <label className="block">Dato og klokkeslæt i København<input className="mt-2 block min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>}
        <label className="flex items-start gap-3 leading-6"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Jeg har kontrolleret tekst, billeder og metadata og godkender denne version til udgivelse.</label>
        <button className={`${button} w-full bg-white/10`} disabled={busy || !checked || (schedule && !when)} onClick={() => void act()}>{schedule ? 'Godkend og planlæg' : 'Godkend og udgiv nu'}</button>
      </> : <>
        {row.questions.length > 0 && <div><p>Afklar i chatten:</p><ul className="mt-2 list-disc space-y-2 pl-5 text-white/70">{row.questions.map(q => <li key={q.field}>{q.question}</li>)}</ul></div>}
        {row.missingMetadata.length > 0 && <p className="text-white/65">Chatten skal udfylde: {row.missingMetadata.join(', ')}.</p>}
        {quote && <>
          <p>{quote.humanReview ? 'ChatGPT-produktion: 0 kr. i backend-AI-kald.' : `Estimeret klargøring: ${quote.estimateDkk.toFixed(2)} kr.`}</p>
          <p className="text-sm text-white/65">{quote.humanReview ? 'Tekst, research og billeder laves i ChatGPT. Abonnementets forbrug og almindelig hosting er ikke medregnet. Ingen betalt AI-fallback.' : `Samlet reservationsloft: ${(quote.ceilingDkkMicros / 1e6).toFixed(2)} kr. Det er et sikkerhedsloft, ikke en faktura. Ingen automatisk genbestilling.`}</p>
          <details><summary>Se hvad beløbet dækker</summary><ul className="mt-3 space-y-2">{quote.lines.map(line => <li key={line.step}>{line.step}: {line.estimateDkk.toFixed(2)} kr. estimeret</li>)}</ul></details>
          {quote.provider.blocked && !quote.humanReview ? <p role="alert">Betalte trin er stoppet af den gemte providerblokering. Tekst og svar er bevaret; der bestilles intet. Du kan bede chatten om klargøring med menneskelig slutkontrol uden AI-kald.</p> : <>
            <label className="flex items-start gap-3 leading-6"><input className="mt-1 h-5 w-5 shrink-0" type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />{quote.humanReview ? 'Jeg bekræfter den redaktionelle kontrol og vil klargøre denne version uden betalte AI-kald. Dette publicerer ikke artiklen.' : 'Klargør denne version inden for det viste loft. Dette publicerer ikke artiklen.'}</label>
            {quote.humanReview && <p>AI-slutkontrol køres ikke. Du overtager den redaktionelle og visuelle kontrol; tekniske CMS- og filkontroller bevares.</p>}
            <button className={`${button} w-full bg-white/10`} disabled={busy || !checked || !quote.canAccept} onClick={() => void act()}>{quote.humanReview ? 'Klargør uden AI-slutkontrol' : 'Acceptér og klargør'}</button>
          </>}
        </>}
      </>}
    {error && <p role="alert" className="text-red-200">{error}</p>}
    <button className={button} disabled={busy} onClick={() => void refresh()}>Kontrollér status</button>
  </section>;
}
