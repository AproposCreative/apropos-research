'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const secondaryBtn =
  'px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98]';
const primaryBtn =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

/** Scan viser alle med EN-locale; Kør oversætter op til 3 ad gangen med force. */
const SCAN_PRESET = { force: true, limit: 50 };
const RUN_PRESET = { force: true, articleLimit: 3 };

type ApiResult = Record<string, unknown> & { ok?: boolean; error?: string; skippedReason?: string | null };

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <p className="text-[10px] text-white/40">{label}</p>
      <p className="text-[15px] font-medium text-white/90">{value}</p>
    </div>
  );
}

function statusLabel(status: string): string {
  if (status === 'ready') return 'Klar';
  if (status === 'skip-unchanged') return 'Opdateret';
  if (status === 'skip-no-en') return 'Mangler EN';
  if (status === 'in-progress') return 'I gang';
  return status;
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
            if (row.ok === true) status = 'Oversat';
            else if (row.ok === false && row.error) status = 'Fejl';
            else if (row.skipped) status = String(row.reason || 'Sprunget over').slice(0, 40);
            else status = statusLabel(status);
            return (
              <tr key={id} className="border-t border-white/[0.06]">
                <td className="px-2.5 py-1.5 text-white/80 font-medium truncate max-w-[180px]">{title}</td>
                <td className="px-2.5 py-1.5 text-white/50">{status}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function AutoTranslateToggle({
  enabled,
  loading,
  saving,
  onToggle,
}: {
  enabled: boolean;
  loading: boolean;
  saving: boolean;
  onToggle: () => void;
}) {
  const busy = loading || saving;
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
      <div className="min-w-0 text-left">
        <p className="text-[12px] font-medium text-white/80">Auto-oversættelse</p>
        <p className="text-[10px] text-white/30 truncate">
          {loading ? 'Tjekker…' : saving ? 'Gemmer…' : enabled ? 'Slået til ved DK-publish' : 'Slået fra'}
        </p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        aria-label={enabled ? 'Slå auto-oversættelse fra' : 'Slå auto-oversættelse til'}
        disabled={busy}
        onClick={onToggle}
        className={`relative w-9 h-5 shrink-0 rounded-full transition-colors duration-200 touch-target ${
          enabled ? 'bg-white/20' : 'bg-white/10'
        } ${busy ? 'opacity-50' : 'hover:bg-white/25'}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </button>
    </div>
  );
}

export default function ArticleTranslationSection({ variant = 'panel' }: { variant?: 'panel' | 'page' }) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [autoLoading, setAutoLoading] = useState(true);
  const [autoSaving, setAutoSaving] = useState(false);

  const [previewLoading, setPreviewLoading] = useState(false);
  const [runLoading, setRunLoading] = useState(false);
  const [result, setResult] = useState<ApiResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [mode, setMode] = useState<'preview' | 'run' | null>(null);

  const scrollToResults = useCallback(() => {
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/webflow/article-translation/status', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) {
          setAutoEnabled(!!data.enabled);
        }
      } catch {
        if (!cancelled) setAutoEnabled(true);
      } finally {
        if (!cancelled) setAutoLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggleAuto = async () => {
    const next = !autoEnabled;
    setAutoSaving(true);
    try {
      const res = await fetch('/api/webflow/article-translation/status', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ enabled: next }),
      });
      const data = await res.json();
      if (!res.ok || !data.ok) throw new Error(data.error || 'Kunne ikke gemme');
      setAutoEnabled(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setAutoSaving(false);
    }
  };

  const callApi = async (url: string, body: object) => {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
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
      setResult(await callApi('/api/webflow/article-translation/preview', SCAN_PRESET));
      scrollToResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setPreviewLoading(false);
    }
  };

  const run = async () => {
    setRunLoading(true);
    setError(null);
    setMode('run');
    try {
      setResult(await callApi('/api/webflow/article-translation/run', RUN_PRESET));
      scrollToResults();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunLoading(false);
    }
  };

  const busy = previewLoading || runLoading;
  const rows = (result?.results || result?.candidates || []) as Array<Record<string, unknown>>;
  const processed = Number(result?.processed ?? 0);
  const succeeded = Number(result?.succeeded ?? 0);
  const ready = Number(result?.ready ?? result?.totalCandidates ?? 0);

  return (
    <div className={variant === 'page' ? 'space-y-4' : 'space-y-3'} ref={resultsRef}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium px-0.5">Oversættelse</p>
      <AutoTranslateToggle
        enabled={autoEnabled}
        loading={autoLoading}
        saving={autoSaving}
        onToggle={() => void toggleAuto()}
      />
      <div className="bg-black rounded-xl p-3 space-y-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-white/80 text-sm font-medium">DK → EN (alle felter)</span>
            {busy && (
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
            <button type="button" onClick={() => void scan()} disabled={busy} className={secondaryBtn}>
              {previewLoading ? '…' : 'Scan'}
            </button>
            <button type="button" onClick={() => void run()} disabled={busy} className={primaryBtn}>
              {runLoading ? '…' : 'Kør'}
            </button>
          </div>
        </div>
        <p className="text-[10px] text-white/35 leading-snug">
          Oversætter titel, intro, brødtekst, SEO m.m. i Apropos EN-stemme. Kør behandler op til 3 artikler ad gangen.
        </p>
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
                {succeeded} af {processed} oversat
                {Number(result.failed) > 0 ? ` · ${result.failed} fejlede` : ''}
                {ready > processed ? ` · ${ready - processed} tilbage i kø` : ''}
              </p>
            ) : null}
            <div className="grid grid-cols-3 gap-2">
              <StatBox label="Artikler" value={String(result.total ?? '—')} />
              <StatBox label="Klar" value={String(ready || '—')} />
              <StatBox
                label="Mangler EN"
                value={String(result.skipNoEn ?? '—')}
              />
            </div>
            <ResultsTable rows={rows} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
