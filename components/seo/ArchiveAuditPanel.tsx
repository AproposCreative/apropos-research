'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  ARCHIVE_JOB_TASK_LABELS,
  deriveJobStatus,
  jobStatusBadge,
  type ArchiveJob,
  type ArchiveJobTab,
  type ArchiveJobTaskKind,
} from '@/lib/seo-engine/archive-jobs';

const secondaryBtn =
  'px-3 py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98] touch-target';
const primaryBtn =
  'px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-[13px] font-medium text-white hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 transition-all duration-200 active:scale-[0.99] touch-target';
const dangerOutlineBtn =
  'px-4 py-2.5 rounded-xl border border-white/25 text-[13px] text-white/90 hover:bg-white/[0.08] disabled:opacity-40 transition-all duration-200 active:scale-[0.98] touch-target';
const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] touch-target ${
    active
      ? 'bg-white/12 text-white shadow-sm border border-white/10'
      : 'text-white/45 hover:text-white/75'
  }`;

type PreviewState = {
  jobId: string;
  kinds: ArchiveJobTaskKind[];
  summary: string;
  confirmToken: string;
  seoMeta?: {
    oldSeoTitle: string | null;
    oldMetaDescription: string | null;
    newSeoTitle: string;
    newMetaDescription: string;
  };
  content?: {
    links: number;
    headings: number;
    canonicalChanged: boolean;
    thumbAltChanged: boolean;
  };
};

function badgeDot(tone: string) {
  if (tone === 'ok') return 'bg-emerald-400';
  if (tone === 'warn') return 'bg-amber-400';
  if (tone === 'err') return 'bg-rose-400';
  if (tone === 'run') return 'bg-white/40';
  return 'bg-white/40';
}

export default function ArchiveAuditPanel() {
  const { user } = useAuth();
  const [tab, setTab] = useState<ArchiveJobTab>('open');
  const [limit, setLimit] = useState(80);
  const [jobs, setJobs] = useState<ArchiveJob[]>([]);
  const [counts, setCounts] = useState({ open: 0, running: 0, done: 0 });
  const [loading, setLoading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const token = await user?.getIdToken?.();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [user]);

  const refreshList = useCallback(async () => {
    const headers = await authHeaders();
    const res = await fetch(`/api/seo-engine/archive-jobs/scan?tab=${tab}&limit=120`, {
      headers,
    });
    const j = await res.json();
    if (!res.ok) throw new Error(j.error || 'Kunne ikke hente kø');
    setJobs(j.jobs || []);
    if (j.counts) setCounts(j.counts);
  }, [authHeaders, tab]);

  const runScan = async () => {
    setLoading(true);
    setError(null);
    setPreview(null);
    setNote(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/archive-jobs/scan', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Scan fejlede');
      setJobs(j.jobs || []);
      setNote(
        `Scan færdig · ${j.jobCount} jobs · ${j.skippedNoise || 0} støj skjult (EN 404 m.m.)`
      );
      setTab('open');
      try {
        await refreshList();
      } catch {
        /* jobs already in response */
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const switchTab = async (next: ArchiveJobTab) => {
    setTab(next);
    setPreview(null);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/seo-engine/archive-jobs/scan?tab=${next}&limit=120`, {
        headers,
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Kunne ikke hente kø');
      setJobs(j.jobs || []);
      if (j.counts) setCounts(j.counts);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const runLos = async (job: ArchiveJob) => {
    setBusyId(job.jobId);
    setError(null);
    setPreview(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(
        `/api/seo-engine/archive-jobs/${encodeURIComponent(job.jobId)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({ action: 'preview', job }),
        }
      );
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Preview fejlede');
      setPreview(j.preview as PreviewState);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmLos = async () => {
    if (!preview) return;
    const ok = window.confirm(
      `${preview.summary}\n\nSkriver til Webflow. Backup tages først. Publiceret status bevares.`
    );
    if (!ok) return;
    setBusyId(preview.jobId);
    setError(null);
    try {
      const headers = await authHeaders();
      const job = jobs.find((j) => j.jobId === preview.jobId);
      const res = await fetch(
        `/api/seo-engine/archive-jobs/${encodeURIComponent(preview.jobId)}`,
        {
          method: 'POST',
          headers,
          body: JSON.stringify({
            action: 'apply',
            confirmOverwrite: true,
            confirmToken: preview.confirmToken,
            job,
          }),
        }
      );
      const j = await res.json();
      if (!res.ok && !j.job) throw new Error(j.error || 'Anvendelse fejlede');
      if (j.job) {
        setJobs((prev) => prev.map((x) => (x.jobId === j.job.jobId ? j.job : x)));
        const badge = jobStatusBadge(j.job);
        setNote(
          j.written
            ? `Skrevet · ${badge.label}. Succes = planlagte tasks — ikke hele artiklen P0-fri.`
            : j.error || 'Ikke skrevet'
        );
      }
      if (j.error) setError(j.error);
      setPreview(null);
      await refreshList().catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (job: ArchiveJob) => {
    setBusyId(job.jobId);
    try {
      const headers = await authHeaders();
      await fetch(`/api/seo-engine/archive-jobs/${encodeURIComponent(job.jobId)}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action: 'dismiss' }),
      });
      setJobs((prev) => prev.filter((j) => j.jobId !== job.jobId));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const visible = useMemo(() => jobs, [jobs]);

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.03] p-3 lg:p-4 space-y-3 font-poppins">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-white tracking-tight">Arkiv</p>
          <p className="text-[12px] text-white/45 mt-0.5 leading-snug">
            Impact-kø med smalle fix-jobs — ikke mega-strategize. Scan → Løs → verificér.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-white/45 flex items-center gap-1.5">
            Antal
            <select
              className="apropos-input-dark h-10 rounded-lg border border-white/12 bg-[#141414] px-2 text-[12px] text-white"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={loading}
            >
              {[40, 80, 150, 300].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={primaryBtn} disabled={loading} onClick={() => void runScan()}>
            {loading ? 'Scanner…' : 'Scan → kø'}
          </button>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5 items-center">
        {(
          [
            ['open', 'Åbne', counts.open],
            ['running', 'Kører', counts.running],
            ['done', 'Løst', counts.done],
          ] as const
        ).map(([id, label, n]) => (
          <button key={id} type="button" className={segBtn(tab === id)} onClick={() => void switchTab(id)}>
            {label}
            <span className="ml-1 text-white/35">{n}</span>
          </button>
        ))}
      </div>

      {error && <p className="text-[12px] text-red-400/95">{error}</p>}
      {note && <p className="text-[12px] text-white/55">{note}</p>}

      {preview && (
        <div className="rounded-xl border border-white/25 bg-black/40 p-3 space-y-2 shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)]">
          <p className="text-[13px] font-medium text-white/90">Løs — preview</p>
          <p className="text-[12px] text-white/70">{preview.summary}</p>
          {preview.seoMeta && (
            <div className="text-[11px] text-white/45 space-y-1">
              <p>
                Title: <span className="text-white/30 line-through">{preview.seoMeta.oldSeoTitle || '∅'}</span>
                {' → '}
                <span className="text-white/80">{preview.seoMeta.newSeoTitle}</span>
              </p>
              <p className="line-clamp-2">
                Meta: {preview.seoMeta.newMetaDescription}
              </p>
            </div>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            <button type="button" className={secondaryBtn} onClick={() => setPreview(null)}>
              Annullér
            </button>
            <button type="button" className={dangerOutlineBtn} onClick={() => void confirmLos()}>
              Bekræft skrivning
            </button>
          </div>
        </div>
      )}

      <div className="space-y-2">
        {visible.length === 0 && !loading ? (
          <p className="text-[12px] text-white/40 px-1 py-6 text-center">
            Ingen jobs i «{tab === 'open' ? 'Åbne' : tab === 'running' ? 'Kører' : 'Løst'}». Kør Scan → kø.
          </p>
        ) : null}

        {visible.map((job) => {
          const badge = jobStatusBadge(job);
          const status = deriveJobStatus(job.tasks);
          const busy = busyId === job.jobId;
          const openKinds = job.tasks
            .filter((t) => t.status === 'open' || t.status === 'failed')
            .map((t) => t.kind);
          return (
            <article
              key={job.jobId}
              className="rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-3 space-y-2"
            >
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
                      <span className={`size-1.5 rounded-full ${badgeDot(badge.tone)}`} />
                      {badge.label}
                    </span>
                    <span className="text-[10px] text-white/30 uppercase">{job.locale}</span>
                  </div>
                  <p className="text-[13px] font-medium text-white/90 mt-1.5 truncate">
                    {job.title}
                  </p>
                  <p className="text-[11px] text-white/40 mt-0.5">{job.whyInQueue}</p>
                  {job.seoTitle ? (
                    <p className="text-[10px] text-white/30 mt-1 truncate">SEO: {job.seoTitle}</p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  {tab !== 'done' && openKinds.length > 0 ? (
                    <button
                      type="button"
                      className={primaryBtn}
                      disabled={busy || status === 'fixing'}
                      onClick={() => void runLos(job)}
                    >
                      {busy ? '…' : 'Løs'}
                    </button>
                  ) : null}
                  {tab === 'open' ? (
                    <button
                      type="button"
                      className={secondaryBtn}
                      disabled={busy}
                      onClick={() => void dismiss(job)}
                    >
                      Afvis
                    </button>
                  ) : null}
                </div>
              </div>
              <ul className="flex flex-wrap gap-1.5">
                {job.tasks.map((t) => (
                  <li
                    key={t.kind}
                    className={`rounded-lg border px-2 py-1 text-[10px] ${
                      t.status === 'verified'
                        ? 'border-white/15 text-white/70 bg-white/[0.06]'
                        : t.status === 'failed'
                          ? 'border-white/20 text-white/55'
                          : 'border-white/[0.06] text-white/40'
                    }`}
                  >
                    {ARCHIVE_JOB_TASK_LABELS[t.kind]}
                    {t.status === 'verified' ? ' · ok' : t.status === 'failed' ? ' · fejl' : ''}
                  </li>
                ))}
              </ul>
            </article>
          );
        })}
      </div>
    </section>
  );
}
