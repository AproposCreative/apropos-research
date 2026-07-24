'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import {
  ARCHIVE_APPLY_MAX_BATCH,
  ARCHIVE_APPLY_WEBFLOW_BUSY_DA,
  ARCHIVE_CONTENT_MAX_BATCH,
  ARCHIVE_FIX_KIND_OPTIONS,
  isArchiveRowEligibleForApply,
  type ArchiveFixKindUi,
} from '@/lib/seo-engine/archive-audit-apply-constants';

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

/** Compact checkbox (≈14–16px visual) inside a 44px hit target. */
function RowCheckbox(props: {
  checked: boolean;
  onChange: () => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <label
      className={`relative inline-flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg transition-colors hover:bg-white/[0.04] ${
        props.disabled ? 'pointer-events-none opacity-40' : ''
      }`}
    >
      <input
        type="checkbox"
        className="peer sr-only"
        checked={props.checked}
        onChange={props.onChange}
        disabled={props.disabled}
        aria-label={props.label}
      />
      <span
        className="flex size-3.5 items-center justify-center rounded-[3px] border border-white/25 bg-white/[0.03] transition-all duration-150 peer-checked:border-white/50 peer-checked:bg-white/90 peer-checked:[&_svg]:opacity-100 peer-focus-visible:ring-1 peer-focus-visible:ring-white/30"
        aria-hidden
      >
        <svg
          className="size-2.5 text-[#0a0a0a] opacity-0 transition-opacity duration-100"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={3}
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12.5l4.5 4.5L19 7" />
        </svg>
      </span>
    </label>
  );
}

function previewErrorMessage(raw: string | null | undefined): string {
  const msg = (raw || '').trim();
  if (!msg) return ARCHIVE_APPLY_WEBFLOW_BUSY_DA;
  if (/too many requests|rate.?limit|429\b|overbelastet/i.test(msg)) {
    return ARCHIVE_APPLY_WEBFLOW_BUSY_DA;
  }
  if (/blocking fetch/i.test(msg) && /too many|429/i.test(msg)) {
    return ARCHIVE_APPLY_WEBFLOW_BUSY_DA;
  }
  return msg;
}

type ReportRow = {
  itemId: string;
  locale: string;
  slug: string;
  title: string;
  priority: string;
  winClass?: string;
  seoTitle: string;
  articleTypeHint?: string;
  ageBucket?: string;
  freshness?: string;
  findings: Array<{ code: string; message: string; priority: string; evidence?: string; geoAeo?: boolean }>;
  gscPageMatched?: boolean;
  gscTopQuery?: string | null;
  gscClicks?: number | null;
  ga4PageMatched?: boolean;
  ga4PageViews?: number | null;
  siblingLocalePresent?: boolean | null;
};

type Report = {
  schemaVersion?: number;
  createdAt?: string;
  scanned?: number;
  measurementWindowDays?: number;
  summary?: {
    p0?: number;
    p1?: number;
    p2?: number;
    ok?: number;
    gscJoinHits?: number;
    ga4JoinHits?: number;
    quickWins?: number;
    strategic?: number;
  };
  patterns?: Array<{ id: string; observation: string; caveat: string; sampleSize: number }>;
  gscProvenance?: { uiNote?: string; setupStatus?: string } | null;
  ga4Provenance?: { available?: boolean; setupStatus?: string; rowCount?: number } | null;
  note?: string;
  rows?: ReportRow[];
};

type Filter = 'all' | 'da' | 'en' | 'P0' | 'P1' | 'quick_win' | 'stale';

type PreviewProposal = {
  itemId: string;
  locale: string;
  title: string;
  slug: string;
  oldSeoTitle?: string | null;
  oldMetaDescription?: string | null;
  newSeoTitle?: string;
  newMetaDescription?: string;
  kinds?: string[];
  contentChanged?: boolean;
  canonicalChanged?: boolean;
  thumbAltChanged?: boolean;
  oldCanonical?: string | null;
  newCanonical?: string | null;
  oldThumbAlt?: string | null;
  newThumbAlt?: string | null;
  links?: Array<{ url: string; title: string; anchorText: string }>;
  headings?: Array<{ text: string; level: number }>;
  oldContentExcerpt?: string;
  newContentExcerpt?: string;
};

type PreviewState = {
  mode: 'seo_meta' | 'content';
  previewId: string;
  confirmToken: string;
  expiresAt: string;
  proposals: PreviewProposal[];
  rejected: Array<{ itemId: string; locale: string; status?: string; reason?: string }>;
  stoppedOnError: boolean;
  errorMessage: string | null;
  kinds: ArchiveFixKindUi[];
};

type ApplyPhase = 'idle' | 'previewing' | 'confirm' | 'applying' | 'done';

function priorityDot(p: string) {
  if (p === 'P0') return 'bg-rose-400';
  if (p === 'P1') return 'bg-amber-400';
  if (p === 'P2') return 'bg-white/40';
  return 'bg-emerald-400';
}

function rowKey(r: ReportRow) {
  return `${r.itemId}:${r.locale}`;
}

function findingSummary(r: ReportRow): string {
  if (!r.findings.length) return 'Ingen fund';
  const top = r.findings[0];
  const extra = r.findings.length > 1 ? ` · +${r.findings.length - 1}` : '';
  return `${top.message}${extra}`;
}

function dataStatusLine(report: Report): { label: string; ok: boolean; detail: string } {
  const gscOk =
    report.gscProvenance?.setupStatus === 'ok' ||
    (report.summary?.gscJoinHits || 0) > 0 ||
    Boolean(report.gscProvenance?.uiNote && !/mangler|fail|error/i.test(report.gscProvenance.uiNote));
  const ga4Ok = report.ga4Provenance?.available === true || (report.summary?.ga4JoinHits || 0) > 0;
  const ok = gscOk || ga4Ok;
  const parts = [
    `Search Console: ${gscOk ? 'OK' : 'mangler data'}`,
    `GA4: ${ga4Ok ? 'OK' : 'mangler data'}`,
  ];
  if (report.gscProvenance?.uiNote) parts.push(report.gscProvenance.uiNote);
  if (report.ga4Provenance?.setupStatus) parts.push(`GA4 ${report.ga4Provenance.setupStatus}`);
  return {
    label: ok ? 'Datakilder OK' : 'Mangler data',
    ok,
    detail: parts.join(' · '),
  };
}

export default function ArchiveAuditPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [limit, setLimit] = useState(80);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [dataOpen, setDataOpen] = useState(false);
  const [phase, setPhase] = useState<ApplyPhase>('idle');
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [fixKinds, setFixKinds] = useState<Set<ArchiveFixKindUi>>(
    () => new Set<ArchiveFixKindUi>(['seo_meta'])
  );
  const [applyResult, setApplyResult] = useState<{
    writtenCount: number;
    stoppedOnError: boolean;
    errorMessage: string | null;
    results?: Array<{
      itemId: string;
      title: string;
      locales: Array<{ locale: string; status: string; reason?: string }>;
    }>;
  } | null>(null);

  const authHeaders = useCallback(async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, [user]);

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    setPreview(null);
    setApplyResult(null);
    setPhase('idle');
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/archive-audit', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          limit,
          locales: ['da', 'en'],
          measurementWindowDays: 28,
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Scan fejlede');
      setReport(j.report as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authHeaders, limit]);

  const typeOptions = useMemo(() => {
    const set = new Set<string>();
    for (const r of report?.rows || []) {
      if (r.articleTypeHint) set.add(r.articleTypeHint);
    }
    return ['all', ...[...set].sort()];
  }, [report]);

  const rows = (report?.rows || []).filter((r) => {
    if (filter === 'da' || filter === 'en') {
      if (r.locale !== filter) return false;
    } else if (filter === 'P0' || filter === 'P1') {
      if (r.priority !== filter) return false;
    } else if (filter === 'quick_win') {
      if (r.winClass !== 'quick_win') return false;
    } else if (filter === 'stale') {
      if (r.freshness !== 'stale') return false;
    }
    if (typeFilter !== 'all' && r.articleTypeHint !== typeFilter) return false;
    return true;
  });

  const toggle = (key: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setPreview(null);
    setPhase('idle');
  };

  const toggleExpand = (key: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const selectVisibleP0 = () => {
    const next = new Set(selected);
    for (const r of rows) {
      if (r.priority !== 'P0') continue;
      if (!isArchiveRowEligibleForApply(r)) continue;
      next.add(rowKey(r));
    }
    setSelected(next);
    setPreview(null);
    setPhase('idle');
  };

  const toggleFixKind = (id: ArchiveFixKindUi) => {
    setFixKinds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setPreview(null);
    setPhase('idle');
  };

  const selectionPayload = useMemo(() => {
    return [...selected]
      .map((key) => {
        const [itemId, locale] = key.split(':');
        if (!itemId || (locale !== 'da' && locale !== 'en')) return null;
        const row = (report?.rows || []).find((r) => r.itemId === itemId && r.locale === locale);
        if (row && !isArchiveRowEligibleForApply(row)) return null;
        return { itemId, locale: locale as 'da' | 'en' };
      })
      .filter(Boolean) as Array<{ itemId: string; locale: 'da' | 'en' }>;
  }, [selected, report]);

  const contentKindsSelected = useMemo(
    () => ARCHIVE_FIX_KIND_OPTIONS.filter((o) => o.id !== 'seo_meta' && fixKinds.has(o.id)).map((o) => o.id),
    [fixKinds]
  );
  const seoMetaSelected = fixKinds.has('seo_meta');
  const maxBatch = contentKindsSelected.length > 0 ? ARCHIVE_CONTENT_MAX_BATCH : ARCHIVE_APPLY_MAX_BATCH;

  const runPreview = async () => {
    setError(null);
    setApplyResult(null);
    if (fixKinds.size === 0) {
      setError('Vælg mindst én fix-type');
      return;
    }
    if (selectionPayload.length === 0) {
      setError('Vælg mindst én gyldig række (fetch-fejl / manglende EN er filtreret fra)');
      return;
    }
    if (selectionPayload.length > maxBatch) {
      setError(`Max ${maxBatch} valgte pr. gang for valgte fix-typer`);
      return;
    }
    setPhase('previewing');
    try {
      const headers = await authHeaders();

      // Content fixes (body/canonical/alt) — separate frozen preview
      if (contentKindsSelected.length > 0) {
        const res = await fetch('/api/seo-engine/archive-audit/content-preview', {
          method: 'POST',
          headers,
          body: JSON.stringify({ selection: selectionPayload, kinds: contentKindsSelected }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) {
          throw new Error(previewErrorMessage(j.error || j.errorMessage) || 'Preview fejlede');
        }
        if (j.stoppedOnError) {
          setPreview(null);
          setError(previewErrorMessage(j.errorMessage));
          setPhase('idle');
          return;
        }
        const proposals = j.proposals || [];
        if (!proposals.length) {
          setError('Ingen gyldige indholds-forslag — tjek skip-årsager');
          setPreview({
            mode: 'content',
            previewId: j.previewId,
            confirmToken: j.confirmToken,
            expiresAt: j.expiresAt,
            proposals: [],
            rejected: j.rejected || [],
            stoppedOnError: false,
            errorMessage: null,
            kinds: contentKindsSelected,
          });
          setPhase('confirm');
          return;
        }
        setPreview({
          mode: 'content',
          previewId: j.previewId,
          confirmToken: j.confirmToken,
          expiresAt: j.expiresAt,
          proposals,
          rejected: j.rejected || [],
          stoppedOnError: false,
          errorMessage: null,
          kinds: contentKindsSelected,
        });
        if (seoMetaSelected) {
          setError('Tip: SEO-title+meta køres i et separat trin — fjern indholds-chips for SEO-only');
        }
        setPhase('confirm');
        return;
      }

      // SEO title + meta only
      const res = await fetch('/api/seo-engine/archive-audit/preview', {
        method: 'POST',
        headers,
        body: JSON.stringify({ selection: selectionPayload }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) {
        throw new Error(previewErrorMessage(j.error || j.errorMessage) || 'Preview fejlede');
      }
      if (j.stoppedOnError) {
        setPreview(null);
        setError(previewErrorMessage(j.errorMessage));
        setPhase('idle');
        return;
      }
      const proposals = j.proposals || [];
      if (proposals.length === 0) {
        setPreview({
          mode: 'seo_meta',
          previewId: j.previewId,
          confirmToken: j.confirmToken,
          expiresAt: j.expiresAt,
          proposals: [],
          rejected: j.rejected || [],
          stoppedOnError: false,
          errorMessage: null,
          kinds: ['seo_meta'],
        });
        setError('Ingen gyldige forslag — tjek skip-årsager nedenfor');
        setPhase('confirm');
        return;
      }
      setPreview({
        mode: 'seo_meta',
        previewId: j.previewId,
        confirmToken: j.confirmToken,
        expiresAt: j.expiresAt,
        proposals,
        rejected: j.rejected || [],
        stoppedOnError: false,
        errorMessage: null,
        kinds: ['seo_meta'],
      });
      setPhase('confirm');
    } catch (e) {
      setPreview(null);
      setError(previewErrorMessage(e instanceof Error ? e.message : String(e)));
      setPhase('idle');
    }
  };

  const confirmApply = async () => {
    if (!preview) return;
    const n = preview.proposals.length;
    if (n === 0) {
      setError('Ingen gyldige forslag at anvende');
      return;
    }
    const confirmMsg =
      preview.mode === 'content'
        ? `Indsæt/ret indhold for ${n} artikel(ler)?\n\nFix: ${preview.kinds.join(', ')}\nBackup tages først. Publiceret status bevares.`
        : `Overskriv SEO-title og meta for ${n} valgte?\n\nKun SEO-title + meta. Publiceret status bevares. Der tages backup før skrivning.`;
    const ok = window.confirm(confirmMsg);
    if (!ok) return;

    setPhase('applying');
    setError(null);
    try {
      const headers = await authHeaders();
      const endpoint =
        preview.mode === 'content'
          ? '/api/seo-engine/archive-audit/content-apply'
          : '/api/seo-engine/archive-audit/apply';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          previewId: preview.previewId,
          confirmOverwrite: true,
          confirmToken: preview.confirmToken,
        }),
      });
      const j = await res.json();
      if (!res.ok && !j.writtenCount && !j.results) throw new Error(j.error || 'Anvendelse fejlede');
      setApplyResult({
        writtenCount: j.writtenCount ?? 0,
        stoppedOnError: Boolean(j.stoppedOnError),
        errorMessage: j.errorMessage || j.error || null,
        results: j.results || [],
      });
      setPhase('done');
      if (j.stoppedOnError) {
        setError(j.errorMessage || j.error || 'Stoppet ved fejl');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase('confirm');
    }
  };

  const dataStatus = report ? dataStatusLine(report) : null;
  const canApply =
    selected.size > 0 &&
    selectionPayload.length > 0 &&
    selectionPayload.length <= maxBatch &&
    fixKinds.size > 0 &&
    phase !== 'previewing' &&
    phase !== 'applying';

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.03] p-3 lg:p-4 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-medium text-white tracking-tight">Arkiv</p>
          <p className="text-[12px] text-white/45 mt-0.5 leading-snug">
            Scan, vælg fix-typer, preview, og anvend — SEO, links, overskrifter, canonical eller billede-alt.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-white/45 flex items-center gap-1.5">
            Antal
            <select
              className="apropos-input-dark h-10 rounded-lg border border-white/12 bg-[#141414] px-2 text-[12px] text-white"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={loading || phase === 'previewing' || phase === 'applying'}
            >
              {[40, 80, 150, 300, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className={primaryBtn}
            disabled={loading || phase === 'previewing' || phase === 'applying'}
            onClick={() => void runScan()}
          >
            {loading ? 'Scanner…' : 'Scan arkiv'}
          </button>
        </div>
      </div>

      {error && <p className="text-[12px] text-red-400/95">{error}</p>}

      {report && (
        <>
          <div className="flex flex-wrap gap-2">
            {[
              ['Kritiske', report.summary?.p0 ?? 0, 'bg-rose-400'],
              ['Vigtige', report.summary?.p1 ?? 0, 'bg-amber-400'],
              ['OK', report.summary?.ok ?? 0, 'bg-emerald-400'],
              ['Hurtige gevinster', report.summary?.quickWins ?? 0, 'bg-white/40'],
            ].map(([label, value, dot]) => (
              <div
                key={String(label)}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
              >
                <span className={`size-1.5 rounded-full ${dot}`} />
                <span className="text-[11px] text-white/45">{label}</span>
                <span className="text-[13px] font-medium text-white/90">{value}</span>
              </div>
            ))}
          </div>

          {dataStatus && (
            <div className="rounded-xl border border-white/[0.06] overflow-hidden">
              <button
                type="button"
                className="flex items-center gap-3 w-full px-3.5 py-2.5 text-left hover:bg-white/[0.03] transition-all"
                onClick={() => setDataOpen((v) => !v)}
              >
                <span
                  className={`size-1.5 rounded-full ${dataStatus.ok ? 'bg-emerald-400' : 'bg-amber-400'}`}
                />
                <span className="text-[12px] text-white/70 flex-1">{dataStatus.label}</span>
                <span className="text-[10px] text-white/30">{dataOpen ? 'Skjul' : 'Detaljer'}</span>
              </button>
              {dataOpen && (
                <p className="px-3.5 pb-2.5 text-[11px] text-white/40 leading-snug">{dataStatus.detail}</p>
              )}
            </div>
          )}

          {!!report.patterns?.length && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-1.5">
              <p className="text-[12px] font-medium text-white/80">Mønstre</p>
              {report.patterns.slice(0, 3).map((p) => (
                <p key={p.id} className="text-[11px] text-white/55 leading-snug">
                  {p.observation}
                </p>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 items-center">
            {(
              [
                ['all', 'Alle'],
                ['da', 'DA'],
                ['en', 'EN'],
                ['P0', 'Kritiske'],
                ['P1', 'Vigtige'],
                ['quick_win', 'Hurtige'],
                ['stale', 'Forældede'],
              ] as const
            ).map(([f, label]) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={segBtn(filter === f)}>
                {label}
              </button>
            ))}
            <select
              className="apropos-input-dark h-9 rounded-lg border border-white/12 bg-[#141414] px-2 text-[11px] text-white"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'Alle typer' : t}
                </option>
              ))}
            </select>
            <button type="button" className={secondaryBtn} onClick={selectVisibleP0}>
              Markér kritiske
            </button>
            <button
              type="button"
              className={secondaryBtn}
              onClick={() => {
                setSelected(new Set());
                setPreview(null);
                setPhase('idle');
              }}
              disabled={selected.size === 0}
            >
              Ryd
            </button>
          </div>

          <div className="rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 space-y-2.5">
            <div className="flex flex-wrap gap-1.5 items-center">
              <span className="text-[11px] text-white/45 mr-1">Fix:</span>
              {ARCHIVE_FIX_KIND_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => toggleFixKind(opt.id)}
                  className={segBtn(fixKinds.has(opt.id))}
                  disabled={phase === 'previewing' || phase === 'applying'}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-[12px] text-white/60 flex-1 min-w-[140px]">
                {selected.size === 0
                  ? 'Vælg rækker (fetch-fejl / manglende EN springes over)'
                  : `${selectionPayload.length} klar · ${selected.size} markeret${
                      selectionPayload.length > maxBatch ? ` (max ${maxBatch})` : ''
                    }`}
              </p>
              <button
                type="button"
                className={primaryBtn}
                disabled={!canApply}
                onClick={() => void runPreview()}
              >
                {phase === 'previewing' ? 'Forbereder…' : 'Anvend valgte'}
              </button>
            </div>
          </div>

          {(phase === 'confirm' || phase === 'applying' || phase === 'done') && preview && (
            <div className="rounded-xl border border-white/15 bg-black/40 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-[13px] font-medium text-white/90">
                  {phase === 'done' ? 'Resultat' : 'Preview — gammel → ny'}
                </p>
                {phase === 'confirm' && (
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={secondaryBtn}
                      onClick={() => {
                        setPreview(null);
                        setError(null);
                        setPhase('idle');
                      }}
                    >
                      Annullér
                    </button>
                    {preview.proposals.length > 0 && !preview.stoppedOnError ? (
                      <button
                        type="button"
                        className={dangerOutlineBtn}
                        onClick={() => void confirmApply()}
                      >
                        {preview.mode === 'content'
                          ? `Indsæt/ret for ${preview.proposals.length} artikel(ler)`
                          : `Overskriv SEO-title og meta for ${preview.proposals.length} valgte`}
                      </button>
                    ) : null}
                  </div>
                )}
                {phase === 'applying' && (
                  <p className="text-[12px] text-white/50">Skriver… backup først</p>
                )}
              </div>

              {preview.stoppedOnError && (
                <p className="text-[12px] text-red-400/95">
                  {previewErrorMessage(preview.errorMessage)}
                </p>
              )}

              <div className="space-y-2 max-h-72 overflow-y-auto nice-scrollbar">
                {preview.proposals.map((p) => (
                  <div
                    key={`${p.itemId}:${p.locale}`}
                    className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 space-y-1"
                  >
                    <p className="text-[12px] text-white/80">
                      {p.title || p.slug} · {p.locale.toUpperCase()}
                    </p>
                    {preview.mode === 'seo_meta' ? (
                      <>
                        <p className="text-[11px] text-white/40">
                          Title: <span className="text-white/30">{p.oldSeoTitle || '(tom)'}</span>
                          {' → '}
                          <span className="text-white/75">{p.newSeoTitle}</span>
                        </p>
                        <p className="text-[11px] text-white/40">
                          Meta: <span className="text-white/30">{p.oldMetaDescription || '(tom)'}</span>
                          {' → '}
                          <span className="text-white/75">{p.newMetaDescription}</span>
                        </p>
                      </>
                    ) : (
                      <>
                        {p.canonicalChanged ? (
                          <p className="text-[11px] text-white/40">
                            Canonical:{' '}
                            <span className="text-white/30">{p.oldCanonical || '(tom)'}</span>
                            {' → '}
                            <span className="text-white/75">{p.newCanonical}</span>
                          </p>
                        ) : null}
                        {p.thumbAltChanged ? (
                          <p className="text-[11px] text-white/40">
                            Thumb alt:{' '}
                            <span className="text-white/30">{p.oldThumbAlt || '(tom)'}</span>
                            {' → '}
                            <span className="text-white/75">{p.newThumbAlt}</span>
                          </p>
                        ) : null}
                        {(p.links || []).slice(0, 3).map((l) => (
                          <p key={l.url} className="text-[11px] text-white/45">
                            Link «{l.anchorText}» → {l.title}
                          </p>
                        ))}
                        {(p.headings || []).map((h, i) => (
                          <p key={`${h.text}-${i}`} className="text-[11px] text-white/45">
                            H{h.level}: {h.text}
                          </p>
                        ))}
                        {p.contentChanged ? (
                          <p className="text-[10px] text-white/30 line-clamp-2">
                            Brødtekst opdateres ({(p.newContentExcerpt || '').length}+ tegn preview)
                          </p>
                        ) : null}
                      </>
                    )}
                  </div>
                ))}
                {preview.rejected.map((r) => (
                  <p key={`${r.itemId}:${r.locale}:rej`} className="text-[11px] text-amber-300/80">
                    Skip {r.itemId.slice(0, 8)}…:{r.locale} — {r.reason || r.status}
                  </p>
                ))}
              </div>

              {applyResult && (
                <div className="border-t border-white/10 pt-2 space-y-1">
                  <p className="text-[12px] text-white/70">
                    Skrevet: {applyResult.writtenCount}
                    {applyResult.stoppedOnError ? ' · stoppet ved fejl' : ' · færdig'}
                  </p>
                  {(applyResult.results || []).map((item) => (
                    <p key={item.itemId} className="text-[11px] text-white/45">
                      {item.title || item.itemId}:{' '}
                      {item.locales.map((l) => `${l.locale}=${l.status}`).join(', ')}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="rounded-xl border border-white/10 overflow-hidden max-h-[28rem] overflow-y-auto nice-scrollbar">
            <table className="min-w-full text-[12px]">
              <thead className="bg-white/[0.04] sticky top-0">
                <tr className="text-left text-white/45">
                  <th className="w-11 px-0 py-2 font-medium" />
                  <th className="w-16 px-2 py-2 font-medium">Status</th>
                  <th className="px-2.5 py-2 font-medium">Artikel</th>
                  <th className="px-2.5 py-2 font-medium">Fund</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 120).map((r) => {
                  const key = rowKey(r);
                  const open = expanded.has(key);
                  const busy = phase === 'previewing' || phase === 'applying';
                  return (
                    <tr key={key} className="border-t border-white/[0.06] align-middle">
                      <td className="w-11 px-0 py-0.5">
                        <RowCheckbox
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                          label={`Vælg ${r.title || r.slug}`}
                          disabled={busy}
                        />
                      </td>
                      <td className="px-2 py-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] text-white/65">
                          <span className={`size-1.5 shrink-0 rounded-full ${priorityDot(r.priority)}`} />
                          {r.priority === 'P0' ? 'Kritisk' : r.priority === 'P1' ? 'Vigtig' : r.priority}
                        </span>
                      </td>
                      <td className="px-2.5 py-2 text-white/80 align-top">
                        <button
                          type="button"
                          className="text-left hover:text-white transition-colors"
                          onClick={() => toggleExpand(key)}
                        >
                          <span className="font-medium">{r.title || r.slug}</span>
                          <span className="text-white/35"> · {r.locale.toUpperCase()}</span>
                        </button>
                        {open && (
                          <div className="mt-1.5 space-y-0.5 text-[11px] text-white/40">
                            <p>
                              {[r.articleTypeHint, r.ageBucket, r.freshness].filter(Boolean).join(' · ') ||
                                '—'}
                            </p>
                            <p>
                              {r.ga4PageMatched ? `GA4 ${r.ga4PageViews ?? 0} visninger` : 'GA4 —'}
                              {' · '}
                              {r.gscPageMatched
                                ? `SC ${r.gscClicks ?? 0} klik${r.gscTopQuery ? ` · ${r.gscTopQuery}` : ''}`
                                : 'SC —'}
                            </p>
                            <p className="text-white/30 truncate max-w-[280px]">SEO: {r.seoTitle || '(tom)'}</p>
                          </div>
                        )}
                      </td>
                      <td className="px-2.5 py-2 text-white/50 align-top">
                        <button
                          type="button"
                          className="text-left w-full hover:text-white/70"
                          onClick={() => toggleExpand(key)}
                        >
                          {findingSummary(r)}
                        </button>
                        {open && r.findings.length > 0 && (
                          <ul className="mt-1.5 space-y-1">
                            {r.findings.map((f, i) => (
                              <li key={`${f.code}-${i}`} className="text-[11px] text-white/40">
                                {f.message}
                                {f.evidence ? (
                                  <span className="text-white/25"> · {f.evidence}</span>
                                ) : null}
                              </li>
                            ))}
                          </ul>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <p className="text-[10px] text-white/30">
            Scannet {report.scanned} · {report.measurementWindowDays}d vindue · max {ARCHIVE_APPLY_MAX_BATCH}{' '}
            pr. anvendelse
          </p>
        </>
      )}
    </section>
  );
}
