'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const secondaryBtn =
  'px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98]';
const primaryBtn =
  'px-3 py-1.5 rounded-lg text-xs font-medium transition-all border border-white/10 bg-white/5 text-white hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

/** Fast indstilling — justeres kun i kode/env, ikke i UI. */
/** Mobil hero: redaktionel kvalitet på retina, stadig mobil-venlig. */
const MOBILE_PRESET = { maxSizeKB: 260, maxLongEdge: 1200, limit: 10, force: false };
const CONTENT_PRESET = {
  maxSizeKB: 200,
  maxLongEdge: 1200,
  minOriginalKB: 80,
  articleLimit: 5,
  imagesPerArticle: 5,
  force: false,
};
const THUMB_PRESET = {
  maxSizeKB: 600,
  minOriginalKB: 120,
  limit: 10,
  preserveDimensions: true,
  force: false,
};

type ApiResult = Record<string, unknown> & { ok?: boolean; error?: string; skippedReason?: string | null };

function StatBox({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-2">
      <p className="text-[10px] text-white/40">{label}</p>
      <p className="text-[15px] font-medium text-white/90">{value}</p>
    </div>
  );
}

function ResultBanner({ result, mode }: { result: ApiResult; mode: 'preview' | 'run' }) {
  const skippedReason = typeof result.skippedReason === 'string' ? result.skippedReason : null;
  const processed = Number(result.processed ?? 0);
  const succeeded = Number(result.succeeded ?? 0);
  const ready = Number(result.ready ?? result.totalCandidates ?? 0);

  if (mode === 'run' && processed === 0 && skippedReason) {
    return (
      <p className="rounded-lg border border-amber-500/25 bg-amber-500/10 px-3 py-2 text-[11px] text-amber-200/90 leading-snug">
        {skippedReason}
      </p>
    );
  }

  if (mode === 'run' && processed > 0) {
    const imagesOptimized = Number(result.imagesOptimized ?? 0);
    const extra = imagesOptimized > 0 ? ` · ${imagesOptimized} billeder` : '';
    return (
      <p className="rounded-lg border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-200/90 leading-snug">
        {succeeded} af {processed} opdateret
        {Number(result.failed) > 0 ? ` · ${result.failed} fejlede` : ''}
        {extra}
      </p>
    );
  }

  if (mode === 'preview' && ready === 0) {
    return (
      <p className="rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-[11px] text-white/55 leading-snug">
        Ingen artikler mangler mobil-optimering lige nu.
      </p>
    );
  }

  return null;
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
            if (row.ok === true) status = 'Opdateret';
            else if (row.ok === false) status = 'Fejl';
            else if (status === 'ready') status = 'Klar';
            else if (status === 'skip-existing') status = 'Optimeret';
            else if (status === 'missing-thumb') status = 'Mangler thumb';
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

function AutoOptimizeStatusToggle({ enabled, loading }: { enabled: boolean; loading: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
      <div className="min-w-0 text-left">
        <p className="text-[12px] font-medium text-white/80">Auto-optimering</p>
        <p className="text-[10px] text-white/30 truncate">
          {loading ? 'Tjekker…' : enabled ? 'Slået til' : 'Slået fra'}
        </p>
      </div>
      <div
        role="status"
        aria-label={
          loading
            ? 'Auto-optimering status indlæses'
            : enabled
              ? 'Auto-optimering er slået til'
              : 'Auto-optimering er slået fra'
        }
        className={`relative w-9 h-5 shrink-0 rounded-full transition-colors duration-200 ${
          enabled ? 'bg-white/20' : 'bg-white/10'
        } ${loading ? 'opacity-50' : ''}`}
      >
        <span
          className={`absolute top-0.5 left-0.5 size-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${
            enabled ? 'translate-x-4' : 'translate-x-0'
          }`}
        />
      </div>
    </div>
  );
}

function OptimizeCard({
  title,
  previewLoading,
  runLoading,
  result,
  mode,
  error,
  onScan,
  onRun,
  stats,
  rows,
}: {
  title: string;
  previewLoading: boolean;
  runLoading: boolean;
  result: ApiResult | null;
  mode: 'preview' | 'run' | null;
  error: string | null;
  onScan: () => void;
  onRun: () => void;
  stats: Array<[string, string | number]>;
  rows: Array<Record<string, unknown>>;
}) {
  const busy = previewLoading || runLoading;
  return (
    <div className="bg-black rounded-xl p-3 space-y-2.5">
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-white/80 text-sm font-medium">{title}</span>
          {busy && (
            <div className="w-3 h-3 border-2 border-white/20 border-t-white/60 rounded-full animate-spin flex-shrink-0" />
          )}
          {!busy && result && (
            <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
              <span
                className={`size-1.5 rounded-full ${
                  Number(result.succeeded) > 0 || Number(result.ready) > 0 ? 'bg-emerald-400' : 'bg-white/40'
                }`}
              />
              {mode === 'run' ? 'Kørt' : 'Scannet'}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button type="button" onClick={onScan} disabled={busy} className={secondaryBtn}>
            {previewLoading ? '…' : 'Scan'}
          </button>
          <button type="button" onClick={onRun} disabled={busy} className={primaryBtn}>
            {runLoading ? '…' : 'Kør'}
          </button>
        </div>
      </div>
      {error ? <p className="text-red-400/95 text-[11px]">{error}</p> : null}
      {result ? (
        <div className="space-y-2">
          {mode ? <ResultBanner result={result} mode={mode} /> : null}
          <div className="grid grid-cols-3 gap-2">
            {stats.map(([label, value]) => (
              <StatBox key={label} label={label} value={value} />
            ))}
          </div>
          <ResultsTable rows={rows} />
        </div>
      ) : null}
    </div>
  );
}

export default function ImageOptimizationSection({ variant = 'panel' }: { variant?: 'panel' | 'page' }) {
  const resultsRef = useRef<HTMLDivElement>(null);
  const [autoOptimizeEnabled, setAutoOptimizeEnabled] = useState(true);
  const [autoOptimizeLoading, setAutoOptimizeLoading] = useState(true);

  const [mobilePreviewLoading, setMobilePreviewLoading] = useState(false);
  const [mobileRunLoading, setMobileRunLoading] = useState(false);
  const [mobileResult, setMobileResult] = useState<ApiResult | null>(null);
  const [mobileError, setMobileError] = useState<string | null>(null);
  const [mobileMode, setMobileMode] = useState<'preview' | 'run' | null>(null);

  const [contentPreviewLoading, setContentPreviewLoading] = useState(false);
  const [contentRunLoading, setContentRunLoading] = useState(false);
  const [contentResult, setContentResult] = useState<ApiResult | null>(null);
  const [contentError, setContentError] = useState<string | null>(null);
  const [contentMode, setContentMode] = useState<'preview' | 'run' | null>(null);

  const [thumbPreviewLoading, setThumbPreviewLoading] = useState(false);
  const [thumbRunLoading, setThumbRunLoading] = useState(false);
  const [thumbResult, setThumbResult] = useState<ApiResult | null>(null);
  const [thumbError, setThumbError] = useState<string | null>(null);
  const [thumbMode, setThumbMode] = useState<'preview' | 'run' | null>(null);

  const scrollToResults = useCallback(() => {
    requestAnimationFrame(() => {
      resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/webflow/image-optimize/status', { cache: 'no-store' });
        const data = await res.json();
        if (!cancelled && res.ok && data.ok) {
          setAutoOptimizeEnabled(!!data.enabled);
        }
      } catch {
        if (!cancelled) setAutoOptimizeEnabled(true);
      } finally {
        if (!cancelled) setAutoOptimizeLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

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

  const scanMobile = async () => {
    setMobilePreviewLoading(true);
    setMobileError(null);
    setMobileMode('preview');
    try {
      setMobileResult(await callApi('/api/webflow/mobile-image/preview', MOBILE_PRESET));
      scrollToResults();
    } catch (e) {
      setMobileError(e instanceof Error ? e.message : String(e));
    } finally {
      setMobilePreviewLoading(false);
    }
  };

  const runMobile = async () => {
    setMobileRunLoading(true);
    setMobileError(null);
    setMobileMode('run');
    try {
      setMobileResult(await callApi('/api/webflow/mobile-image/run', MOBILE_PRESET));
      scrollToResults();
    } catch (e) {
      setMobileError(e instanceof Error ? e.message : String(e));
    } finally {
      setMobileRunLoading(false);
    }
  };

  const scanContent = async () => {
    setContentPreviewLoading(true);
    setContentError(null);
    setContentMode('preview');
    try {
      setContentResult(await callApi('/api/webflow/content-image/preview', CONTENT_PRESET));
    } catch (e) {
      setContentError(e instanceof Error ? e.message : String(e));
    } finally {
      setContentPreviewLoading(false);
    }
  };

  const runContent = async () => {
    setContentRunLoading(true);
    setContentError(null);
    setContentMode('run');
    try {
      setContentResult(await callApi('/api/webflow/content-image/run', CONTENT_PRESET));
    } catch (e) {
      setContentError(e instanceof Error ? e.message : String(e));
    } finally {
      setContentRunLoading(false);
    }
  };

  const scanThumb = async () => {
    setThumbPreviewLoading(true);
    setThumbError(null);
    setThumbMode('preview');
    try {
      setThumbResult(await callApi('/api/webflow/thumb-image/preview', THUMB_PRESET));
      scrollToResults();
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : String(e));
    } finally {
      setThumbPreviewLoading(false);
    }
  };

  const runThumb = async () => {
    setThumbRunLoading(true);
    setThumbError(null);
    setThumbMode('run');
    try {
      setThumbResult(await callApi('/api/webflow/thumb-image/run', THUMB_PRESET));
      scrollToResults();
    } catch (e) {
      setThumbError(e instanceof Error ? e.message : String(e));
    } finally {
      setThumbRunLoading(false);
    }
  };

  const mobileRows = (mobileResult?.results || mobileResult?.candidates || []) as Array<Record<string, unknown>>;
  const contentRows = (contentResult?.results || contentResult?.candidates || []) as Array<Record<string, unknown>>;
  const thumbRows = (thumbResult?.results || thumbResult?.candidates || []) as Array<Record<string, unknown>>;

  return (
    <div className={variant === 'page' ? 'space-y-4' : 'space-y-3'} ref={resultsRef}>
      <p className="text-[10px] uppercase tracking-[0.2em] text-white/30 font-medium px-0.5">Optimering</p>
      <AutoOptimizeStatusToggle enabled={autoOptimizeEnabled} loading={autoOptimizeLoading} />
      <OptimizeCard
        title="Desktop-billede (thumb)"
        previewLoading={thumbPreviewLoading}
        runLoading={thumbRunLoading}
        result={thumbResult}
        mode={thumbMode}
        error={thumbError}
        onScan={() => void scanThumb()}
        onRun={() => void runThumb()}
        stats={[
          ['Artikler', String(thumbResult?.total ?? '—')],
          ['Klar', String(thumbResult?.ready ?? thumbResult?.totalCandidates ?? '—')],
          ['OK', String(thumbResult?.succeeded ?? '—')],
        ]}
        rows={thumbRows}
      />
      <OptimizeCard
        title="Mobil-billede"
        previewLoading={mobilePreviewLoading}
        runLoading={mobileRunLoading}
        result={mobileResult}
        mode={mobileMode}
        error={mobileError}
        onScan={() => void scanMobile()}
        onRun={() => void runMobile()}
        stats={[
          ['Artikler', String(mobileResult?.total ?? '—')],
          ['Klar', String(mobileResult?.ready ?? mobileResult?.totalCandidates ?? '—')],
          ['OK', String(mobileResult?.succeeded ?? '—')],
        ]}
        rows={mobileRows}
      />
      <OptimizeCard
        title="Brødtekst-billeder"
        previewLoading={contentPreviewLoading}
        runLoading={contentRunLoading}
        result={contentResult}
        mode={contentMode}
        error={contentError}
        onScan={() => void scanContent()}
        onRun={() => void runContent()}
        stats={[
          ['Artikler', String(contentResult?.totalArticles ?? '—')],
          ['Klar', String(contentResult?.ready ?? '—')],
          ['Billeder', String(contentResult?.optimizableImages ?? contentResult?.imagesOptimized ?? '—')],
        ]}
        rows={contentRows}
      />
    </div>
  );
}
