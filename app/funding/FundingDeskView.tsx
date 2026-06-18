'use client';

import { useRouter } from 'next/navigation';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { APPLICATION_SECTION_OPTIONS, getApplicationSectionOption } from '@/lib/funding/application-sections';
import { scoreFundingOpportunity } from '@/lib/funding/scoring';
import { writeFundingBriefHandoff } from '@/lib/funding/handoff';
import type {
  ApplicationSection,
  ApplicationStatus,
  FundingApplication,
  FundingEmailThread,
  FundingOpportunity,
  FundingResearchResult,
} from '@/lib/funding/types';

type DeskTab = 'radar' | 'brief' | 'workflow' | 'mail';

const ARCHIVED_KEY = 'apropos-funding-archived-ids';

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const secondaryBtn =
  'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const fieldClass =
  'apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

function readArchived(): Set<string> {
  if (typeof window === 'undefined') return new Set();
  try {
    const raw = localStorage.getItem(ARCHIVED_KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

function writeArchived(ids: Set<string>) {
  try {
    localStorage.setItem(ARCHIVED_KEY, JSON.stringify([...ids]));
  } catch {
    /* ignore */
  }
}

function unwrap<T>(data: { data?: T } & T): T {
  return (data as { data?: T }).data ?? (data as T);
}

function ScoreBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-white/40">{label}</span>
        <span className="text-[11px] tabular-nums text-white/60">{value}</span>
      </div>
      <div className="h-1.5 rounded-lg bg-white/[0.06] overflow-hidden">
        <div className="h-full rounded-lg bg-white/70" style={{ width: `${Math.max(4, Math.min(100, value))}%` }} />
      </div>
    </div>
  );
}

function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'err' | 'idle' }) {
  const dot =
    tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : tone === 'err' ? 'bg-rose-400' : 'bg-white/40';
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

const STATUS_OPTIONS: { id: ApplicationStatus; label: string }[] = [
  { id: 'discovered', label: 'Opdaget' },
  { id: 'researching', label: 'Research' },
  { id: 'drafting', label: 'Udkast' },
  { id: 'submitted', label: 'Indsendt' },
  { id: 'won', label: 'Vundet' },
  { id: 'lost', label: 'Tabt' },
  { id: 'skipped', label: 'Sprunget over' },
];

type FundingDeskViewProps = {
  embedded?: boolean;
  onClose?: () => void;
};

export default function FundingDeskView({ embedded = false, onClose }: FundingDeskViewProps) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<DeskTab>('radar');
  const [opportunities, setOpportunities] = useState<FundingOpportunity[]>([]);
  const [applications, setApplications] = useState<FundingApplication[]>([]);
  const [threads, setThreads] = useState<FundingEmailThread[]>([]);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => readArchived());
  const [selectedId, setSelectedId] = useState<string>('');
  const [signalsBusy, setSignalsBusy] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const autoLoadRef = useRef(false);
  const [researchById, setResearchById] = useState<Record<string, FundingResearchResult>>({});
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [applicationSection, setApplicationSection] = useState<ApplicationSection>('full');
  const sectionOption = getApplicationSectionOption(applicationSection);

  const [mailThreadId, setMailThreadId] = useState<string>('');
  const [mailTo, setMailTo] = useState('');
  const [mailSubject, setMailSubject] = useState('');
  const [mailBody, setMailBody] = useState('');
  const [mailBusy, setMailBusy] = useState(false);
  const [mailStatus, setMailStatus] = useState<string | null>(null);

  const visibleOpportunities = useMemo(
    () => opportunities.filter((o) => !archivedIds.has(o.id) && o.deadlineStatus !== 'closed'),
    [opportunities, archivedIds]
  );

  const selected = useMemo(
    () => visibleOpportunities.find((o) => o.id === selectedId) || visibleOpportunities[0],
    [selectedId, visibleOpportunities]
  );

  const selectedScore = selected ? scoreFundingOpportunity(selected) : 0;
  const selectedResearch = selected ? researchById[selected.id] : null;

  const applicationForSelected = useMemo(
    () => (selected ? applications.find((a) => a.opportunityId === selected.id) : undefined),
    [applications, selected]
  );

  const threadsForSelected = useMemo(
    () => (selected ? threads.filter((t) => t.opportunityId === selected.id) : []),
    [threads, selected]
  );

  const activeMailThread = useMemo(
    () => threads.find((t) => t.id === mailThreadId) || threadsForSelected[0],
    [mailThreadId, threads, threadsForSelected]
  );

  const loadStored = useCallback(async () => {
    const [oppRes, appRes, threadRes] = await Promise.all([
      fetch('/api/funding/opportunities'),
      fetch('/api/funding/applications'),
      fetch('/api/funding/emails/threads'),
    ]);
    const oppData = await oppRes.json();
    const appData = await appRes.json();
    const threadData = await threadRes.json();
    const opps = unwrap<{ opportunities: FundingOpportunity[] }>(oppData)?.opportunities;
    const apps = unwrap<{ applications: FundingApplication[] }>(appData)?.applications;
    const th = unwrap<{ threads: FundingEmailThread[] }>(threadData)?.threads;
    if (Array.isArray(opps)) setOpportunities(opps);
    if (Array.isArray(apps)) setApplications(apps);
    if (Array.isArray(th)) setThreads(th);
  }, []);

  const discoverOpportunities = useCallback(async () => {
    if (signalsBusy) return;
    setSignalsBusy(true);
    setSignalsError(null);
    try {
      const res = await fetch('/api/funding/opportunities', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 10, coveredIds: [...archivedIds] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke hente muligheder');
      const incoming = unwrap<{ opportunities: FundingOpportunity[] }>(data)?.opportunities || [];
      setOpportunities(incoming);
      if (incoming[0]?.id) setSelectedId(incoming[0].id);
    } catch (e) {
      setSignalsError(e instanceof Error ? e.message : 'Fejl ved søgning');
    } finally {
      setSignalsBusy(false);
    }
  }, [archivedIds, signalsBusy]);

  useEffect(() => {
    if (autoLoadRef.current) return;
    autoLoadRef.current = true;
    void loadStored();
    void discoverOpportunities();
  }, [discoverOpportunities, loadStored]);

  useEffect(() => {
    if (visibleOpportunities.length && !visibleOpportunities.some((o) => o.id === selectedId)) {
      setSelectedId(visibleOpportunities[0].id);
    }
  }, [selectedId, visibleOpportunities]);

  useEffect(() => {
    if (!selected) return;
    setMailSubject((prev) => prev || `Henvendelse: ${selected.title}`);
    setMailTo((prev) => prev || applicationForSelected?.primaryContactEmail || '');
  }, [selected, applicationForSelected]);

  const runResearch = useCallback(
    async (force = false) => {
      if (!selected || researchBusy) return;
      if (!force && researchById[selected.id]) return;
      setResearchBusy(true);
      setResearchError(null);
      try {
        const res = await fetch('/api/funding/research', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ opportunity: selected, applicationSection }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Research fejlede');
        const result = unwrap<FundingResearchResult>(data);
        if (!result?.dossier) throw new Error('Ugyldigt research-svar');
        setResearchById((prev) => ({ ...prev, [selected.id]: result }));
      } catch (e) {
        setResearchError(e instanceof Error ? e.message : 'Research fejlede');
      } finally {
        setResearchBusy(false);
      }
    },
    [applicationSection, researchBusy, researchById, selected]
  );

  useEffect(() => {
    if (activeTab === 'brief' && selected) void runResearch(false);
  }, [activeTab, runResearch, selected]);

  const ensureApplication = async (): Promise<FundingApplication | null> => {
    if (!selected) return null;
    if (applicationForSelected) return applicationForSelected;
    const res = await fetch('/api/funding/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        opportunityId: selected.id,
        opportunityTitle: selected.title,
        funder: selected.funder,
      }),
    });
    const data = await res.json();
    if (!res.ok) return null;
    const app = unwrap<{ application: FundingApplication }>(data)?.application;
    if (app) {
      setApplications((prev) => [...prev.filter((a) => a.opportunityId !== selected.id), app]);
    }
    return app || null;
  };

  const updateApplicationStatus = async (appId: string, status: ApplicationStatus, notes?: string) => {
    const res = await fetch('/api/funding/applications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id: appId, status, notes }),
    });
    const data = await res.json();
    if (res.ok) {
      const app = unwrap<{ application: FundingApplication }>(data)?.application;
      if (app) setApplications((prev) => prev.map((a) => (a.id === app.id ? app : a)));
    }
  };

  const handleApproveBrief = () => {
    if (!selected) return;
    const result = researchById[selected.id];
    const briefText = result?.brief?.text || `Funding-brief: ${selected.title}`;
    writeFundingBriefHandoff({
      briefText,
      fundingResearch: result,
      opportunityId: selected.id,
      opportunityTitle: selected.title,
      applicationSection,
    });
    router.replace('/ai?from=funding&view=ai');
  };

  const handleArchive = () => {
    if (!selected) return;
    const next = new Set(archivedIds);
    next.add(selected.id);
    setArchivedIds(next);
    writeArchived(next);
  };

  const createMailThread = async () => {
    if (!selected || !mailTo.trim()) return;
    setMailBusy(true);
    setMailStatus(null);
    try {
      const app = await ensureApplication();
      const res = await fetch('/api/funding/emails/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          opportunityId: selected.id,
          opportunityTitle: selected.title,
          funder: selected.funder,
          applicationId: app?.id,
          contactEmail: mailTo.trim(),
          subject: mailSubject.trim() || `Henvendelse: ${selected.title}`,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke oprette tråd');
      const thread = unwrap<{ thread: FundingEmailThread }>(data)?.thread;
      if (thread) {
        setThreads((prev) => [...prev.filter((t) => t.id !== thread.id), thread]);
        setMailThreadId(thread.id);
        setMailStatus('Tråd oprettet.');
      }
      await loadStored();
    } catch (e) {
      setMailStatus(e instanceof Error ? e.message : 'Fejl');
    } finally {
      setMailBusy(false);
    }
  };

  const draftMail = async (purpose: string) => {
    const tid = activeMailThread?.id;
    if (!tid) {
      setMailStatus('Opret tråd først.');
      return;
    }
    setMailBusy(true);
    try {
      const res = await fetch('/api/funding/emails/draft-reply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: tid, purpose }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kladde fejlede');
      const draft = unwrap<{ draft: string }>(data)?.draft;
      if (draft) setMailBody(draft);
    } catch (e) {
      setMailStatus(e instanceof Error ? e.message : 'Kladde fejlede');
    } finally {
      setMailBusy(false);
    }
  };

  const sendMail = async () => {
    const tid = activeMailThread?.id;
    if (!tid || !mailTo.trim() || !mailSubject.trim() || !mailBody.trim()) {
      setMailStatus('Udfyld modtager, emne og besked.');
      return;
    }
    setMailBusy(true);
    try {
      const res = await fetch('/api/funding/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ threadId: tid, to: mailTo.trim(), subject: mailSubject.trim(), text: mailBody.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Send fejlede');
      setMailStatus('Mail sendt.');
      await loadStored();
    } catch (e) {
      setMailStatus(e instanceof Error ? e.message : 'Send fejlede');
    } finally {
      setMailBusy(false);
    }
  };

  const tabClass = (tab: DeskTab) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
      activeTab === tab ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
    }`;

  const tabBar = (
    <div className="flex flex-wrap items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
      {(['radar', 'brief', 'workflow', 'mail'] as DeskTab[]).map((tab) => (
        <button key={tab} type="button" className={tabClass(tab)} onClick={() => setActiveTab(tab)}>
          {tab === 'radar' ? 'Radar' : tab === 'brief' ? 'Brief' : tab === 'workflow' ? 'Flow' : 'Mail'}
        </button>
      ))}
    </div>
  );

  return (
    <div
      className={
        embedded
          ? 'flex h-full min-h-0 flex-col bg-transparent font-poppins text-white'
          : 'min-h-[100dvh] bg-[#0a0a0a] font-poppins flex flex-col text-white'
      }
    >
      <EmbeddedAppHeader
        embedded={embedded}
        title="Funding Desk"
        subtitle={embedded ? undefined : 'Legater, puljer og korrespondance for Apropos Magazine'}
        onClose={onClose}
        trailing={tabBar}
      />

      <div
        className={`flex-1 min-h-0 overflow-y-auto nice-scrollbar space-y-4 w-full ${
          embedded ? 'p-3 lg:p-4' : 'p-4 lg:p-6 max-w-5xl mx-auto'
        }`}
      >
        <p className="text-[11px] text-white/35 leading-relaxed">
          Research-assistent — ikke juridisk eller finansiel rådgivning. Verificér altid officielle vilkår, beløb og frister.
        </p>

        {selected && (
          <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">{selected.category}</p>
                <h2 className="mt-2 text-[18px] font-medium tracking-tight text-white">{selected.title}</h2>
                <p className="mt-1 text-[12px] text-white/50">{selected.funder}</p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">Score</p>
                <p className="text-[28px] font-medium tabular-nums text-white">{selectedScore}</p>
                <StatusBadge
                  label={selected.deadlineStatus === 'open' ? 'Åben' : selected.deadlineStatus === 'closed' ? 'Lukket' : 'Frist ukendt'}
                  tone={selected.deadlineStatus === 'open' ? 'ok' : selected.deadlineStatus === 'closed' ? 'err' : 'warn'}
                />
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <ScoreBar label="Fit" value={selected.fitScore} />
              <ScoreBar label="Urgency" value={selected.urgencyScore} />
              <ScoreBar label="Risiko" value={selected.riskScore} />
            </div>
          </section>
        )}

        {activeTab === 'radar' && (
          <section className="space-y-3">
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} style={{ width: 'auto' }} disabled={signalsBusy} onClick={() => void discoverOpportunities()}>
                {signalsBusy ? 'Søger…' : 'Opdater radar'}
              </button>
              <button type="button" className={secondaryBtn} style={{ width: 'auto' }} onClick={handleArchive} disabled={!selected}>
                Arkivér valgt
              </button>
            </div>
            {signalsError && <p className="text-[12px] text-red-400/95">{signalsError}</p>}
            <div className="space-y-2">
              {visibleOpportunities.map((opp) => (
                <button
                  key={opp.id}
                  type="button"
                  onClick={() => setSelectedId(opp.id)}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 text-left active:scale-[0.98] ${
                    selected?.id === opp.id ? 'border-white/15 bg-white/[0.05]' : 'border-white/[0.06] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[12px] font-medium text-white/80 truncate">{opp.title}</p>
                    <p className="text-[10px] text-white/30 truncate">{opp.funder} · {opp.category}</p>
                  </div>
                  <span className="text-[11px] tabular-nums text-white/50">{scoreFundingOpportunity(opp)}</span>
                </button>
              ))}
              {!visibleOpportunities.length && !signalsBusy && (
                <p className="text-[12px] text-white/40">Ingen muligheder endnu — tryk Opdater radar.</p>
              )}
            </div>
          </section>
        )}

        {activeTab === 'brief' && selected && (
          <section className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {APPLICATION_SECTION_OPTIONS.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`rounded-lg px-2.5 py-1 text-[11px] border transition-all ${
                    applicationSection === opt.id ? 'border-white/15 bg-white/10 text-white' : 'border-white/8 text-white/45'
                  }`}
                  onClick={() => setApplicationSection(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {researchBusy && <p className="text-[12px] text-white/50">Research kører…</p>}
            {researchError && <p className="text-[12px] text-red-400/95">{researchError}</p>}
            {selectedResearch && (
              <>
                <div className="rounded-xl border border-white/12 bg-black/30 p-3 space-y-2">
                  {selectedResearch.qualityGate.checks.map((c) => (
                    <div key={c.id} className="flex justify-between gap-2 text-[12px]">
                      <span className="text-white/70">{c.label}</span>
                      <StatusBadge label={c.ok ? 'OK' : 'Mangler'} tone={c.ok ? 'ok' : 'warn'} />
                    </div>
                  ))}
                </div>
                <p className="text-[12px] text-white/55 whitespace-pre-wrap">{selectedResearch.dossier.eligibilityMatch}</p>
                <button type="button" className={primaryBtn} onClick={handleApproveBrief} disabled={researchBusy}>
                  Godkend brief → AI Writer
                </button>
                <p className="text-[10px] text-white/30">Sektion: {sectionOption.label}</p>
              </>
            )}
            {!selectedResearch && !researchBusy && (
              <button type="button" className={secondaryBtn} onClick={() => void runResearch(true)}>
                Kør research
              </button>
            )}
          </section>
        )}

        {activeTab === 'workflow' && (
          <section className="space-y-3">
            <button type="button" className={secondaryBtn} onClick={() => void ensureApplication()} disabled={!selected}>
              Opret / hent ansøgningsspor
            </button>
            {applicationForSelected && (
              <div className="rounded-xl border border-white/12 p-3 space-y-3">
                <p className="text-[12px] text-white/70">Status: {applicationForSelected.status}</p>
                <select
                  className={fieldClass}
                  value={applicationForSelected.status}
                  onChange={(e) => void updateApplicationStatus(applicationForSelected.id, e.target.value as ApplicationStatus)}
                >
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                {threadsForSelected.some((t) => t.status === 'replied') && (
                  <StatusBadge label="Nyt svar" tone="ok" />
                )}
              </div>
            )}
            {applications.map((app) => (
              <div key={app.id} className="rounded-lg border border-white/[0.06] px-3 py-2 text-[12px] text-white/60">
                {app.opportunityTitle || app.opportunityId} — {app.status}
              </div>
            ))}
          </section>
        )}

        {activeTab === 'mail' && (
          <section className="space-y-4">
            <p className="text-[11px] text-white/40">
              Kræver RESEND_API_KEY og FUNDING_FROM_EMAIL. Inbound: FUNDING_INBOUND_DOMAIN + Resend Receiving.
            </p>
            <input className={fieldClass} placeholder="Modtager e-mail" value={mailTo} onChange={(e) => setMailTo(e.target.value)} />
            <input className={fieldClass} placeholder="Emne" value={mailSubject} onChange={(e) => setMailSubject(e.target.value)} />
            <textarea className={`${fieldClass} min-h-[140px]`} placeholder="Besked" value={mailBody} onChange={(e) => setMailBody(e.target.value)} rows={6} />
            <div className="flex flex-wrap gap-2">
              <button type="button" className={secondaryBtn} style={{ width: 'auto' }} disabled={mailBusy} onClick={() => void createMailThread()}>
                Opret tråd
              </button>
              <button type="button" className={secondaryBtn} style={{ width: 'auto' }} disabled={mailBusy} onClick={() => void draftMail('first_outreach')}>
                AI-kladde
              </button>
              <button type="button" className={primaryBtn} style={{ width: 'auto' }} disabled={mailBusy} onClick={() => void sendMail()}>
                Send mail
              </button>
            </div>
            {mailStatus && <p className="text-[12px] text-white/55">{mailStatus}</p>}
            {activeMailThread && (
              <div className="rounded-xl border border-white/12 p-3 space-y-2">
                <p className="text-[11px] text-white/40">Tråd: {activeMailThread.subject} ({activeMailThread.status})</p>
                {activeMailThread.messages.map((m) => (
                  <div key={m.id} className="border-t border-white/[0.06] pt-2">
                    <p className="text-[10px] text-white/35">
                      {m.direction === 'inbound' ? 'Indgående' : 'Udgående'} · {m.deliveryStatus || m.receivedAt || m.sentAt}
                    </p>
                    {m.aiSummary && <p className="text-[12px] text-white/60 mt-1">{m.aiSummary}</p>}
                    <p className="text-[12px] text-white/75 mt-1 whitespace-pre-wrap">{m.text?.slice(0, 500)}</p>
                    {m.suggestedReply && (
                      <button type="button" className="mt-2 text-[11px] text-white/50 underline" onClick={() => setMailBody(m.suggestedReply || '')}>
                        Brug foreslået svar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
}
