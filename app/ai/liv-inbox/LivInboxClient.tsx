'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import type { LivInboxItem, LivInboxItemStatus, LivInboxSettings } from '@/lib/liv-inbox/types';

type Props = { embedded?: boolean; onClose?: () => void };
type DeskTab = 'inbox' | 'guidelines';

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
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // one.com inbox (IMAP) status + sync
  const [mailbox, setMailbox] = useState<{ user: string; host: string; configured: boolean } | null>(
    null
  );
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState<string | null>(null);

  // Simulate-inbound form
  const [fromEmail, setFromEmail] = useState('');
  const [fromName, setFromName] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  // Guidelines editor drafts
  const [guidelinesDraft, setGuidelinesDraft] = useState('');
  const [signatureDraft, setSignatureDraft] = useState('');
  const [thresholdDraft, setThresholdDraft] = useState(70);
  const [guidelinesSaved, setGuidelinesSaved] = useState(false);

  // Per-item draft editing
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingText, setEditingText] = useState('');

  const applySettings = useCallback((s: LivInboxSettings, model?: string) => {
    setSettings(s);
    setGuidelinesDraft(s.guidelines);
    setSignatureDraft(s.signature);
    setThresholdDraft(s.confidenceThreshold);
    if (model) setAgentModel(model);
  }, []);

  const loadAll = useCallback(async () => {
    setError(null);
    try {
      const [sRes, iRes, mRes] = await Promise.all([
        fetch('/api/liv-inbox/settings').then((r) => r.json()),
        fetch('/api/liv-inbox/items').then((r) => r.json()),
        fetch('/api/liv-inbox/sync').then((r) => r.json()),
      ]);
      if (sRes?.data?.settings) applySettings(sRes.data.settings, sRes.data.agentModel);
      if (iRes?.data?.items) setItems(iRes.data.items);
      if (mRes?.data?.mailbox) setMailbox(mRes.data.mailbox);
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
  }, [guidelinesDraft, signatureDraft, thresholdDraft, applySettings]);

  const runSimulate = useCallback(async () => {
    if (!fromEmail.trim() || !body.trim()) {
      setError('Udfyld mindst afsender-email og mailtekst.');
      return;
    }
    setProcessing(true);
    setError(null);
    try {
      const res = await fetch('/api/liv-inbox/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fromEmail, fromName, subject, body }),
      }).then((r) => r.json());
      if (res?.data?.item) {
        setBody('');
        setSubject('');
        setFromName('');
        setFromEmail('');
        await loadAll();
      } else {
        setError(res?.error || 'Liv kunne ikke behandle mailen.');
      }
    } catch {
      setError('Liv kunne ikke behandle mailen.');
    } finally {
      setProcessing(false);
    }
  }, [fromEmail, fromName, subject, body, loadAll]);

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

  const counts = useMemo(() => {
    return {
      escalated: items.filter((i) => i.status === 'escalated').length,
      draft: items.filter((i) => i.status === 'draft').length,
      autoReplied: items.filter((i) => i.status === 'auto_replied').length,
    };
  }, [items]);

  const tabs: { id: DeskTab; label: string }[] = [
    { id: 'inbox', label: 'Indbakke' },
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

      <main className="flex-1 min-h-0 overflow-y-auto nice-scrollbar px-3 py-4 lg:px-5">
        {error && (
          <div className="mb-4 rounded-xl border border-red-400/30 bg-red-400/[0.06] px-3.5 py-2.5 text-[12px] text-red-400/95">
            {error}
          </div>
        )}

        {tab === 'inbox' && (
          <div className="flex flex-col gap-5">
            {/* Status strip */}
            <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/55">
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
              {agentModel && (
                <>
                  <span className="text-white/20">·</span>
                  <span className="text-white/45">Intelligens: {agentModel}</span>
                </>
              )}
            </div>

            {/* one.com inbox connection + sync */}
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
                  className={secondaryBtn}
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
            </div>

            {/* Simulate inbound */}
            <div className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
              <p className="text-[12px] font-medium text-white/80">Test en indgående mail</p>
              <p className="mt-0.5 text-[10px] text-white/40">
                Indsæt en mail, som var den lige landet i Livs indbakke. Hun læser den, følger jeres retningslinjer og
                beslutter, om hun svarer selv eller rækker ud til dig.
              </p>
              <div className="mt-3 grid grid-cols-1 gap-2 md:grid-cols-2">
                <input
                  className={inputClass}
                  placeholder="Afsender-email (fx presse@venue.dk)"
                  value={fromEmail}
                  onChange={(e) => setFromEmail(e.target.value)}
                />
                <input
                  className={inputClass}
                  placeholder="Afsendernavn (valgfrit)"
                  value={fromName}
                  onChange={(e) => setFromName(e.target.value)}
                />
              </div>
              <input
                className={`${inputClass} mt-2`}
                placeholder="Emne"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
              />
              <textarea
                className={`${inputClass} mt-2 min-h-[110px] resize-y`}
                placeholder="Mailens tekst…"
                value={body}
                onChange={(e) => setBody(e.target.value)}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <span className="text-[10px] text-white/35">
                  {settings?.autoRespond
                    ? 'Auto-svar er ON: Liv sender selv, når hun er sikker.'
                    : 'Auto-svar er OFF: Liv laver kladder til din gennemgang.'}
                </span>
                <button type="button" className={primaryBtn} disabled={processing} onClick={runSimulate}>
                  {processing ? 'Liv læser…' : 'Lad Liv svare'}
                </button>
              </div>
            </div>

            {/* Inbox items */}
            <div className="flex flex-col gap-3">
              {items.length === 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-4 py-8 text-center text-[12px] text-white/40">
                  Ingen henvendelser endnu. Test en mail ovenfor for at se Liv arbejde.
                </div>
              )}
              {items.map((item) => (
                <div key={item.id} className="rounded-xl border border-white/[0.08] bg-white/[0.02] p-3.5">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-[13px] font-medium text-white/90">
                        {item.subject || '(intet emne)'}
                      </p>
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

                  {item.category && (
                    <p className="mt-2 text-[10px] uppercase tracking-wider text-white/35">{item.category}</p>
                  )}

                  {item.reasoning && (
                    <p className="mt-1.5 text-[11px] leading-relaxed text-white/55">
                      <span className="text-white/35">Livs vurdering: </span>
                      {item.reasoning}
                    </p>
                  )}

                  {editingId === item.id ? (
                    <textarea
                      className={`${inputClass} mt-2.5 min-h-[120px] resize-y`}
                      value={editingText}
                      onChange={(e) => setEditingText(e.target.value)}
                    />
                  ) : (
                    item.draftReply && (
                      <pre className="mt-2.5 whitespace-pre-wrap rounded-lg border border-white/[0.06] bg-black/30 px-3 py-2.5 font-poppins text-[12px] leading-relaxed text-white/80">
                        {item.draftReply}
                      </pre>
                    )
                  )}

                  {item.status !== 'sent' && item.status !== 'dismissed' && (
                    <div className="mt-3 flex flex-wrap items-center gap-2">
                      {editingId === item.id ? (
                        <>
                          <button
                            type="button"
                            className={primaryBtn}
                            disabled={busy}
                            onClick={() => itemAction(item.id, 'update_draft', editingText)}
                          >
                            Gem rettelse
                          </button>
                          <button
                            type="button"
                            className={secondaryBtn}
                            disabled={busy}
                            onClick={() => setEditingId(null)}
                          >
                            Fortryd
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className={primaryBtn}
                            disabled={busy}
                            onClick={() => itemAction(item.id, 'approve_send', item.draftReply)}
                          >
                            Godkend &amp; send
                          </button>
                          <button
                            type="button"
                            className={secondaryBtn}
                            disabled={busy}
                            onClick={() => {
                              setEditingId(item.id);
                              setEditingText(item.draftReply || '');
                            }}
                          >
                            Rediger
                          </button>
                          <button
                            type="button"
                            className={dangerOutlineBtn}
                            disabled={busy}
                            onClick={() => itemAction(item.id, 'dismiss')}
                          >
                            Afvis
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
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
          </div>
        )}
      </main>
    </div>
  );
}
