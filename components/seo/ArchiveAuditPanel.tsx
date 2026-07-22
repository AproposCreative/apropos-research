'use client';

import { useCallback, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const secondaryBtn =
  'px-3 py-2 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';
const primaryBtn =
  'px-3 py-2 rounded-xl border border-white/10 bg-white/5 text-[13px] text-white hover:border-white/20 hover:bg-white/10 disabled:opacity-40 transition-all duration-200 active:scale-[0.99]';

type Report = {
  createdAt?: string;
  scanned?: number;
  summary?: {
    p0?: number;
    p1?: number;
    p2?: number;
    ok?: number;
    gscJoinHits?: number;
  };
  gscProvenance?: { uiNote?: string } | null;
  note?: string;
  rows?: Array<{
    itemId: string;
    locale: string;
    slug: string;
    title: string;
    priority: string;
    seoTitle: string;
    findings: Array<{ code: string; message: string; priority: string }>;
    gscPageMatched?: boolean;
    gscTopQuery?: string | null;
  }>;
};

function priorityDot(p: string) {
  if (p === 'P0') return 'bg-rose-400';
  if (p === 'P1') return 'bg-amber-400';
  if (p === 'P2') return 'bg-white/40';
  return 'bg-emerald-400';
}

export default function ArchiveAuditPanel() {
  const { user } = useAuth();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<Report | null>(null);
  const [filter, setFilter] = useState<'all' | 'da' | 'en' | 'P0' | 'P1'>('all');

  const runScan = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
      const res = await fetch('/api/seo-engine/archive-audit', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 40, locales: ['da', 'en'], measurementWindowDays: 28 }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Arkiv-audit fejlede');
      setReport(j.report as Report);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [user]);

  const exportJson = () => {
    if (!report) return;
    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `archive-audit-${report.createdAt || 'export'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const rows = (report?.rows || []).filter((r) => {
    if (filter === 'da' || filter === 'en') return r.locale === filter;
    if (filter === 'P0' || filter === 'P1') return r.priority === filter;
    return true;
  });

  return (
    <section className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white/90">Arkiv-audit</p>
          <p className="text-[11px] text-white/40 mt-0.5 leading-snug">
            Read-only scan af publicerede DA/EN-varianter. Ingen CMS-skrivning. GSC page-join er
            sampled/top — ikke komplet arkiv.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={primaryBtn} disabled={loading} onClick={() => void runScan()}>
            {loading ? 'Scanner…' : 'Scan alle (read-only)'}
          </button>
          <button type="button" className={secondaryBtn} disabled={!report} onClick={exportJson}>
            Eksportér rapport
          </button>
        </div>
      </div>

      {error && <p className="text-[12px] text-red-400/95">{error}</p>}

      {report && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            {[
              ['P0', report.summary?.p0 ?? 0],
              ['P1', report.summary?.p1 ?? 0],
              ['P2', report.summary?.p2 ?? 0],
              ['OK', report.summary?.ok ?? 0],
              ['GSC join', report.summary?.gscJoinHits ?? 0],
            ].map(([label, value]) => (
              <div key={String(label)} className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
                <p className="text-[10px] text-white/40">{label}</p>
                <p className="text-[15px] font-medium text-white/90">{value}</p>
              </div>
            ))}
          </div>
          {report.gscProvenance?.uiNote && (
            <p className="text-[11px] text-white/45">
              Search Console: {report.gscProvenance.uiNote}
            </p>
          )}
          <div className="flex flex-wrap gap-1.5">
            {(['all', 'da', 'en', 'P0', 'P1'] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all ${
                  filter === f
                    ? 'bg-white/12 text-white border border-white/10'
                    : 'text-white/45 hover:text-white/75'
                }`}
              >
                {f === 'all' ? 'Alle' : f.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="rounded-xl border border-white/10 overflow-hidden max-h-72 overflow-y-auto nice-scrollbar">
            <table className="min-w-full text-[11px]">
              <thead className="bg-white/[0.04] sticky top-0">
                <tr className="text-left text-white/45">
                  <th className="px-2.5 py-1.5 font-medium">Prioritet</th>
                  <th className="px-2.5 py-1.5 font-medium">Artikel</th>
                  <th className="px-2.5 py-1.5 font-medium">Fund</th>
                </tr>
              </thead>
              <tbody>
                {rows.slice(0, 60).map((r) => (
                  <tr key={`${r.itemId}:${r.locale}`} className="border-t border-white/[0.06]">
                    <td className="px-2.5 py-1.5">
                      <span className="inline-flex items-center gap-1.5 text-white/70">
                        <span className={`size-1.5 rounded-full ${priorityDot(r.priority)}`} />
                        {r.priority}
                      </span>
                    </td>
                    <td className="px-2.5 py-1.5 text-white/80">
                      <span className="font-medium">{r.title || r.slug}</span>
                      <span className="text-white/35"> · {r.locale}</span>
                    </td>
                    <td className="px-2.5 py-1.5 text-white/50">
                      {r.findings.length
                        ? r.findings.map((f) => f.message).join(' · ')
                        : 'Ingen findings'}
                      {r.gscPageMatched && r.gscTopQuery
                        ? ` · GSC: ${r.gscTopQuery}`
                        : ''}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {report.note && <p className="text-[10px] text-white/30">{report.note}</p>}
        </>
      )}
    </section>
  );
}
