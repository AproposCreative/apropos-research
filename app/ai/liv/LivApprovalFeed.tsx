'use client';
import ToolHelp from '@/components/embedded-app/ToolHelp';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import type { ApprovalFeed, ApprovalStory } from '@/lib/liv/approval-types';
import LivContentColumn from './LivContentColumn';
import LivPresentationEditor from './LivPresentationEditor';
import LivShorteningEditor from './LivShorteningEditor';
import LivCoverEditor from './LivCoverEditor';
import type { LivWorkItem } from '@/lib/liv/work-overview';
import type { LivIdeaItem } from '@/lib/liv/idea-overview';
import type { WeeklyStory } from '@/lib/liv/weekly-plan';

const decisions = { pending: 'Afventer dit valg', approved: 'Godkendt', rejected: 'Afvist' };
const fieldNames: Record<string, string> = { title: 'titel', intro: 'intro', subtitle: 'underrubrik', author: 'forfatter',
  category: 'kategori', slug: 'adresse', seoTitle: 'SEO-titel', seoDescription: 'SEO-beskrivelse', cover: 'cover',
  cover_credit: 'billedkredit', two_distinct_body_images: 'to brødtekstbilleder', body_image_alt: 'billedbeskrivelser' };
function dateLabel(day: string) {
  return new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })
    .format(new Date(`${day}T12:00:00Z`));
}
export function LivApprovalCard({ story, disabled, saving, onDecide, canDecide = false, onEdited }: {
  story: ApprovalStory; disabled: boolean; saving: boolean;
  canDecide?: boolean;
  onEdited?: () => void;
  onDecide: (decision: 'approved' | 'rejected', feedback?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);
  const [feedback, setFeedback] = useState(story.feedback || '');
  // An untouched field is not a request to replace or clear an existing preference.
  const changedFeedback = feedback === (story.feedback || '') ? undefined : feedback;
  const blocked = Boolean(story.publicationBlockers?.length);
  const revisionPending = story.publicationBlockers?.includes('editorial_revision_pending');
  const locked = story.state !== 'ready' || blocked;
  const status = revisionPending ? 'Redigering afventer afslutning' : story.state === 'published' ? 'Udgivet' : story.state === 'selected' ? 'Valgt til udgivelse' :
    story.state === 'rejected' ? 'Kræver rettelse' : blocked ? 'Publicering blokeret' : decisions[story.decision];
  const ratedReview = story.articleFormat === 'research-review' && Number.isInteger(story.rating) &&
    story.rating! >= 1 && story.rating! <= 6 && !!story.ratingReason;
  const detailsId = `liv-story-${story.itemId}`;
  const actionClass = 'min-h-12 rounded-xl px-4 py-3 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-white disabled:opacity-40';
  return <article className="overflow-hidden rounded-2xl border border-white/15 bg-[#111111]">
    <button type="button" onClick={() => setExpanded(!expanded)} aria-expanded={expanded} aria-controls={detailsId}
      className="block w-full text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-white focus-visible:-outline-offset-4">
      <div className="relative aspect-[16/10] overflow-hidden bg-white/5">
        {story.image && !brokenImage ? <Image src={story.image} alt={story.imageAlt} fill unoptimized
          sizes="(max-width: 640px) 100vw, 600px" className="object-cover" onError={() => setBrokenImage(true)} /> :
          <div className="flex h-full items-center justify-center text-sm text-white/50">Billede ikke tilgængeligt</div>}
        <span className="absolute left-4 top-4 max-w-[calc(100%-2rem)] rounded-full bg-[#000000]/85 px-3 py-1.5 text-xs font-medium text-white">{story.formatLabel || 'Artikel'} · {story.category}</span>
      </div>
      <div className="space-y-3 px-3 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
          <span>{story.kind === 'reserve' ? (blocked ? 'Reserve · publicering blokeret' : 'Reserve · klar til næste ledige udgivelse') : `Planlagt ${dateLabel(story.scheduledDay)}`}</span>
          <span className={story.decision === 'approved' ? 'text-emerald-300' : story.decision === 'rejected' ? 'text-rose-300' : ''}>{status}</span>
        </div>
        <h3 className="break-words text-[22px] font-medium leading-tight sm:text-2xl">{story.title}</h3>
        {ratedReview ? <div role="img" aria-label={`Bedømmelse: ${story.rating} af 6 stjerner`} className="text-amber-200">
          <span aria-hidden="true">{'★'.repeat(story.rating!)}{'☆'.repeat(6 - story.rating!)} <span className="ml-2 text-sm">{story.rating}/6</span></span>
        </div> : null}
        <p className="break-words text-sm leading-relaxed text-white/75 sm:text-base">{story.summary}</p>
        {ratedReview ? <p className="break-words text-sm leading-relaxed text-white/65"><span className="font-medium text-white/85">Livs begrundelse: </span>{story.ratingReason}</p> : null}
        <span className="inline-block text-sm text-white/80 underline underline-offset-4">{expanded ? 'Læs mindre ↑' : 'Læs mere ↓'}</span>
      </div>
    </button>
    <div id={detailsId} hidden={!expanded} className="space-y-4 border-t border-white/10 px-3 py-5">
      <p className="text-xs uppercase tracking-wider text-white/50">Livs artikel</p>
      {story.paragraphs.map((paragraph, i) => <p key={i} className="break-words text-sm leading-7 text-white/80">{paragraph}</p>)}
      {story.credit && <p className="text-xs text-white/50">Billede: {story.credit}</p>}
    </div>
    {canDecide && <><div className="space-y-2 px-3 pb-4">
      <label htmlFor={`${detailsId}-feedback`} className="block text-sm text-white/80">Din redaktionelle kommentar (valgfri)</label>
      <textarea id={`${detailsId}-feedback`} value={feedback} maxLength={500} rows={3}
        disabled={disabled || locked || saving} onChange={event => setFeedback(event.target.value)}
        aria-describedby={`${detailsId}-feedback-help`}
        className="apropos-input-dark w-full resize-y rounded-lg border border-white/25 bg-[#141414] p-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40" />
      <p id={`${detailsId}-feedback-help`} className="text-xs leading-relaxed text-white/50">
        {feedback.length}/500 tegn · Gemmes med Godkend eller Afvis. Kommentaren er privat og bruges som redaktionelt input til kommende tekster, ikke som fakta. Den ændrer ikke denne artikel.
      </p>
    </div>
    <div className="grid grid-cols-2 gap-3 px-3 pb-5" role="group" aria-label={`Vælg: ${story.title}`}>
      <button type="button" disabled={disabled || locked || saving} aria-pressed={story.decision === 'approved'}
        onClick={() => onDecide('approved', changedFeedback)} className={`${actionClass} ${story.decision === 'approved' ? 'bg-emerald-200 text-emerald-950' : 'bg-white text-[#000000] hover:bg-white/85'}`}>Godkend</button>
      <button type="button" disabled={disabled || locked || saving} aria-pressed={story.decision === 'rejected'}
        onClick={() => onDecide('rejected', changedFeedback)} className={`${actionClass} border ${story.decision === 'rejected' ? 'border-rose-300 bg-rose-300/10 text-rose-200' : 'border-white/25 text-white hover:bg-white/10'}`}>Afvis</button>
    </div>
    </>}
    {canDecide && story.state === 'ready' && story.decision !== 'rejected' && onEdited &&
      <><LivPresentationEditor itemId={story.itemId} disabled={disabled || saving} onSaved={onEdited} />
        <LivCoverEditor itemId={story.itemId} disabled={disabled || saving} onSaved={onEdited} />
        <LivShorteningEditor itemId={story.itemId} disabled={disabled || saving} onSaved={onEdited} /></>}
    {saving && <p className="px-3 pb-4 text-xs text-white/60" role="status">Gemmer dit valg…</p>}
  </article>;
}

function LivSavedWorkCard({ item }: { item: LivWorkItem }) {
  const status = item.status === 'blocked' ? 'Stoppet ved en fejl' : item.status === 'prepared' ?
    'Klargjort · kræver kontrol' : item.status === 'processing' ? 'Behandling i gang' : 'Gemt kladde · ikke godkendt';
  return <article className="border-b border-white/15 py-5 first:pt-0 last:border-b-0">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/55">
      <span>{item.kind === 'reserve' ? 'Reserve' : item.scheduledDay ? `Oprindeligt planlagt ${dateLabel(item.scheduledDay)}` : 'Liv-artikel'}</span>
      <span className={item.status === 'blocked' ? 'text-amber-200' : ''}>{status}</span>
    </div>
    <h3 className="mt-2 break-words text-lg font-medium leading-snug">{item.title}</h3>
    <p className="mt-2 text-xs leading-relaxed text-white/55">{item.source === 'chatgpt-submission' ? `Gemt i ChatGPT-forløb${item.revision ? ` · version ${item.revision}` : ''}` :
      item.source === 'editorial-desk' ? 'Gemt i Research og kilder' : item.source === 'cms-draft' ? 'Gemt som CMS-kladde' : 'Gemt i Livs artikelarkiv'}
      {item.updatedAt ? ` · opdateret ${new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(item.updatedAt))}` : ''} ·
      {item.researchCount ? ` ${item.researchCount} registrerede kilder, ikke faktatjekket.` : ' Ingen kilder registreret i denne artikelpost.'}
      {item.missing.length ? ` Mangler registrerede felter: ${item.missing.map(name => fieldNames[name] || name).join(', ')}.` : ' Alle grundfelter findes; kvalitet og udgivelse er ikke godkendt.'}</p>
    {item.previewUrl && <a href={item.previewUrl} className="mt-3 inline-block min-h-11 py-3 text-sm text-white underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white">Åbn gemt artikel →</a>}
    {!item.previewUrl && <p className="mt-2 text-xs text-white/45">{item.source === 'editorial-desk' ? 'Åbn under Indstillinger → Research og kilder.' : item.source === 'cms-draft' ? 'Find kladden i artikelarkivet.' : 'Åbnes via Livs gemte arbejde i redaktionen.'}</p>}
  </article>;
}

function LivIdeaRow({ item }: { item: LivIdeaItem }) {
  return <li className="border-b border-white/10 py-4 first:pt-0 last:border-b-0">
    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/50">
      <span>{item.status === 'selected' ? 'Valgt til research · ingen artikeltekst' : 'Idé · ikke valgt'}</span>
      <time dateTime={item.createdAt}>{new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' }).format(new Date(item.createdAt))}</time>
    </div>
    <h3 className="mt-2 break-words text-base font-medium">{item.title}</h3>
    <p className="mt-1 line-clamp-2 break-words text-sm leading-relaxed text-white/60">{item.angle}</p>
  </li>;
}

const planLabels: Record<WeeklyStory['status'], string> = {
  off_day: 'Udgivelsesfri', unplanned: 'Ingen artikel planlagt', planned: 'Kun emne planlagt',
  preparing: 'Forberedelse i gang', blocked: 'Forberedelse stoppet', ready: 'Artikel klar', published: 'Udgivet',
};

export default function LivApprovalFeed() {
  const { user, capabilities } = useAuth();
  const [feed, setFeed] = useState<ApprovalFeed | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const version = useRef(0);
  const busy = useRef(false);
  const request = useCallback(async (body?: object) => {
    if (!user) throw new Error('Log ind for at se Livs historier.');
    const token = await user.getIdToken();
    const response = await fetch('/api/liv/delivery/feed', { method: body ? 'POST' : 'GET', cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await readJsonResponse(response);
    if (!response.ok) throw new Error(data.error || 'Livs historier kunne ikke hentes.');
    return data;
  }, [user]);
  const refresh = useCallback(async () => {
    const current = ++version.current;
    setLoading(true);
    try {
      const data = await request() as ApprovalFeed;
      if (!Array.isArray(data.stories)) throw new Error('Historielisten er ugyldig.');
      if (current !== version.current) return;
      setFeed(data);
      setError('');
    } catch (e) { if (current === version.current) setError(e instanceof Error ? e.message : 'Prøv igen.'); }
    finally { if (current === version.current) setLoading(false); }
  }, [request]);
  useEffect(() => { setFeed(null); void refresh(); return () => { version.current++; }; }, [refresh]);
  async function decide(story: ApprovalStory, decision: 'approved' | 'rejected', feedback?: string) {
    if (busy.current) return;
    const current = version.current;
    busy.current = true; setSaving(story.itemId); setNotice('');
    try {
      const result = await request({ itemId: story.itemId, payloadHash: story.payloadHash, revision: story.revision, decision, feedback });
      if (current !== version.current) return;
      setFeed(old => old && ({ ...old, stories: old.stories.map(s => s.itemId === story.itemId ?
        { ...s, decision: result.decision, revision: result.revision, feedback: result.feedback ?? null } : s) }));
      setNotice(decision === 'approved' ? 'Dit valg er gemt. Artiklen er ikke udgivet endnu.' : 'Afvist. Liv vælger ikke denne historie.');
    } catch (e) {
      if (current !== version.current) return;
      await refresh();
      setError(e instanceof Error ? e.message : 'Valget kunne ikke gemmes. Opdater listen.');
    } finally { busy.current = false; setSaving(null); }
  }
  const readyCmsIds = new Set(feed?.stories.map(story => story.itemId) || []);
  const savedWork = feed?.work?.items.filter(item => !item.cmsItemId || !readyCmsIds.has(item.cmsItemId)) || [];
  const publicationDays = feed?.week?.filter(day => day.status !== 'off_day') || [];
  const historyCount = (feed?.work?.history?.length || 0) + (feed?.ideas?.history?.length || 0);
  return <div data-liv-story-scroll style={{ paddingTop: 'var(--liv-tabs-height, 0px)' }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <LivContentColumn className="space-y-5 py-3">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-medium">Artikler i arbejde</h2>
          <button className="min-h-11 px-2 text-sm text-white/70 underline underline-offset-4 disabled:opacity-40" disabled={loading || !!saving} onClick={() => void refresh()}>Opdater</button></div>
        <ToolHelp title="Om redaktionen"><p>Anmeldelser og kulturguider om koncerter, serier, film, bøger, museer og kulturoplevelser. Researchanmeldelser bygger på flere læste anmeldelser og markeres som AI.</p><p>Kladder er ikke automatisk godkendt eller planlagt til udgivelse.</p></ToolHelp>
        {feed?.work && <p className="text-xs text-white/55">{feed.stories.length} i udgivelseskøen · {savedWork.length} gemte kladder</p>}
      </header>
      {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-amber-200/20 p-4 text-sm text-amber-200">{error}</p>}
      {feed?.queueUnavailable && <p role="alert" className="rounded-xl border border-amber-200/25 p-4 text-sm text-amber-200">Udgivelseskøen kunne ikke kontrolleres. Gemte kladder vises, men de er ikke klar til godkendelse her.</p>}
      {loading && !feed && <p role="status" className="p-3 text-sm text-white/60">Henter Livs historier…</p>}
      {feed?.stories.map(story => <LivApprovalCard key={`${story.itemId}:${story.revision}`} story={story} canDecide={capabilities.owner} disabled={loading || !!saving || !!error}
        saving={saving === story.itemId} onEdited={() => void refresh()} onDecide={(decision, feedback) => void decide(story, decision, feedback)} />)}
      {feed?.work === null && <p role="alert" className="rounded-xl border border-amber-200/25 p-4 text-sm text-amber-200">Gemte Liv-kladder kunne ikke hentes. Listen er ufuldstændig; prøv Opdater.</p>}
      {feed?.work && !feed.work.complete && <p role="alert" className="rounded-xl border border-amber-200/25 p-4 text-sm text-amber-200">Ikke alle kilder kunne gennemgås fuldt ud. Listen kan mangle kladder.</p>}
      {feed?.work && savedWork.length > 0 &&
        <section aria-label="Gemte Liv-kladder" className="rounded-2xl border border-white/15 px-3 py-2">
          {savedWork.map(item => <LivSavedWorkCard key={`${item.source}:${item.id}`} item={item} />)}
        </section>}
      {feed && !feed.stories.length && feed.work?.items.length === 0 &&
        <p className="rounded-2xl border border-white/15 p-3 text-sm text-white/60">Ingen aktive anmeldelser eller kulturguider i de gennemgåede kilder. Planer uden artikeltekst vises ikke her.</p>}
      {capabilities.owner && <section aria-labelledby="liv-ideas-heading" className="space-y-3 border-t border-white/15 pt-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2"><h2 id="liv-ideas-heading" className="text-lg font-medium">Seneste forslag</h2>
          {feed?.ideas && <span className="text-xs text-white/50">{feed.ideas.items.length} gemte idéer</span>}</div>
        <ToolHelp title="Om idéerne">Forslag fra gemte idébriefs. De er ikke researchet færdigt, skrevet eller godkendt til udgivelse. Daglige statusmails med et emne opretter ikke en artikel.</ToolHelp>
        {feed?.ideas?.latestCreatedAt && <p className="text-xs text-white/50">Seneste gemte brief: {new Intl.DateTimeFormat('da-DK', { day: 'numeric', month: 'long', timeZone: 'Europe/Copenhagen' }).format(new Date(feed.ideas.latestCreatedAt))}</p>}
        {feed?.ideas === null && <p role="alert" className="text-sm text-amber-200">Idéarkivet kunne ikke hentes. Overblikket er ufuldstændigt.</p>}
        {feed?.ideas && !feed.ideas.complete && <p role="alert" className="text-sm text-amber-200">Der findes flere gemte idéer end de 30 viste. Åbn redaktionens idéarkiv for resten.</p>}
        {feed?.ideas && (feed.ideas.items.length ? <ul className="rounded-2xl border border-white/15 px-3 py-2">
          {feed.ideas.items.map(item => <LivIdeaRow key={item.id} item={item} />)}
        </ul> : <p className="text-sm text-white/50">Ingen nye forslag fra den seneste uge.</p>)}
      </section>}
      {capabilities.owner && historyCount > 0 && <details className="rounded-2xl border border-white/15 p-3">
        <summary className="cursor-pointer text-sm text-white/75">Tidligere kladder og idébriefs ({historyCount})</summary>
        <div className="pt-4">{feed?.work?.history?.map(item => <LivSavedWorkCard key={`${item.source}:${item.id}`} item={item} />)}</div>
        <ul className="pt-4">{feed?.ideas?.history?.map(item => <LivIdeaRow key={item.id} item={item} />)}</ul>
      </details>}
      {capabilities.owner && (!!feed?.work?.retained?.length || !!feed?.ideas?.retained?.length) &&
        <details className="rounded-2xl border border-white/15 p-3">
          <summary className="cursor-pointer text-sm text-white/75">Tidligere forslag · kræver ny vinkel ({(feed?.work?.retained?.length || 0) + (feed?.ideas?.retained?.length || 0)})</summary>
          <p className="py-3 text-sm leading-relaxed text-white/55">Bevaret med tekst, billeder og kilder. Disse features, kommentarer og nyhedsforslag indgår ikke i den aktive kø. De skal omarbejdes til en anmeldelse eller konkret kulturguide før udgivelse.</p>
          {feed?.work?.retained?.map(item => <LivSavedWorkCard key={item.id} item={item} />)}
          <ul>{feed?.ideas?.retained?.map(item => <li key={item.id} className="py-2 text-sm text-white/65">{item.title}</li>)}</ul>
        </details>}
      {capabilities.owner && <section aria-labelledby="liv-plan-heading" className="space-y-3 border-t border-white/15 pt-6">
        <h2 id="liv-plan-heading" className="text-lg font-medium">Udgivelsesplan</h2>
        <p className="text-sm leading-relaxed text-white/60">Kun planlagte udgivelsesdage vises her. Et emne er ikke en færdig artikel.</p>
        {feed && !feed.week && <p role="alert" className="text-sm text-amber-200">Planen kunne ikke verificeres lige nu.</p>}
        {publicationDays.length > 0 && <ul className="divide-y divide-white/10 rounded-2xl border border-white/15 px-3">
          {publicationDays.map(day => <li key={day.day} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 py-3 text-sm">
            <time dateTime={day.day} className="text-white/80">{dateLabel(day.day)}</time>
            <span className={day.status === 'blocked' ? 'text-amber-200' : 'text-white/55'}>{planLabels[day.status]}</span>
            {day.itemId && day.status === 'ready' && <span className="w-full break-words text-xs text-white/60">{day.title}</span>}
          </li>)}
        </ul>}
      </section>}
    </LivContentColumn>
  </div>;
}
