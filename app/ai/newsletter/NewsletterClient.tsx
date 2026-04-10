'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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

type WeeklyAutoLogItem = {
  id: string;
  weekKey: string;
  status: 'sent' | 'failed' | 'skipped';
  finishedAt: string;
  subject?: string;
  sent?: number;
  recipientCount?: number;
  skipReason?: string;
  error?: string;
};

type ManualSendLogItem = {
  id: string;
  kind: 'test' | 'broadcast';
  status: 'sent' | 'failed';
  subject: string;
  finishedAt: string;
  detail: string;
  error?: string;
};

type WeeklyAutoPlanDocClient = {
  status: 'processing' | 'sent' | 'failed' | 'skipped';
  subject?: string;
  error?: string;
  skipReason?: string;
  completedAt: string | null;
  processingStartedAt: string | null;
};

type WeeklyAutoPlanState = {
  enabled: boolean;
  weekdayIso: number;
  hour: number;
  minute: number;
  weekKey: string;
  doc: WeeklyAutoPlanDocClient | null;
};

type MergedSendLogRow =
  | { source: 'weekly'; row: WeeklyAutoLogItem }
  | { source: 'scheduled'; row: ScheduleHistoryItem }
  | { source: 'manual'; row: ManualSendLogItem };

function toDatetimeLocalValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

const ISO_WEEKDAY_DA = ['', 'Mandag', 'Tirsdag', 'Onsdag', 'Torsdag', 'Fredag', 'Lørdag', 'Søndag'];
const DEFAULT_TEST_RECIPIENTS = [
  'frederik@aproposmagazine.com',
  'milo@aproposmagazine.com',
  'casper@aproposmagazine.com',
] as const;

function emptyPresetActive(): Record<string, boolean> {
  return Object.fromEntries(DEFAULT_TEST_RECIPIENTS.map((e) => [e, false])) as Record<string, boolean>;
}

function toTimeInputValue(hour: number, minute: number): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
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
  const [testEmailInput, setTestEmailInput] = useState('');
  /** Standardadresser: slået fra som udgangspunkt; klik = aktiv med flueben. */
  const [presetTestActive, setPresetTestActive] = useState<Record<string, boolean>>(emptyPresetActive);
  const [extraTestEmails, setExtraTestEmails] = useState<string[]>([]);

  const activeTestRecipients = useMemo(() => {
    const fromPresets = DEFAULT_TEST_RECIPIENTS.filter((e) => presetTestActive[e]);
    const presetSet = new Set<string>(fromPresets);
    const extras = extraTestEmails.filter((e) => !presetSet.has(e));
    return [...fromPresets, ...extras];
  }, [presetTestActive, extraTestEmails]);
  const [previewTheme, setPreviewTheme] = useState<'light' | 'dark'>('light');
  const [previewViewport, setPreviewViewport] = useState<'mobile' | 'desktop'>('desktop');
  const [scheduleAtLocal, setScheduleAtLocal] = useState('');
  const [pendingSchedules, setPendingSchedules] = useState<PendingSchedule[]>([]);
  const [scheduleHistory, setScheduleHistory] = useState<ScheduleHistoryItem[]>([]);
  const [weeklyAutoLog, setWeeklyAutoLog] = useState<WeeklyAutoLogItem[]>([]);
  const [manualSendLog, setManualSendLog] = useState<ManualSendLogItem[]>([]);
  const [weeklyAutoPlan, setWeeklyAutoPlan] = useState<WeeklyAutoPlanState | null>(null);
  const [expandedSendLogKeys, setExpandedSendLogKeys] = useState<Set<string>>(() => new Set());
  const [scheduleBusy, setScheduleBusy] = useState(false);
  const [weeklyAutoEnabled, setWeeklyAutoEnabled] = useState(true);
  const [weeklyWeekdayIso, setWeeklyWeekdayIso] = useState(5);
  const [weeklyTimeHHMM, setWeeklyTimeHHMM] = useState('12:00');
  const [weeklySaveBusy, setWeeklySaveBusy] = useState(false);
  const [weeklyPreviewBusy, setWeeklyPreviewBusy] = useState(false);
  const [weeklyPreviewOffset, setWeeklyPreviewOffset] = useState(-1);
  const [mobileSheetOpen, setMobileSheetOpen] = useState(false);
  const [mobileSection, setMobileSection] = useState<string | null>(null);
  const [desktopSection, setDesktopSection] = useState<string | null>(null);
  const sheetRef = useRef<HTMLDivElement>(null);

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
      if (res.ok && Array.isArray(data.weeklyAutoLog)) {
        const wRows: WeeklyAutoLogItem[] = [];
        for (const w of data.weeklyAutoLog) {
          if (
            typeof w === 'object' &&
            w !== null &&
            'id' in w &&
            'weekKey' in w &&
            'status' in w &&
            'finishedAt' in w &&
            (w.status === 'sent' || w.status === 'failed' || w.status === 'skipped')
          ) {
            wRows.push(w as WeeklyAutoLogItem);
          }
        }
        setWeeklyAutoLog(wRows);
      }
      if (res.ok && Array.isArray(data.manualSendLog)) {
        const mRows: ManualSendLogItem[] = [];
        for (const m of data.manualSendLog) {
          if (
            typeof m === 'object' &&
            m !== null &&
            'id' in m &&
            'kind' in m &&
            'finishedAt' in m &&
            (m.kind === 'test' || m.kind === 'broadcast')
          ) {
            const status = m.status === 'failed' ? 'failed' : 'sent';
            mRows.push({
              ...(m as ManualSendLogItem),
              status,
            });
          }
        }
        setManualSendLog(mRows);
      }
      if (res.ok && data.weeklyAutoPlan && typeof data.weeklyAutoPlan === 'object' && data.weeklyAutoPlan !== null) {
        const p = data.weeklyAutoPlan as Record<string, unknown>;
        if (typeof p.weekKey === 'string' && typeof p.weekdayIso === 'number') {
          let doc: WeeklyAutoPlanDocClient | null = null;
          if (p.doc && typeof p.doc === 'object' && p.doc !== null && 'status' in p.doc) {
            const d = p.doc as Record<string, unknown>;
            const st = d.status;
            if (
              st === 'processing' ||
              st === 'sent' ||
              st === 'failed' ||
              st === 'skipped'
            ) {
              doc = {
                status: st,
                subject: typeof d.subject === 'string' ? d.subject : undefined,
                error: typeof d.error === 'string' ? d.error : undefined,
                skipReason: typeof d.skipReason === 'string' ? d.skipReason : undefined,
                completedAt: typeof d.completedAt === 'string' ? d.completedAt : null,
                processingStartedAt: typeof d.processingStartedAt === 'string' ? d.processingStartedAt : null,
              };
            }
          }
          setWeeklyAutoPlan({
            enabled: Boolean(p.enabled),
            weekdayIso: p.weekdayIso,
            hour: typeof p.hour === 'number' ? p.hour : 12,
            minute: typeof p.minute === 'number' ? p.minute : 0,
            weekKey: p.weekKey,
            doc,
          });
        } else {
          setWeeklyAutoPlan(null);
        }
      } else if (res.ok) {
        setWeeklyAutoPlan(null);
      }
    } catch {
      /* stille fejl */
    }
  }, [authHeader, user]);

  const toggleSendLogKey = useCallback((key: string) => {
    setExpandedSendLogKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }, []);

  const formatSendLogWhen = useCallback((iso: string) => {
    try {
      return new Date(iso).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' });
    } catch {
      return iso;
    }
  }, []);

  const mergedSendLog = useMemo((): MergedSendLogRow[] => {
    const weeklyRows: MergedSendLogRow[] = weeklyAutoLog.map((row) => ({ source: 'weekly', row }));
    const schedRows: MergedSendLogRow[] = scheduleHistory.map((row) => ({ source: 'scheduled', row }));
    const manualRows: MergedSendLogRow[] = manualSendLog.map((row) => ({ source: 'manual', row }));
    const all = [...weeklyRows, ...schedRows, ...manualRows];
    all.sort((a, b) => {
      const ta = a.row.finishedAt;
      const tb = b.row.finishedAt;
      return ta < tb ? 1 : ta > tb ? -1 : 0;
    });
    return all.slice(0, 36);
  }, [weeklyAutoLog, scheduleHistory, manualSendLog]);

  /** Afsluttede uger (sendt/fejl/sprunget over) vises kun under Seneste udsendelser — frigør plads til næste uges kø. */
  const showWeeklyPlanSlot = useMemo(() => {
    if (!weeklyAutoPlan) return false;
    if (!weeklyAutoPlan.enabled) return true;
    const st = weeklyAutoPlan.doc?.status;
    return !st || st === 'processing';
  }, [weeklyAutoPlan]);

  const loadWeeklyAutoSettings = useCallback(async () => {
    if (!user) return;
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/weekly-auto/settings', { headers });
      const data = await res.json();
      if (!res.ok) return;
      if (typeof data.enabled === 'boolean') setWeeklyAutoEnabled(data.enabled);
      if (typeof data.weekdayIso === 'number' && data.weekdayIso >= 1 && data.weekdayIso <= 7) {
        setWeeklyWeekdayIso(data.weekdayIso);
      }
      if (typeof data.hour === 'number' && typeof data.minute === 'number') {
        setWeeklyTimeHHMM(toTimeInputValue(data.hour, data.minute));
      }
    } catch {
      /* stille */
    }
  }, [authHeader, user]);

  useEffect(() => {
    if (user) void refreshPendingSchedules();
  }, [user, refreshPendingSchedules]);

  useEffect(() => {
    if (user) void loadWeeklyAutoSettings();
  }, [user, loadWeeklyAutoSettings]);

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
      setStatus(data.cacheHit ? 'Preview uændret (cache)' : 'Preview hentet');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setBusy(false);
    }
  }, [authHeader]);

  const loadDraftFromCacheOnOpen = useCallback(async () => {
    if (!user || html) return;
    setError(null);
    setBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/draft', { method: 'GET', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (!data.found) {
        setStatus('Ingen gemt kladde — tryk «Hent Preview» for at bygge en.');
        return;
      }
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
      setStatus('Viser seneste kladde');
    } catch {
      /* stille fejl; bruger kan altid trykke Hent Preview */
    } finally {
      setBusy(false);
    }
  }, [authHeader, html, user]);

  useEffect(() => {
    if (user && !html) void loadDraftFromCacheOnOpen();
  }, [user, html, loadDraftFromCacheOnOpen]);

  const saveWeeklyAuto = useCallback(async () => {
    setError(null);
    setStatus(null);
    setWeeklySaveBusy(true);
    try {
      const tp = weeklyTimeHHMM.split(':');
      const h = Number.parseInt(tp[0] || '12', 10);
      const m = Number.parseInt(tp[1] || '0', 10);
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/weekly-auto/settings', {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          enabled: weeklyAutoEnabled,
          weekdayIso: weeklyWeekdayIso,
          hour: Number.isFinite(h) ? h : 12,
          minute: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      if (typeof data.hour === 'number' && typeof data.minute === 'number') {
        setWeeklyTimeHHMM(toTimeInputValue(data.hour, data.minute));
      }
      setStatus('Gemt');
      await refreshPendingSchedules();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setWeeklySaveBusy(false);
    }
  }, [authHeader, refreshPendingSchedules, weeklyAutoEnabled, weeklyTimeHHMM, weeklyWeekdayIso]);

  const loadWeeklyAutoPreview = useCallback(async (offset?: number) => {
    const useOffset = offset ?? weeklyPreviewOffset;
    setError(null);
    setStatus(null);
    setWeeklyPreviewBusy(true);
    try {
      const headers = await authHeader();
      const res = await fetch('/api/newsletter/weekly-auto/preview', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ skipAiIntro: false, weekOffset: useOffset }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || res.statusText);
      setHtml(data.html);
      setSubject(data.subject || '');
      setWeeklyPreviewOffset(typeof data.weekOffset === 'number' ? data.weekOffset : useOffset);
      const isoWeek = data.week?.isoWeek;
      const weekLabel = data.week?.labelDa || '';
      setMeta({
        headline: typeof data.headline === 'string' ? data.headline : '',
        weekLabel: isoWeek ? `Uge ${isoWeek} · ${weekLabel}` : weekLabel,
        articleCount: Array.isArray(data.articles) ? data.articles.length : 0,
        recipientCount: data.recipientCount ?? 0,
        totalSignups: data.totalSignups ?? data.recipientCount ?? 0,
        unsubscribedCount: data.unsubscribedCount ?? 0,
        recipientSource: data.recipientSource || 'unknown',
        formName: data.formName || null,
        warnings: data.warnings || [],
        signupError: data.signupError || null,
      });
      setStatus(useOffset === -1 ? 'Næste automatiske udsendelse' : `Uge ${isoWeek ?? ''} preview`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setWeeklyPreviewBusy(false);
    }
  }, [authHeader, weeklyPreviewOffset]);

  const sendTest = useCallback(async () => {
    const recipients = activeTestRecipients.filter((e) => e.trim().length > 0);
    if (!recipients.length) {
      setError('Tilføj mindst én testmodtager');
      return;
    }
    setError(null);
    setStatus(null);
    setBusy(true);
    try {
      const headers = await authHeader();
      const failed: string[] = [];

      for (const to of recipients) {
        const res = await fetch('/api/newsletter/send', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            testOnly: true,
            testEmail: to,
            html: html || undefined,
            subject: subject || undefined,
          }),
        });
        const data = await res.json();
        if (!res.ok) {
          failed.push(`${to}: ${data.error || res.statusText}`);
        }
      }

      if (failed.length) {
        throw new Error(failed.slice(0, 3).join(' | '));
      }
      setStatus(`Testmail sendt til ${recipients.length} modtagere`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      await refreshPendingSchedules();
      setBusy(false);
    }
  }, [authHeader, html, subject, activeTestRecipients, refreshPendingSchedules]);

  const addTestRecipient = useCallback(() => {
    const email = testEmailInput.trim().toLowerCase();
    if (!email) return;
    const valid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!valid) {
      setError('Ugyldig e-mailadresse');
      return;
    }
    setError(null);
    if ((DEFAULT_TEST_RECIPIENTS as readonly string[]).includes(email)) {
      setPresetTestActive((p) => ({ ...p, [email]: true }));
    } else {
      setExtraTestEmails((prev) => (prev.includes(email) ? prev : [...prev, email]));
    }
    setTestEmailInput('');
  }, [testEmailInput]);

  const removeExtraTestEmail = useCallback((email: string) => {
    setExtraTestEmails((prev) => prev.filter((x) => x !== email));
  }, []);

  const scheduleSend = useCallback(async () => {
    if (!html || !subject.trim()) {
      setError('Hent Preview først');
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
      setStatus('Afsendelse planlagt');
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
        setStatus('Annulleret');
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
        setStatus(typeof data.message === 'string' ? data.message : 'Intet at sende');
      } else {
        setStatus(typeof data.summary === 'string' ? data.summary : 'Sendt');
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
    if (!window.confirm('Send denne mail til alle modtagere?')) return;
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
      setStatus(
        data.failed > 0
          ? `Sendt til ${data.sent}, ${data.failed} fejlede`
          : `Sendt til ${data.sent} modtagere`
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fejl');
    } finally {
      await refreshPendingSchedules();
      setBusy(false);
    }
  }, [authHeader, html, subject, refreshPendingSchedules]);

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
        <p className="text-white/55 text-sm">Log ind for at fortsætte</p>
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

  const segBtn = (active: boolean) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
      active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
    }`;

  const primaryBtn =
    'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

  const weeklyFieldShell = 'relative w-full';
  const weeklySelectClass =
    'w-full h-10 appearance-none pl-3 pr-10 rounded-lg border border-white/[0.12] bg-[#141414] text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';
  const weeklyTimeClass =
    'w-full h-10 box-border pl-3 pr-10 rounded-lg border border-white/[0.12] bg-[#141414] text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark] relative [&::-webkit-calendar-picker-indicator]:absolute [&::-webkit-calendar-picker-indicator]:right-3 [&::-webkit-calendar-picker-indicator]:top-1/2 [&::-webkit-calendar-picker-indicator]:h-[1.125rem] [&::-webkit-calendar-picker-indicator]:w-[1.125rem] [&::-webkit-calendar-picker-indicator]:-translate-y-1/2 [&::-webkit-calendar-picker-indicator]:cursor-pointer [&::-webkit-calendar-picker-indicator]:opacity-70';

  const secondaryBtn =
    'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

  const dangerOutlineBtn =
    'w-full py-2.5 rounded-xl border border-white/25 text-[13px] text-white/90 hover:bg-white/[0.08] disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

  const anyBusy = busy || scheduleBusy || weeklySaveBusy || weeklyPreviewBusy;

  const toggleMobileSection = (key: string) => {
    setMobileSection((prev) => (prev === key ? null : key));
  };

  const toggleDesktopSection = (key: string) => {
    setDesktopSection((prev) => (prev === key ? null : key));
  };

  const sectionRow = (key: string, label: string, icon: React.ReactNode, subtitle?: string) => (
    <button
      type="button"
      onClick={() => toggleMobileSection(key)}
      className={`flex items-center gap-3 w-full px-4 py-3 rounded-xl border transition-all duration-200 active:scale-[0.98] ${
        mobileSection === key
          ? 'border-white/20 bg-white/[0.06]'
          : 'border-white/[0.08] bg-white/[0.02] hover:bg-white/[0.04]'
      }`}
    >
      <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/60">
        {icon}
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-[13px] font-medium text-white/85">{label}</p>
        {subtitle && <p className="text-[11px] text-white/35 truncate">{subtitle}</p>}
      </div>
      <svg
        className={`size-4 shrink-0 text-white/30 transition-transform duration-200 ${mobileSection === key ? 'rotate-180' : ''}`}
        viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}
      >
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
      </svg>
    </button>
  );

  const sectionContent = (key: string, children: React.ReactNode) =>
    mobileSection === key ? (
      <div className="px-1 pb-1 space-y-3 animate-in fade-in slide-in-from-top-1 duration-200">{children}</div>
    ) : null;

  const chevron = (open: boolean) => (
    <svg
      className={`size-3.5 shrink-0 opacity-60 transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" />
    </svg>
  );
  const expandCls = 'mt-1.5 space-y-1 border-l border-white/15 pl-2.5 text-[10px] leading-snug';

  const sendLogList = mergedSendLog.length > 0 && (
    <ul className="space-y-1.5">
      {mergedSendLog.map((entry) => {
        if (entry.source === 'scheduled') {
          const h = entry.row;
          const rowKey = `s-${h.id}`;
          const open = expandedSendLogKeys.has(rowKey);
          const ok = h.status === 'sent';
          const when = formatSendLogWhen(h.finishedAt);
          return (
            <li key={rowKey} className="list-none">
              <button type="button" onClick={() => toggleSendLogKey(rowKey)} aria-expanded={open}
                className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors active:scale-[0.99] ${ok ? 'border-emerald-500/45 bg-emerald-500/[0.12] text-emerald-50/95 hover:bg-emerald-500/[0.16]' : 'border-rose-500/45 bg-rose-500/[0.12] text-rose-50/95 hover:bg-rose-500/[0.16]'}`}>
                <span className="min-w-0 truncate">Planlagt kø · {when}</span>
                {chevron(open)}
              </button>
              {open ? (<div className={expandCls}><p className={ok ? 'text-emerald-100/80' : 'text-rose-100/80'}>{ok ? 'Sendt' : 'Fejlede'}</p>{h.subject ? <p className="text-white/55 break-words">{h.subject}</p> : null}{ok && h.summary ? <p className="text-emerald-200/75">{h.summary}</p> : null}{!ok && h.error ? <p className="text-rose-200/90 whitespace-pre-wrap break-words">{h.error}</p> : null}</div>) : null}
            </li>
          );
        }
        if (entry.source === 'manual') {
          const m = entry.row;
          const rowKey = `m-${m.id}`;
          const open = expandedSendLogKeys.has(rowKey);
          const typeLabel = m.kind === 'broadcast' ? 'Til alle nu' : 'Testmail';
          const when = formatSendLogWhen(m.finishedAt);
          const ok = m.status !== 'failed';
          return (
            <li key={rowKey} className="list-none">
              <button type="button" onClick={() => toggleSendLogKey(rowKey)} aria-expanded={open}
                className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors active:scale-[0.99] ${ok ? 'border-emerald-500/45 bg-emerald-500/[0.12] text-emerald-50/95 hover:bg-emerald-500/[0.16]' : 'border-rose-500/45 bg-rose-500/[0.12] text-rose-50/95 hover:bg-rose-500/[0.16]'}`}>
                <span className="min-w-0 truncate">{typeLabel} · {when}</span>
                {chevron(open)}
              </button>
              {open ? (<div className={`${expandCls} ${ok ? 'text-emerald-100/85' : 'text-rose-100/85'}`}><p>{ok ? 'Sendt' : 'Fejlede'}</p>{m.subject ? <p className="text-white/60 break-words">{m.subject}</p> : null}{m.detail ? <p className={ok ? 'text-emerald-200/70' : 'text-rose-200/75'}>{m.detail}</p> : null}{!ok && m.error ? <p className="text-rose-200/90 whitespace-pre-wrap break-words">{m.error}</p> : null}</div>) : null}
            </li>
          );
        }
        const w = entry.row;
        const rowKey = `w-${w.id}`;
        const open = expandedSendLogKeys.has(rowKey);
        const ok = w.status === 'sent';
        const failed = w.status === 'failed';
        const when = formatSendLogWhen(w.finishedAt);
        const wLabel = w.status === 'sent' ? 'Sendt' : w.status === 'failed' ? 'Fejlede' : 'Sprunget over';
        return (
          <li key={rowKey} className="list-none">
            <button type="button" onClick={() => toggleSendLogKey(rowKey)} aria-expanded={open}
              className={`w-full flex items-center justify-between gap-2 rounded-lg border px-2 py-1.5 text-left text-[11px] font-medium transition-colors active:scale-[0.99] ${ok ? 'border-emerald-500/45 bg-emerald-500/[0.12] text-emerald-50/95 hover:bg-emerald-500/[0.16]' : failed ? 'border-rose-500/45 bg-rose-500/[0.12] text-rose-50/95 hover:bg-rose-500/[0.16]' : 'border-white/20 bg-white/[0.04] text-white/70 hover:bg-white/[0.07]'}`}>
              <span className="min-w-0 truncate">Ugentlig auto · {when}</span>
              {chevron(open)}
            </button>
            {open ? (<div className={expandCls}><p className={ok ? 'text-emerald-100/80' : failed ? 'text-rose-100/80' : 'text-white/55'}>{wLabel} · uge {w.weekKey}</p>{w.subject ? <p className="text-white/55 break-words">{w.subject}</p> : null}{ok && typeof w.sent === 'number' ? <p className="text-emerald-200/75">{w.sent} sendt{typeof w.recipientCount === 'number' ? ` · ${w.recipientCount} på listen` : ''}</p> : null}{w.status === 'skipped' && w.skipReason ? <p className="text-white/50 whitespace-pre-wrap break-words">{w.skipReason}</p> : null}{failed && w.error ? <p className="text-rose-200/90 whitespace-pre-wrap break-words">{w.error}</p> : null}</div>) : null}
          </li>
        );
      })}
    </ul>
  );

  /* ── Shared aside content blocks (used in both desktop sidebar and mobile sheet) ── */

  const autoSendBlock = (
    <>
      <div className="flex items-center justify-between gap-3">
        <span className="text-[12px] text-white/38">Automatisk hver uge</span>
        <button type="button" role="switch" aria-checked={weeklyAutoEnabled}
          disabled={weeklySaveBusy || weeklyPreviewBusy}
          onClick={() => setWeeklyAutoEnabled((v) => !v)}
          className={`relative h-7 w-12 shrink-0 rounded-full transition-colors duration-200 ${weeklyAutoEnabled ? 'bg-emerald-600/90' : 'bg-white/15'} disabled:opacity-40`}>
          <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow-sm transition-transform duration-200 ${weeklyAutoEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
        </button>
      </div>
      <p className="text-[11px] text-white/28 leading-snug -mt-1">
        {weeklyAutoEnabled ? `${ISO_WEEKDAY_DA[weeklyWeekdayIso] ?? '—'} kl. ${weeklyTimeHHMM} · København` : 'Slået fra'}
      </p>
      {weeklyAutoEnabled ? (
        <div className="grid gap-2">
          <div className={weeklyFieldShell}>
            <select value={weeklyWeekdayIso} disabled={weeklySaveBusy || weeklyPreviewBusy}
              onChange={(e) => setWeeklyWeekdayIso(Number(e.target.value))} className={weeklySelectClass}>
              {[1,2,3,4,5,6,7].map((d) => <option key={d} value={d}>{ISO_WEEKDAY_DA[d]}</option>)}
            </select>
            <span className="pointer-events-none absolute right-3 top-1/2 size-[1.125rem] -translate-y-1/2 text-white/40" aria-hidden>
              <svg viewBox="0 0 20 20" fill="none" className="size-full" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" /></svg>
            </span>
          </div>
          <input type="time" step={900} title="København-tid" value={weeklyTimeHHMM}
            disabled={weeklySaveBusy || weeklyPreviewBusy}
            onChange={(e) => setWeeklyTimeHHMM(e.target.value || '12:00')} className={weeklyTimeClass} />
        </div>
      ) : null}
      <div className="flex gap-2">
        <button type="button" disabled={anyBusy} onClick={() => void saveWeeklyAuto()}
          className="flex-1 py-2 rounded-lg border border-white/[0.12] text-[13px] text-white/80 hover:bg-white/[0.05] disabled:opacity-40 transition-all duration-200">
          {weeklySaveBusy ? 'Gemmer…' : 'Gem'}
        </button>
        <button type="button" disabled={anyBusy || weeklyPreviewOffset <= -12}
          onClick={() => { const n = weeklyPreviewOffset - 1; setWeeklyPreviewOffset(n); void loadWeeklyAutoPreview(n); }}
          className="py-2 px-3 rounded-lg border border-white/[0.12] text-[13px] text-white/80 hover:bg-white/[0.05] disabled:opacity-40 transition-all duration-200" title="Forrige uge">‹</button>
        <button type="button" disabled={anyBusy} onClick={() => void loadWeeklyAutoPreview()}
          className="flex-1 py-2 rounded-lg border border-white/[0.12] text-[13px] text-white/80 hover:bg-white/[0.05] disabled:opacity-40 transition-all duration-200">
          {weeklyPreviewBusy ? 'Henter…' : 'Vis uge'}
        </button>
        <button type="button" disabled={anyBusy || weeklyPreviewOffset >= 0}
          onClick={() => { const n = weeklyPreviewOffset + 1; setWeeklyPreviewOffset(n); void loadWeeklyAutoPreview(n); }}
          className="py-2 px-3 rounded-lg border border-white/[0.12] text-[13px] text-white/80 hover:bg-white/[0.05] disabled:opacity-40 transition-all duration-200" title="Næste uge">›</button>
      </div>
    </>
  );

  const nextAutoLabel = weeklyAutoEnabled
    ? `${ISO_WEEKDAY_DA[weeklyWeekdayIso] ?? '—'} kl. ${weeklyTimeHHMM}`
    : null;

  const statusDashboard = (
    <div className="rounded-xl border border-white/[0.10] bg-gradient-to-b from-white/[0.04] to-transparent p-3.5 space-y-3">
      <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">Status</p>
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-center">
          <p className="text-[18px] font-semibold text-white/90 tabular-nums">{meta?.articleCount ?? '—'}</p>
          <p className="text-[10px] text-white/35 mt-0.5">Artikler</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-center">
          <p className="text-[18px] font-semibold text-white/90 tabular-nums">{meta?.recipientCount ?? '—'}</p>
          <p className="text-[10px] text-white/35 mt-0.5">Modtagere</p>
        </div>
        <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-center">
          <p className={`text-[18px] font-semibold tabular-nums ${weeklyAutoEnabled ? 'text-emerald-400/90' : 'text-white/30'}`}>
            {weeklyAutoEnabled ? '✓' : '—'}
          </p>
          <p className="text-[10px] text-white/35 mt-0.5">Auto-send</p>
        </div>
      </div>
      {meta && (
        <div className="space-y-1.5 pt-1">
          {subject && <p className="text-[13px] text-white/85 font-medium leading-snug break-words">{subject}</p>}
          <p className="text-[11px] text-white/40">{meta.weekLabel}</p>
          {nextAutoLabel && (
            <p className="text-[11px] text-emerald-400/70">Næste auto-send: {nextAutoLabel}</p>
          )}
          {meta.signupError && <p className="text-amber-400/85 text-[11px] leading-snug break-words">{meta.signupError}</p>}
          {meta.warnings.map((w, i) => <p key={i} className="text-white/50 text-[11px] leading-snug">{w}</p>)}
        </div>
      )}
      {!meta && (
        <p className="text-[11px] text-white/30 text-center py-1">Tryk &laquo;Hent Preview&raquo; for at se status</p>
      )}
    </div>
  );

  const metaBlock = meta && (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 space-y-2.5 text-[13px]">
      {subject ? (<div><p className="text-[12px] text-white/38 mb-0.5">Emne</p><p className="text-white/[0.88] leading-snug break-words">{subject}</p></div>) : null}
      <div className="grid gap-1 text-white/45 text-[12px]">
        {meta.headline ? <p><span className="text-white/40">Overskrift</span> <span className="text-white/70">{meta.headline}</span></p> : null}
        <p><span className="text-white/40">Periode</span> {meta.weekLabel}</p>
        <p><span className="text-white/40">Artikler</span> {meta.articleCount}</p>
        <p><span className="text-white/40">Modtagere</span> {meta.recipientCount}{meta.unsubscribedCount > 0 && <span className="text-white/30"> · {meta.unsubscribedCount} frameldt</span>}</p>
      </div>
      {meta.formName && <p className="text-white/35 text-[11px] pt-1 border-t border-white/[0.06]">{meta.recipientSource === 'forms-api' ? 'Webflow' : 'CMS'}{meta.formName ? ` · ${meta.formName}` : ''}</p>}
      {meta.signupError && <p className="text-amber-400/85 break-words whitespace-pre-wrap text-[11px] leading-snug pt-1 border-t border-white/[0.06]">{meta.signupError}</p>}
      {meta.warnings.map((w, i) => <p key={i} className="text-white/80 text-[11px] leading-snug">{w}</p>)}
    </div>
  );

  const testMailBlock = (
    <>
      <label className="block text-[12px] text-white/38" htmlFor="newsletter-test-email-input">Testmail</label>
      <div className="flex min-h-[2.625rem] flex-wrap items-center gap-1 rounded-lg border border-white/[0.12] bg-[#141414] px-2 py-1.5 [color-scheme:dark] focus-within:border-white/25 focus-within:ring-1 focus-within:ring-white/10" role="group">
        {DEFAULT_TEST_RECIPIENTS.map((email) => {
          const on = Boolean(presetTestActive[email]);
          return (
            <button key={email} type="button" onClick={() => setPresetTestActive((p) => ({ ...p, [email]: !p[email] }))} aria-pressed={on}
              className={`inline-flex max-w-full min-h-0 items-center gap-0.5 rounded-md border px-1.5 py-0.5 text-left text-[10px] leading-snug transition-colors active:scale-[0.98] ${on ? 'border-emerald-500/45 bg-emerald-500/[0.12] text-emerald-50/95' : 'border-white/[0.08] bg-white/[0.03] text-white/40 hover:border-white/15 hover:bg-white/[0.05] hover:text-white/55'}`}>
              {on ? <svg className="size-2.5 shrink-0 text-emerald-400" viewBox="0 0 12 12" fill="none" aria-hidden><path d="M10 3L4.5 8.5L2 6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" /></svg> : null}
              <span className="truncate">{email}</span>
            </button>
          );
        })}
        {extraTestEmails.map((email) => (
          <span key={email} className="inline-flex max-w-full items-center gap-0.5 rounded-md border border-white/12 bg-white/[0.06] px-1.5 py-0.5 text-[10px] leading-snug text-white/80">
            <span className="truncate">{email}</span>
            <button type="button" aria-label={`Fjern ${email}`} onClick={() => removeExtraTestEmail(email)} className="shrink-0 rounded px-0.5 text-white/45 hover:text-rose-300/90">×</button>
          </span>
        ))}
        <input id="newsletter-test-email-input" type="email" value={testEmailInput} onChange={(e) => setTestEmailInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addTestRecipient(); }}}
          onBlur={() => { if (testEmailInput.trim()) addTestRecipient(); }}
          placeholder="Tilføj e-mail" autoComplete="email"
          className="min-w-[7rem] flex-1 border-0 bg-transparent py-1 pl-0.5 text-[12px] text-white placeholder:text-white/28 focus:outline-none focus:ring-0" />
      </div>
      <button type="button" disabled={anyBusy} onClick={sendTest} className={secondaryBtn}>Send testmail</button>
    </>
  );

  const scheduleBlock = (
    <>
      <ul className="space-y-2">
        {showWeeklyPlanSlot && weeklyAutoPlan ? (
          <li className="list-none">
            <div className={`rounded-lg border px-2.5 py-2 text-[11px] ${!weeklyAutoPlan.enabled ? 'border-white/15 bg-white/[0.04] text-white/45' : weeklyAutoPlan.doc?.status === 'failed' ? 'border-rose-500/35 bg-rose-500/[0.08] text-rose-100/90' : weeklyAutoPlan.doc?.status === 'sent' ? 'border-emerald-500/35 bg-emerald-500/[0.08] text-emerald-100/90' : weeklyAutoPlan.doc?.status === 'skipped' ? 'border-white/20 bg-white/[0.05] text-white/60' : weeklyAutoPlan.doc?.status === 'processing' ? 'border-amber-500/35 bg-amber-500/[0.08] text-amber-100/90' : 'border-white/25 bg-white/[0.06] text-white/70'}`}>
              <p className="text-[10px] uppercase tracking-wide text-white/35 mb-1">Ugentlig automatisk</p>
              <p className="text-white/85 font-medium leading-snug">{weeklyAutoPlan.enabled ? `${ISO_WEEKDAY_DA[weeklyAutoPlan.weekdayIso] ?? '—'} kl. ${toTimeInputValue(weeklyAutoPlan.hour, weeklyAutoPlan.minute)} · København · ${weeklyAutoPlan.weekKey}` : 'Slået fra'}</p>
              {weeklyAutoPlan.enabled ? (
                <div className="mt-1.5 text-[10px] leading-snug space-y-1">
                  {!weeklyAutoPlan.doc ? <p className="text-white/50">Afventer send efter planlagt tidspunkt.</p>
                    : weeklyAutoPlan.doc.status === 'processing' ? <p className="text-amber-200/80">Under behandling…</p>
                    : weeklyAutoPlan.doc.status === 'sent' ? <><p className="text-emerald-200/80">Sendt</p>{weeklyAutoPlan.doc.subject ? <p className="text-white/55 line-clamp-3">{weeklyAutoPlan.doc.subject}</p> : null}</>
                    : weeklyAutoPlan.doc.status === 'failed' ? <><p className="text-rose-200/90">Fejlede</p>{weeklyAutoPlan.doc.error ? <p className="text-rose-200/85 whitespace-pre-wrap break-words">{weeklyAutoPlan.doc.error}</p> : null}</>
                    : <><p className="text-white/55">Sprunget over</p>{weeklyAutoPlan.doc.skipReason ? <p className="text-white/45 whitespace-pre-wrap break-words">{weeklyAutoPlan.doc.skipReason}</p> : null}</>}
                </div>
              ) : null}
            </div>
          </li>
        ) : null}
        {pendingSchedules.length > 0 ? <li className="list-none text-[10px] uppercase tracking-wide text-white/35 pt-1">Engangs · i køen</li> : null}
        {pendingSchedules.map((p) => {
          const due = new Date(p.scheduledFor).getTime(); const now = Date.now(); const lagMs = Number.isFinite(due) ? now - due : -1; const isDue = lagMs >= 0; const longOverdue = lagMs >= 20 * 60 * 1000;
          return (
            <li key={p.id} className={`flex flex-col gap-1.5 rounded-lg border px-2.5 py-2 text-[11px] text-white/55 ${longOverdue ? 'border-amber-500/45 bg-amber-500/[0.1]' : 'border-white/25 bg-white/[0.06]'}`}>
              <span className="text-white/75">{new Date(p.scheduledFor).toLocaleString('da-DK', { dateStyle: 'short', timeStyle: 'short' })}</span>
              {isDue ? <div className="flex flex-col gap-1"><span className="text-[11px] text-white/60 leading-snug">Sendes automatisk.</span>{longOverdue ? <span className="text-[10px] text-amber-200/75 leading-snug">Ser du ikke afsendelse efter længere tid, kontakt den tekniske ansvarlige.</span> : null}</div> : null}
              <span className="text-white/50 line-clamp-2">{p.subject}</span>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5">
                <button type="button" disabled={scheduleBusy} onClick={() => void cancelSchedule(p.id)} className="self-start text-[11px] text-rose-300/80 hover:text-rose-200 transition-colors">Annuller</button>
                {isDue ? <button type="button" disabled={scheduleBusy} onClick={() => void runDueSchedule()} className="text-[10px] text-white/35 hover:text-white/55 underline underline-offset-2 decoration-white/25 transition-colors disabled:opacity-40">Send manuelt (nødfald)</button> : null}
              </div>
            </li>
          );
        })}
      </ul>
      <p className="text-[11px] text-white/30 pt-1">Ny engangs-afsendelse</p>
      <input type="datetime-local" value={scheduleAtLocal} onChange={(e) => setScheduleAtLocal(e.target.value)}
        className="w-full px-3 py-2.5 rounded-lg border border-white/[0.12] bg-[#141414] text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]" />
      <button type="button" disabled={anyBusy} onClick={() => void scheduleSend()} className={secondaryBtn}>Planlæg</button>
    </>
  );

  /* ── Preview iframe (shared) ── */

  const previewIframe = html ? (
    <div className={`flex min-h-0 w-full flex-1 flex-col ${previewViewport === 'mobile' ? 'items-center overflow-auto py-1' : ''}`}>
      <div className={`flex min-h-0 flex-col ${previewViewport === 'mobile' ? 'w-full max-w-[390px] shrink-0 rounded-[1.35rem] border border-white/12 bg-black/35 p-1.5 shadow-[0_12px_40px_rgba(0,0,0,0.45)]' : 'h-full min-h-0 w-full flex-1'}`}>
        <iframe title="Preview"
          className={`w-full flex-1 min-h-0 rounded-xl border border-white/12 shadow-[0_0_0_1px_rgba(255,255,255,0.04)_inset] ${previewTheme === 'dark' ? 'bg-[#1a1a1a]' : 'bg-[#ebebeb]'} ${embedded ? '' : 'min-h-[480px]'} ${previewViewport === 'mobile' ? 'min-h-[520px] rounded-[1rem]' : ''}`}
          srcDoc={previewHtml ?? ''} />
      </div>
    </div>
  ) : (
    <div className="h-full min-h-[160px] flex items-center justify-center rounded-xl border border-dashed border-white/[0.08] bg-black/15 text-white/32 text-[13px] px-6 text-center">
      Hent Preview
    </div>
  );

  /* ══════════════════════════ RENDER ══════════════════════════ */

  return (
    <div className={embedded
      ? 'flex flex-col h-full min-h-0 text-white bg-transparent font-poppins'
      : 'min-h-[100dvh] flex flex-col text-white bg-[#0a0a0a] font-poppins'
    }>
      {/* ── Header ── */}
      <header className={embedded
        ? 'border-b border-white/10 px-3 lg:px-4 py-2.5 lg:py-3 flex items-center justify-between gap-3 shrink-0 bg-black/25 backdrop-blur-md'
        : 'border-b border-white/10 px-4 lg:px-5 py-3 lg:py-4 flex items-center justify-between gap-3 shrink-0 bg-[#0c0c0c]'
      }>
        <h1 className={`font-medium tracking-tight text-white ${embedded ? 'text-[15px]' : 'text-[17px]'}`}>Nyhedsbrev</h1>
        <div className="flex items-center gap-2 shrink-0">
          {/* Theme + viewport toggles: hidden on mobile, shown in sheet instead */}
          <div className="hidden lg:flex items-center gap-2">
            <div className="flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm" role="group">
              <button type="button" onClick={() => setPreviewTheme('light')} className={segBtn(previewTheme === 'light')}>Lys</button>
              <button type="button" onClick={() => setPreviewTheme('dark')} className={segBtn(previewTheme === 'dark')}>Mørk</button>
            </div>
            <div className="flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm" role="group">
              <button type="button" onClick={() => setPreviewViewport('mobile')} className={segBtn(previewViewport === 'mobile')}>Mobile</button>
              <button type="button" onClick={() => setPreviewViewport('desktop')} className={segBtn(previewViewport === 'desktop')}>Desktop</button>
            </div>
          </div>
          {onClose ? (
            <button type="button" onClick={onClose}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.12] active:scale-[0.97]" aria-label="Luk">
              <svg className="size-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} aria-hidden><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          ) : null}
          {!embedded && <Link href="/ai" className="px-3 py-1.5 rounded-lg border border-white/12 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-200 active:scale-[0.98]">← Tilbage</Link>}
        </div>
      </header>

      {/* ── Desktop: classic sidebar + preview ── */}
      <div className="flex-1 hidden lg:flex min-h-0 overflow-hidden">
        <aside className={embedded
          ? 'w-[min(300px,100%)] shrink-0 border-r border-white/10 p-3 px-4 py-4 space-y-3 overflow-y-auto bg-black/10'
          : 'w-[380px] shrink-0 border-r border-white/10 p-5 space-y-4 overflow-y-auto bg-[#0c0c0c]'
        }>
          {/* Status dashboard */}
          {statusDashboard}

          {/* Primary actions — side by side */}
          <div className="flex gap-2">
            <button type="button" disabled={anyBusy} onClick={() => loadDraft()} className={`flex-1 ${primaryBtn}`}>Hent Preview</button>
            <button type="button" disabled={anyBusy} onClick={sendAll} className={`flex-1 ${dangerOutlineBtn}`}>Send til alle</button>
          </div>

          {error && <p className="text-[13px] text-red-400/95">{error}</p>}
          {status && <p className="text-[13px] text-white/90">{status}</p>}

          {/* Collapsible sections */}
          <div className="space-y-1.5 pt-1">
            {/* Auto-send */}
            <button type="button" onClick={() => toggleDesktopSection('auto')}
              className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${desktopSection === 'auto' ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-medium text-white/80">Automatisk udsendelse</p>
                <p className="text-[10px] text-white/30 truncate">{weeklyAutoEnabled ? `${ISO_WEEKDAY_DA[weeklyWeekdayIso] ?? '—'} kl. ${weeklyTimeHHMM}` : 'Slået fra'}</p>
              </div>
              <svg className={`size-3.5 shrink-0 text-white/25 transition-transform duration-200 ${desktopSection === 'auto' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" /></svg>
            </button>
            {desktopSection === 'auto' && (
              <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-3 space-y-3 ml-1">{autoSendBlock}</div>
            )}

            {/* Test */}
            <button type="button" onClick={() => toggleDesktopSection('test')}
              className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${desktopSection === 'test' ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-medium text-white/80">Testmail</p>
                <p className="text-[10px] text-white/30">{activeTestRecipients.length} modtager{activeTestRecipients.length !== 1 ? 'e' : ''}</p>
              </div>
              <svg className={`size-3.5 shrink-0 text-white/25 transition-transform duration-200 ${desktopSection === 'test' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" /></svg>
            </button>
            {desktopSection === 'test' && (
              <div className="space-y-2 px-1 ml-1">{testMailBlock}</div>
            )}

            {/* Schedule */}
            <button type="button" onClick={() => toggleDesktopSection('schedule')}
              className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${desktopSection === 'schedule' ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}>
              <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
              </div>
              <div className="flex-1 min-w-0 text-left">
                <p className="text-[12px] font-medium text-white/80">Planlæg afsendelse</p>
                {pendingSchedules.length > 0 && <p className="text-[10px] text-white/30">{pendingSchedules.length} i kø</p>}
              </div>
              <svg className={`size-3.5 shrink-0 text-white/25 transition-transform duration-200 ${desktopSection === 'schedule' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" /></svg>
            </button>
            {desktopSection === 'schedule' && (
              <div className="space-y-2 px-1 ml-1">{scheduleBlock}</div>
            )}

            {/* History */}
            {mergedSendLog.length > 0 && (
              <>
                <button type="button" onClick={() => toggleDesktopSection('log')}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${desktopSection === 'log' ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] hover:bg-white/[0.03]'}`}>
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[12px] font-medium text-white/80">Historik</p>
                    <p className="text-[10px] text-white/30">{mergedSendLog.length} poster</p>
                  </div>
                  <svg className={`size-3.5 shrink-0 text-white/25 transition-transform duration-200 ${desktopSection === 'log' ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 8l4 4 4-4" /></svg>
                </button>
                {desktopSection === 'log' && (
                  <div className="px-1 ml-1">{sendLogList}</div>
                )}
              </>
            )}
          </div>
        </aside>
        <main className={`flex-1 min-h-0 flex flex-col ${embedded ? 'p-3 bg-transparent' : 'p-5 bg-[#080808]'} ${html && previewViewport === 'mobile' ? 'items-center' : ''}`}>
          {previewIframe}
        </main>
      </div>

      {/* ── Mobile: full-screen preview + bottom sheet ── */}
      <div className="flex-1 flex flex-col lg:hidden min-h-0 relative">
        {/* Preview fills the space */}
        <main className={`flex-1 min-h-0 flex flex-col p-2 bg-transparent ${html && previewViewport === 'mobile' ? 'items-center' : ''}`}>
          {previewIframe}
        </main>

        {/* Bottom sheet overlay backdrop */}
        {mobileSheetOpen && (
          <div className="absolute inset-0 z-40 bg-black/50 backdrop-blur-sm" onClick={() => { setMobileSheetOpen(false); setMobileSection(null); }} />
        )}

        {/* Bottom sheet */}
        <div
          ref={sheetRef}
          className={`absolute left-0 right-0 bottom-0 z-50 flex flex-col bg-[#111] border-t border-white/12 rounded-t-2xl transition-all duration-300 ease-out ${
            mobileSheetOpen ? 'max-h-[85vh]' : 'max-h-[72px]'
          }`}
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 8px)' }}
        >
          {/* Sheet handle + collapsed bar */}
          <button
            type="button"
            onClick={() => { setMobileSheetOpen((v) => !v); if (mobileSheetOpen) setMobileSection(null); }}
            className="flex flex-col items-center w-full pt-2 pb-3 px-4 touch-target"
          >
            <div className="w-8 h-1 rounded-full bg-white/20 mb-2.5" />
            <div className="flex items-center justify-between w-full">
              <div className="min-w-0 flex-1">
                {meta ? (
                  <p className="text-[12px] text-white/60 truncate">
                    {meta.weekLabel} · {meta.articleCount} artikler · {meta.recipientCount} modtagere
                  </p>
                ) : (
                  <p className="text-[12px] text-white/40">Tryk for indstillinger</p>
                )}
              </div>
              {!mobileSheetOpen && (
                <button type="button" disabled={anyBusy} onClick={(e) => { e.stopPropagation(); void loadDraft(); }}
                  className="ml-3 px-4 py-1.5 rounded-full bg-white/10 border border-white/15 text-[12px] font-medium text-white/80 active:scale-[0.97] disabled:opacity-40">
                  Hent Preview
                </button>
              )}
            </div>
          </button>

          {/* Expanded sheet content */}
          {mobileSheetOpen && (
            <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-2 overscroll-contain">
              {/* Status dashboard */}
              {statusDashboard}

              {/* Preview toggles */}
              <div className="flex gap-2">
                <div className="flex flex-1 rounded-xl border border-white/12 p-0.5 gap-0.5 bg-black/30" role="group">
                  <button type="button" onClick={() => setPreviewTheme('light')} className={`flex-1 ${segBtn(previewTheme === 'light')}`}>Lys</button>
                  <button type="button" onClick={() => setPreviewTheme('dark')} className={`flex-1 ${segBtn(previewTheme === 'dark')}`}>Mørk</button>
                </div>
                <div className="flex flex-1 rounded-xl border border-white/12 p-0.5 gap-0.5 bg-black/30" role="group">
                  <button type="button" onClick={() => setPreviewViewport('mobile')} className={`flex-1 ${segBtn(previewViewport === 'mobile')}`}>Mobile</button>
                  <button type="button" onClick={() => setPreviewViewport('desktop')} className={`flex-1 ${segBtn(previewViewport === 'desktop')}`}>Desktop</button>
                </div>
              </div>

              {/* Primary actions */}
              <div className="space-y-2">
                <button type="button" disabled={anyBusy} onClick={() => loadDraft()} className={primaryBtn}>Hent Preview</button>
                <button type="button" disabled={anyBusy} onClick={sendAll} className={dangerOutlineBtn}>Send til alle nu</button>
              </div>

              {/* Collapsible sections */}
              {sectionRow('auto', 'Automatisk udsendelse',
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>,
                weeklyAutoEnabled ? `${ISO_WEEKDAY_DA[weeklyWeekdayIso] ?? '—'} kl. ${weeklyTimeHHMM}` : 'Slået fra'
              )}
              {sectionContent('auto', autoSendBlock)}

              {sectionRow('test', 'Testmail',
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><path d="m22 6-10 7L2 6"/></svg>,
                `${activeTestRecipients.length} modtager${activeTestRecipients.length !== 1 ? 'e' : ''}`
              )}
              {sectionContent('test', testMailBlock)}

              {sectionRow('schedule', 'Planlæg afsendelse',
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>,
                pendingSchedules.length > 0 ? `${pendingSchedules.length} i kø` : undefined
              )}
              {sectionContent('schedule', scheduleBlock)}

              {mergedSendLog.length > 0 && (
                <>
                  {sectionRow('log', 'Seneste udsendelser',
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>,
                    `${mergedSendLog.length} poster`
                  )}
                  {sectionContent('log', sendLogList)}
                </>
              )}

              {error && <p className="text-[13px] text-red-400/95">{error}</p>}
              {status && <p className="text-[13px] text-white/90">{status}</p>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
