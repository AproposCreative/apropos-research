'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const secondaryBtn =
  'px-3 py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98] touch-target';
const primaryBtn =
  'px-4 py-2.5 rounded-xl border border-white/10 bg-white/5 text-[13px] font-medium text-white hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 transition-all duration-200 active:scale-[0.99] touch-target';
const dangerOutlineBtn =
  'px-3 py-2 rounded-xl border border-white/25 text-[13px] text-white/90 hover:bg-white/[0.08] disabled:opacity-40 transition-all duration-200 active:scale-[0.98] touch-target';

type OpportunityRow = {
  id: string;
  title: string;
  slug: string;
  score: number;
  confidence?: number;
  status: string;
  signals: string[];
  why: string;
  skipReason?: string | null;
  evidence?: {
    query?: string | null;
    clicks?: number | null;
    impressions?: number | null;
    ctr?: number | null;
    position?: number | null;
    ga4EngagedSessions?: number | null;
  };
  proposals?: Array<{ field: string; proposedValue: string; rationale: string }>;
};

const SIGNAL_LABELS: Record<string, string> = {
  high_impressions_low_ctr: 'Høj imp. / lav CTR',
  position_4_to_20: 'Pos. 4–20',
  rising_query: 'Stigende query',
  declining_article: 'Faldende artikel',
  query_cannibalization: 'Cannibalization',
  weak_or_missing_meta: 'Svag/mangler meta',
};

export default function OpportunityQueuePanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<OpportunityRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [connectionMessage, setConnectionMessage] = useState<string | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<string>('ready');
  const [mode, setMode] = useState<string>('automatic');
  const [autoEnabled, setAutoEnabled] = useState(true);
  const [canToggle, setCanToggle] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [teamNote, setTeamNote] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const token = await user?.getIdToken?.();
    return {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    };
  }, [user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/opportunities?status=all&limit=60', {
        headers,
        cache: 'no-store',
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Kunne ikke hente status');
      setRows(j.opportunities || []);
      setConnectionMessage(j.connectionMessage || null);
      setConnectionStatus(j.connectionStatus || 'ready');
      setMode(j.mode || 'automatic');
      setAutoEnabled(Boolean(j.autoOpportunityOptEnabled));
      setCanToggle(Boolean(j.canToggleAutoOpt));
      setTeamNote(j.teamNote || null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleEmergencyStop = async () => {
    if (!canToggle) return;
    setToggling(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/status', {
        method: 'PATCH',
        headers,
        body: JSON.stringify({ autoOpportunityOptEnabled: !autoEnabled }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Kunne ikke ændre nød-stop');
      setAutoEnabled(Boolean(j.autoOpportunityOptEnabled));
      setNote(
        j.autoOpportunityOptEnabled
          ? 'Automatisk drift genaktiveret'
          : 'Nød-stop aktiveret — automatisk optimering er stoppet'
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setToggling(false);
    }
  };

  const runManualOptimize = async () => {
    setScanning(true);
    setError(null);
    setNote(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/opportunities/scan', {
        method: 'POST',
        headers,
        body: JSON.stringify({ limit: 10, mode: 'optimize' }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Manuel kørsel fejlede');
      const report = j.report || {};
      const applied = j.autoApply?.applied?.length ?? 0;
      setNote(
        `${report.statusMessage || 'Kørsel færdig'}${applied ? ` · auto-anvendt ${applied}` : ''}`
      );
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setScanning(false);
    }
  };

  const act = async (id: string, action: string, extra?: Record<string, unknown>) => {
    setBusyId(id);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch(`/api/seo-engine/opportunities/${id}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ action, ...extra }),
      });
      const j = await res.json();
      if (!res.ok) throw new Error(j.error || 'Handling fejlede');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusyId(null);
    }
  };

  const statusDot =
    mode === 'automatic'
      ? 'bg-emerald-400'
      : mode === 'waiting_for_connections'
        ? 'bg-amber-400'
        : 'bg-rose-400';

  return (
    <div className="flex flex-col h-full min-h-0 gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 shrink-0">
        <div className="min-w-0 text-left">
          <p className="text-[13px] font-medium text-white/90">Automatisk SEO-optimering</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            Kører selv (publish + daglig collect / ugentlig optimize). Ingen løbende Scan eller
            godkendelse. Kun seo-title/meta (+ server-schema snapshot).
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            className={dangerOutlineBtn}
            disabled={!canToggle || toggling}
            onClick={() => void toggleEmergencyStop()}
          >
            {autoEnabled ? 'Nød-stop' : 'Genaktivér'}
          </button>
          <button
            type="button"
            className={secondaryBtn}
            disabled={loading || scanning}
            onClick={() => void refresh()}
          >
            Opdatér status
          </button>
          <button
            type="button"
            className={primaryBtn}
            disabled={scanning}
            onClick={() => void runManualOptimize()}
          >
            {scanning ? 'Kører…' : 'Manuel kørsel'}
          </button>
        </div>
      </div>

      <div className="rounded-xl border border-white/12 bg-white/[0.03] px-3 py-2.5 flex items-start gap-2">
        <span className={`mt-1 size-1.5 rounded-full shrink-0 ${statusDot}`} />
        <div className="min-w-0 text-left space-y-1">
          <p className="text-[12px] text-white/75 leading-snug">
            {mode === 'automatic'
              ? 'Automatisk drift aktiv'
              : mode === 'emergency_stopped'
                ? 'Nød-stop — ingen automatiske writes'
                : 'Venter på sunde GSC/Webflow-forbindelser'}
            {autoEnabled ? '' : ' · deaktiveret'}
          </p>
          {connectionMessage && (
            <p className="text-[11px] text-white/45 leading-snug">{connectionMessage}</p>
          )}
          {teamNote && <p className="text-[11px] text-white/35 leading-snug">{teamNote}</p>}
        </div>
      </div>

      {note && <p className="text-[12px] text-white/55">{note}</p>}
      {error && <p className="text-[12px] text-red-400/95">{error}</p>}

      <div className="flex-1 min-h-0 overflow-y-auto nice-scrollbar space-y-2">
        {loading && rows.length === 0 && (
          <p className="text-[12px] text-white/40">Henter status…</p>
        )}
        {!loading && rows.length === 0 && (
          <p className="text-[12px] text-white/40">
            Ingen registrerede muligheder endnu. Cron samler data dagligt.
          </p>
        )}
        {rows.map((row) => (
          <div
            key={row.id}
            className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3 py-2.5 space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0 text-left">
                <p className="text-[13px] font-medium text-white/85 truncate">{row.title}</p>
                <p className="text-[10px] text-white/30 truncate">
                  {row.slug} · {row.status}
                  {row.skipReason ? ` · ${row.skipReason}` : ''}
                </p>
              </div>
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70 shrink-0">
                <span
                  className={`size-1.5 rounded-full ${
                    row.status === 'applied'
                      ? 'bg-emerald-400'
                      : row.status === 'skipped'
                        ? 'bg-white/40'
                        : 'bg-amber-400'
                  }`}
                />
                {Math.round(row.score)}
                {row.confidence != null ? ` · ${Math.round(row.confidence * 100)}%` : ''}
              </span>
            </div>
            <p className="text-[12px] text-white/65 leading-snug">{row.why}</p>
            <div className="flex flex-wrap gap-1.5">
              {(row.signals || []).map((s) => (
                <span
                  key={s}
                  className="px-2 py-0.5 rounded-md border border-white/10 text-[10px] text-white/55"
                >
                  {SIGNAL_LABELS[s] || s}
                </span>
              ))}
            </div>
            {row.evidence && (
              <p className="text-[11px] text-white/40">
                {row.evidence.query ? `Query: ${row.evidence.query} · ` : ''}
                klik {row.evidence.clicks ?? '—'} · imp {row.evidence.impressions ?? '—'} · CTR{' '}
                {row.evidence.ctr != null ? `${(row.evidence.ctr * 100).toFixed(1)}%` : '—'} · pos{' '}
                {row.evidence.position != null ? row.evidence.position.toFixed(1) : '—'}
                {row.evidence.ga4EngagedSessions != null
                  ? ` · GA4 eng. ${row.evidence.ga4EngagedSessions}`
                  : ''}
              </p>
            )}
            {(row.proposals || []).length > 0 && (
              <div className="rounded-lg border border-white/[0.06] bg-black/30 px-2.5 py-2 space-y-1">
                {row.proposals!.map((p, i) => (
                  <p key={`${p.field}-${i}`} className="text-[11px] text-white/55">
                    <span className="text-white/75">{p.field}</span>: {p.proposedValue}
                  </p>
                ))}
              </div>
            )}
            {row.status === 'applied' && (
              <button
                type="button"
                className={dangerOutlineBtn}
                disabled={busyId === row.id}
                onClick={() => {
                  const ok = window.confirm('Rul metadata tilbage til før auto-apply?');
                  if (!ok) return;
                  void act(row.id, 'rollback');
                }}
              >
                Rollback
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
