'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import type { LivInboxItem, LivInboxItemStatus, LivInboxSettings } from '@/lib/liv-inbox/types';

type Props = { embedded?: boolean; onClose?: () => void };
type DeskTab = 'inbox' | 'guidelines' | 'activity';

type Metrics = {
  handled: number;
  avgConfidence: number | null;
  escalationRate: number;
  knownContacts: number;
};
type AuditEvent = {
  id: string;
  at: string;
  type: string;
  subject?: string;
  contactEmail?: string;
  detail?: string;
};

const AUDIT_LABEL: Record<string, string> = {
  poll: 'Auto-hentning',
  auto_prepared: 'Auto-klargjort',
  drafted: 'Kladde',
  escalated: 'Eskaleret',
  sent: 'Sendt',
  dismissed: 'Afvist',
  edited: 'Redigeret',
};

const primaryBtn =
  'px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';
const secondaryBtn =
  'px-3 py-2 rounded-xl border border-white/12 text-[12px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';
const dangerOutlineBtn =
  'px-3 py-2 rounded-xl border border-white/25 text-[12px] text-white/90 hover:bg-white/[0.08] disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';
const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
    active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
  }`;
const inputClass =
  'apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

const STATUS_META: Record<LivInboxItemStatus, { label: string; dot: string }> = {
  auto_replied: { label: 'Auto-svaret', dot: 'bg-emerald-400' },
  draft: { label: 'Kladde klar', dot: 'bg-white/40' },
  escalated: { label: 'Kræver dig', dot: 'bg-amber-400' },
  sent: { label: 'Sendt', dot: 'bg-emerald-400' },
  dismissed: { label: 'Afvist', dot: 'bg-white/30' },
};

function StatusBadge({ status }: { status: LivInboxItemStatus }) {
  const meta = STATUS_META[status];
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
      <span className={`size-1.5 rounded-full ${meta.dot}`} /> {meta.label}
    </span>
  );
}

function Chevron({ open }: { open: boolean }) {
  return (
    <svg
      className={`size-3.5 shrink-0 text-white/25 transition-transform ${open ? 'rotate-180' : ''}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      aria-hidden
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 9l6 6 6-6" />
    </svg>
  );
}

function InboxItemCard({
  item,
  busy,
  editingId,
  editingText,
  onStartEdit,
  onCancelEdit,
  onChangeEdit,
  onAction,
}: {
  item: LivInboxItem;
  busy: boolean;
  editingId: string | null;
  editingText: string;
  onStartEdit: (item: LivInboxItem) => void;
  onCancelEdit: () => void;
  onChangeEdit: (value: string) => void;
  onAction: (id: string, action: 'approve_send' | 'dismiss' | 'update_draft', draftReply?: string) => void;
}) {
  const editing = editingId === item.id;
  const isTask = item.category === 'opgave';
  const canAct = item.status !== 'sent' && item.status !== 'dismissed';
  const canSend = canAct && !isTask && Boolean(item.draftReply?.trim());

  return (
    <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-[13px] font-medium text-white/90">{item.subject || '(intet emne)'}</p>
          <p className="truncate text-[11px] text-white/45">
            {item.fromName ? `${item.fromName} · ` : ''}
            {item.fromEmail}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {typeof item.confidence === 'number' && (
            <span className="text-[10px] text-white/40">{item.confidence}%</span>
          )}
          <StatusBadge status={item.status} />
        </div>
      </div>

      <div className="mt-2 flex flex-wrap items-center gap-2">
        {item.category && (
          <span className="text-[10px] uppercase tracking-wider text-white/35">{item.category}</span>
        )}
        {item.attachments && item.attachments.length > 0 && (
          <span className="inline-flex items-center gap-1.5 rounded-md border border-white/15 bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-white/70">
            <span className="size-1.5 rounded-full bg-white/40" />
            {item.attachments.length === 1
              ? item.attachments[0].filename
              : `${item.attachments.length} vedhæftninger`}
          </span>
        )}
        {item.contactNote && (
          <span
            className={`inline-flex items-center gap-1.5 rounded-md border px-1.5 py-0.5 text-[10px] ${
              item.contactKnown
                ? 'border-emerald-400/25 bg-emerald-400/[0.06] text-emerald-200/90'
                : 'border-white/12 bg-white/[0.04] text-white/50'
            }`}
          >
            <span className={`size-1.5 rounded-full ${item.contactKnown ? 'bg-emerald-400' : 'bg-white/40'}`} />
            {item.contactNote}
          </span>
        )}
      </div>

      {(item.sent || item.sendBlockedReason) && (
        <p className={`mt-1.5 text-[10px] ${item.sent ? 'text-emerald-300/85' : 'text-white/35'}`}>
          {item.sent
            ? `Sendt via ${item.sentVia === 'smtp' ? 'one.com' : 'Resend'}${
                item.sendRedirected ? ' (test-redirect)' : ''
              } → ${item.sentTo}${item.sentCopyArchived ? ' · arkiveret i Sendt' : ''}`
            : `Ikke afsendt: ${item.sendBlockedReason}`}
        </p>
      )}

      {item.reasoning && (
        <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
          <span className="text-white/35">Livs vurdering: </span>
          {item.reasoning}
        </p>
      )}

      {item.status === 'dismissed' && item.body && (
        <p className="mt-1.5 line-clamp-3 text-[11px] leading-relaxed text-white/40">{item.body}</p>
      )}

      {editing ? (
        <textarea
          className={`${inputClass} mt-2.5 min-h-[120px] resize-y`}
          value={editingText}
          onChange={(e) => onChangeEdit(e.target.value)}
        />
      ) : (
        item.draftReply &&
        item.status !== 'dismissed' && (
          <pre className="mt-2.5 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2.5 font-poppins text-[12px] leading-relaxed text-white/80">
            {item.draftReply}
          </pre>
        )
      )}

      {canAct && (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {editing ? (
            <>
              <button
                type="button"
                className={primaryBtn}
                disabled={busy}
                onClick={() => onAction(item.id, 'update_draft', editingText)}
              >
                Gem rettelse
              </button>
              <button type="button" className={secondaryBtn} disabled={busy} onClick={onCancelEdit}>
                Fortryd
              </button>
            </>
          ) : (
            <>
              {canSend && (
                <button
                  type="button"
                  className={primaryBtn}
                  disabled={busy}
                  onClick={() => onAction(item.id, 'approve_send', item.draftReply)}
                >
                  Godkend &amp; send
                </button>
              )}
              {item.draftReply && (
                <button type="button" className={secondaryBtn} disabled={busy} onClick={() => onStartEdit(item)}>
                  Rediger
                </button>
              )}
              <button
                type="button"
                className={dangerOutlineBtn}
                disabled={busy}
                onClick={() => onAction(item.id, 'dismiss')}
              >
                Afvis
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

function AutoToggle({
  enabled,
  busy,
  onToggle,
}: {
  enabled: boolean;
  busy: boolean;
  onToggle: (next: boolean) => void;
}) {
  return (
    <button
      type="button"
      disabled={busy}
      onClick={() => onToggle(!enabled)}
      className={`touch-target flex items-center gap-2 rounded-xl border px-3 py-1.5 transition-all duration-200 active:scale-[0.98] disabled:opacity-50 ${
        enabled
          ? 'border-emerald-400/30 bg-emerald-400/[0.08] text-white'
          : 'border-white/12 bg-white/[0.04] text-white/70 hover:bg-white/[0.07]'
      }`}
      title={enabled ? 'Liv svarer automatisk' : 'Liv laver kun kladder'}
    >
      <span
        className={`relative inline-flex h-4 w-7 items-center rounded-full transition-colors ${
          enabled ? 'bg-emerald-400/80' : 'bg-white/15'
        }`}
      >
        <span
          className={`inline-block size-3 rounded-full bg-white transition-transform ${
            enabled ? 'translate-x-3.5' : 'translate-x-0.5'
          }`}
        />
      </span>
      <span className="text-[12px] font-medium tracking-wide whitespace-nowrap">
        Auto-svar {enabled ? 'ON' : 'OFF'}
      </span>
    </button>
  );
}

export default function LivInboxClient({ embedded = false, onClose }: Props) {
  const [tab, setTab] = useState<DeskTab>('inbox');
  const [settings, setSettings] = useState<LivInboxSettings | null>(null);
  const [agentModel, setAgentModel] = useState<string>('');
  const [items, setItems] = useState<LivInboxItem[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // one.com inbox (IMAP) status + sync
  const [mailbox, setMailbox] = useState<{ user: string; host: string; configured: boolean } | null>(
    null
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [activity, setActivity] = useState<AuditEvent[]>([]);

  // Guidelines editor drafts
  const [guidelinesDraft, setGuidelinesDraft] = useState('');
  const [editorialFactsDraft, setEditorialFactsDraft] = useState('');
  const [signatureDraft, setSignatureDraft] = useState('');
  const [thresholdDraft, setThresholdDraft] = useState(70);
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState<string | null>(null);

  // Per-item draft editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');
  const [dismissedOpen, setDismissedOpen] = useState(false);

  const applySettings = useCallback((s: LivInboxSettings, model?: string) => {
    setSettings(s);
    setGuidelinesDraft(s.guidelines);
    setEditorialFactsDraft(s.editorialFacts || '');
    setSignatureDraft(s.signature);
    setThresholdDraft(s.confidenceThreshold);
    if (model) setAgentModel(model);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [sRes, iRes, mRes, aRes] = await Promise.all([
        fetch('/api/liv-inbox/settings').then((r) => r.json()),
        fetch('/api/liv-inbox/items').then((r) => r.json()),
        fetch('/api/liv-inbox/sync').then((r) => r.json()),
        fetch('/api/liv-inbox/activity').then((r) => r.json()),
      ]);
      if (sRes?.data?.settings) applySettings(sRes.data.settings, sRes.data.agentModel);
      if (iRes?.data?.items) setItems(iRes.data.items);
      if (iRes?.data?.metrics) setMetrics(iRes.data.metrics);
      if (mRes?.data?.mailbox) setMailbox(mRes.data.mailbox);
      if (aRes?.data?.events) setActivity(aRes.data.events);
    } catch {
      setError('Kunne ikke hente indbakken.');
    }
  }, [applySettings]);

  const runSync = useCallback(async () => {
    setSyncing(true);
    setSyncMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/liv-inbox/sync', { method: 'POST' }).then((r) => r.json());
      if (res?.data?.summary) {
        const s = res.data.summary;
        setSyncMsg(`Hentet ${s.processed} ny(e), sprang ${s.skipped} over.`);
        await loadAll();
      } else {
        setError(res?.error || 'Kunne ikke hente mails.');
      }
    } catch {
      setError('Kunne ikke hente mails fra one.com.');
    } finally {
      setSyncing(false);
    }
  }, [loadAll]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const toggleAuto = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch('/api/liv-inbox/settings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ autoRespond: next, updatedBy: 'studio' }),
        }).then((r) => r.json());
        if (res?.data?.settings) applySettings(res.data.settings, res.data.agentModel);
        else setError(res?.error || 'Kunne ikke opdatere.');
      } catch {
        setError('Kunne ikke opdatere auto-svar.');
      } finally {
        setBusy(false);
      }
    },
    [applySettings]
  );

  const saveGuidelines = useCallback(async () => {
    setBusy(true);
    setError(null);
    setGuidelinesSaved(false);
    try {
      const res = await fetch('/api/liv-inbox/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          guidelines: guidelinesDraft,
          editorialFacts: editorialFactsDraft,
          signature: signatureDraft,
          confidenceThreshold: thresholdDraft,
          updatedBy: 'studio',
        }),
      }).then((r) => r.json());
      if (res?.data?.settings) {
        applySettings(res.data.settings, res.data.agentModel);
        setGuidelinesSaved(true);
        setTimeout(() => setGuidelinesSaved(false), 2500);
      } else {
        setError(res?.error || 'Kunne ikke gemme.');
      }
    } catch {
      setError('Kunne ikke gemme retningslinjer.');
    } finally {
      setBusy(false);
    }
  }, [guidelinesDraft, editorialFactsDraft, signatureDraft, thresholdDraft, applySettings]);

  const seedMemory = useCallback(async () => {
    setSeeding(true);
    setSeedMsg(null);
    setError(null);
    try {
      const res = await fetch('/api/accreditation/memory/sync', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'sync' }),
      }).then((r) => r.json());
      const d = res?.data;
      if (d && (d.ok || d.imported !== undefined)) {
        setSeedMsg(`Hukommelse opdateret: ${d.upserted ?? 0} kontakter (${d.imported ?? 0} nye).`);
        await loadAll();
      } else {
        setError(res?.error || 'Kunne ikke seede hukommelsen.');
      }
    } catch {
      setError('Kunne ikke seede hukommelsen fra historikken.');
    } finally {
      setSeeding(false);
    }
  }, [loadAll]);

  const itemAction = useCallback(
    async (id: string, action: 'approve_send' | 'dismiss' | 'update_draft', draftReply?: string) => {
      setBusy(true);
      setError(null);
      try {
        const res = await fetch(`/api/liv-inbox/items/${id}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action, draftReply }),
        }).then((r) => r.json());
        if (res?.data?.item) {
          setEditingId(null);
          await loadAll();
        } else {
          setError(res?.error || 'Handlingen fejlede.');
        }
      } catch {
        setError('Handlingen fejlede.');
      } finally {
        setBusy(false);
      }
    },
    [loadAll]
  );

  const openItems = useMemo(() => items.filter((i) => i.status !== 'dismissed'), [items]);
  const dismissedItems = useMemo(() => items.filter((i) => i.status === 'dismissed'), [items]);

  const counts = useMemo(() => {
    return {
      escalated: openItems.filter((i) => i.status === 'escalated').length,
      draft: openItems.filter((i) => i.status === 'draft').length,
      autoReplied: openItems.filter((i) => i.status === 'auto_replied').length,
      dismissed: dismissedItems.length,
    };
  }, [openItems, dismissedItems]);

  const tabs: { id: DeskTab; label: string }[] = [
    { id: 'inbox', label: 'Indbakke' },
    { id: 'activity', label: 'Aktivitet' },
    { id: 'guidelines', label: 'Retningslinjer' },
  ];

  return (
    <div className="flex flex-col h-full min-h-0 text-white bg-transparent font-poppins">
      <EmbeddedAppHeader
        embedded={embedded}
        title="Liv Indbakke"
        subtitle="Liv svarer proaktivt og rækker kun ud, når hun er i tvivl"
        onClose={onClose}
        trailing={
          <div className="flex flex-wrap items-center gap-2">
            <AutoToggle enabled={settings?.autoRespond === true} busy={busy} onToggle={toggleAuto} />
            <div className="flex flex-wrap items-center gap-1">
              {tabs.map((t) => (
                <button key={t.id} type="button" className={segBtn(tab === t.id)} onClick={() => setTab(t.id)}>
                  {t.label}
                </button>
              ))}
            </div>
          </div>
        }
      />

      <main className="flex-1 min-h-0 overflow-y-auto nice-scrollbar px-3 py-3 lg:px-4 lg:py-4">
        {error && (
          <div className="mb-3 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3.5 py-2.5 text-[12px] text-red-400/95">
            {error}
          </div>
        )}

        {tab === 'inbox' && (
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-[12px] font-medium text-white/80">
                    <span
                      className={`size-1.5 rounded-full ${
                        mailbox?.configured ? 'bg-emerald-400' : 'bg-amber-400'
                      }`}
                    />
                    Livs indbakke · one.com
                  </p>
                  <p className="mt-0.5 truncate text-[10px] text-white/40">
                    {mailbox
                      ? `${mailbox.user} · ${mailbox.host}${
                          mailbox.configured ? '' : ' · adgangskode mangler (LIV_IMAP_PASSWORD)'
                        }`
                      : 'Henter forbindelsesstatus…'}
                  </p>
                  {syncMsg && <p className="mt-1 text-[10px] text-emerald-300">{syncMsg}</p>}
                </div>
                <button
                  type="button"
                  className={`${secondaryBtn} touch-target min-h-11 px-4`}
                  disabled={syncing || !mailbox?.configured}
                  onClick={runSync}
                  title={
                    mailbox?.configured
                      ? 'Hent nye mails fra Livs one.com-indbakke'
                      : 'Sæt LIV_IMAP_PASSWORD for at forbinde'
                  }
                >
                  {syncing ? 'Henter…' : 'Hent nye mails'}
                </button>
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-white/55">
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-amber-400" /> {counts.escalated} kræver dig
                </span>
                <span className="text-white/20">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-white/40" /> {counts.draft} kladder
                </span>
                <span className="text-white/20">·</span>
                <span className="inline-flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-emerald-400" /> {counts.autoReplied} auto-svaret
                </span>
                {counts.dismissed > 0 && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="inline-flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-white/30" /> {counts.dismissed} afvist
                    </span>
                  </>
                )}
                {agentModel && (
                  <>
                    <span className="text-white/20">·</span>
                    <span className="text-white/45">Intelligens: {agentModel}</span>
                  </>
                )}
              </div>
            </div>

            <div className="flex flex-col gap-3">
              {openItems.length === 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-8 text-center text-[12px] text-white/40">
                  {dismissedItems.length
                    ? 'Ingen åbne henvendelser. Afviste ligger nedenfor.'
                    : 'Ingen henvendelser endnu. Tryk Hent nye mails, eller vent på næste auto-hentning.'}
                </div>
              )}
              {openItems.map((item) => (
                <InboxItemCard
                  key={item.id}
                  item={item}
                  busy={busy}
                  editingId={editingId}
                  editingText={editingText}
                  onStartEdit={(it) => {
                    setEditingId(it.id);
                    setEditingText(it.draftReply || '');
                  }}
                  onCancelEdit={() => setEditingId(null)}
                  onChangeEdit={setEditingText}
                  onAction={itemAction}
                />
              ))}
            </div>

            {dismissedItems.length > 0 && (
              <div>
                <button
                  type="button"
                  onClick={() => setDismissedOpen((v) => !v)}
                  className={`flex items-center gap-3 w-full px-3.5 py-2.5 rounded-xl border transition-all duration-200 active:scale-[0.98] ${
                    dismissedOpen
                      ? 'border-white/15 bg-white/[0.05]'
                      : 'border-white/[0.06] hover:bg-white/[0.03]'
                  }`}
                >
                  <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-white/50">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <p className="text-[12px] font-medium text-white/80">Afvist</p>
                    <p className="text-[10px] text-white/30 truncate">
                      {dismissedItems.length} mail{dismissedItems.length === 1 ? '' : 's'} — skjult fra overblikket
                    </p>
                  </div>
                  <Chevron open={dismissedOpen} />
                </button>
                {dismissedOpen && (
                  <div className="mt-2 flex flex-col gap-2">
                    {dismissedItems.map((item) => (
                      <InboxItemCard
                        key={item.id}
                        item={item}
                        busy={busy}
                        editingId={null}
                        editingText=""
                        onStartEdit={() => undefined}
                        onCancelEdit={() => undefined}
                        onChangeEdit={() => undefined}
                        onAction={itemAction}
                      />
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {tab === 'guidelines' && (
          <div className="flex flex-col gap-4">
            <div>
              <p className="text-[12px] font-medium text-white/80">Livs retningslinjer og kontekst</p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Beskriv hvordan I normalt behandler henvendelser. Det er Livs regler og kontekst - hun følger dem, når
                hun svarer, og eskalerer det, I beder hende om at være varsom med.
              </p>
              <textarea
                className={`${inputClass} mt-2 min-h-[240px] resize-y`}
                value={guidelinesDraft}
                onChange={(e) => setGuidelinesDraft(e.target.value)}
              />
            </div>

            <div>
              <p className="text-[12px] font-medium text-white/80">Redaktionelle fakta</p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Hvad dækker vi, hvad er allerede planlagt, deadlines, hvem skriver hvad. Liv bruger det til at svare
                præcist (fx &quot;vi dækker allerede den festival&quot;) i stedet for generisk. Aktive sager fra
                akkrediterings-arket tilføjes automatisk.
              </p>
              <textarea
                className={`${inputClass} mt-2 min-h-[140px] resize-y`}
                value={editorialFactsDraft}
                onChange={(e) => setEditorialFactsDraft(e.target.value)}
                placeholder={'Fx:\n- Vi dækker Roskilde, Northside og SPOT i 2026.\n- Anmelder koncerter/festivaler, ikke albums.\n- Deadline for sommernummer: 1. juni.'}
              />
            </div>

            <div>
              <p className="text-[12px] font-medium text-white/80">Signatur</p>
              <textarea
                className={`${inputClass} mt-2 min-h-[80px] resize-y`}
                value={signatureDraft}
                onChange={(e) => setSignatureDraft(e.target.value)}
              />
            </div>

            <div>
              <p className="text-[12px] font-medium text-white/80">
                Tryghedstærskel: {thresholdDraft}%
              </p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Er Liv mindre sikker end dette, rækker hun ud til dig i stedet for at svare selv.
              </p>
              <input
                type="range"
                min={0}
                max={100}
                step={5}
                value={thresholdDraft}
                onChange={(e) => setThresholdDraft(Number(e.target.value))}
                className="mt-2 w-full accent-white/80"
              />
            </div>

            <div className="flex items-center gap-3">
              <button type="button" className={primaryBtn} disabled={busy} onClick={saveGuidelines}>
                {busy ? 'Gemmer…' : 'Gem retningslinjer'}
              </button>
              {guidelinesSaved && <span className="text-[11px] text-emerald-300">Gemt</span>}
            </div>

            <div className="rounded-xl border border-white/[0.06] p-3.5">
              <p className="text-[12px] font-medium text-white/80">Hukommelse</p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Seed Livs hukommelse fra den eksisterende mailboks-historik, så hun kender etablerede relationer fra
                dag ét (kendt vs. ny afsender som eksplicit signal).
              </p>
              <div className="mt-2 flex items-center gap-3">
                <button
                  type="button"
                  className={secondaryBtn}
                  style={{ width: 'auto', paddingInline: '1rem' }}
                  disabled={seeding}
                  onClick={seedMemory}
                >
                  {seeding ? 'Seeder…' : 'Seed hukommelse'}
                </button>
                {seedMsg && <span className="text-[11px] text-emerald-300">{seedMsg}</span>}
              </div>
            </div>
          </div>
        )}

        {tab === 'activity' && (
          <div className="flex flex-col gap-4">
            {/* Metrics */}
            <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
              {[
                { label: 'Behandlet', value: metrics ? String(metrics.handled) : '-' },
                {
                  label: 'Gns. sikkerhed',
                  value: metrics?.avgConfidence != null ? `${metrics.avgConfidence}%` : '-',
                },
                { label: 'Eskaleringsrate', value: metrics ? `${metrics.escalationRate}%` : '-' },
                { label: 'Kendte kontakter', value: metrics ? String(metrics.knownContacts) : '-' },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3">
                  <p className="text-[18px] font-medium text-white/90">{m.value}</p>
                  <p className="mt-0.5 text-[10px] uppercase tracking-wider text-white/40">{m.label}</p>
                </div>
              ))}
            </div>

            {/* Timeline */}
            <div>
              <p className="mb-2 text-[12px] font-medium text-white/80">Seneste aktivitet</p>
              <div className="flex flex-col gap-1.5">
                {activity.length === 0 && (
                  <p className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-6 text-center text-[12px] text-white/40">
                    Ingen aktivitet endnu.
                  </p>
                )}
                {activity.map((e) => (
                  <div
                    key={e.id}
                    className="flex items-center justify-between gap-3 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2"
                  >
                    <div className="min-w-0">
                      <span className="text-[11px] font-medium text-white/80">
                        {AUDIT_LABEL[e.type] || e.type}
                      </span>
                      {(e.subject || e.detail) && (
                        <span className="ml-2 text-[11px] text-white/45">
                          {e.subject || e.detail}
                        </span>
                      )}
                    </div>
                    <span className="shrink-0 text-[10px] text-white/30">
                      {new Date(e.at).toLocaleString('da-DK', {
                        day: '2-digit',
                        month: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
