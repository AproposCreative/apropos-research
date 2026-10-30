'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { PodcastOperationsData, PodcastOperationRow } from '@/lib/podcast/operations-format';
import { PODCAST_ISSUE_LABELS, PODCAST_SPOTIFY_SHOW_URL } from '@/lib/podcast/delivery-labels';
import styles from './PodcastOperationsPanel.module.css';

type Action = Record<string, string>;
type ViewProps = { data: PodcastOperationsData | null; loading: boolean; error: string | null; busy: boolean;
  onAction: (action: Action) => void; onReload: () => void };
const audioLabels = { ready: 'Lyd klar', pending: 'Lyd afventer', failed: 'Lydfejl', missing: 'Mangler lyd' };
function duration(seconds: number | null) { return seconds ? `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}` : 'Varighed mangler'; }
function EpisodeRow({ row, data, busy, onAction }: { row: PodcastOperationRow; data: PodcastOperationsData; busy: boolean; onAction: ViewProps['onAction'] }) {
  const [spotifyUrl, setSpotifyUrl] = useState('');
  const guid = row.guids[0], audioKey = guid ? row.audioKeys[guid] : '';
  const repair = (action: string) => onAction({ action, guid, audioKey });
  return <li className={styles.row}>
    <div className={styles.article}>
      {row.imageURL ? <img className={styles.cover} src={row.imageURL} alt="" width={48} height={48} loading="lazy" decoding="async" /> : <span className={styles.cover} />}
      <div className={styles.text}>
        {row.articleUrl ? <a href={row.articleUrl} className={styles.title} target="_blank" rel="noopener noreferrer">{row.title}</a> : <span className={styles.title}>{row.title}</span>}
        <div className={styles.status}>
          <span>{row.published ? 'Publiceret' : 'Historisk'}</span>
          <span className={row.audio === 'failed' ? styles.warning : undefined}>{audioLabels[row.audio]}</span>
          {row.feed && <span>I feed</span>}
          {row.spotifyUrl ? <a href={row.spotifyUrl} target="_blank" rel="noopener noreferrer" title={`Verificeret ${row.spotifyCheckedAt || ''}`}>Spotify ↗</a> : row.feed && <span>Spotify ikke verificeret</span>}
        </div>
      </div>
    </div>
    <details className={styles.details}>
      <summary>Detaljer{row.issues.length ? ` · ${row.issues.length} problem${row.issues.length > 1 ? 'er' : ''}` : ''}</summary>
      <div className={styles.detailBody}>
        {row.audio === 'ready' && <p className={styles.muted}>{duration(row.durationSeconds)}{row.guids.length > 1 ? ` · ${row.guids.length} lydversioner` : ''}</p>}
        {guid && <div className={styles.actions}>
          <button className={styles.action} disabled={busy} onClick={() => repair('repair_metadata')}>Opdater cover</button>
          {!row.durationSeconds && <button className={styles.action} disabled={busy} onClick={() => repair('repair_duration')}>Mål varighed</button>}
          <button className={styles.action} disabled={busy} onClick={() => repair('verify_spotify')}>Kontrollér Spotify</button>
        </div>}
        {row.issues.map(id => data.issues.find(i => i.id === id)).filter(Boolean).map(issue => <div className={styles.problem} key={issue!.id}>
          <p>{PODCAST_ISSUE_LABELS[issue!.reason] || 'Dette trin kræver kontrol. Det gemte arbejde er bevaret.'}</p>
          {issue!.acknowledgedFingerprint !== issue!.fingerprint && <button className={styles.action} disabled={busy} onClick={() => onAction({ action: 'acknowledge', id: issue!.id, fingerprint: issue!.fingerprint })}>Markér som set</button>}
        </div>)}
        {guid && !row.spotifyUrl && <form className={styles.verify} onSubmit={event => { event.preventDefault(); onAction({ action: 'verify_spotify', guid, audioKey, spotifyUrl }); }}>
          <input aria-label={`Spotify-episodelink til ${row.title}`} type="url" placeholder="Spotify-episodelink" value={spotifyUrl} onChange={event => setSpotifyUrl(event.target.value)} required />
          <button className={styles.action} disabled={busy || !spotifyUrl.trim()} type="submit">Verificér link</button>
        </form>}
      </div>
    </details>
  </li>;
}
export function PodcastOperationsView({ data, loading, error, busy, onAction, onReload }: ViewProps) {
  const [query, setQuery] = useState(''), [filter, setFilter] = useState<'all' | 'missing' | 'issues'>('all'), [limit, setLimit] = useState(20);
  const rows = data?.rows.filter(row => row.title.toLocaleLowerCase('da').includes(query.toLocaleLowerCase('da')) &&
    (filter === 'all' || filter === 'missing' && row.audio !== 'ready' || filter === 'issues' && row.issues.length > 0)) || [];
  return <section className={styles.panel} aria-label="Lyd og Spotify-status">
    <div className={styles.toolbar}>
      <span className={styles.count}>{data ? `${data.summary.inFeed} episoder i feedet` : 'Henter lydstatus…'}</span>
      <a className={styles.action} href={PODCAST_SPOTIFY_SHOW_URL} target="_blank" rel="noopener noreferrer">Spotify ↗</a>
      <button className={styles.action} disabled={busy || loading} onClick={() => onAction({ action: 'refresh' })}>{busy ? 'Opdaterer…' : 'Opdater'}</button>
    </div>
    {error && <p role="alert" className={styles.notice}>{error} <button className={styles.action} onClick={onReload}>Genindlæs status</button></p>}
    {data?.stale && <p className={styles.notice}>Viser senest gemte status.</p>}
    {Boolean(data?.summary.newIssues) && <p className={styles.notice} role="status">{data!.summary.newIssues} {data!.summary.newIssues === 1 ? 'nyt problem' : 'nye problemer'} <button className={styles.action} onClick={() => setFilter('issues')}>Se problemer</button></p>}
    {data?.issues.filter(i => i.active && i.scope === 'feed').map(issue => <p className={styles.notice} key={issue.id}>{PODCAST_ISSUE_LABELS[issue.reason]}</p>)}
    <input type="search" className={styles.search} aria-label="Søg i artiklernes lydstatus" placeholder="Find en artikel…" value={query} onChange={event => { setQuery(event.target.value); setLimit(20); }} />
    <div className={styles.filters} aria-label="Vis artikler">
      {([['all', 'Alle'], ['missing', 'Mangler lyd'], ['issues', 'Problemer']] as const).map(([id, label]) =>
        <button type="button" key={id} aria-pressed={filter === id} onClick={() => { setFilter(id); setLimit(20); }}>{label}</button>)}
    </div>
    <ul className={styles.list}>{data && rows.slice(0, limit).map(row => <EpisodeRow key={row.id} row={row} data={data} busy={busy} onAction={onAction} />)}
      {!rows.length && <li className={styles.empty}>{loading ? 'Henter…' : data ? 'Ingen artikler matcher.' : 'Status er ikke tilgængelig endnu.'}</li>}
    </ul>
    {rows.length > limit && <button className={`${styles.action} ${styles.more}`} onClick={() => setLimit(value => value + 20)}>Vis flere ({rows.length - limit})</button>}
  </section>;
}
export default function PodcastOperationsPanel({ authHeaders }: { authHeaders: () => Promise<Record<string, string>> }) {
  const actionLock = useRef(false);
  const [data, setData] = useState<PodcastOperationsData | null>(null), [loading, setLoading] = useState(true), [busy, setBusy] = useState(false), [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/podcast/operations', { headers: await authHeaders(), cache: 'no-store', signal: AbortSignal.timeout(30000) });
      if (!response.ok) throw Error('Status kunne ikke hentes.');
      setData(await response.json());
    } catch { setError('Status kunne ikke hentes.'); }
    finally { setLoading(false); }
  }, [authHeaders]);
  useEffect(() => { void load(); }, [load]);
  const action = async (input: Action) => {
    if (actionLock.current) return; actionLock.current = true; setBusy(true); setError(null);
    try {
      const response = await fetch('/api/podcast/operations', { method: 'POST', headers: await authHeaders(), body: JSON.stringify(input), signal: AbortSignal.timeout(240000) });
      if (!response.ok) throw Error(response.status === 422 ? 'Spotify-episoden kunne ikke verificeres endnu.' : response.status === 409 ? 'En opdatering kører, eller episoden er ændret. Genindlæs status.' : 'Handlingen blev ikke fuldført. Genindlæs status før genoptagelse.');
    } catch (e) {
      setError(e instanceof Error && /^(Spotify-episoden|En opdatering|Handlingen blev)/.test(e.message) ? e.message
        : 'Forbindelsen blev afbrudt. Genindlæs status før genoptagelse.');
    }
    finally { await load(); setBusy(false); actionLock.current = false; }
  };
  return <PodcastOperationsView data={data} loading={loading} busy={busy} error={error} onAction={input => void action(input)} onReload={() => { setError(null); void load(); }} />;
}
