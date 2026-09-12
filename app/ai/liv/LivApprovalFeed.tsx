'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { useAuth } from '@/lib/auth-context';
import { readJsonResponse } from '@/lib/api/read-json-response';
import type { ApprovalFeed, ApprovalStory } from '@/lib/liv/approval-types';
import LivContentColumn from './LivContentColumn';

const decisions = { pending: 'Afventer dit valg', approved: 'Godkendt', rejected: 'Afvist' };
function dateLabel(day: string) {
  return new Intl.DateTimeFormat('da-DK', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Europe/Copenhagen' })
    .format(new Date(`${day}T12:00:00Z`));
}
export function LivApprovalCard({ story, disabled, saving, onDecide }: {
  story: ApprovalStory; disabled: boolean; saving: boolean;
  onDecide: (decision: 'approved' | 'rejected', feedback?: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [brokenImage, setBrokenImage] = useState(false);
  const [feedback, setFeedback] = useState(story.feedback || '');
  // An untouched field is not a request to replace or clear an existing preference.
  const changedFeedback = feedback === (story.feedback || '') ? undefined : feedback;
  const locked = story.state !== 'ready';
  const status = story.state === 'published' ? 'Udgivet' : story.state === 'selected' ? 'Valgt til udgivelse' :
    story.state === 'rejected' ? 'Kræver rettelse' : decisions[story.decision];
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
      <div className="space-y-3 px-5 pb-4 pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-white/60">
          <span>{story.kind === 'reserve' ? 'Reserve · klar til næste ledige udgivelse' : `Planlagt ${dateLabel(story.scheduledDay)}`}</span>
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
    <div id={detailsId} hidden={!expanded} className="space-y-4 border-t border-white/10 px-5 py-5">
      <p className="text-xs uppercase tracking-wider text-white/50">Livs artikel</p>
      {story.paragraphs.map((paragraph, i) => <p key={i} className="break-words text-sm leading-7 text-white/80">{paragraph}</p>)}
      {story.credit && <p className="text-xs text-white/50">Billede: {story.credit}</p>}
    </div>
    <div className="space-y-2 px-5 pb-4">
      <label htmlFor={`${detailsId}-feedback`} className="block text-sm text-white/80">Din redaktionelle kommentar (valgfri)</label>
      <textarea id={`${detailsId}-feedback`} value={feedback} maxLength={500} rows={3}
        disabled={disabled || locked || saving} onChange={event => setFeedback(event.target.value)}
        aria-describedby={`${detailsId}-feedback-help`}
        className="apropos-input-dark w-full resize-y rounded-lg border border-white/25 bg-[#141414] p-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white disabled:opacity-40" />
      <p id={`${detailsId}-feedback-help`} className="text-xs leading-relaxed text-white/50">
        {feedback.length}/500 tegn · Gemmes med Godkend eller Afvis. Kommentaren er privat og bruges som redaktionelt input til kommende tekster, ikke som fakta. Den ændrer ikke denne artikel.
      </p>
    </div>
    <div className="grid grid-cols-2 gap-3 px-5 pb-5" role="group" aria-label={`Vælg: ${story.title}`}>
      <button type="button" disabled={disabled || locked || saving} aria-pressed={story.decision === 'approved'}
        onClick={() => onDecide('approved', changedFeedback)} className={`${actionClass} ${story.decision === 'approved' ? 'bg-emerald-200 text-emerald-950' : 'bg-white text-[#000000] hover:bg-white/85'}`}>Godkend</button>
      <button type="button" disabled={disabled || locked || saving} aria-pressed={story.decision === 'rejected'}
        onClick={() => onDecide('rejected', changedFeedback)} className={`${actionClass} border ${story.decision === 'rejected' ? 'border-rose-300 bg-rose-300/10 text-rose-200' : 'border-white/25 text-white hover:bg-white/10'}`}>Afvis</button>
    </div>
    {saving && <p className="px-5 pb-4 text-xs text-white/60" role="status">Gemmer dit valg…</p>}
  </article>;
}

export default function LivApprovalFeed() {
  const { user } = useAuth();
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
      setNotice(decision === 'approved' ? 'Godkendt. Historien får prioritet på sin udgivelsesdag.' : 'Afvist. Liv vælger ikke denne historie.');
    } catch (e) {
      if (current !== version.current) return;
      await refresh();
      setError(e instanceof Error ? e.message : 'Valget kunne ikke gemmes. Opdater listen.');
    } finally { busy.current = false; setSaving(null); }
  }
  return <div data-liv-story-scroll style={{ paddingTop: 'var(--liv-tabs-height, 0px)' }} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
    <LivContentColumn className="space-y-5 py-6">
      <header className="space-y-3">
        <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-medium">De kommende historier</h2>
          <button className="min-h-11 px-2 text-sm text-white/70 underline underline-offset-4 disabled:opacity-40" disabled={loading || !!saving} onClick={() => void refresh()}>Opdater</button></div>
        <p className="text-sm leading-relaxed text-white/65">Alle klargjorte kommende historier samlet på én liste. Mangler dagens udgivelse, kommer den først.</p>
        <p className="text-xs leading-relaxed text-white/45">Godkend eller afvis. Uden et valg fortsætter Liv automatisk. Dit valg kan ændres, indtil historien er valgt til udgivelse.</p>
      </header>
      {notice && <p role="status" className="rounded-xl border border-emerald-300/20 bg-emerald-300/5 p-4 text-sm text-emerald-200">{notice}</p>}
      {error && <p role="alert" className="rounded-xl border border-amber-200/20 p-4 text-sm text-amber-200">{error}</p>}
      {feed && !feed.queueEnabled && <p className="rounded-xl border border-white/15 p-4 text-sm text-white/60">Automatisk udgivelse er ikke aktiveret. Dine valg udgiver ikke noget med det samme.</p>}
      {loading && !feed && <p role="status" className="p-5 text-sm text-white/60">Henter Livs historier…</p>}
      {feed && !feed.stories.length && <div className="rounded-2xl border border-dashed border-white/20 px-6 py-12 text-center">
        <h3 className="text-lg">Den næste historie er ikke klar endnu</h3><p className="mt-3 text-sm leading-relaxed text-white/55">
          {!feed.preparationEnabled ? 'Forberedelsen er ikke aktiveret. Gemte historier og dine valg er bevaret.' :
            feed.preparation?.status === 'blocked_saved_work' || feed.preparation?.status === 'reconciliation_required' ?
              'Forberedelsen er stoppet på et gemt trin. Tekst og billeder er bevaret; udgivelsen er endnu ikke klar.' :
            feed.preparation?.status === 'unavailable' ? 'Forberedelsens status kunne ikke hentes. Prøv Opdater.' :
            feed.preparation?.status === 'preparing' ? 'Liv arbejder på historien nu. Den vises her, når den er klar.' :
              'Historien vises her, når research, tekst, billeder og kontroller er klar.'}</p>
        {feed.preparation?.day && <p className="mt-3 text-xs text-white/45">Planlagt {dateLabel(feed.preparation.day)}</p>}
      </div>}
      {feed?.stories.map(story => <LivApprovalCard key={`${story.itemId}:${story.revision}`} story={story} disabled={loading || !!saving || !!error}
        saving={saving === story.itemId} onDecide={(decision, feedback) => void decide(story, decision, feedback)} />)}
    </LivContentColumn>
  </div>;
}
