'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const secondaryBtn =
  'px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98]';
const primaryBtn =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const SCAN_PRESET = { limit: 50 };

type ScanCandidate = {
  id: string;
  slug?: string;
  title?: string;
  status?: string;
  lastUpdated?: string;
  contentHash?: string;
  inputVersionHash?: string;
  seoTitleEmpty?: boolean;
  metaDescriptionEmpty?: boolean;
};

type ApiResult = Record<string, unknown> & {
  ok?: boolean;
  error?: string;
  skippedReason?: string | null;
  scanId?: string;
  candidates?: ScanCandidate[];
  results?: ScanCandidate[];
};

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <p className="text-[10px] text-white/40">{label}</p>
      <p className="text-[15px] font-medium text-white/90">{value}</p>
    </div>
  );
}

function ResultsTable({ rows }: { rows: Array<Record<string, unknown>> }) {
  if (rows.length === 0) return null;
  return (
    <div className="rounded-xl border border-white/10 overflow-hidden max-h-52 overflow-y-auto nice-scrollbar">
      <table className="min-w-full text-[11px]">
        <thead className="bg-white/[0.04] sticky top-0">
          <tr className="text-left text-white/45">
            <th className="px-2.5 py-1.5 font-medium">Artikel</th>
            <th className="px-2.5 py-1.5 font-medium">Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.slice(0, 20).map((row) => {
            const id = String(row.id ?? row.slug ?? Math.random());
            const title = String(row.title ?? '—');
            let status = String(row.status ?? '—');
            if (row.ok === true) status = 'Udfyldt';
            else if (row.ok === false && row.error) status = 'Fejl';
            else if (row.skipped) status = String(row.reason || 'Sprunget over').slice(0, 48);
            else if (status === 'missing_seo') status = 'Mangler SEO';
            else if (status === 'validator_error') status = 'Validator';
            return (
              <tr key={id} className="border-t border-white/[0.06]">
                <td className="px-2.5 py-1.5 text-white/80 font-medium truncate max-w-[180px]">
                  {title}
                </td>
                <td className="px-2.5 py-1.5 text-white/50">{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function SeoEngineSection({
  variant = 'panel',
}: {
  variant?: 'panel' | 'page';
}) {
  const { user } = useAuth();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [enabled, setEnabled] = useState(false);
  const [autoOptEnabled, setAutoOptEnabled] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const [statusLoading, setStatusLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savingAutoOpt, setSavingAutoOpt] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [mode, setMode] = useState<'preview' | 'run' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanId, setScanId] = useState<string | null>(null);
  const [scanCandidates, setScanCandidates] = useState<ScanCandidate[]>([]);

  const authHeaders = useCallback(async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, [user]);

  const refreshStatus = useCallback(async () => {
    setStatusLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/status', { cache: 'no-store', headers });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Kunne ikke hente status');
      setEnabled(Boolean(j.enabled));
      setAutoOptEnabled(Boolean(j.autoOpportunityOptEnabled));
      setCanToggle(Boolean(j.canToggle));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setStatusLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const scrollToResults = useCallback(() => {
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  const toggle = async () => {
    if (!canToggle) return;
    setSaving(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ enabled: !enabled }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Kunne ikke gemme');
      setEnabled(Boolean(j.enabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const toggleAutoOpt = async () => {
    if (!canToggle) return;
    setSavingAutoOpt(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ autoOpportunityOptEnabled: !autoOptEnabled }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Kunne ikke gemme Auto-optimering');
      setAutoOptEnabled(Boolean(j.autoOpportunityOptEnabled));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSavingAutoOpt(false);
    }
  };

  const callApi = async (url: string, body: object) => {
    const headers = await authHeaders();
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });
    const data = await res.json();
    if (!res.ok || data.ok === false) {
      throw new Error(data.error || 'Anmodning fejlede');
    }
    return data as ApiResult;
  };

  const scan = async () => {
    setPreviewLoading(true);
    setError(null);
    setMode('preview');
    try {
      const data = await callApi('/api/seo-engine/preview', SCAN_PRESET);
      setResult(data);
      setScanId(typeof data.scanId === 'string' ? data.scanId : null);
      const rows = (data.candidates || data.results || []) as ScanCandidate[];
      setScanCandidates(rows.filter((c) => c.status === 'missing_seo'));
      scrollToResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const run = async () => {
    if (!canToggle) {
      setError('Kun admin kan køre Auto-SEO.');
      return;
    }
    if (!scanId || scanCandidates.length === 0) {
      setError('Kør Scan først — Kør kræver frozen kandidater fra seneste scan.');
      return;
    }
    const ok = window.confirm(
      `Kør Auto-SEO på op til 3 scannede DK-artikler med tomme SEO-felter?\n\nUdfyldte felter overskrives aldrig. Bruger durable job-kø med stale-check.`
    );
    if (!ok) return;
    setRunLoading(true);
    setError(null);
    setMode('run');
    try {
      setResult(
        await callApi('/api/seo-engine/run', {
          scanId,
          articleLimit: 3,
          candidates: scanCandidates.slice(0, 3).map((c) => ({
            id: c.id,
            lastUpdated: c.lastUpdated,
            contentHash: c.contentHash,
            inputVersionHash: c.inputVersionHash,
            slug: c.slug,
            title: c.title,
            seoTitleEmpty: c.seoTitleEmpty,
            metaDescriptionEmpty: c.metaDescriptionEmpty,
          })),
        })
      );
      scrollToResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunLoading(false);
    }
  };

  const busy = previewLoading || runLoading || statusLoading || saving;
  const rows = (result?.results || result?.candidates || []) as Array<Record<string, unknown>>;
  const processed = Number(result?.processed ?? 0);
  const succeeded = Number(result?.succeeded ?? 0);
  const ready = Number(result?.ready ?? result?.totalCandidates ?? 0);

  return (
    <div
      className={variant === 'page' ? 'space-y-3' : 'space-y-3'}
      ref={resultsRef}
    >
      <div
        className={
          variant === 'page'
            ? 'rounded-xl border border-white/12 bg-white/[0.02] p-4 space-y-3'
            : 'bg-black rounded-xl p-3 space-y-3'
        }
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 text-left">
            <p className="text-[13px] font-medium text-white/90">SEO-optimering</p>
            <p className="text-[11px] text-white/40 mt-0.5 leading-snug">
              Auto-SEO udfylder kun tomme seo-title / meta-description ved DK-publish. Manuelt
              indhold overskrives aldrig.
            </p>
            <p className="text-[10px] text-white/30 mt-1">
              {statusLoading
                ? 'Tjekker…'
                : saving
                  ? 'Gemmer…'
                  : enabled
                    ? 'Auto-SEO: Slået til'
                    : 'Auto-SEO: Slået fra'}
              {!canToggle ? ' · Kun admin kan ændre' : ''}
            </p>
          </div>
          <div className="touch-target flex shrink-0 items-center justify-center">
            <button
              type="button"
              role="switch"
              aria-checked={enabled}
              aria-label={enabled ? 'Slå Auto-SEO fra' : 'Slå Auto-SEO til'}
              disabled={statusLoading || saving || !canToggle}
              onClick={() => void toggle()}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                enabled ? 'bg-white/20' : 'bg-white/10'
              } ${!canToggle || statusLoading || saving ? 'opacity-50' : 'hover:bg-white/25'}`}
            >
              <span
                className={`pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  enabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-start justify-between gap-3 border-t border-white/[0.06] pt-3">
          <div className="min-w-0 text-left">
            <p className="text-[12px] font-medium text-white/80">Automatisk SEO (GSC/GA4)</p>
            <p className="text-[10px] text-white/35 mt-0.5 leading-snug">
              Production-default er automatisk drift (publish + cron). Kun seo-title/meta (+
              server-schema snapshot). Nød-stop her stopper writes. Aldrig redaktionel
              titel/brødtekst/holdning/rating/slug.
            </p>
            <p className="text-[10px] text-white/30 mt-1">
              {autoOptEnabled
                ? 'Automatisk drift: Aktiv (slå fra = nød-stop)'
                : 'Nød-stop: Aktiv — ingen automatiske SEO-writes'}
            </p>
          </div>
          <div className="touch-target flex shrink-0 items-center justify-center">
            <button
              type="button"
              role="switch"
              aria-checked={autoOptEnabled}
              aria-label={
                autoOptEnabled ? 'Slå Auto-optimering fra' : 'Slå Auto-optimering til'
              }
              disabled={statusLoading || savingAutoOpt || !canToggle}
              onClick={() => void toggleAutoOpt()}
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors duration-200 ${
                autoOptEnabled ? 'bg-white/20' : 'bg-white/10'
              } ${!canToggle || statusLoading || savingAutoOpt ? 'opacity-50' : 'hover:bg-white/25'}`}
            >
              <span
                className={`pointer-events-none absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
                  autoOptEnabled ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white/80 text-sm font-medium">Tomme SEO-felter (DK)</span>
            {busy && (previewLoading || runLoading) && (
              <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
            )}
            {!busy && result && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
                <span
                  className={`size-1.5 rounded-full ${
                    succeeded > 0 || ready > 0 ? 'bg-emerald-400' : 'bg-white/40'
                  }`}
                />
                {mode === 'run' ? 'Kørt' : 'Scannet'}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => void scan()}
              disabled={busy}
              className={secondaryBtn}
            >
              {previewLoading ? '…' : 'Scan'}
            </button>
            <button
              type="button"
              onClick={() => void run()}
              disabled={busy || !canToggle || !scanId || scanCandidates.length === 0}
              className={primaryBtn}
            >
              {runLoading ? '…' : 'Kør'}
            </button>
          </div>
        </div>

        <p className="text-[10px] text-white/35 leading-snug">
          Scan er read-only og fryser kandidater. Kør kræver Scan først og behandler op til 3 via
          durable job-kø (stale-check, empty-only, exact readback). For manuel analyse: åbn SEO
          Engine.
        </p>

        <Link
          href="/ai?view=seo"
          className={`${secondaryBtn} inline-flex items-center touch-target`}
        >
          Åbn SEO Engine
        </Link>

        {error ? <p className="text-red-400/95 text-[11px]">{error}</p> : null}

        {result ? (
          <div className="space-y-2">
            {mode === 'run' && processed === 0 && result.skippedReason ? (
              <p className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] text-white/55 leading-snug">
                {String(result.skippedReason)}
              </p>
            ) : null}
            {mode === 'run' && processed > 0 ? (
              <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200/90 leading-snug">
                {succeeded} af {processed} udfyldt
                {Number(result.failed) > 0 ? ` · ${result.failed} fejlede` : ''}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Scannet" value={String(result.total ?? '—')} />
              <StatBox label="Mangler SEO" value={String(ready || result.missingSeo || '—')} />
              <StatBox
                label="Validator"
                value={String(result.validatorFlagged ?? '—')}
              />
            </div>
            <ResultsTable rows={rows} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
