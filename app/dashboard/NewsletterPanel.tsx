'use client';
import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth-context';
import type { NewsletterDashboard } from '@/lib/dashboard/newsletter-data';
import type { DashboardPeriod } from '@/lib/dashboard/period';
import styles from './NewsletterPanel.module.css';
const number = (value: number | null | undefined) => value == null ? 'Ikke målt' : new Intl.NumberFormat('da-DK').format(value);
const date = (value: string | null | undefined) => value ? new Date(value).toLocaleDateString('da-DK', { timeZone: 'Europe/Copenhagen', day: 'numeric', month: 'short', year: 'numeric' }) : 'Dato ukendt';
const status: Record<string, string> = { delivered: 'Leveret', opened: 'Åbning registreret', clicked: 'Klik registreret', sent: 'Accepteret til afsendelse', bounced: 'Afvist af modtagerserver', complained: 'Spamklage', failed: 'Fejlet', unknown: 'Ingen kvittering' };
export default function NewsletterPanel({ period, active }: { period: DashboardPeriod; active: number | null }) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false), [refresh, setRefresh] = useState(0);
  const [data, setData] = useState<NewsletterDashboard | null>(null);
  const [error, setError] = useState<string | null>(null), [audienceError, setAudienceError] = useState(false);
  const [loading, setLoading] = useState(false), [search, setSearch] = useState(''), [selected, setSelected] = useState('');
  useEffect(() => {
    if (!open || !user) return;
    const controller = new AbortController(); setLoading(true); setError(null); setData(null);
    (async () => {
      try {
        const token = await user.getIdToken();
        const response = await fetch('/api/dashboard/newsletter?period='+period, { headers: { Authorization: `Bearer ${token}` }, signal: controller.signal, cache: 'no-store' });
        const result = await response.json();
        if (!response.ok) throw Error('Nyhedsbrevsdata kunne ikke hentes.');
        if (!controller.signal.aborted) { setData(result.data); setAudienceError(result.audienceError === true); }
      } catch { if (!controller.signal.aborted) setError('Nyhedsbrevsdata kunne ikke hentes. Prøv igen.'); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    })();
    return () => controller.abort();
  }, [open, user?.uid, period, refresh]);
  const campaign = data?.campaigns.find(row => row.id === selected) ?? data?.campaigns.find(row => row.sendType === 'weekly_auto') ?? data?.campaigns[0];
  const messages = useMemo(() => new Map(campaign?.messages.map(row => [row.email, row]) ?? []), [campaign]);
  const audience = data?.audience.filter(row => row.email.toLowerCase().includes(search.trim().toLowerCase())) ?? [];
  return <details className={styles.panel} onToggle={event => setOpen(event.currentTarget.open)}>
    <summary><span>Nyhedsbrev</span><span>{active == null ? 'Se modtagere og udsendelser' : `${active} aktive · Se overblik`}</span></summary>
    {open && <div className={styles.body}>
      <div className={styles.row}><h2>Modtagere og udsendelser</h2><button type="button" onClick={() => setRefresh(value => value + 1)} disabled={loading}>Opdater</button></div>
      {loading && <p role="status">Henter nyhedsbrevsdata…</p>}
      {error && <p role="alert">{error}</p>}
      {data && <>
        <p className={styles.note}>{data.newSubscribers == null ? 'Tilmeldingsdatoer er ikke kendt.' : `${data.newSubscribers} kendte nye tilmeldinger i perioden.`} {data.audience.filter(row => row.active === false).length} frameldte nu.</p>
        {audienceError && <p role="alert">Modtagerlisten kunne ikke verificeres fuldt. Tallene kan være ufuldstændige.</p>}
        {campaign ? <>
          <label className={styles.label}>Udsendelse<select aria-label="Vælg nyhedsbrev" value={campaign.id} onChange={event => setSelected(event.target.value)}>
            {data.campaigns.map(row => <option key={row.id} value={row.id}>{date(row.sentAt)} · {row.subject}{!row.audienceKnown ? ' (sendetype ukendt)' : ''}</option>)}
          </select></label>
          <div className={styles.stats}>
            {[['Mailkvitteringer', campaign.recipients], ['Leveret', campaign.delivered], ['Registrerede åbninger', campaign.opened], ['Registrerede klik', campaign.clicked]].map(([label, value]) => <div key={label as string}><span>{label}</span><strong>{number(value as number | null)}</strong></div>)}
          </div>
          {campaign.failed > 0 && <p role="status">{campaign.failed} afviste eller fejlede mails.</p>}
        </> : <p>Ingen dokumenterede udsendelser i denne periode.</p>}
        <details className={styles.explanation}><summary>Om målingen</summary>
          <p>Åbninger er signaler fra mailprogrammet, ikke bevis på læsning. Apple Mail kan hente billeder automatisk. Et manglende signal betyder ikke, at mailen er ulæst.</p>
          <p>{data.tracking ? `Åbningsmåling: ${data.tracking.openTracking ? 'aktiv' : 'slået fra'}. Klikmåling: ${data.tracking.clickTracking ? 'aktiv' : 'slået fra'}. Kontrolleret ${date(data.tracking.observedAt)}.` : 'Måleopsætningen er ikke verificeret.'}</p>
          <p>Gamle mails får ikke bagudrettet åbninger eller klik. Testmails med kendt testmærkning er udeladt. Ældre manuelle mails kan have ukendt sendetype.</p>
          {data.unknownSignupDates > 0 && <p>{data.unknownSignupDates} adresser har ingen kendt tilmeldingsdato. Nye tilmeldinger viser kun daterede poster fra den bevarede liste.</p>}
          {data.historyNote && <p>{data.historyNote}</p>}{data.truncated && <p>Historikken er afkortet. Vælg en kortere periode.</p>}
        </details>
        <label className={styles.label}>Søg modtager<input type="search" value={search} onChange={event => setSearch(event.target.value)} placeholder="E-mailadresse" autoComplete="off" /></label>
        <ul className={styles.audience} aria-label="Nyhedsbrevets modtagere">
          {audience.map(row => <li key={row.email}>
            <div><span className={styles.email}>{row.email}</span><span className={styles.note}>{row.active === false ? 'Frameldt' : row.active === true ? 'Aktiv' : 'Status ukendt'} · Tilmeldt {date(row.signedUpAt)}</span></div>
            <span className={styles.messageStatus}>{status[messages.get(row.email)?.status ?? 'unknown']}</span>
          </li>)}
          {!audience.length && <li>Ingen matchende modtagere.</li>}
        </ul>
      </>}
    </div>}
  </details>;
}
