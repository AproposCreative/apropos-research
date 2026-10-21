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
type Candidate = { assetId: string; originalHash: string; alt: string; role: string; revision: number; current: boolean; selected: boolean; historyWarning?: string };
type State = {
  candidatePreviews?: Record<string, string>;
  consent?: { id: string; includesPersonalImageSelection: boolean } | null;
  reading: ArticleReadingPreview;
  dependencyError?: string | null;
  row: { revision: number; status: string; executionPolicy?: string; approvalState?: string; publicationConsent?: { id: string }; publicationConsentPending?: boolean; article: Article; questions: Array<{ field: string; question: string }>;
    imageDeclines?: Array<{ assetId: string; originalHash: string }>;
    imageCandidates?: Candidate[];
    imageSelection?: { required: boolean; accepted: boolean; selectionHash: string;
      items: Array<{ assetId: string; hash: string; url: string; role: string }>; warnings: Array<{ assetId: string; message: string }> };
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
  const [view, setView] = useState<'images' | 'article' | null>(null);
  const [imageStates, setImageStates] = useState<Record<string, 'loaded' | 'failed'>>({});
  const [notice, setNotice] = useState('');
  const [activeAsset, setActiveAsset] = useState<string | null>(null);
  const requestSequence = useRef(0);
  const actionPending = useRef(false);
  const refresh = useCallback(async () => {
    if (!user) return;
    const sequence = ++requestSequence.current;
    setBusy(true); setError(''); setChecked(false);
    try {
      const res = await fetch(`/api/editorial/submissions?id=${encodeURIComponent(id)}`, { headers: { Authorization: `Bearer ${await user.getIdToken()}` }, cache: 'no-store' });
      if (!res.ok) throw Error();
      const next = await res.json();
      if (sequence === requestSequence.current) { setState(next); setImageFailed(false); return next as State; }
    } catch { if (sequence === requestSequence.current) { setState(null); setError('Forløbet kunne ikke hentes. Genindlæs status; start ikke en ny bestilling.'); } }
    finally { if (sequence === requestSequence.current) setBusy(false); }
  }, [id, user]);
  useEffect(() => { setState(null); void refresh(); return () => { requestSequence.current++; }; }, [refresh]);
  const status = state?.row.status;
  const consentPending = !!state?.row.publicationConsentPending && ['processing', 'prepared'].includes(status || '');
  useEffect(() => {
    if (!status || (!['processing', 'scheduled'].includes(status) && !consentPending)) return;
    const started = Date.now();
    const timer = setInterval(() => { if (Date.now() - started < 120_000) void refresh(); else clearInterval(timer); }, 5000);
    return () => clearInterval(timer);
  }, [status, consentPending, refresh]);
  async function act(candidate?: Candidate, imageDecision: 'select' | 'decline' = 'select') {
    if (!user || !state || busy || actionPending.current || state.dependencyError) return;
    if (candidate ? !candidate.current || imageStates[candidate.assetId + candidate.originalHash] !== 'loaded'
      : imageFailed || !!state.row.imageCandidates?.length || (!state.consent && !checked)) return;
    actionPending.current = true;
    if (candidate) setView('images');
    setBusy(true); setError(''); setNotice(''); setActiveAsset(candidate?.assetId || null);
    const confirmedChoice = (current?: State) => candidate && (imageDecision === 'decline'
      ? current?.row.imageDeclines?.some(d => d.assetId === candidate.assetId && d.originalHash === candidate.originalHash)
      : current?.row.imageSelection?.items.some(a => a.assetId === candidate.assetId && a.hash === candidate.originalHash));
    try {
      const body = candidate ? { action: imageDecision === 'decline' ? 'decline_image_candidate' : 'select_image_candidate', id, revision: candidate.revision, assetId: candidate.assetId, originalHash: candidate.originalHash }
        : state.consent ? { action: 'approve_publish', id, revision: state.row.revision, consentId: state.consent.id, localTime: schedule ? when : 'now' }
        : state.row.imageSelection?.required
        ? { action: 'accept_media', id, revision: state.row.revision, selectionHash: state.row.imageSelection.selectionHash }
        : state.preview?.ready
        ? { action: 'publish', id, preparedHash: state.preview.preparedHash, localTime: schedule ? when : 'now' }
        : { action: 'accept_quote', id, revision: state.row.revision, quoteId: state.quote?.quoteId };
      const res = await fetch('/api/editorial/submissions', { method: 'POST', headers: { Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!res.ok) throw Error();
      const current = await refresh();
      if (candidate && !confirmedChoice(current)) throw Error('Unconfirmed image choice');
      if (candidate) setNotice(imageDecision === 'decline' ? 'Billedet er fravalgt. Originalen er bevaret i historikken.' : 'Billedet er godkendt og sat ind i artiklen. Artiklen er ikke udgivet.');
    } catch {
      const current = await refresh();
      const confirmed = confirmedChoice(current);
      if (confirmed) setNotice(imageDecision === 'decline' ? 'Billedet er fravalgt. Originalen er bevaret i historikken.' : 'Billedet er godkendt og sat ind i artiklen. Artiklen er ikke udgivet.');
      else
        setError('Handlingen er ikke bekræftet. Kontrollér status før du prøver igen. Ved ændret artikel skal du se et nyt preview.');
    } finally { actionPending.current = false; setBusy(false); setActiveAsset(null); }
  }
  if (!state) return <section aria-live="polite"><p>{error || 'Henter din artikel …'}</p><button className={`${button} mt-4`} disabled={busy} onClick={() => void refresh()}>Genindlæs</button></section>;
  const { row, quote, preview } = state;
  const candidates = row.imageCandidates || [];
  const showingImages = (view || (candidates.length ? 'images' : 'article')) === 'images';
  const bodyCount = state.reading.blocks.filter(block => block.kind === 'image').length;
  return <section className="space-y-5" aria-label="Læs og godkend artikel">
    <nav className="flex flex-wrap justify-between gap-3 text-sm text-white/65"><Link className="underline underline-offset-4" href="/connect/chatgpt?review=1">Alle kladder</Link><span>Version {row.revision} · {row.status === 'published' ? 'Udgivelseskvittering gemt' : 'Privat preview'}</span></nav>
    <nav aria-label="Artikel og billedvalg" className="flex flex-wrap gap-3">
      <button className={`${button} ${showingImages ? 'bg-white text-[#080808] hover:bg-white/90' : ''}`} aria-pressed={showingImages} onClick={() => setView('images')}>Vælg billeder{candidates.length ? ` (${candidates.length})` : ''}</button>
      <button className={`${button} ${!showingImages ? 'bg-white text-[#080808] hover:bg-white/90' : ''}`} aria-pressed={!showingImages} onClick={() => setView('article')}>Læs artikel</button>
    </nav>
    {notice && <p role="status" className="border-l-2 border-white pl-4 leading-7">{notice}</p>}
    {showingImages ? <div className="mx-auto max-w-[42rem] space-y-6">
      <header className="space-y-3">
        <h2 className="text-2xl font-medium">Vælg billeder til artiklen</h2>
        <p className="text-white/75">{row.article.title}</p>
        <p className="leading-7">Godkend eller fravælg hvert forslag nedenfor. Kun det billede, du trykker på, bliver valgt. Det udgiver ikke artiklen.</p>
        <p className="text-sm text-white/65">I artiklen nu: {state.reading.featuredImage ? 'cover' : 'intet cover'} og {bodyCount} billeder i teksten.</p>
      </header>
      {(['cover', 'body'] as const).map(role => {
        const group = candidates.filter(candidate => candidate.role === role);
        if (!group.length) return null;
        return <section key={role} aria-label={role === 'cover' ? 'Coverforslag' : 'Forslag til teksten'} className="space-y-5">
          <h3 className="border-b border-white/20 pb-3 text-lg font-medium">{role === 'cover' ? 'Coverforslag' : 'Billeder til teksten'}</h3>
          {group.map(candidate => {
            const key = candidate.assetId + candidate.originalHash;
            const usable = candidate.current && imageStates[key] === 'loaded' && !!state.candidatePreviews?.[candidate.assetId];
            return <figure key={key} aria-label={candidate.alt} className="space-y-3 border-b border-white/15 pb-6">
              {state.candidatePreviews?.[candidate.assetId] && <Image unoptimized src={state.candidatePreviews[candidate.assetId]} alt={candidate.alt} width={1000} height={800} className="h-auto w-full rounded-lg"
                onLoad={() => setImageStates(previous => ({ ...previous, [key]: 'loaded' }))}
                onError={() => setImageStates(previous => ({ ...previous, [key]: 'failed' }))} />}
              <figcaption className="space-y-2 text-sm leading-6 text-white/70">
                <p>{candidate.alt}</p>
                <p>{candidate.selected ? 'Godkendt. Tilknytningen skal færdiggøres.' : 'Forslag. Ikke i artiklen endnu.'}</p>
                {candidate.historyWarning && <p role="status">{candidate.historyWarning}</p>}
                {!candidate.current && <p role="status">Teksten eller placeringen er ændret. Billedet skal kontrolleres igen før valg.</p>}
                {(!state.candidatePreviews?.[candidate.assetId] || imageStates[key] === 'failed') && <p role="status">Billedet kunne ikke vises. Genindlæs før du vælger det.</p>}
              </figcaption>
              <div className="flex flex-wrap gap-3">
                <button className={`${button} flex-1 bg-white text-[#080808] hover:bg-white/90`} disabled={busy || !usable || !!state.dependencyError} onClick={() => void act(candidate)}>
                  {activeAsset === candidate.assetId ? 'Gemmer …' : candidate.selected ? 'Færdiggør billedvalg' : 'Godkend billede'}
                </button>
                {!candidate.selected && <button className={`${button} flex-1`} disabled={busy || !usable || !!state.dependencyError} onClick={() => void act(candidate, 'decline')}>Fravælg billede</button>}
              </div>
            </figure>;
          })}
        </section>;
      })}
      {!candidates.length && <p>Ingen forslag afventer dit valg. Du kan nu læse artiklen med de billeder, der er sat ind.</p>}
      {!!row.imageSelection?.items.length && <details>
        <summary className="cursor-pointer py-3">Billeder i artiklen ({row.imageSelection.items.length})</summary>
        <div className="grid grid-cols-2 gap-4 py-3">{row.imageSelection.items.map(asset => <figure key={asset.assetId}>
          <Image unoptimized src={asset.url} alt={asset.role === 'cover' ? 'Nuværende cover' : 'Billede i teksten'} width={480} height={320} className="h-auto w-full rounded-lg" />
          <figcaption className="mt-2 text-sm text-white/65">{asset.role === 'cover' ? 'Cover' : 'I teksten'} · tilknyttet</figcaption>
        </figure>)}</div>
      </details>}
      <details className="text-sm leading-6 text-white/60"><summary className="cursor-pointer py-3">Om billedvalg og historik</summary>
        <p>Fravalg bevarer originalen og starter ikke en ny generation. {row.imageDeclines?.length || 0} forslag er fravalgt.</p>
        <p>Kontrollér motiv og Apropos-stil. Generatorens skjulte behandling kan ikke verificeres. Godkendelse vælger præcis den viste original.</p>
      </details>
      <button className={button} onClick={() => setView('article')}>Læs artiklen med valgte billeder</button>
    </div> : <>
    <ArticleReading article={state.reading} onImageError={() => setImageFailed(true)} />
    <div className="mx-auto max-w-[42rem] space-y-5 border-t border-white/20 pt-7">
    <h3 className="text-xl font-medium">Næste skridt</h3>
    {!!row.imageDeclines?.length && !row.imageCandidates?.length && !!row.missingMedia?.length && <p role="status">Det fravalgte billedforslag er bevaret i historikken. Intet nyt billede er startet. Fortæl i chatten, hvilken ny retning du ønsker; et nyt forsøg kræver en udtrykkelig beslutning og teknisk kontrol.</p>}
    {state.dependencyError && <p role="alert">{state.dependencyError}</p>}
    {imageFailed && <p role="alert">Et billede kunne ikke vises. Genindlæs før godkendelse.</p>}
    {row.imageSelection?.warnings.map(warning => <p role="status" key={warning.assetId}>{warning.message}{row.imageSelection?.accepted ? ' Dit personlige billedvalg er gemt for denne version.' : ''}</p>)}
    {!!candidates.length ? <>
      <p>{candidates.length} billedforslag afventer dit valg. De er ikke vist som en del af artiklen.</p>
      <button className={button} onClick={() => setView('images')}>Godkend eller fravælg billeder enkeltvis</button>
    </> : state.consent && !state.dependencyError ? <>
      <p className="leading-7 text-white/75">Med ét klik godkender du tekst, kilder, de viste billeder og metadata i version {row.revision}. Serveren klargør og udgiver denne version efter tekniske kontroller. Ingen betalte AI-kald og ingen ekstra godkendelse i chatten.</p>
      {state.consent.includesPersonalImageSelection && <p className="text-white/75">Dit klik vælger også de viste billeder trods ovenstående forbehold om prompt og stilreference.</p>}
      <label className="flex gap-3"><input type="checkbox" checked={schedule} onChange={e => setSchedule(e.target.checked)} />Planlæg udgivelse</label>
      {schedule && <label className="block">Tidspunkt i København<input className="mt-2 block min-h-12 w-full rounded-xl border border-white/25 bg-transparent p-3" type="datetime-local" value={when} onChange={e => setWhen(e.target.value)} /></label>}
      <button className={`${button} w-full bg-white text-[#080808] hover:bg-white/90`} disabled={busy || imageFailed || (schedule && !when)} onClick={() => void act()}>{schedule ? 'Godkend og planlæg' : 'Godkend og udgiv'}</button>
    </> : consentPending ? <p role="status">Din udgivelsesgodkendelse er gemt. Serveren færdiggør de tekniske kontroller og udgivelsen. Du skal ikke godkende igen eller sende en besked; status opdateres automatisk.</p> : row.imageSelection?.required && row.executionPolicy !== 'chatgpt-first-v1' ? <>
      {row.imageSelection.items.map(asset => <figure key={asset.assetId}>
        <Image unoptimized src={asset.url} alt={asset.role === 'cover' ? 'Valgt cover til gennemgang' : 'Valgt illustration til gennemgang'} width={960} height={540} onError={() => setImageFailed(true)} className="h-auto w-full rounded-xl" />
      </figure>)}
      <p>En hash-sammenligning er ikke bevis for billedgeneratorens faktiske input. Dit valg her godkender kun de viste billeder, ikke udgivelse eller betalte trin.</p>
      <label className="flex items-start gap-3"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Jeg har set billederne og vil bruge dem i denne version.</label>
      {imageFailed && <p role="alert">Et billede kunne ikke vises. Genindlæs før dit billedvalg.</p>}
      <button className={button} disabled={busy || !checked || imageFailed || !!state.dependencyError} onClick={() => void act()}>Jeg vælger disse billeder</button>
    </> : row.status === 'published' ? <p role="status">Artiklen har en verificeret udgivelseskvittering. <a className="underline" href={row.publication?.receipt?.publicUrl} target="_blank" rel="noreferrer">Åbn artiklen</a></p>
      : row.status === 'scheduled' ? <p role="status">Godkendt til udgivelse {row.publication?.publishAt ? new Date(row.publication.publishAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' }) : ''}. Serveren fortsætter, selv om du lukker chatten.</p>
      : row.status === 'processing' ? <p role="status">Godkendelsen er gemt. Serveren kontrollerer og klargør artiklen; status opdateres automatisk. {row.approvalState === 'publication_approved' ? 'Du skal ikke vende tilbage til chatten og godkende igen.' : 'Dit tidligere valg omfattede kun klargøring, ikke udgivelse.'} Artiklen er ikke publiceret endnu.</p>
      : row.status === 'blocked' ? <p role="alert">Arbejdet er gemt, men kræver opfølgning: {row.blocker}. Bed ChatGPT hente status for dette forløb.</p>
      : row.status === 'prepared' && !preview?.ready ? <p role="alert">Den gemte artikel vises ovenfor, men de aktuelle CMS-kontroller tillader endnu ikke udgivelse. Bed ChatGPT kontrollere denne version; der oprettes ikke en ny artikel.</p>
      : row.executionPolicy === 'chatgpt-first-v1' && ['awaiting_preparation', 'prepared'].includes(row.status) ? <p role="status">Læs artiklen ovenfor. Den fælles knap “Godkend og udgiv” vises, når billeder, adgang og den aktuelle version er kontrolleret. Du skal ikke godkende klargøring separat eller skrive en bekræftelse i chatten.</p>
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
    </div>
    </>}
    {state.dependencyError && showingImages && <p role="alert">{state.dependencyError}</p>}
    {error && <p role="alert" className="text-red-200">{error}</p>}
    <button className={button} disabled={busy} onClick={() => void refresh()}>Kontrollér status</button>
  </section>;
}
