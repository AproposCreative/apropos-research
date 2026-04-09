'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useAuth } from '@/lib/auth-context';
import { stripUnsubscribePlaceholderForPreview } from '@/lib/newsletter/unsubscribe-placeholder';

type PendingSchedule = { id: string; scheduledFor: string; subject: string; createdAt: string | null };

type ScheduleHistoryItem = {
  id: string;
  scheduledFor: string;
  subject: string;
  status: 'sent' | 'failed';
  finishedAt: string;
  error?: string;
  summary?: string;
};

function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

type NewsletterClientProps = {
  /** Inde i AI Writer højre-panel — kompakt layout uden fuldside-header */
  embedded?: boolean;
  onClose?: () => void;
};

export default function NewsletterClient({ embedded = false, onClose }: NewsletterClientProps) {
  const { user, loading: authLoading } = useAuth();
  const [html, setHtml] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [meta, setMeta] = useState<{
    headline: string;
    weekLabel: string;
    articleCount: number;
    recipientCount: number;
    totalSignups: number;
    unsubscribedCount: number;
    recipientSource: string;
    formName: string | null;
    warnings: string[];
    signupError: string | null;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState('');
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('desktop');
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [pendingSchedules, setPendingSchedules] = useState<PendingSchedule[]>([]);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryItem[]>([]);
  const [scheduleBusy, setScheduleBusy] = useState(false);

  const authHeader = useCallback(async () => {
    const auth = user;
    if (!auth) throw new Error('Log ind for at bruge nyhedsbrev-værktøjet');
    const token = await auth.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const refreshPendingSchedules = useCallback(async () => {
    if (!user) return;
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/schedule', { headers });
      const data = await res.json();
      if (res.ok && Array.isArray(data.pending)) {
        setPendingSchedules(data.pending);
      }
      if (res.ok && Array.isArray(data.history)) {
        const rows: ScheduleHistoryItem[] = [];
        for (const h of data.history) {
          if (
            typeof h === 'object' &&
            h !== null &&
            'id' in h &&
            'status' in h &&
            'finishedAt' in h &&
            ((h as ScheduleHistoryItem).status === 'sent' || (h as ScheduleHistoryItem).status === 'failed')
          ) {
            rows.push(h as ScheduleHistoryItem);
          }
        }
        setScheduleHistory(rows);
      }
    } catch {
      /* stille fejl */
    }
  }, [authHeader, user]);

  useEffect(() => {
    if (user) void refreshPendingSchedules();
  }, [user, refreshPendingSchedules]);

  useEffect(() => {
    if (!user) return;
    const t = window.setInterval(() => void refreshPendingSchedules(), 45_000);
    return () => window.clearInterval(t);
  }, [user, refreshPendingSchedules]);

  useEffect(() => {
    if (!scheduleAtLocal && typeof window !== 'undefined') {
      const d = new Date();
      d.setMinutes(d.getMinutes() + 5);
      setScheduleAtLocal(toDatetimeLocalValue(d));
    }
  }, [scheduleAtLocal]);

  const loadDraft = useCallback(async () => {
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/draft', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setHtml(data.html);
      setSubject(data.subject || '');
      setMeta({
        headline: typeof data.headline === 'string' ? data.headline : '',
        weekLabel: data.week?.labelDa || '',
        articleCount: Array.isArray(data.articles) ? data.articles.length : 0,
        recipientCount: data.recipientCount ?? 0,
        totalSignups: data.totalSignups ?? data.recipientCount ?? 0,
        unsubscribedCount: data.unsubscribedCount ?? 0,
        recipientSource: data.recipientSource || 'unknown',
        formName: data.formName || null,
        warnings: data.warnings || [],
        signupError: data.signupError || null,
      });
      setStatus('Preview klar — emnefeltet er samme som overskriften i mailen; intro genereret automatisk.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setBusy(false);
    }
  }, [authHeader]);

  const sendTest = useCallback(async () => {
    if (!testEmail.trim()) {
      setError('Angiv en e-mail til test');
      return;
    }
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/send', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          testOnly: true,
          testEmail: testEmail.trim(),
          html: html || undefined,
          subject: subject || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setStatus(`Test sendt til ${data.to}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setBusy(false);
    }
  }, [authHeader, html, subject, testEmail]);

  const scheduleSend = useCallback(async () => {
    if (!html || !subject.trim()) {
      setError('Hent preview først, så der er indhold og emne at planlægge');
      return;
    }
    if (!scheduleAtLocal) {
      setError('Vælg dato og tid');
      return;
    }
    const when = new Date(scheduleAtLocal);
    if (Number.isNaN(when.getTime())) {
      setError('Ugyldigt tidspunkt');
      return;
    }
    setError(null);
    setStatus(null);
    setScheduleBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/schedule', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scheduledAt: when.toISOString(),
          subject,
          html,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setStatus('Nyhedsbrev planlagt — det sendes automatisk på det valgte tidspunkt.');
      await refreshPendingSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setScheduleBusy(false);
    }
  }, [authHeader, html, subject, scheduleAtLocal, refreshPendingSchedules]);

  const cancelSchedule = useCallback(
    async (id: string) => {
      setScheduleBusy(true);
      setError(null);
      try {
        const headers = await authHeader();
        const res = await fetch(`/api/newsletter/schedule?id=${encodeURIComponent(id)}`, {
          method: 'DELETE',
          headers,
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || res.statusText);
        setStatus('Planlagt udsendelse annulleret.');
        await refreshPendingSchedules();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Fejl');
      } finally {
        setScheduleBusy(false);
      }
    },
    [authHeader, refreshPendingSchedules]
  );

  /** Samme send-logik som cron, men kun for din konto — bruges hvis job er forbi tid uden send. */
  const runDueSchedule = useCallback(async () => {
    setScheduleBusy(true);
    setError(null);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/schedule/run-due', { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) {
        const extra = typeof data.hint === 'string' ? ` ${data.hint}` : '';
        throw new Error((data.error || res.statusText) + extra);
      }
      if (data.processed === 0) {
        setStatus(typeof data.message === 'string' ? data.message : 'Intet forfaldent planlagt job.');
      } else {
        setStatus(`Planlagt udsendelse sendt (${typeof data.summary === 'string' ? data.summary : 'ok'}).`);
      }
      await refreshPendingSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setScheduleBusy(false);
    }
  }, [authHeader, refreshPendingSchedules]);

  const previewHtml = useMemo(() => {
    if (!html) return html;
    let h = stripUnsubscribePlaceholderForPreview(html);
    if (typeof window === 'undefined') return h;
    const origin = window.location.origin.replace(/\/$/, '');
    const schemeMeta =
      previewTheme === 'dark'
        ? '<meta name="color-scheme" content="dark" />'
        : '<meta name="color-scheme" content="light only" />';
    if (!/<base\s/i.test(h)) {
      h = h.replace(/<head([^>]*)>/i, `<head$1><base href="${origin}/" />${schemeMeta}`);
    } else if (/name=["']color-scheme["']/i.test(h)) {
      h = h.replace(/<meta\s[^>]*name=["']color-scheme["'][^>]*\/?>/gi, schemeMeta);
    } else {
      h = h.replace(/<head([^>]*)>/i, `<head$1>${schemeMeta}`);
    }

    h = h.replace(/<html([^>]*)>/i, (_, attrs) => {
      const a = attrs.replace(/\s*data-nl-preview="(light|dark)"/gi, '').trim();
      return `<html${a ? ` ${a}` : ''} data-nl-preview="${previewTheme}">`;
    });
    return h;
  }, [html, previewTheme]);

  const sendAll = useCallback(async () => {
    if (!window.confirm('Send nyhedsbrev til alle tilmeldte fra Webflow?')) return;
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/send', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          html: html || undefined,
          subject: subject || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setStatus(`Sendt: ${data.sent}, fejlede: ${data.failed}.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setBusy(false);
    }
  }, [authHeader, html, subject]);

  if (authLoading) {
    return (
      <div
        className={`flex items-center justify-center text-white/45 text-sm tracking-wide ${
          embedded ? 'flex-1 min-h-[120px]' : 'min-h-[100dvh]'
        }`}
      >
        Indlæser…
      </div>
    );
  }

  if (!user) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-4 px-4 text-center ${
          embedded ? 'flex-1 min-h-[160px]' : 'min-h-[100dvh]'
        }`}
      >
        <p className="text-white/70 text-sm">Log ind for at generere og sende nyhedsbrev.</p>
        {embedded ? (
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-white/50 hover:text-white/90 transition-colors"
          >
            Luk
          </button>
        ) : (
          <Link href="/ai" className="text-sm text-white/70 hover:text-white transition-colors">
            Tilbage til AI Writer
          </Link>
        )}
      </div>
    );
  }

  const shell = embedded
    ? 'flex flex-col h-full min-h-0 text-white bg-transparent font-poppins'
    : 'min-h-[100dvh] flex flex-col text-white bg-[#0a0a0a] font-poppins';

  const inner = 'flex-1 flex flex-col lg:flex-row min-h-0 overflow-hidden';

  const asideClass = embedded
    ? 'w-full lg:w-[min(300px,100%)] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 p-3 md:px-4 md:py-4 space-y-3 overflow-y-auto max-h-[40vh] lg:max-h-none lg:bg-black/10'
    : 'lg:w-[380px] shrink-0 border-b lg:border-b-0 lg:border-r border-white/10 p-5 space-y-4 overflow-y-auto bg-[#0c0c0c]';

  const mainClass = embedded
    ? 'flex-1 min-h-0 flex flex-col p-2 md:p-3 bg-transparent'
    : 'flex-1 min-h-0 flex flex-col p-3 md:p-5 bg-[#080808]';

  const headerClass = embedded
    ? 'border-b border-white/10 px-3 md:px-4 py-2.5 md:py-3 flex items-center justify-between gap-3 shrink-0 bg-black/25 backdrop-blur-md'
    : 'border-b border-white/10 px-5 py-4 flex items-center justify-between gap-3 shrink-0 bg-[#0c0c0c]';

  const segBtn = (active: boolean) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
      active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
    }`;

  const primaryBtn =
    'w-full py-2.5 rounded-lg bg-white font-semibold text-[13px] text-neutral-950 shadow-sm ring-1 ring-inset ring-black/[0.06] disabled:opacity-40 transition-all duration-200 hover:bg-neutral-100 active:scale-[0.98]';

  const secondaryBtn =
    'w-full py-2.5 rounded-lg border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

  const dangerOutlineBtn =
    'w-full py-2.5 rounded-lg border border-white/25 text-[13px] text-white/90 hover:bg-white/[0.08] disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

  return (
    <div className={shell}>
      <header className={headerClass}>
        <div className="min-w-0">
          <h1 className={`font-semibold tracking-tight text-white ${embedded ? 'text-[15px]' : 'text-lg'}`}>
            Nyhedsbrev
          </h1>
          {!embedded && (
            <p className="text-[11px] text-white/40 mt-1 tracking-wide uppercase">
              Webflow · AI · Resend
            </p>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-2 shrink-0">
          <div
            className="flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm"
            role="group"
            aria-label="Forhåndsvisning lys eller mørk"
          >
            <button type="button" onClick={() => setPreviewTheme('light')} className={segBtn(previewTheme === 'light')}>
              Lys
            </button>
            <button type="button" onClick={() => setPreviewTheme('dark')} className={segBtn(previewTheme === 'dark')}>
              Mørk
            </button>
          </div>
          <div
            className="flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm"
            role="group"
            aria-label="Preview bredde mobil eller desktop"
          >
            <button
              type="button"
              onClick={() => setPreviewViewport('mobile')}
              className={segBtn(previewViewport === 'mobile')}
            >
              Mobile
            </button>
            <button
              type="button"
              onClick={() => setPreviewViewport('desktop')}
              className={segBtn(previewViewport === 'desktop')}
            >
              Desktop
            </button>
          </div>
          {onClose ? (
            <div
              className="flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm shrink-0"
              role="group"
              aria-label="Luk nyhedsbrev"
            >
              <button
                type="button"
                onClick={onClose}
                className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/12 text-white transition-all duration-200 hover:bg-white/[0.16] active:scale-[0.97]"
                aria-label="Luk nyhedsbrev"
              >
                <svg
                  className="size-3.5 shrink-0"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                  aria-hidden
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          ) : null}
          {!embedded && (
            <Link
              href="/ai"
              className="px-3 py-1.5 rounded-lg border border-white/12 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-200 active:scale-[0.98]"
            >
              ← Tilbage
            </Link>
          )}
        </div>
      </header>

      <div className={inner}>
        <aside className={asideClass}>
          {!embedded && (
            <p className="text-[11px] text-white/38 leading-relaxed">
              Hent preview samler artikler, periode, emnelinje, AI-overskrift og intro.
            </p>
          )}

          <button
            type="button"
            disabled={busy || scheduleBusy}
            onClick={() => loadDraft()}
            className={primaryBtn}
            style={{ color: '#171717' }}
          >
            Hent preview
          </button>

          {meta && (
            <div className="rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3 space-y-2 text-[12px] transition-all duration-300 ease-out">
              {subject ? (
                <div>
                  <p className="text-[10px] uppercase tracking-[0.14em] text-white/35 mb-1">Emne</p>
                  <p className="text-white/80 leading-snug break-words">{subject}</p>
                </div>
              ) : null}
              <div className="grid gap-1.5 text-white/50">
                {meta.headline ? (
                  <p>
                    <span className="text-white/55">Overskrift</span> ·{' '}
                    <span className="text-white/70">{meta.headline}</span>
                  </p>
                ) : null}
                <p>
                  <span className="text-white/55">Periode</span> · {meta.weekLabel}
                </p>
                <p>
                  <span className="text-white/55">Artikler</span> · {meta.articleCount}
                </p>
                <p>
                  <span className="text-white/55">Modtagere</span> · {meta.recipientCount}
                  {meta.unsubscribedCount > 0 && (
                    <span className="text-white/35"> ({meta.totalSignups} tilmeldt, {meta.unsubscribedCount} frameldt)</span>
                  )}
                </p>
              </div>
              {meta.formName && (
                <p className="text-white/45 text-[11px] pt-1 border-t border-white/[0.06]">
                  <span className="text-white/50">Kilde</span>{' '}
                  {meta.recipientSource === 'forms-api' ? 'Webflow-formular' : 'CMS'}
                  {meta.formName ? ` · ${meta.formName}` : ''}
                </p>
              )}
              {meta.signupError && (
                <p className="text-amber-400/85 break-words whitespace-pre-wrap text-[11px] leading-snug pt-1 border-t border-white/[0.06]">
                  {meta.signupError}
                </p>
              )}
              {meta.warnings.map((w, i) => (
                <p key={i} className="text-white/80 text-[11px] leading-snug">
                  {w}
                </p>
              ))}
            </div>
          )}

          <div className="space-y-2 pt-1">
            <label className="block text-[10px] uppercase tracking-[0.16em] text-white/35">Test-e-mail</label>
            <input
              type="email"
              value={testEmail}
              onChange={(e) => setTestEmail(e.target.value)}
              placeholder="dig@domæne.dk"
              autoComplete="email"
              className="w-full px-3 py-2.5 rounded-lg border border-white/15 bg-[#141414] text-[13px] text-white placeholder:text-white/35 focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/15 transition-all duration-200 [color-scheme:dark]"
            />
          </div>

          <button type="button" disabled={busy || scheduleBusy} onClick={sendTest} className={secondaryBtn}>
            Send test
          </button>

          <div className="space-y-2 pt-1 border-t border-white/[0.06]">
            <p className="text-[10px] uppercase tracking-[0.16em] text-white/35">Planlæg udsendelse</p>
            <p className="text-[11px] text-white/38 leading-snug">
              Tidspunkt er din browsers lokale tid. Vercel Cron kalder hvert 15. min (kun{' '}
              <strong className="text-white/55 font-medium">production</strong>) — sæt{' '}
              <code className="text-white/50">CRON_SECRET</code> i Vercel og redeploy, ellers får cron 503/403. Køen kræver Firestore-indekser (
              <code className="text-white/50">firebase deploy --only firestore:indexes</code>). Forbi tid uden send: brug «Send planlagt nu».
            </p>
            <input
              type="datetime-local"
              value={scheduleAtLocal}
              onChange={(e) => setScheduleAtLocal(e.target.value)}
              className="w-full px-3 py-2.5 rounded-lg border border-white/15 bg-[#141414] text-[13px] text-white focus:border-white/30 focus:outline-none focus:ring-1 focus:ring-white/15 transition-all duration-200 [color-scheme:dark]"
            />
            <button
              type="button"
              disabled={busy || scheduleBusy}
              onClick={() => void scheduleSend()}
              className={secondaryBtn}
            >
              Planlæg send til alle
            </button>
            {pendingSchedules.length > 0 && (
              <ul className="space-y-2 pt-1">
                <li className="text-[10px] uppercase tracking-[0.12em] text-white/30">Planlagt</li>
                {pendingSchedules.map((p) => {
                  const due = new Date(p.scheduledFor).getTime();
                  const overdue = Number.isFinite(due) && due < Date.now();
                  return (
                  <li
                    key={p.id}
                    className={`flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] text-white/55 ${
                      overdue
                        ? 'border-amber-500/35 bg-amber-500/[0.08]'
                        : 'border-white/25 bg-white/[0.06]'
                    }`}
                  >
                    <span className="text-white/75">
                      {new Date(p.scheduledFor).toLocaleString('da-DK', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      })}
                    </span>
                    {overdue ? (
                      <div className="flex flex-col gap-2">
                        <span className="text-[10px] text-amber-200/90 leading-snug">
                          Forbi tidspunktet. Der var en fejl i kø-plukning (vilkårlig grænse i Firestore) så forfaldne jobs kunne blive overset — det er rettet. Op til ~15 min cron-forsinkelse kan stadig forekomme.
                        </span>
                        <button
                          type="button"
                          disabled={scheduleBusy}
                          onClick={() => void runDueSchedule()}
                          className="self-start rounded-md border border-emerald-500/40 bg-emerald-500/15 px-2.5 py-1.5 text-[11px] font-medium text-emerald-100/95 hover:bg-emerald-500/25 transition-colors disabled:opacity-40"
                        >
                          Send planlagt nu
                        </button>
                      </div>
                    ) : null}
                    <span className="text-white/50 line-clamp-2">{p.subject}</span>
                    <button
                      type="button"
                      disabled={scheduleBusy}
                      onClick={() => void cancelSchedule(p.id)}
                      className="self-start text-[11px] text-rose-300/80 hover:text-rose-200 transition-colors"
                    >
                      Annuller plan
                    </button>
                  </li>
                  );
                })}
              </ul>
            )}
            {scheduleHistory.length > 0 && (
              <ul className="space-y-2 pt-2">
                <li className="text-[10px] uppercase tracking-[0.12em] text-white/30">Seneste</li>
                {scheduleHistory.map((h) => (
                  <li
                    key={h.id}
                    className={`flex flex-col gap-1 rounded-lg px-2.5 py-2 text-[11px] border ${
                      h.status === 'sent'
                        ? 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-100/90'
                        : 'border-rose-500/35 bg-rose-500/[0.08] text-rose-100/90'
                    }`}
                  >
                    <span className="font-medium text-white/90">
                      {h.status === 'sent' ? 'Sendt' : 'Fejlede'}
                      <span className="font-normal text-white/45">
                        {' '}
                        ·{' '}
                        {new Date(h.finishedAt).toLocaleString('da-DK', {
                          dateStyle: 'short',
                          timeStyle: 'short',
                        })}
                      </span>
                    </span>
                    <span className="text-white/55 line-clamp-2">{h.subject}</span>
                    {h.status === 'sent' && h.summary ? (
                      <span className="text-[10px] text-emerald-200/70">{h.summary}</span>
                    ) : null}
                    {h.status === 'failed' && h.error ? (
                      <span className="text-[10px] text-rose-200/80 whitespace-pre-wrap break-words">{h.error}</span>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <button type="button" disabled={busy || scheduleBusy} onClick={sendAll} className={dangerOutlineBtn}>
            Send til alle tilmeldte nu
          </button>

          {error && (
            <p className="text-[13px] text-red-400/95 motion-safe:transition-opacity duration-300">{error}</p>
          )}
          {status && (
            <p className="text-[13px] text-white/90 motion-safe:transition-opacity duration-300">{status}</p>
          )}
        </aside>

        <main
          className={`${mainClass} ${html && previewViewport === 'mobile' ? 'items-center' : ''}`}
        >
          {html ? (
            <div
              className={`flex min-h-0 w-full flex-1 flex-col ${
                previewViewport === 'mobile' ? 'items-center overflow-auto py-1' : ''
              }`}
            >
              <div
                className={`flex min-h-0 flex-col ${
                  previewViewport === 'mobile'
                    ? 'w-full max-w-[390px] shrink-0 rounded-[1.35rem] border border-white/12 bg-black/35 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]'
                    : 'h-full min-h-0 w-full flex-1'
                }`}
              >
                <iframe
                  title="Preview"
                  className={`w-full flex-1 min-h-0 rounded-xl border border-white/12 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] ${
                    previewTheme === 'dark' ? 'bg-[#1a1a1a]' : 'bg-[#ebebeb]'
                  } ${embedded ? '' : 'min-h-[480px]'} ${
                    previewViewport === 'mobile' ? 'min-h-[520px] rounded-[1rem]' : ''
                  }`}
                  srcDoc={previewHtml ?? ''}
                />
              </div>
            </div>
          ) : (
            <div className="h-full min-h-[160px] flex items-center justify-center rounded-xl border border-dashed border-white/10 bg-black/20 text-white/30 text-[13px] px-6 text-center">
              Hent preview for at se mailen her.
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
