'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { listMetadataHistory } from '@/lib/seo-engine/post-publish/editorial';

type History = Awaited<ReturnType<typeof listMetadataHistory>>;
type Row = History['rows'][number];
const statusLabels: Record<string, string> = { queued: 'I kø', running: 'Vurderes', verify_pending: 'Afventer live-kontrol',
  kept: 'Beholdt', applied: 'Verificeret live', needs_editor: 'Kræver gennemgang', stale: 'Grundlaget ændret', failed: 'Fejlet' };
const reasonLabels: Record<string, string> = {
  verified_public_metadata: 'Metadata er kontrolleret på den publicerede side.',
  reconciled_public_metadata: 'Den tidligere opdatering er nu bekræftet på den publicerede side.',
  no_unlocked_improvement: 'De aktuelle metadata er beholdt.',
  editorial_locks: 'Redaktionens feltlåse er respekteret.',
  cooldown: 'Metadata er ændret for nylig. Der ventes før en ny optimering.',
  article_changed: 'Artiklen er ændret siden vurderingen.',
  insufficient_performance_evidence: 'Der er endnu ikke tilstrækkelige sammenlignelige søgedata.',
  editorial_uncertainty: 'Vurderingen kræver en redaktør.',
  unverified_proposal: 'Forslaget kunne ikke verificeres mod artiklen.',
  auto_disabled: 'Automatikken er sat på pause.',
  article_write_pending: 'En tidligere opdatering af artiklen afventer kontrol.',
  seo_public_metadata_pending: 'Opdateringen er endnu ikke bekræftet på den offentlige side.',
  seo_metadata_duplicate: 'Forslaget matcher en anden artikels metadata og er ikke gemt.',
};
const button = 'rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40 hover:bg-white/10';

export default function MetadataQualityPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const refresh = useCallback(async (next?: string) => {
    if (!user) return;
    const request = ++generation.current;
    setBusy(true); setError(null);
    try {
      const token = await user.getIdToken();
      const response = await fetch(`/api/seo-engine/quality${next ? `?cursor=${encodeURIComponent(next)}` : ''}`, {
        headers: { Authorization: `Bearer ${token}` }, cache: 'no-store',
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Historikken kunne ikke hentes.');
      if (request !== generation.current) return;
      setRows(previous => next ? [...previous, ...data.rows.filter((row: Row) => !previous.some(old => old.id === row.id))] : data.rows);
      setCursor(data.nextCursor);
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : 'Historikken kunne ikke hentes.'); }
    finally { if (request === generation.current) setBusy(false); }
  }, [user]);
  useEffect(() => { setRows([]); setCursor(null); void refresh(); return () => { generation.current++; }; }, [refresh]);

  async function toggleLock(row: Row, field: 'seoTitle' | 'metaDescription') {
    if (!user) return;
    const request = ++generation.current;
    setBusy(true); setError(null);
    const lockedFields = row.lockedFields.includes(field) ? row.lockedFields.filter(key => key !== field) : [...row.lockedFields, field];
    try {
      const response = await fetch('/api/seo-engine/quality', { method: 'POST', headers: {
        Authorization: `Bearer ${await user.getIdToken()}`, 'Content-Type': 'application/json',
      }, body: JSON.stringify({ itemId: row.itemId, locale: row.locale, lockedFields }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Låsen kunne ikke gemmes.');
      if (request !== generation.current) return;
      setRows(previous => previous.map(old => old.itemId === row.itemId && old.locale === row.locale ? { ...old, lockedFields: data.lockedFields } : old));
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : 'Låsen kunne ikke gemmes.'); }
    finally { if (request === generation.current) setBusy(false); }
  }

  return <section className="mt-6 rounded-2xl border border-white/15 p-4 text-white" aria-label="Automatisk metadata-kontrol">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-medium">Automatisk SEO-kontrol</h2>
      <button type="button" className={button} disabled={busy || !user} onClick={() => void refresh()}>Opdater historik</button>
    </div>
    <p className="mt-2 text-sm text-white/65">Se vurderinger efter publicering og opfølgning med Google-data. Lås et felt for at bevare redaktionens valg.</p>
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {!rows.length && !busy && !error && <p className="mt-4 text-sm text-white/65">Ingen registrerede kvalitetskontroller endnu.</p>}
    {busy && <p role="status" className="mt-3 text-sm text-white/65">Henter eller gemmer…</p>}
    <div className="mt-4 space-y-3">{rows.map(row => <details key={row.id} className="rounded-xl border border-white/10 p-3">
      <summary className="cursor-pointer break-words text-sm"><strong>{row.title}</strong> · {row.locale.toUpperCase()} · {statusLabels[row.status] || row.status}</summary>
      <p className="mt-2 text-xs text-white/60">{new Date(row.updatedAt).toLocaleString('da-DK')} · {row.mode === 'performance' ? 'Opfølgning med Google-data' : 'Kontrol efter publicering'}</p>
      {row.reason && <p className="mt-2 break-words text-sm text-white/75">{reasonLabels[row.reason] || 'Kontrollen kunne ikke gennemføres automatisk.'}</p>}
      {row.reason && !reasonLabels[row.reason] && <details className="mt-2 text-xs text-white/60"><summary>Fejldetaljer</summary><p className="break-words">{row.reason}</p></details>}
      {(['seoTitle', 'metaDescription'] as const).map(field => <div key={field} className="mt-4 space-y-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{field === 'seoTitle' ? 'SEO-titel' : 'Metabeskrivelse'}</h3>
          <button type="button" className={button} disabled={busy} aria-pressed={row.lockedFields.includes(field)} onClick={() => void toggleLock(row, field)}>
            {row.lockedFields.includes(field) ? 'Låst – lås op' : 'Lås felt'}
          </button></div>
        <p className="break-words text-white/65">Før: {row.before[field] || 'Tomt felt'}</p>
        {row.assessments.find(assessment => assessment.field === field)?.reason && <p className="text-white/75">{row.assessments.find(assessment => assessment.field === field)?.reason}</p>}
        {row.proposed?.[field] && <p className="break-words">Forslag: {row.proposed[field]}</p>}
        {row.after?.[field] && <p className="break-words">Verificeret: {row.after[field]}</p>}
      </div>)}
      {row.evidence && <div className="mt-3 space-y-1 text-sm text-white/65">
        <p>Søgning: {row.evidence.query || 'Ingen enkelt søgning'}</p>
        <p>{row.evidence.currentStart} – {row.evidence.currentEnd}: {row.evidence.impressions ?? 'Ukendt'} visninger · {row.evidence.clicks ?? 'Ukendt'} klik · Klikrate {row.evidence.ctr === null ? 'ukendt' : `${(row.evidence.ctr * 100).toFixed(1)} %`} · Placering {row.evidence.position?.toFixed(1) ?? 'ukendt'}</p>
        <p>{row.evidence.previousStart} – {row.evidence.previousEnd}: {row.evidence.previousImpressions ?? 'Ukendt'} visninger · {row.evidence.previousClicks ?? 'Ukendt'} klik · Klikrate {row.evidence.previousCtr === null ? 'ukendt' : `${(row.evidence.previousCtr * 100).toFixed(1)} %`}</p>
        <p>Engagerede sessioner: {row.evidence.ga4EngagedSessions ?? 'Ukendt'}. Udviklingen kan også skyldes ændringer i søgninger og placeringer.</p>
      </div>}
      {row.publicReceipt && <a href={row.publicReceipt.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm underline">Se verificeret artikel</a>}
    </details>)}</div>
    {cursor && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => void refresh(cursor)}>Vis ældre kontroller</button>}
  </section>;
}
