'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { listMetadataHistory } from '@/lib/seo-engine/post-publish/editorial';
import type { SeoChatHealth } from '@/lib/seo-engine/post-publish/chat-health';
import { seoStatusPresentation, seoHealthLabels } from '@/lib/seo-engine/post-publish/presentation';

type History = Awaited<ReturnType<typeof listMetadataHistory>>;
type Row = History['rows'][number];
const button = 'rounded-lg border border-white/20 px-3 py-2 text-sm disabled:opacity-40 hover:bg-white/10';

export default function MetadataQualityPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [health, setHealth] = useState<SeoChatHealth | null>(null);
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
      setHealth(data.health || null);
    } catch (e) { if (request === generation.current) setError(e instanceof Error ? e.message : 'Historikken kunne ikke hentes.'); }
    finally { if (request === generation.current) setBusy(false); }
  }, [user]);
  useEffect(() => { setRows([]); setCursor(null); setHealth(null); void refresh(); return () => { generation.current++; }; }, [refresh]);

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

  return <MetadataQualityView rows={rows} health={health} cursor={cursor} busy={busy} error={error}
    authenticated={!!user} refresh={refresh} toggleLock={toggleLock} />;
}

/** Same presentation for the authenticated client and isolated UI regression. */
export function MetadataQualityView({ rows, health, cursor, busy, error, authenticated, refresh, toggleLock }: {
  rows: Row[]; health: SeoChatHealth | null; cursor: string | null; busy: boolean; error: string | null;
  authenticated: boolean; refresh: (cursor?: string) => void | Promise<void>;
  toggleLock: (row: Row, field: 'seoTitle' | 'metaDescription') => void | Promise<void>;
}) {
  return <section className="mt-6 rounded-2xl border border-white/15 p-4 text-white" aria-label="Automatisk metadata-kontrol">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <h2 className="text-lg font-medium">Automatisk SEO-kontrol</h2>
      <button type="button" className={button} disabled={busy || !authenticated} onClick={() => void refresh()}>Opdater historik</button>
    </div>
    <p className="mt-2 text-sm text-white/65">Se vurderinger efter publicering og opfølgning med Google-data. Lås et felt for at bevare redaktionens valg.</p>
    {health ? <aside className="mt-4 rounded-xl border border-white/15 p-3 text-sm" aria-label="SEO-driftsstatus">
      <h3 className="font-medium">{health.processor === 'chatgpt-first' ? 'ChatGPT-first' : 'API-behandling'} · Driftsstatus</h3>
      <p className="mt-1 text-white/75">{health.day}: {({ completed: 'Modtaget kørsel afsluttet', waiting: 'Afventer dagens kørsel',
        not_due: 'Ny daglig tidsplan er endnu ikke forfalden', in_progress: 'Modtaget kørsel er i gang', attention: 'Kræver opfølgning' } as Record<string, string>)[health.status]} · {health.completedTasks} offentligt kontrollerede resultater.</p>
      <p className="mt-1 text-white/65">Dagligt kl. 09 dansk tid. Manglende kørsel markeres efter kl. 10. Status kontrolleret {new Date(health.checkedAt).toLocaleString('da-DK')}.</p>
      {[health, ...(health.previousDay?.issues.length ? [health.previousDay] : [])].map(day => day.issues.length > 0 &&
        <ul key={day.day} className="mt-2 list-disc space-y-1 pl-5 text-amber-200">{day.issues.map((issue, i) =>
          <li key={`${issue.code}-${i}`}>{day.day}: {seoHealthLabels[issue.code] || 'Ukendt driftsstatus kræver kontrol.'}</li>)}</ul>)}
      {health.scanPartial && <p className="mt-2 text-amber-200">Afgrænset køudsnit. Dette er ikke en fuld kontrol af hele køen.</p>}
      <p className="mt-2 text-xs text-white/60">ChatGPT vurderer indholdet; serveren kontrollerer felter og offentligt resultat. Serverstatus beviser ikke alene timerstart. Ingen automatisk genstart eller betalt AI i driftskontrollen.</p>
    </aside> : !busy && <p className="mt-3 text-sm text-white/65">Driftsstatus er ikke tilgængelig. Det er ikke bevis på en vellykket kørsel.</p>}
    {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}
    {!rows.length && !busy && !error && <p className="mt-4 text-sm text-white/65">Ingen registrerede kvalitetskontroller endnu.</p>}
    {busy && <p role="status" className="mt-3 text-sm text-white/65">Henter eller gemmer…</p>}
    <div className="mt-4 space-y-3">{rows.map(row => { const display = seoStatusPresentation(row); return <details key={row.id} className="rounded-xl border border-white/10 p-3">
      <summary className="cursor-pointer break-words text-sm"><strong>{row.title}</strong> · {row.locale.toUpperCase()} · {display.label}</summary>
      <p className="mt-2 text-xs text-white/60">{new Date(row.updatedAt).toLocaleString('da-DK')} · {row.mode === 'performance' ? 'Opfølgning med Google-data' : 'Kontrol efter publicering'}</p>
      <p className="mt-2 break-words text-sm text-white/75">{display.reason}</p>
      {display.showTechnicalCode && <details className="mt-2 text-xs text-white/60"><summary>Teknisk status</summary><p className="break-words">{row.reason}</p></details>}
      {row.processor === 'chatgpt-first' && <p className="mt-2 text-xs text-white/60">ChatGPT-vurdering · {row.editorialRecheck ? 'Redaktionel genkontrol rapporteret af ChatGPT' : 'Redaktionel genkontrol afventer'} · Ikke et uafhængigt serverfaktatjek.</p>}
      {(['seoTitle', 'metaDescription'] as const).map(field => <div key={field} className="mt-4 space-y-1 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{field === 'seoTitle' ? 'SEO-titel' : 'Metabeskrivelse'}</h3>
          <button type="button" className={button} disabled={busy} aria-pressed={row.lockedFields.includes(field)} onClick={() => void toggleLock(row, field)}>
            {row.lockedFields.includes(field) ? 'Låst – lås op' : 'Lås felt'}
          </button></div>
        <p className="break-words text-white/65">Før: {row.before[field] || 'Tomt felt'}</p>
        {row.assessments.find(assessment => assessment.field === field)?.reason && <p className="text-white/75">{row.assessments.find(assessment => assessment.field === field)?.reason}</p>}
        {row.proposed?.[field] && <p className="break-words">Forslag: {row.proposed[field]}</p>}
        {row.after?.[field] && <p className="break-words">{display.verified ? 'Verificeret offentligt' : 'Gemt resultat'}: {row.after[field]}</p>}
      </div>)}
      {row.evidence && <div className="mt-3 space-y-1 text-sm text-white/65">
        <p>Søgning: {row.evidence.query || 'Ingen enkelt søgning'}</p>
        <p>{row.evidence.currentStart} – {row.evidence.currentEnd}: {row.evidence.impressions ?? 'Ukendt'} visninger · {row.evidence.clicks ?? 'Ukendt'} klik · Klikrate {row.evidence.ctr === null ? 'ukendt' : `${(row.evidence.ctr * 100).toFixed(1)} %`} · Placering {row.evidence.position?.toFixed(1) ?? 'ukendt'}</p>
        <p>{row.evidence.previousStart} – {row.evidence.previousEnd}: {row.evidence.previousImpressions ?? 'Ukendt'} visninger · {row.evidence.previousClicks ?? 'Ukendt'} klik · Klikrate {row.evidence.previousCtr === null ? 'ukendt' : `${(row.evidence.previousCtr * 100).toFixed(1)} %`}</p>
        <p>Engagerede sessioner: {row.evidence.ga4EngagedSessions ?? 'Ukendt'}. Udviklingen kan også skyldes ændringer i søgninger og placeringer.</p>
      </div>}
      {row.publicReceipt && <a href={row.publicReceipt.url} target="_blank" rel="noreferrer" className="mt-3 inline-block text-sm underline">Se verificeret artikel</a>}
    </details>; })}</div>
    {cursor && <button type="button" className={`${button} mt-4`} disabled={busy} onClick={() => void refresh(cursor)}>Vis ældre kontroller</button>}
  </section>;
}
