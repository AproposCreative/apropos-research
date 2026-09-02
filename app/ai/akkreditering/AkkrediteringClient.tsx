'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import { STATUS_LABELS_DA } from '@/lib/accreditation/state-machine';
import { normalizeEventDate, parseEventDateFromText } from '@/lib/accreditation/event-date';
import type { AccreditationRequest, ApprovalItem, AgentControlState } from '@/lib/accreditation/types';

type DeskTab = 'overview' | 'intake' | 'liv' | 'approvals' | 'contacts' | 'settings';

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const secondaryBtn =
  'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const fieldClass =
  'apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
    active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
  }`;

function unwrap<T>(data: { data?: T } & T): T {
  return (data as { data?: T }).data ?? (data as T);
}

type TicketRow = {
  id: string;
  artist: string;
  venue: string | null;
  eventDate: string | null;
  applicantLabel: string;
  ticketType: string | null;
  ticketQuantity: number | null;
  contactName: string | null;
  contactEmail: string | null;
  promoter: string | null;
  status: string;
  overviewStatus: string;
  statusLabel: string;
  paused: boolean;
  nextFollowUpAt: string | null;
  outcomeReason: string | null;
  latestMessage: { direction: string; subject: string; preview: string; at: string | null } | null;
  nextAction: string;
  finalAccess: string | null;
  updatedAt: string;
};

type EventPreview = {
  url: string;
  artist: string;
  venue?: string;
  eventDate?: string;
  promoter?: string;
  title?: string;
  descriptionSnippet?: string;
};

function StatusBadge({ status, label }: { status: string; label?: string }) {
  const tone =
    status === 'granted'
      ? 'ok'
      : status === 'follow_up_due' || status === 'escalated' || status === 'needs_contact' || status === 'paused'
        ? 'warn'
        : status === 'denied' || status === 'withdrawn'
          ? 'err'
          : 'idle';
  const dot =
    tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : tone === 'err' ? 'bg-rose-400' : 'bg-white/40';
  const text =
    label ||
    STATUS_LABELS_DA[status as AccreditationRequest['status']] ||
    status.replace(/_/g, ' ');
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border text-[10px] uppercase tracking-wider ${
        status === 'granted'
          ? 'border-emerald-400/30 bg-emerald-400/10 text-white/90'
          : 'border-white/15 bg-white/[0.06] text-white/70'
      }`}
    >
      <span className={`size-1.5 rounded-full ${dot}`} />
      {text}
    </span>
  );
}

function AutomationToggle({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-3 min-w-0">
      <button
        type="button"
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={() => onToggle(!enabled)}
        className={`touch-target inline-flex items-center gap-2.5 pl-2.5 pr-3 py-1.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${
          enabled
            ? 'border-white/20 bg-white/10 text-white'
            : 'border-white/12 bg-white/[0.03] text-white/55'
        }`}
      >
        <span
          className={`relative h-6 w-11 rounded-full border transition-colors ${
            enabled ? 'bg-white/25 border-white/20' : 'bg-white/[0.06] border-white/10'
          }`}
        >
          <span
            className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${
              enabled ? 'translate-x-5' : 'translate-x-0.5'
            }`}
          />
        </span>
        <span className="text-[12px] font-medium tracking-wide">
          Liv auto {enabled ? 'ON' : 'OFF'}
        </span>
      </button>
      <p className="text-[10px] text-white/35 max-w-[42ch] leading-snug">
        {enabled
          ? 'Liv svarer og følger automatisk op.'
          : 'Liv klargør udkast, men sender ikke selv.'}
      </p>
    </div>
  );
}

type Props = { embedded?: boolean; onClose?: () => void };

export default function AkkrediteringClient({ embedded = false, onClose }: Props) {
  const searchParams = useSearchParams();
  const setupImap = searchParams.get('setup') === 'imap';
  const startFlow = searchParams.get('start') === '1';
  const [tab, setTab] = useState<DeskTab>(() =>
    setupImap ? 'settings' : startFlow ? 'intake' : 'overview'
  );
  const [tickets, setTickets] = useState<TicketRow[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [control, setControl] = useState<AgentControlState | null>(null);
  const [outboundSafety, setOutboundSafety] = useState<{
    testRedirectTo: string | null;
    allowlist: string[] | null;
    forceSendOnApprove: boolean;
  } | null>(null);
  const [approvals, setApprovals] = useState<ApprovalItem[]>([]);
  const [approvalRecipients, setApprovalRecipients] = useState<Record<string, string>>({});
  const [connStatus, setConnStatus] = useState<Record<
    string,
    {
      ok: boolean;
      label: string;
      value?: string | null;
      mode?: string;
      fallback?: string;
      backend?: string;
      contactCount?: number;
      lastSyncAt?: string | null;
      error?: string;
      mailboxArchiveRows?: number;
    }
  > | null>(null);
  const [memorySync, setMemorySync] = useState<{
    imported?: number;
    upserted?: number;
    skipped?: number;
    contactCount?: number;
    lastSyncAt?: string;
    automatedCount?: number;
    humanOrRoleCount?: number;
  } | null>(null);
  const [filter, setFilter] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [imapHealth, setImapHealth] = useState<unknown>(null);
  const [contactOverview, setContactOverview] = useState<{
    contacts?: { email: string; name?: string; companyHint?: string; messageCount: number; reviewStatus: string }[];
    lastScanAt?: string;
  } | null>(null);

  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [applicant, setApplicant] = useState('');
  const [eventUrl, setEventUrl] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [ticketQty, setTicketQty] = useState('1');
  const [accessType, setAccessType] = useState('presse');
  const [intakeStep, setIntakeStep] = useState<0 | 1 | 2>(0);
  const [eventPreview, setEventPreview] = useState<EventPreview | null>(null);
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<{ id: string; role: string; content: string }[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [chatBusy, setChatBusy] = useState(false);
  const [livProfile, setLivProfile] = useState<{
    promptVersion?: string;
    bio?: { name: string; summary: string; education: string; origin: string; antifabrication: string };
    voiceModes?: { id: string; label: string; description: string }[];
    help?: { channels?: string[]; automation?: string; deliveryInvariant?: string };
  } | null>(null);
  const [showLivHelp, setShowLivHelp] = useState(false);
  const [showMoreDetails, setShowMoreDetails] = useState(false);

  const load = useCallback(async () => {
    try {
      const [tRes, aRes, sRes] = await Promise.all([
        fetch('/api/accreditation/tickets'),
        fetch('/api/accreditation/approvals'),
        fetch('/api/accreditation/status'),
      ]);
      const tJson = unwrap(await tRes.json());
      const aJson = unwrap(await aRes.json());
      const sJson = unwrap(await sRes.json());
      setTickets(tJson.tickets || []);
      setCounts(tJson.counts || {});
      setControl(tJson.control || sJson.control || null);
      setOutboundSafety(sJson.outboundSafety || null);
      setApprovals(aJson.approvals || []);
      setConnStatus(sJson.connections || null);
      if (!selectedId && tJson.tickets?.[0]?.id) setSelectedId(tJson.tickets[0].id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kunne ikke hente data');
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/accreditation/liv-profile');
        const json = unwrap(await res.json());
        setLivProfile(json as typeof livProfile);
      } catch {
        /* optional */
      }
    })();
  }, []);

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      await action();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function analyzeEventLink() {
    if (!eventUrl.trim()) return;
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch('/api/accreditation/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ eventUrl, previewOnly: true }),
      });
      const json = unwrap(await res.json()) as {
        extracted?: EventPreview;
        error?: string;
      };
      if (!res.ok || !json.extracted) {
        throw new Error(json.error || 'Liv kunne ikke læse eventlinket');
      }
      setEventPreview(json.extracted);
      setArtist(json.extracted.artist || '');
      setVenue(json.extracted.venue || '');
      setEventDate(
        normalizeEventDate(json.extracted.eventDate) ||
          parseEventDateFromText(
            [json.extracted.title, json.extracted.descriptionSnippet, json.extracted.eventDate]
              .filter(Boolean)
              .join(' ')
          ) ||
          ''
      );
      setIntakeStep(1);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function resetIntake() {
    setEventUrl('');
    setEventPreview(null);
    setArtist('');
    setVenue('');
    setEventDate('');
    setRecipientName('');
    setRecipientEmail('');
    setTicketQty('1');
    setAccessType('presse');
    setShowMoreDetails(false);
    setIntakeStep(0);
  }

  async function sendMessageToLiv(message: string) {
    const cleanMessage = message.trim();
    if (!cleanMessage || chatBusy) return;
    setChatBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accreditation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: cleanMessage, threadId: chatThreadId }),
      });
      const json = unwrap(await res.json());
      if (!res.ok) {
        throw new Error((json as { error?: string }).error || 'Chat fejlede');
      }
      const thread = (json as {
        thread?: { id: string; messages: typeof chatMessages };
      }).thread;
      if (thread) {
        setChatThreadId(thread.id);
        setChatMessages(thread.messages || []);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChatBusy(false);
    }
  }

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (
        filter === 'active' &&
        ['granted', 'denied', 'withdrawn'].includes(t.overviewStatus)
      ) {
        return false;
      }
      if (filter === 'granted' && t.overviewStatus !== 'granted') return false;
      if (!q) return true;
      return [t.id, t.artist, t.venue, t.applicantLabel, t.contactEmail, t.promoter]
        .filter(Boolean)
        .join(' ')
        .toLowerCase()
        .includes(q);
    });
  }, [tickets, filter, query]);

  const selected = filtered.find((t) => t.id === selectedId) || filtered[0] || tickets[0];

  const automationOn = control?.automationEnabled === true;
  const activeCount = tickets.filter(
    (t) => !['granted', 'denied', 'withdrawn'].includes(t.overviewStatus)
  ).length;
  const queuedApprovals = approvals.filter((a) => a.status === 'queued').length;

  const filterChips: { id: string; label: string }[] = [
    { id: 'all', label: `Alle (${counts.all || 0})` },
    { id: 'active', label: `I gang (${activeCount})` },
    { id: 'granted', label: `Færdige (${counts.granted || 0})` },
  ];

  const tabs: { id: DeskTab; label: string }[] = [
    { id: 'overview', label: 'Overblik' },
    { id: 'intake', label: 'Ny akkreditering' },
    { id: 'liv', label: 'Skriv til Liv' },
  ];
  if (setupImap) tabs.push({ id: 'settings', label: 'Opsætning' });

  return (
    <div className="flex flex-col h-full min-h-0 text-white bg-transparent font-poppins">
      <EmbeddedAppHeader
        embedded={embedded}
        title="Akkreditering"
        subtitle="Liv holder styr på dialogen fra start til slut"
        onClose={onClose}
        trailing={
          <div className="flex flex-wrap items-center gap-1">
            {tabs.map((t) => (
              <button key={t.id} type="button" className={segBtn(tab === t.id)} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </div>
        }
      />

      <div className="shrink-0 border-b border-white/10 px-3 lg:px-4 py-3 bg-black/20 space-y-2">
        <AutomationToggle
          enabled={automationOn}
          busy={busy}
          onToggle={(next) =>
            void run(async () => {
              const res = await fetch('/api/accreditation/control', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  action: 'automation',
                  enabled: next,
                  actor: 'studio',
                  source: 'header-toggle',
                }),
              });
              const json = unwrap(await res.json());
              if (!res.ok) throw new Error((json as { error?: string }).error || 'Toggle fejlede');
              setControl(json.control);
              setMessage(next ? 'Liv automation ON' : 'Liv automation OFF');
            })
          }
        />
        {outboundSafety?.testRedirectTo && (
          <p className="rounded-lg border border-amber-300/20 bg-amber-300/[0.05] px-3 py-2 text-[11px] text-amber-100/75">
            Test-mode: alle Liv-mails sendes kun til {outboundSafety.testRedirectTo} — ikke til arrangør/presse.
          </p>
        )}
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto nice-scrollbar p-3 lg:p-4 space-y-4">
        {(message || error) && (
          <div
            className={`rounded-xl border px-3.5 py-2.5 text-[13px] ${
              error ? 'border-white/20 text-red-400/95 bg-white/[0.03]' : 'border-white/12 text-white/75 bg-white/[0.03]'
            }`}
          >
            {error || message}
          </div>
        )}

        {tab === 'overview' && (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap gap-1.5">
                {filterChips.map((c) => (
                  <button key={c.id} type="button" className={segBtn(filter === c.id)} onClick={() => setFilter(c.id)}>
                    {c.label}
                  </button>
                ))}
              </div>
              {queuedApprovals > 0 && (
                <button
                  type="button"
                  className="rounded-lg border border-amber-300/20 bg-amber-300/[0.06] px-2.5 py-1 text-[11px] text-amber-100/80"
                  onClick={() => setTab('approvals')}
                >
                  Kræver din hjælp ({queuedApprovals})
                </button>
              )}
            </div>
            {tickets.length > 4 && (
              <input
                className={fieldClass}
                placeholder="Søg efter koncert eller ansøger"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            )}

            {/* Desktop table */}
            <div className="hidden lg:block rounded-xl border border-white/12 overflow-hidden">
              <div className="grid grid-cols-12 gap-2 px-3 py-2 text-[10px] uppercase tracking-wider text-white/35 border-b border-white/10 bg-white/[0.02]">
                <span className="col-span-3">Koncert</span>
                <span className="col-span-2">Ansøger / adgang</span>
                <span className="col-span-2">Kontakt</span>
                <span className="col-span-2">Status</span>
                <span className="col-span-2">Næste</span>
                <span className="col-span-1" />
              </div>
              {filtered.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setSelectedId(t.id)}
                  className={`grid grid-cols-12 gap-2 w-full text-left px-3 py-3 border-b border-white/[0.06] transition-colors ${
                    selected?.id === t.id ? 'bg-white/[0.05]' : 'hover:bg-white/[0.03]'
                  } ${t.overviewStatus === 'granted' ? 'bg-emerald-400/[0.04]' : ''}`}
                >
                  <div className="col-span-3 min-w-0">
                    <p className="text-[13px] font-medium text-white truncate">{t.artist}</p>
                    <p className="text-[11px] text-white/40 truncate">
                      {[t.venue, t.eventDate].filter(Boolean).join(' · ') || t.id}
                    </p>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-[12px] text-white/75 truncate">{t.applicantLabel}</p>
                    <p className="text-[10px] text-white/35 truncate">
                      {t.ticketType || 'Ikke angivet'}
                      {t.ticketQuantity != null ? ` · ×${t.ticketQuantity}` : ''}
                    </p>
                  </div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-[12px] text-white/70 truncate">{t.contactName || t.promoter || 'Ikke fundet'}</p>
                    <p className="text-[10px] text-white/30 truncate">{t.contactEmail || 'Ingen mail'}</p>
                  </div>
                  <div className="col-span-2">
                    <StatusBadge status={t.overviewStatus} label={t.statusLabel} />
                    {t.finalAccess && (
                      <p className="text-[10px] text-emerald-300/80 mt-1 truncate">{t.finalAccess}</p>
                    )}
                  </div>
                  <div className="col-span-2 min-w-0">
                    <p className="text-[11px] text-white/60 truncate">{t.nextAction}</p>
                    <p className="text-[10px] text-white/30 truncate">
                      {t.latestMessage?.preview || t.nextFollowUpAt || 'Afventer næste skridt'}
                    </p>
                  </div>
                  <div className="col-span-1 flex justify-end">
                    <span
                      role="button"
                      tabIndex={0}
                      className="text-[10px] px-2 py-1 rounded-lg border border-white/12 text-white/55 hover:bg-white/[0.06]"
                      onClick={(e) => {
                        e.stopPropagation();
                        void run(async () => {
                          await fetch('/api/accreditation/control', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                              action: t.paused ? 'resume_request' : 'pause_request',
                              requestId: t.id,
                              actor: 'studio',
                              source: 'ticket-row',
                            }),
                          });
                        });
                      }}
                    >
                      {t.paused ? 'Resume' : 'Pause'}
                    </span>
                  </div>
                </button>
              ))}
              {!filtered.length && (
                <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
                  <div className="flex size-10 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-lg">
                    ♪
                  </div>
                  <div>
                    <p className="text-[14px] text-white/80">Ingen akkrediteringer endnu</p>
                    <p className="mt-1 text-[12px] text-white/40">
                      Indsæt et eventlink, så tager Liv sig af resten.
                    </p>
                  </div>
                  <button
                    type="button"
                    className="rounded-xl border border-white/15 bg-white/[0.06] px-4 py-2 text-[12px] text-white/80 hover:bg-white/[0.1]"
                    onClick={() => setTab('intake')}
                  >
                    Start en akkreditering
                  </button>
                </div>
              )}
            </div>

            {/* Mobile cards */}
            <div className="lg:hidden space-y-2">
              {filtered.map((t) => (
                <div
                  key={t.id}
                  className={`rounded-xl border p-3.5 space-y-2 ${
                    t.overviewStatus === 'granted'
                      ? 'border-emerald-400/25 bg-emerald-400/[0.05]'
                      : selected?.id === t.id
                        ? 'border-white/15 bg-white/[0.05]'
                        : 'border-white/[0.08] bg-white/[0.02]'
                  }`}
                  onClick={() => setSelectedId(t.id)}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-[14px] font-medium text-white truncate">{t.artist}</p>
                      <p className="text-[11px] text-white/40 truncate">
                        {[t.venue, t.eventDate].filter(Boolean).join(' · ') || t.id}
                      </p>
                    </div>
                    <StatusBadge status={t.overviewStatus} label={t.statusLabel} />
                  </div>
                  <p className="text-[12px] text-white/70">
                    {t.applicantLabel} · {t.ticketType || 'adgang'}
                    {t.ticketQuantity != null ? ` ×${t.ticketQuantity}` : ''}
                  </p>
                  <p className="text-[11px] text-white/45 truncate">
                    {t.contactName || t.promoter || 'Ikke fundet'} · {t.contactEmail || 'ingen mail'}
                  </p>
                  {t.finalAccess && (
                    <p className="text-[12px] text-emerald-300/90">Adgang: {t.finalAccess}</p>
                  )}
                  <p className="text-[11px] text-white/40 line-clamp-2">
                    {t.latestMessage?.preview || t.nextAction}
                  </p>
                  <button
                    type="button"
                    className={secondaryBtn}
                    onClick={(e) => {
                      e.stopPropagation();
                      void run(async () => {
                        await fetch('/api/accreditation/control', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: t.paused ? 'resume_request' : 'pause_request',
                            requestId: t.id,
                          }),
                        });
                      });
                    }}
                  >
                    {t.paused ? 'Resume ticket' : 'Pause ticket'}
                  </button>
                </div>
              ))}
            </div>

            {selected && (
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3.5 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="text-[14px] font-medium text-white">
                    {selected.id} · {selected.artist}
                  </h3>
                  <StatusBadge status={selected.overviewStatus} label={selected.statusLabel} />
                </div>
                <p className="text-[12px] text-white/55">
                  Næste: {selected.nextAction}
                  {selected.nextFollowUpAt ? ` · follow-up ${selected.nextFollowUpAt}` : ''}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  <button
                    type="button"
                    className={secondaryBtn}
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        await fetch('/api/accreditation/control', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            action: selected.paused ? 'resume_request' : 'pause_request',
                            requestId: selected.id,
                          }),
                        });
                      })
                    }
                  >
                    {selected.paused ? 'Resume ticket' : 'Pause ticket'}
                  </button>
                </div>
              </div>
            )}

          </div>
        )}

        {tab === 'intake' && (
          <div className="w-full rounded-xl border border-white/12 bg-black/70 p-3.5 backdrop-blur-2xl md:p-5">
            <div className="mb-5">
              <div className="flex items-center justify-between text-[10px] uppercase tracking-[0.16em] text-white/40">
                <span>Ny akkreditering</span>
                <span>{intakeStep + 1}/3</span>
              </div>
              <div className="mt-2 flex gap-1.5">
                {[0, 1, 2].map((step) => (
                  <div
                    key={step}
                    className={`h-1.5 flex-1 rounded-full ${
                      step <= intakeStep
                        ? 'bg-white shadow-[0_0_10px_rgba(255,255,255,0.65)]'
                        : 'bg-white/10'
                    }`}
                  />
                ))}
              </div>
              <div className="mt-3 flex gap-2">
                {[
                  { id: 0, label: 'Event' },
                  { id: 1, label: 'Adgang' },
                  { id: 2, label: 'Gennemgang' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    disabled={item.id > intakeStep}
                    onClick={() => setIntakeStep(item.id as 0 | 1 | 2)}
                    className={`rounded-full border px-3 py-1 text-[11px] transition-colors ${
                      intakeStep === item.id
                        ? 'border-white/30 bg-white/10 text-white'
                        : item.id < intakeStep
                          ? 'border-white/15 text-white/65'
                          : 'border-white/[0.06] text-white/25'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {intakeStep === 0 && (
              <div className="space-y-4">
                <div>
                  <p className="text-[18px] font-medium text-white">Indsæt eventlinket</p>
                  <p className="mt-1 text-[12px] text-white/45">
                    Liv finder artist, venue, dato og den rigtige presseindgang.
                  </p>
                </div>
                <input
                  className={fieldClass}
                  placeholder="Link til koncert eller festival"
                  value={eventUrl}
                  onChange={(e) => {
                    setEventUrl(e.target.value);
                    setEventPreview(null);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && eventUrl.trim() && !busy) {
                      e.preventDefault();
                      void analyzeEventLink();
                    }
                  }}
                />
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busy || !eventUrl.trim()}
                  onClick={() => void analyzeEventLink()}
                >
                  {busy ? 'Liv undersøger eventet...' : 'Find koncerten'}
                </button>
              </div>
            )}

            {intakeStep === 1 && eventPreview && (
              <div className="space-y-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
                  <p className="text-[15px] font-medium text-white">{artist || eventPreview.artist}</p>
                  <p className="mt-1 text-[12px] text-white/45">
                    {[venue || eventPreview.venue, eventDate || eventPreview.eventDate]
                      .filter(Boolean)
                      .join(' · ') || 'Liv fandt eventet, men mangler enkelte detaljer'}
                  </p>
                  {eventPreview.promoter && (
                    <p className="mt-1 text-[11px] text-white/30">
                      Arrangør: {eventPreview.promoter}
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-white/35">Dato</p>
                  <input
                    type="date"
                    className={fieldClass}
                    value={eventDate}
                    onChange={(e) => setEventDate(e.target.value)}
                  />
                  {!eventDate && (
                    <p className="text-[11px] text-white/35">
                      Liv fandt ikke datoen automatisk — udfyld den fra eventlinket.
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-white/35">Billetantal</p>
                  <div className="flex flex-wrap gap-2">
                    {[1, 2, 3].map((quantity) => (
                      <button
                        key={quantity}
                        type="button"
                        onClick={() => setTicketQty(String(quantity))}
                        className={`min-w-11 rounded-lg border px-3 py-2 text-[12px] ${
                          ticketQty === String(quantity)
                            ? 'border-white/35 bg-white/10 text-white'
                            : 'border-white/10 bg-white/[0.03] text-white/55'
                        }`}
                      >
                        {quantity}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <p className="text-[11px] uppercase tracking-wider text-white/35">Adgang</p>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { id: 'presse', label: 'Presse' },
                      { id: 'staapladser', label: 'Ståplads' },
                      { id: 'photo', label: 'Fotopas' },
                    ].map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        onClick={() => setAccessType(option.id)}
                        className={`rounded-lg border px-3 py-2 text-[12px] ${
                          accessType === option.id
                            ? 'border-white/35 bg-white/10 text-white'
                            : 'border-white/10 bg-white/[0.03] text-white/55'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input
                    className={fieldClass}
                    placeholder="Hvem skal afsted?"
                    value={recipientName}
                    onChange={(e) => setRecipientName(e.target.value)}
                  />
                  <input
                    className={fieldClass}
                    placeholder="Modtagers email"
                    type="email"
                    value={recipientEmail}
                    onChange={(e) => setRecipientEmail(e.target.value)}
                  />
                </div>

                <button
                  type="button"
                  className="text-left text-[11px] text-white/40 hover:text-white/70"
                  onClick={() => setShowMoreDetails((value) => !value)}
                >
                  {showMoreDetails ? 'Skjul rettelser' : 'Ret artist eller venue'}
                </button>
                {showMoreDetails && (
                  <div className="grid grid-cols-1 gap-2 rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:grid-cols-2">
                    <input className={fieldClass} placeholder="Artist" value={artist} onChange={(e) => setArtist(e.target.value)} />
                    <input className={fieldClass} placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
                  </div>
                )}

                <button
                  type="button"
                  className={primaryBtn}
                  disabled={!recipientName.trim() || !recipientEmail.includes('@') || !eventDate.trim()}
                  onClick={() => {
                    setIntakeStep(2);
                    void sendMessageToLiv(
                      `Gennemgå denne akkreditering før første mail: ${artist}, ${venue}, ${eventDate}, ${ticketQty} billet, skribent og billetmodtager ${recipientName}. Liv Brandt er altid afsenderen. Pressepersonen er modtageren af selve ansøgningen. Skeln tydeligt mellem de tre roller, peg kun på noget, der bør rettes, og send ikke nogen mail.`
                    );
                  }}
                >
                  Gennemgå med Liv
                </button>
              </div>
            )}

            {intakeStep === 2 && (
              <div className="space-y-4">
                <div>
                  <p className="text-[18px] font-medium text-white">Klar til Liv</p>
                  <p className="mt-1 text-[12px] text-white/45">
                    I kan rette detaljerne i chatten, før sagen startes.
                  </p>
                </div>
                <div className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3.5 text-[12px] text-white/70 sm:grid-cols-2">
                  <p><span className="text-white/35">Event</span><br />{artist}</p>
                  <p><span className="text-white/35">Dato</span><br />{eventDate}</p>
                  <p><span className="text-white/35">Skribent</span><br />{recipientName}</p>
                  <p><span className="text-white/35">Adgang</span><br />{ticketQty} billet, {accessType}</p>
                </div>
                <div className="max-h-52 space-y-2 overflow-y-auto rounded-xl border border-white/10 bg-black/40 p-3 nice-scrollbar">
                  {chatBusy && !chatMessages.length && (
                    <p className="text-[12px] text-white/40">Liv gennemgår detaljerne...</p>
                  )}
                  {chatMessages.slice(-4).map((item) => (
                    <div
                      key={item.id}
                      className={`text-[12px] leading-relaxed ${
                        item.role === 'user' ? 'text-white/45' : 'text-white/80'
                      }`}
                    >
                      {item.role === 'user' ? 'Dig: ' : 'Liv: '}
                      {item.content}
                    </div>
                  ))}
                </div>
                <div className="flex gap-2">
                  <input
                    className={fieldClass}
                    placeholder="Spørg Liv eller bed om en rettelse"
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && chatInput.trim() && !chatBusy) {
                        e.preventDefault();
                        const message = chatInput;
                        setChatInput('');
                        void sendMessageToLiv(message);
                      }
                    }}
                  />
                  <button
                    type="button"
                    className="min-w-20 rounded-xl border border-white/15 px-3 text-[12px] text-white/70 disabled:opacity-40"
                    disabled={chatBusy || !chatInput.trim()}
                    onClick={() => {
                      const message = chatInput;
                      setChatInput('');
                      void sendMessageToLiv(message);
                    }}
                  >
                    Send
                  </button>
                </div>
                {outboundSafety?.testRedirectTo ? (
                  <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/65">
                    Test-mode aktiv: første mail går til {outboundSafety.testRedirectTo} (ikke til
                    presse/arrangør). Svar fra din Gmail tester dialogen med Liv.
                  </p>
                ) : !automationOn ? (
                  <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[11px] text-amber-100/65">
                    Liv er slået fra. Sagen og mailudkastet bliver oprettet, men intet sendes automatisk.
                  </p>
                ) : null}
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busy || chatBusy}
                  onClick={() =>
                    void run(async () => {
                      const res = await fetch('/api/accreditation/intake', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          eventUrl,
                          recipientName: recipientName || applicant,
                          recipientEmail,
                          ticketQuantity: Number(ticketQty) || 1,
                          ticketType: accessType,
                          artist: artist || undefined,
                          venue: venue || undefined,
                          eventDate: eventDate || undefined,
                          runPipeline: true,
                        }),
                      });
                      const json = unwrap(await res.json());
                      if (!res.ok) {
                        throw new Error((json as { error?: string }).error || 'Intake fejlede');
                      }
                      setMessage(
                        `Sag ${(json as { request?: string }).request} er oprettet og overtaget af Liv.`
                      );
                      resetIntake();
                      setTab('overview');
                    })
                  }
                >
                  Godkend og lad Liv tage sagen
                </button>
              </div>
            )}
          </div>
        )}

        {tab === 'liv' && (
          <div className="flex flex-col h-[min(70vh,640px)] rounded-xl border border-white/15 bg-black/55 md:bg-black/75 backdrop-blur-2xl overflow-hidden">
            <div className="shrink-0 border-b border-white/10 px-3 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[13px] font-medium text-white">Liv Brandt</p>
                <p className="text-[10px] text-white/35 truncate">
                  {livProfile?.bio?.origin || 'København NV'} · {livProfile?.promptVersion || 'liv-prompt-v3'}
                </p>
              </div>
              <button
                type="button"
                className={segBtn(showLivHelp)}
                onClick={() => setShowLivHelp((v) => !v)}
              >
                Profil / help
              </button>
            </div>
            {showLivHelp && livProfile && (
              <div className="shrink-0 max-h-[40%] overflow-y-auto nice-scrollbar border-b border-white/10 px-3 py-3 space-y-2 bg-white/[0.02]">
                <p className="text-[12px] text-white/75 leading-relaxed">{livProfile.bio?.summary}</p>
                <p className="text-[10px] text-white/40">{livProfile.bio?.education}</p>
                <p className="text-[10px] text-amber-300/80">{livProfile.bio?.antifabrication}</p>
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {(livProfile.voiceModes || []).map((m) => (
                    <span
                      key={m.id}
                      className="inline-flex flex-col gap-0.5 px-2 py-1.5 rounded-lg border border-white/12 bg-white/[0.04] max-w-[220px]"
                    >
                      <span className="text-[10px] font-medium text-white/80">{m.label}</span>
                      <span className="text-[10px] text-white/40 leading-snug">{m.description}</span>
                    </span>
                  ))}
                </div>
                {livProfile.help?.deliveryInvariant && (
                  <p className="text-[10px] text-white/35 pt-1">{livProfile.help.deliveryInvariant}</p>
                )}
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto nice-scrollbar p-3 space-y-3">
              {!chatMessages.length && (
                <div className="px-1.5 py-2 text-white/85 text-[13px] leading-relaxed md:mr-20">
                  Hej, smid et eventlink, antal og modtager, eller spørg ind til en igangværende sag. Jeg husker
                  konteksten herinde.
                </div>
              )}
              {chatMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.role === 'user' ? 'justify-end md:ml-20' : 'justify-start md:mr-20'}`}
                >
                  <div
                    className={
                      m.role === 'user'
                        ? 'max-w-[78%] rounded-2xl px-4 py-3 bg-black/90 text-white border border-white/20 break-words'
                        : 'max-w-[78%] px-1.5 py-2 text-white/85 break-words'
                    }
                  >
                    <p className="text-[13px] whitespace-pre-wrap">{m.content}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="shrink-0 border-t border-white/10 p-3">
              <div
                className={`relative rounded-xl border border-white/15 p-3 ${
                  chatMessages.length ? 'bg-[#171717]' : 'bg-black/40 backdrop-blur-xl'
                }`}
              >
                <textarea
                  className="apropos-input-dark w-full bg-transparent text-white text-sm resize-none outline-none min-h-[60px]"
                  rows={3}
                  placeholder="Skriv til Liv…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      if (!chatInput.trim() || chatBusy) return;
                      const msg = chatInput.trim();
                      setChatInput('');
                      setChatBusy(true);
                      void (async () => {
                        try {
                          const res = await fetch('/api/accreditation/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: msg, threadId: chatThreadId }),
                          });
                          const json = unwrap(await res.json());
                          if (!res.ok) throw new Error((json as { error?: string }).error || 'Chat fejlede');
                          const thread = (json as { thread?: { id: string; messages: typeof chatMessages } }).thread;
                          if (thread) {
                            setChatThreadId(thread.id);
                            setChatMessages(thread.messages || []);
                          }
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        } finally {
                          setChatBusy(false);
                        }
                      })();
                    }
                  }}
                />
                <div className="flex justify-end mt-2">
                  <button
                    type="button"
                    className="touch-target w-11 h-11 flex items-center justify-center rounded text-white hover:bg-gray-700 disabled:opacity-40"
                    disabled={chatBusy || !chatInput.trim()}
                    onClick={() => {
                      const msg = chatInput.trim();
                      if (!msg) return;
                      setChatInput('');
                      setChatBusy(true);
                      void (async () => {
                        try {
                          const res = await fetch('/api/accreditation/chat', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ message: msg, threadId: chatThreadId }),
                          });
                          const json = unwrap(await res.json());
                          if (!res.ok) throw new Error((json as { error?: string }).error || 'Chat fejlede');
                          const thread = (json as { thread?: { id: string; messages: typeof chatMessages } }).thread;
                          if (thread) {
                            setChatThreadId(thread.id);
                            setChatMessages(thread.messages || []);
                          }
                        } catch (err) {
                          setError(err instanceof Error ? err.message : String(err));
                        } finally {
                          setChatBusy(false);
                        }
                      })();
                    }}
                  >
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                      <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {tab === 'approvals' && (
          <div className="space-y-2">
            {approvals.filter((a) => a.status === 'queued').map((a) => (
              <div key={a.id} className="rounded-xl border border-white/12 p-3.5 space-y-2">
                <p className="text-[12px] text-white/80">
                  {a.kind} · {a.requestId} · {a.autoEligible ? 'auto-eligible' : 'escalated'}
                </p>
                <p className="text-[11px] text-white/40">{a.subject}</p>
                <div className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-lg border border-white/10 bg-black/25 p-3 text-[11px] leading-relaxed text-white/60">
                  {a.text}
                </div>
                <p className="text-[10px] text-white/30">{a.policyFlags.join(', ') || 'Ingen begrænsninger'}</p>
                <label className="block space-y-1">
                  <span className="text-[10px] uppercase tracking-wider text-white/35">
                    Modtager
                  </span>
                  <input
                    className={fieldClass}
                    type="email"
                    value={approvalRecipients[a.id] ?? a.to}
                    onChange={(event) =>
                      setApprovalRecipients((current) => ({
                        ...current,
                        [a.id]: event.target.value,
                      }))
                    }
                  />
                </label>
                <p className="text-[10px] text-white/30">
                  Mailen sendes kun til denne modtager. Andre sager og gamle tråde berøres ikke.
                </p>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busy || !(approvalRecipients[a.id] ?? a.to).includes('@')}
                  onClick={() =>
                    void run(async () => {
                      const approvalResponse = await fetch('/api/accreditation/approvals', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                          id: a.id,
                          action: 'approve',
                          to: approvalRecipients[a.id] ?? a.to,
                        }),
                      });
                      const approvalJson = unwrap(await approvalResponse.json());
                      if (!approvalResponse.ok) {
                        throw new Error(
                          (approvalJson as { error?: string }).error || 'Godkendelse fejlede'
                        );
                      }
                      const sendResponse = await fetch('/api/accreditation/emails/send', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ approvalId: a.id, draftHash: a.draftHash }),
                      });
                      const sendJson = unwrap(await sendResponse.json());
                      if (!sendResponse.ok) {
                        throw new Error(
                          (sendJson as { error?: string }).error || 'Afsendelse fejlede'
                        );
                      }
                      setMessage('Manuel send udført');
                    })
                  }
                >
                  Godkend & send manuelt
                </button>
              </div>
            ))}
            {!approvals.filter((a) => a.status === 'queued').length && (
              <p className="text-[13px] text-white/40">Ingen escaleringer i kø.</p>
            )}
          </div>
        )}

        {tab === 'contacts' && (
          <div className="space-y-3">
            <p className="text-[13px] text-white/55">
              IMAP-historik → reviewable oversigt. Sheet &quot;Contacts etc.&quot; forbliver read-only.
            </p>
            <button
              type="button"
              className={secondaryBtn}
              disabled={busy}
              onClick={() =>
                void run(async () => {
                  const res = await fetch('/api/accreditation/mailboxes/history', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'scan', maxPerMailbox: 120 }),
                  });
                  const json = unwrap(await res.json());
                  if (!res.ok) throw new Error((json as { error?: string }).error || 'Scan fejlede');
                  setContactOverview(json.overview || json);
                  setMessage(`Scan: ${json.contactsFound ?? 0} kontakter`);
                })
              }
            >
              Historisk inbox-scan
            </button>
            {(contactOverview?.contacts || []).slice(0, 30).map((c) => (
              <div key={c.email} className="rounded-xl border border-white/[0.08] px-3 py-2 text-[12px] text-white/70">
                {c.name || c.email} · {c.companyHint || 'Ukendt'} · {c.messageCount} · {c.reviewStatus}
              </div>
            ))}
          </div>
        )}

        {tab === 'settings' && (
          <div className="space-y-3">
            {connStatus && (
              <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3.5 space-y-2">
                <p className="text-[12px] font-medium text-white/80">Mail-identitet (ingen secrets)</p>
                {(['mailTransport', 'smtp', 'livFrom', 'replyTo', 'mailIdentity', 'resend'] as const).map((key) => {
                  const row = connStatus[key];
                  if (!row) return null;
                  return (
                    <div
                      key={key}
                      className="flex items-start gap-2 rounded-lg border border-white/[0.06] px-3 py-2"
                    >
                      <span
                        className={`mt-1 size-1.5 shrink-0 rounded-full ${
                          row.ok ? 'bg-emerald-400' : 'bg-amber-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <p className="text-[11px] text-white/70">{row.label}</p>
                        {row.value ? (
                          <p className="text-[10px] text-white/35 break-all">{row.value}</p>
                        ) : null}
                        {row.mode ? (
                          <p className="text-[10px] text-white/30">mode: {row.mode}</p>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3.5 space-y-3">
              <p className="text-[12px] font-medium text-white/80">Kontakt-hukommelse (Firestore)</p>
              <p className="text-[11px] text-white/45">
                Synkroniserer read-only fanen Mailbox contact archive til durable hukommelse.
                Ingen passwords eller fulde mailbodies gemmes.
              </p>
              {connStatus?.memory && (
                <div className="flex items-start gap-2 rounded-lg border border-white/[0.06] px-3 py-2">
                  <span
                    className={`mt-1 size-1.5 shrink-0 rounded-full ${
                      connStatus.memory.ok ? 'bg-emerald-400' : 'bg-amber-400'
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] text-white/70">{connStatus.memory.label}</p>
                    {connStatus.memory.value ? (
                      <p className="text-[10px] text-white/35 break-all">{connStatus.memory.value}</p>
                    ) : null}
                    {connStatus.memory.backend ? (
                      <p className="text-[10px] text-white/30">backend: {connStatus.memory.backend}</p>
                    ) : null}
                  </div>
                </div>
              )}
              {connStatus?.sheet?.mailboxArchiveRows != null && (
                <p className="text-[10px] text-white/35">
                  Sheet archive rows: {connStatus.sheet.mailboxArchiveRows}
                </p>
              )}
              <button
                type="button"
                className={secondaryBtn}
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const res = await fetch('/api/accreditation/memory/sync', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ action: 'sync' }),
                    });
                    const json = unwrap(await res.json()) as {
                      imported?: number;
                      upserted?: number;
                      skipped?: number;
                      contactCount?: number;
                      lastSyncAt?: string;
                      automatedCount?: number;
                      humanOrRoleCount?: number;
                      error?: string;
                    };
                    if (!res.ok) throw new Error(json.error || 'Memory sync fejlede');
                    setMemorySync(json);
                    setMessage(
                      `Memory sync: +${json.imported ?? 0} new · ${json.upserted ?? 0} upserted · ${json.skipped ?? 0} skipped · ${json.contactCount ?? '?'} total`
                    );
                  })
                }
              >
                Sync Mailbox contact archive
              </button>
              {memorySync && (
                <pre className="text-[10px] text-white/35 whitespace-pre-wrap max-h-32 overflow-y-auto">
                  {JSON.stringify(memorySync, null, 2)}
                </pre>
              )}
            </div>
            <div className="rounded-xl border border-white/15 bg-white/[0.03] p-3.5 space-y-3">
              <p className="text-[12px] font-medium text-white/80">
                one.com IMAP {setupImap ? '(setup path)' : ''}
              </p>
              <p className="text-[11px] text-white/45">
                Sæt passwords i <span className="text-white/70">.env.local</span> / Vercel env - aldrig i chat.
                Path: <span className="text-white/70">/ai?view=akkreditering&setup=imap</span>
              </p>
              <ul className="text-[11px] text-white/40 space-y-1 font-mono">
                <li>LIV_IMAP_PASSWORD / FREDERIK_IMAP_PASSWORD</li>
                <li>ONECOM_IMAP_HOST=imap.one.com · PORT=993</li>
                <li>ACCREDITATION_REPLY_TO_EMAIL=liv@aproposmagazine.com</li>
                <li>ACCREDITATION_INBOUND_DOMAIN=optional Resend subdomain</li>
              </ul>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await fetch('/api/accreditation/mailboxes/health?probe=1');
                      setImapHealth(unwrap(await res.json()));
                      setMessage('IMAP health (uden secrets)');
                    })
                  }
                >
                  Test IMAP
                </button>
                <button
                  type="button"
                  className={secondaryBtn}
                  disabled={busy}
                  onClick={() =>
                    void run(async () => {
                      const res = await fetch('/api/accreditation/mailboxes/poll', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ mailbox: 'liv_only' }),
                      });
                      const json = unwrap(await res.json());
                      if (!res.ok) throw new Error((json as { error?: string }).error || 'Poll fejlede');
                      setMessage(`Poll processed ${json.liv?.processed ?? 0}`);
                    })
                  }
                >
                  Poll liv@
                </button>
              </div>
              {imapHealth != null && (
                <pre className="text-[10px] text-white/35 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {JSON.stringify(imapHealth, null, 2)}
                </pre>
              )}
            </div>
            <p className="text-[12px] text-white/45">
              Gmail er valgfri. Produktion bruger one.com til indgående mail og SMTP som Liv fra liv@aproposmagazine.com.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
