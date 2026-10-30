'use client';

import NewsletterPanel from './NewsletterPanel';
import toolStyles from '@/components/tool-surface.module.css';

import { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import AuthModal from '@/components/AuthModal';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import { useAuth } from '@/lib/auth-context';
import type { DashboardPayload } from '@/lib/dashboard/build-data';
import { DASHBOARD_PERIODS, type DashboardPeriod } from '@/lib/dashboard/period';

const fieldClass =
  'apropos-input-dark h-10 w-full appearance-none rounded-lg border border-white/[0.12] bg-[#141414] pl-3 pr-8 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

type DashboardClientProps = {
  embedded?: boolean;
  onClose?: () => void;
};

function fmt(n: number | null | undefined): string {
  if (n == null) return '—';
  return new Intl.NumberFormat('da-DK').format(n);
}

function StatCard({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-white/12 bg-[#1c1c1e] p-3.5 lg:p-4">
      <p className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</p>
      <p className="mt-1.5 text-[22px] font-medium tabular-nums text-white lg:text-[24px]">{value}</p>
      {hint ? <p className="mt-1 text-[11px] text-white/35">{hint}</p> : null}
    </div>
  );
}

function MiniTrend({ points }: { points: Array<{ date: string; views: number }> }) {
  const max = Math.max(1, ...points.map((p) => p.views));
  if (points.length === 0) {
    return <p className="text-[12px] text-white/40">Ingen data i perioden.</p>;
  }
  return (
    <div className="flex h-28 items-end gap-0.5 sm:h-32">
      {points.map((p) => (
        <div
          key={p.date}
          className="min-w-0 flex-1 rounded-t-sm bg-white/20 hover:bg-white/35 transition-colors"
          style={{ height: `${p.views > 0 ? Math.max(1, (p.views / max) * 100) : 0}%` }}
          title={`${p.date}: ${fmt(p.views)} visninger`} role="img" aria-label={`${p.date}: ${fmt(p.views)} visninger`}
        />
      ))}
    </div>
  );
}

function AuthorAvatar({ name, src }: { name: string; src?: string }) {
  const initials = name
    .split(/\s+/)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  if (src) {
    return (
      <img
        src={src}
        alt=""
        className="size-9 shrink-0 rounded-lg border border-white/12 object-cover"
      />
    );
  }
  return (
    <div className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-[11px] font-medium text-white/70">
      {initials || '?'}
    </div>
  );
}

export default function DashboardClient({ embedded = false, onClose }: DashboardClientProps) {
  const { user } = useAuth();
  const [period, setPeriod] = useState<DashboardPeriod>('28d');
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    if (!user) return;
    request.current?.abort();
    const controller = new AbortController(); request.current = controller;
    setLoading(true);
    setData(null);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch(`/api/dashboard?period=${period}`, {
        headers: { Authorization: `Bearer ${token}` },
        cache: 'no-store', signal: controller.signal,
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
      if (!controller.signal.aborted) setData(json.data as DashboardPayload);
    } catch (e) {
      if (!controller.signal.aborted) { setError('Trafikoverblikket kunne ikke hentes. Prøv igen.'); setData(null); }
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [user, period]);

  useEffect(() => {
    void load();
    return () => request.current?.abort();
  }, [load]);

  const periodLabel = useMemo(
    () => DASHBOARD_PERIODS.find((p) => p.id === period)?.label || period,
    [period]
  );

  if (!user) {
    if (embedded) return null;
    return (
      <div className={`${toolStyles.surface} min-h-[100dvh] bg-[#0a0a0a]  text-white`}>
        <AuthModal />
      </div>
    );
  }

  const periodControls = (
    <>
      <label className="sr-only" htmlFor="dashboard-period">
        Periode
      </label>
      <select
        id="dashboard-period"
        value={period}
        onChange={(e) => setPeriod(e.target.value as DashboardPeriod)}
        className={`${fieldClass} w-[120px] min-w-0 sm:w-[150px]`}
      >
        {DASHBOARD_PERIODS.map((p) => (
          <option key={p.id} value={p.id}>
            {p.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        onClick={() => void load()}
        disabled={loading}
        className={toolStyles.iconButton} aria-label="Opdater trafik" title="Opdater trafik"
      >
        <svg aria-hidden="true" width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M20 7v5h-5M4 17v-5h5"/><path d="M6.1 6.1a8 8 0 0 1 13.4 3M4.5 14.9a8 8 0 0 0 13.4 3"/></svg>
      </button>
    </>
  );

  return (
    <div
      className={`${toolStyles.surface} ${embedded
          ? 'flex h-full min-h-0 flex-col bg-transparent  text-white'
          : 'min-h-[100dvh] bg-[#0a0a0a]  text-white'
      }`}
    >
      <EmbeddedAppHeader
        embedded={embedded}
        title="Trafik & overblik"
        subtitle={`Apropos Magazine · ${periodLabel}`}
        onClose={onClose}
        trailing={periodControls}
      />

      <main
        className={
          embedded
            ? 'nice-scrollbar min-h-0 flex-1 overflow-y-auto px-3 py-3 lg:px-4 lg:py-4'
            : 'mx-auto max-w-7xl px-4 py-4 lg:px-3 lg:py-3'
        }
      >
        {error ? (
          <div className="mb-4 rounded-xl border border-white/20 bg-white/[0.04] px-4 py-3 text-[13px] text-red-400/95">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_280px] xl:grid-cols-[1fr_300px]">
          <aside className="order-2 min-w-0 lg:order-2 lg:col-start-2 lg:row-start-1">
            <section
              className={`rounded-xl border border-white/12 p-4 backdrop-blur-xl lg:sticky ${
                embedded ? 'bg-[#1c1c1e] lg:top-3' : 'bg-black/55 lg:top-24'
              }`}
            >
              <h2 className="text-[14px] font-medium text-white/85">Forfattere</h2>
              <p className="mt-0.5 text-[11px] text-white/40">Artikelvisninger i perioden</p>
              <ul className="mt-3 space-y-3">
                {(data?.authorLeaderboard || []).length === 0 ? (
                  <li className="py-8 text-center text-[12px] text-white/40">
                    {loading ? 'Henter…' : data?.availability?.authors === false ? 'Forfatterdata kunne ikke hentes' : 'Ingen visninger i perioden'}
                  </li>
                ) : (
                  data?.authorLeaderboard.map((a, i) => (
                    <li key={a.authorId} className="flex items-center gap-3">
                      <span className="w-4 shrink-0 text-[10px] tabular-nums text-white/30">{i + 1}</span>
                      <AuthorAvatar name={a.name} src={a.avatar} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[13px] font-medium text-white/80">{a.name}</p>
                        <p className="text-[10px] text-white/35">
                          {fmt(a.views)} visninger · {a.articleCount} artikler i arkivet
                        </p>
                      </div>
                    </li>
                  ))
                )}
              </ul>
            </section>
          </aside>

          <div className="order-1 min-w-0 space-y-4 lg:order-1 lg:col-start-1 lg:row-start-1">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
              {data?.newsletter && <StatCard
                label="Nyhedsbrev"
                value={fmt(data.newsletter.signups)}
                hint={
                  data?.newsletter.error
                    ? 'Data ikke tilgængelige'
                    : data
                      ? `${fmt(data.newsletter.totalSignups)} bevarede tilmeldinger i alt`
                      : 'Aktive modtagere'
                }
              />}
              <StatCard
                label="Artikler"
                value={data ? fmt(data.articles.published) : '—'}
                hint={data?.articles.drafts !== undefined ? `${fmt(data.articles.drafts)} kladder · samlet arkiv` : 'Publiceret i Webflow'}
              />
              <StatCard
                label="Besøgende"
                value={data ? fmt(data.overview?.activeUsers) : '—'}
                hint="Aktive brugere målt af GA4"
              />
              <StatCard
                label="Sidevisninger"
                value={data ? fmt(data.overview?.pageViews) : '—'}
                hint={data ? `${fmt(data.overview?.sessions)} sessioner` : undefined}
              />
              <StatCard
                label="Google klik"
                value={
                  data?.google.clicks != null ? fmt(data.google.clicks) : '—'
                }
                hint={
                  data?.google.searchConsoleLinked
                    ? 'Search Console'
                    : 'Søgetal ikke tilgængelige'
                }
              />
              <StatCard
                label="Impressions"
                value={
                  data?.google.impressions != null ? fmt(data.google.impressions) : '—'
                }
                hint={
                  data?.google.searchConsoleLinked
                    ? data.google.ctr != null
                      ? `CTR ${(data.google.ctr * 100).toFixed(1)}%`
                      : 'Google søgning'
                    : 'Søgetal ikke tilgængelige'
                }
              />
            </div>

            {data?.newsletter && <NewsletterPanel period={period} active={data.newsletter.signups} />}
            {data?.availability && Object.values(data.availability).some(value => !value) && <p role="status" className="text-xs text-amber-300">Nogle datakilder kunne ikke hentes. Manglende tal vises som ukendte.</p>}

            <section
              className={`rounded-xl border border-white/12 p-4 backdrop-blur-xl lg:p-3 ${
                embedded ? 'bg-[#1c1c1e]' : 'bg-black/55'
              }`}
            >
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="text-[14px] font-medium text-white/85">Sidevisninger</h2>
                  <p className="text-[11px] text-white/40">
                    {data ? fmt(data.overview?.pageViews) : '—'} i alt · {data ? fmt(data.overview?.sessions) : '—'} sessioner
                  </p>
                </div>
              </div>
              {loading ? <p role="status" className="text-xs text-white/40">Henter trafik…</p> : data?.availability?.viewsTrend === false ? <p className="text-xs text-white/40">Sidevisninger kunne ikke hentes.</p> : <MiniTrend points={data?.viewsTrend || []} />}
              {data?.range && <p className="mt-2 text-xs text-white/40">{data.range.startDate} til {data.range.endDate}. I dag er foreløbig.</p>}
            </section>

            <section
              className={`rounded-xl border border-white/12 p-4 backdrop-blur-xl lg:p-3 ${
                embedded ? 'bg-[#1c1c1e]' : 'bg-black/55'
              }`}
            >
              <h2 className="text-[14px] font-medium text-white/85">Mest læste artikler</h2>
              <p className="mt-0.5 text-[11px] text-white/40">Sidevisninger fra GA4</p>
              <ul className="mt-3 divide-y divide-white/[0.06]">
                {(data?.topArticles || []).length === 0 ? (
                  <li className="py-3 text-center text-[12px] text-white/40">
                    {loading ? 'Henter artikler…' : data?.availability?.topArticles === false ? 'Artikeldata kunne ikke hentes' : 'Ingen artikelvisninger i perioden'}
                  </li>
                ) : (
                  data?.topArticles.map((a, i) => (
                    <li key={a.path} className="flex items-start gap-3 py-3">
                      <span className="mt-0.5 w-5 shrink-0 text-[11px] tabular-nums text-white/30">
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <a href={`https://www.aproposmagazine.com${a.path}`} target="_blank" rel="noopener noreferrer" className="text-[13px] font-medium text-white/85 line-clamp-2 hover:underline">{a.title || a.slug}</a>
                        <p className="mt-0.5 truncate text-[10px] text-white/35">{a.path}</p>
                      </div>
                      <span className="shrink-0 text-[12px] tabular-nums text-white/70">{fmt(a.views)}</span>
                    </li>
                  ))
                )}
              </ul>
            </section>

            <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
              <section
                className={`rounded-xl border border-white/12 p-4 backdrop-blur-xl ${
                  embedded ? 'bg-[#1c1c1e]' : 'bg-black/55'
                }`}
              >
                <h2 className="text-[14px] font-medium text-white/85">Trafikkilder</h2>
                <ul className="mt-3 space-y-2">
                  {(data?.trafficSources || []).map((t) => (
                    <li key={t.channel} className="flex items-center justify-between gap-2 text-[12px]">
                      <span className="text-white/70">{t.channel}</span>
                      <span className="tabular-nums text-white/50">{fmt(t.sessions)}</span>
                    </li>
                  ))}
                </ul>
              </section>

              <section
                className={`rounded-xl border border-white/12 p-4 backdrop-blur-xl ${
                  embedded ? 'bg-[#1c1c1e]' : 'bg-black/55'
                }`}
              >
                <h2 className="text-[14px] font-medium text-white/85">Google &amp; organisk</h2>
                <p className="mt-1 text-[11px] text-white/40">{data?.google.searchQueriesNote}</p>
                <p className="mt-3 text-[20px] font-medium tabular-nums text-white">
                  {data ? fmt(data.google.organicSessions) : '—'}
                </p>
                <p className="text-[10px] uppercase tracking-wider text-white/35">Organiske sessioner</p>
                {(data?.google.googleSources || []).length > 0 ? (
                  <ul className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                    <li className="text-[10px] uppercase tracking-wider text-white/30">Findes via</li>
                    {data?.google.googleSources.slice(0, 4).map((s) => (
                      <li key={`${s.source}-${s.medium}`} className="flex justify-between gap-2 text-[11px]">
                        <span className="truncate text-white/55">
                          {s.source} / {s.medium}
                        </span>
                        <span className="shrink-0 tabular-nums text-white/40">{fmt(s.sessions)}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
                <ul className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                  <li className="text-[10px] uppercase tracking-wider text-white/30">Top landingssider (organisk)</li>
                  {(data?.google.topLandingPages || []).slice(0, 5).map((p) => (
                    <li key={p.path} className="flex justify-between gap-2 text-[11px]">
                      <span className="truncate text-white/55">{p.path}</span>
                      <span className="shrink-0 tabular-nums text-white/40">{fmt(p.sessions)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            </div>

            {data && <details className="rounded-xl bg-[#1c1c1e] px-3 py-2 text-xs text-white/45"><summary className="min-h-11 flex items-center cursor-pointer">Om tallene</summary>
              <p className="pb-2">Trafik: den valgte periode. Artikler og aktive modtagere: samlet status nu. Forfattertal er sidevisninger, ikke dokumenteret gennemlæsning. App-downloads er endnu ikke målt.</p>
              <p className="pb-2">Overblik hentet {new Date(data.generatedAt).toLocaleString('da-DK', { timeZone: 'Europe/Copenhagen' })}. GA4 og Google kan have forsinkelse.</p>
            </details>}
          </div>
        </div>
      </main>
    </div>
  );
}
