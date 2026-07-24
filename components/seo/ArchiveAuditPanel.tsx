'use client';

import { useCallback, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const secondaryBtn =
  'px-3 py-2 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';
const primaryBtn =
  'px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[13px] text-white hover:border-white/20 hover:bg-white/10 disabled:opacity-40 transition-all duration-200 active:scale-[0.99]';
const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
    active
      ? 'bg-white/12 text-white shadow-sm border border-white/10'
      : 'text-white/45 hover:text-white/75'
  }`;

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
  segments?: Array<{
    key: string;
    articleType: string;
    locale: string;
    ageBucket: string;
    freshness: string;
    count: number;
    p0: number;
  }>;
  patterns?: Array<{ id: string; observation: string; caveat: string; sampleSize: number }>;
  gscProvenance?: { uiNote?: string; setupStatus?: string } | null;
  ga4Provenance?: { available?: boolean; setupStatus?: string; rowCount?: number } | null;
  note?: string;
  rows?: ReportRow[];
};

type Filter =
  | 'all'
  | 'da'
  | 'en'
  | 'P0'
  | 'P1'
  | 'quick_win'
  | 'strategic'
  | 'stale';

function priorityDot(p: string) {
  if (p === 'P0') return 'bg-rose-400';
  if (p === 'P1') return 'bg-amber-400';
  if (p === 'P2') return 'bg-white/40';
  return 'bg-emerald-400';
}

function rowKey(r: ReportRow) {
  return `${r.itemId}:${r.locale}`;
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

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    setSelected(new Set());
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
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
      if (!res.ok || !j.ok) throw new Error(j.error || 'Arkiv-audit fejlede');
      setReport(j.report as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user, limit]);

  const exportJson = (onlySelected: boolean) => {
    if (!report) return;
    const payload = onlySelected
      ? {
          ...report,
          kind: 'archive-audit-batch-selection',
          mode: 'read-only',
          selectedKeys: [...selected],
          rows: (report.rows || []).filter((r) => selected.has(rowKey(r))),
          note: `${report.note || ''} Batch selection only — no CMS writes; apply requires separate explicit preview/backup.`,
        }
      : report;
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = onlySelected
      ? `archive-audit-batch-${report.createdAt || 'export'}.json`
      : `archive-audit-${report.createdAt || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

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
    } else if (filter === 'strategic') {
      if (r.winClass !== 'strategic') return false;
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
  };

  const selectVisibleP0 = () => {
    const next = new Set(selected);
    for (const r of rows) {
      if (r.priority === 'P0') next.add(rowKey(r));
    }
    setSelected(next);
  };

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white/90">Arkiv-audit</p>
          <p className="text-[11px] text-white/40 mt-0.5 leading-snug">
            Read-only SEO+GEO/AEO scan. Joiner Webflow med GA4 page metrics + GSC page/query når
            tilgængeligt. Ingen CMS-skrivning. Batch-valg er kun til eksport/review.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="text-[11px] text-white/45 flex items-center gap-1.5">
            Limit
            <select
              className="apropos-input-dark h-9 rounded-lg border border-white/12 bg-[#141414] px-2 text-[12px] text-white"
              value={limit}
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={loading}
            >
              {[40, 80, 150, 300, 500].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
          <button type="button" className={`${primaryBtn} touch-target`} disabled={loading} onClick={() => void runScan()}>
            {loading ? 'Scanner…' : 'Scan alle (read-only)'}
          </button>
          <button type="button" className={secondaryBtn} disabled={!report} onClick={() => exportJson(false)}>
            Eksportér frozen rapport
          </button>
          <button
            type="button"
            className={secondaryBtn}
            disabled={!report || selected.size === 0}
            onClick={() => exportJson(true)}
          >
            Eksportér batch ({selected.size})
          </button>
        </div>
      </div>

      {error && <p className="text-[12px] text-red-400/95">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-8 gap-2">
            {[
              ['P0', report.summary?.p0 ?? 0],
              ['P1', report.summary?.p1 ?? 0],
              ['P2', report.summary?.p2 ?? 0],
              ['OK', report.summary?.ok ?? 0],
              ['Quick wins', report.summary?.quickWins ?? 0],
              ['Strategisk', report.summary?.strategic ?? 0],
              ['GSC join', report.summary?.gscJoinHits ?? 0],
              ['GA4 join', report.summary?.ga4JoinHits ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <p className="text-[10px] text-white/40">{label}</p>
                <p className="text-[15px] font-medium text-white/90">{value}</p>
              </div>
            ))}
          </div>

          <div className="space-y-1">
            {report.gscProvenance?.uiNote && (
              <p className="text-[11px] text-white/45">
                Search Console: {report.gscProvenance.uiNote}
                {report.gscProvenance.setupStatus ? ` · ${report.gscProvenance.setupStatus}` : ''}
              </p>
            )}
            {report.ga4Provenance && (
              <p className="text-[11px] text-white/45">
                GA4: {report.ga4Provenance.available ? 'page metrics join OK' : 'ikke tilgængelig'}
                {report.ga4Provenance.setupStatus ? ` · ${report.ga4Provenance.setupStatus}` : ''}
              </p>
            )}
          </div>

          {!!report.patterns?.length && (
            <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <p className="text-[12px] font-medium text-white/80">Observerede mønstre</p>
              {report.patterns.slice(0, 4).map((p) => (
                <div key={p.id} className="space-y-0.5">
                  <p className="text-[11px] text-white/70">{p.observation}</p>
                  <p className="text-[10px] text-white/35">{p.caveat}</p>
                </div>
              ))}
            </div>
          )}

          <div className="flex flex-wrap gap-1.5 items-center">
            {(
              [
                ['all', 'Alle'],
                ['da', 'DA'],
                ['en', 'EN'],
                ['P0', 'P0'],
                ['P1', 'P1'],
                ['quick_win', 'Quick wins'],
                ['strategic', 'Strategisk'],
                ['stale', 'Stale'],
              ] as const
            ).map(([f, label]) => (
              <button key={f} type="button" onClick={() => setFilter(f)} className={segBtn(filter === f)}>
                {label}
              </button>
            ))}
            <select
              className="apropos-input-dark h-8 rounded-lg border border-white/12 bg-[#141414] px-2 text-[11px] text-white ml-1"
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
            >
              {typeOptions.map((t) => (
                <option key={t} value={t}>
                  {t === 'all' ? 'Alle typer' : t}
                </option>
              ))}
            </select>
            <button type="button" className={`${secondaryBtn} !py-1.5 text-[11px]`} onClick={selectVisibleP0}>
              Markér synlige P0
            </button>
            <button
              type="button"
              className={`${secondaryBtn} !py-1.5 text-[11px]`}
              onClick={() => setSelected(new Set())}
              disabled={selected.size === 0}
            >
              Ryd valg
            </button>
          </div>

          <div className="rounded-xl border border-white/10 overflow-hidden max-h-96 overflow-y-auto nice-scrollbar">
            <table className="min-w-full text-[11px]">
              <thead className="bg-white/[0.04] sticky top-0">
                <tr className="text-left text-white/45">
                  <th className="px-2 py-1.5 font-medium w-8" />
                  <th className="px-2.5 py-1.5 font-medium">Prioritet</th>
                  <th className="px-2.5 py-1.5 font-medium">Artikel</th>
                  <th className="px-2.5 py-1.5 font-medium hidden md:table-cell">Segment</th>
                  <th className="px-2.5 py-1.5 font-medium">Evidence / fund</th>
                  <th className="px-2.5 py-1.5 font-medium hidden lg:table-cell">Metrics</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 120).map((r) => {
                  const key = rowKey(r);
                  return (
                    <tr key={key} className="border-t border-white/[0.06] align-top">
                      <td className="px-2 py-1.5">
                        <input
                          type="checkbox"
                          className="size-4 accent-white/80"
                          checked={selected.has(key)}
                          onChange={() => toggle(key)}
                          aria-label={`Vælg ${r.title || r.slug}`}
                        />
                      </td>
                      <td className="px-2.5 py-1.5">
                        <span className="inline-flex items-center gap-1.5 text-white/70">
                          <span className={`size-1.5 rounded-full ${priorityDot(r.priority)}`} />
                          {r.priority}
                          {r.winClass && r.winClass !== 'ok' ? (
                            <span className="text-white/30">· {r.winClass}</span>
                          ) : null}
                        </span>
                      </td>
                      <td className="px-2.5 py-1.5 text-white/80">
                        <span className="font-medium">{r.title || r.slug}</span>
                        <span className="text-white/35"> · {r.locale}</span>
                      </td>
                      <td className="px-2.5 py-1.5 text-white/45 hidden md:table-cell">
                        {[r.articleTypeHint, r.ageBucket, r.freshness].filter(Boolean).join(' · ')}
                      </td>
                      <td className="px-2.5 py-1.5 text-white/50">
                        {r.findings.length
                          ? r.findings
                              .map((f) =>
                                f.evidence ? `${f.message} (${f.evidence})` : f.message
                              )
                              .join(' · ')
                          : 'Ingen findings'}
                      </td>
                      <td className="px-2.5 py-1.5 text-white/40 hidden lg:table-cell">
                        {r.ga4PageMatched ? `GA4 ${r.ga4PageViews ?? 0} views` : 'GA4 —'}
                        {' · '}
                        {r.gscPageMatched
                          ? `GSC ${r.gscClicks ?? 0} klik${r.gscTopQuery ? ` · ${r.gscTopQuery}` : ''}`
                          : 'GSC —'}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {!!report.segments?.length && (
            <p className="text-[10px] text-white/30">
              {report.segments.length} segmenter (type×sprog×alder×freshness). Scannet {report.scanned}{' '}
              · vindue {report.measurementWindowDays}d. Valgte batches anvendes ikke automatisk.
            </p>
          )}
          {report.note && <p className="text-[10px] text-white/30">{report.note}</p>}
        </>
      )}
    </section>
  );
}
