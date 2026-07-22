'use client';

import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth-context';

const secondaryBtn =
  'px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white/60 border-white/10 hover:border-white/20 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98]';

export default function SeoEngineSection({
  variant = 'panel',
}: {
  variant?: 'panel' | 'page';
}) {
  const { user } = useAuth();
  const [enabled, setEnabled] = useState(false);
  const [envDefault, setEnvDefault] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const authHeaders = useCallback(async () => {
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
    return headers;
  }, [user]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = await authHeaders();
      const res = await fetch('/api/seo-engine/status', { cache: 'no-store', headers });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Kunne ikke hente status');
      setEnabled(Boolean(j.enabled));
      setEnvDefault(Boolean(j.envDefault));
      setCanToggle(Boolean(j.canToggle));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [authHeaders]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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

  return (
    <div
      className={
        variant === 'page'
          ? 'rounded-xl border border-white/12 bg-white/[0.02] p-4 space-y-3'
          : 'bg-black rounded-xl p-3 space-y-3'
      }
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-white/90">SEO Engine (auto)</p>
          <p className="text-[11px] text-white/40 mt-0.5">
            Udfylder kun tomme seo-title / meta-description ved DK-publish. Overskriver aldrig
            manuelt indhold.
          </p>
          <p className="text-[10px] text-white/30 mt-1">
            Env-default: {envDefault ? 'on' : 'off'}
            {!canToggle ? ' · Kun admin kan ændre' : ''}
          </p>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          disabled={loading || saving || !canToggle}
          onClick={() => void toggle()}
          className={`relative h-5 w-9 shrink-0 rounded-full border transition-colors ${
            enabled ? 'border-white/25 bg-white/20' : 'border-white/15 bg-white/[0.06]'
          } ${!canToggle ? 'opacity-40' : ''}`}
        >
          <span
            className={`absolute top-0.5 size-3.5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-4' : 'translate-x-0.5'
            }`}
          />
        </button>
      </div>
      {error && <p className="text-[11px] text-red-400/90">{error}</p>}
      <button type="button" className={secondaryBtn} onClick={() => void refresh()} disabled={loading}>
        Opdatér status
      </button>
    </div>
  );
}
