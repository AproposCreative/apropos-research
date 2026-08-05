'use client';

import { useEffect, useState } from 'react';
import StepChip from '@/components/ui/StepChip';

type EventPreview = {
  url: string;
  artist: string;
  venue?: string;
  eventDate?: string;
  promoter?: string;
};

type ChatMessage = {
  id: string;
  role: string;
  content: string;
};

type ResearchPreview = {
  research: {
    contactName: string | null;
    contactEmail: string | null;
    promoter: string | null;
    contactConfidence: string;
    ambiguous: boolean;
    previousCoverageUrl: string | null;
    historyMatched: boolean;
    sources: { title: string; url?: string }[];
  };
  plan: {
    subject: string;
    text: string;
    followUp: string;
    delivery: string;
  };
};

type Props = {
  onBack: () => void;
  onCreated: (requestId: string) => void;
  onStepChange?: (step: number, total: number) => void;
};

const fieldClass =
  'w-full rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2.5 text-xs text-white outline-none transition-colors placeholder:text-white/30 focus:border-white/30';

const optionClass = (selected: boolean) =>
  `rounded-lg border px-3 py-1.5 text-xs transition-all ${
    selected
      ? 'border-white/40 bg-white/10 text-white'
      : 'border-white/10 bg-white/5 text-white/70 hover:border-white/20 hover:bg-white/10'
  }`;

function unwrap<T>(data: { data?: T } & T): T {
  return (data as { data?: T }).data ?? (data as T);
}

export default function AccreditationSetupFlow({
  onBack,
  onCreated,
  onStepChange,
}: Props) {
  const [step, setStep] = useState<0 | 1 | 2 | 3>(0);
  const [eventUrl, setEventUrl] = useState('');
  const [preview, setPreview] = useState<EventPreview | null>(null);
  const [artist, setArtist] = useState('');
  const [venue, setVenue] = useState('');
  const [eventDate, setEventDate] = useState('');
  const [ticketQuantity, setTicketQuantity] = useState(1);
  const [ticketType, setTicketType] = useState('presse');
  const [recipientName, setRecipientName] = useState('');
  const [recipientEmail, setRecipientEmail] = useState('');
  const [chatThreadId, setChatThreadId] = useState<string | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchPreview, setResearchPreview] = useState<ResearchPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [automationOn, setAutomationOn] = useState(false);

  useEffect(() => {
    onStepChange?.(step + 1, 4);
  }, [step, onStepChange]);

  useEffect(() => {
    void (async () => {
      try {
        const res = await fetch('/api/accreditation/tickets');
        const json = unwrap(await res.json()) as {
          control?: { automationEnabled?: boolean };
        };
        setAutomationOn(json.control?.automationEnabled === true);
      } catch {
        setAutomationOn(false);
      }
    })();
  }, []);

  async function analyzeLink() {
    if (!eventUrl.trim()) return;
    setBusy(true);
    setError(null);
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
      setPreview(json.extracted);
      setArtist(json.extracted.artist || '');
      setVenue(json.extracted.venue || '');
      setEventDate(json.extracted.eventDate || '');
      setStep(1);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  async function askLiv(message: string) {
    const clean = message.trim();
    if (!clean || chatBusy) return;
    setChatBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accreditation/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: clean, threadId: chatThreadId }),
      });
      const json = unwrap(await res.json()) as {
        thread?: { id: string; messages: ChatMessage[] };
        error?: string;
      };
      if (!res.ok || !json.thread) {
        throw new Error(json.error || 'Liv kunne ikke svare');
      }
      setChatThreadId(json.thread.id);
      setChatMessages(json.thread.messages || []);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setChatBusy(false);
    }
  }

  async function runResearchPreview() {
    setResearchBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accreditation/research-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventUrl,
          artist,
          venue,
          eventDate,
          recipientName,
          recipientEmail,
          ticketQuantity,
          ticketType,
          promoter: preview?.promoter,
        }),
      });
      const json = unwrap(await res.json()) as ResearchPreview & { error?: string };
      if (!res.ok || !json.research || !json.plan) {
        throw new Error(json.error || 'Livs research kunne ikke gennemføres');
      }
      setResearchPreview(json);
      const contact = [json.research.contactName, json.research.contactEmail]
        .filter(Boolean)
        .join(', ');
      await askLiv(
        [
          `Opsummer din plan for ${artist} til mig før godkendelse.`,
          `Roller: Liv Brandt er afsender. ${recipientName} er skribent og billetmodtager. Pressepersonen eller arrangøren er modtager af ansøgningen.`,
          `Research fandt kontakt: ${contact || 'ingen sikker kontakt endnu'}.`,
          `Promoter: ${json.research.promoter || 'ikke bekræftet'}.`,
          `Tidligere dialog: ${json.research.historyMatched ? 'ja' : 'ikke fundet'}.`,
          `Første mailemne: ${json.plan.subject}.`,
          'Forklar kort, hvem du vil kontakte, hvad du vil skrive, hvornår du følger op, og hvad der kræver min opmærksomhed.',
          'Send ikke nogen mail.',
        ].join('\n')
      );
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setResearchBusy(false);
    }
  }

  async function createAccreditation() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/accreditation/intake', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventUrl,
          artist,
          venue,
          eventDate,
          recipientName,
          recipientEmail,
          ticketQuantity,
          ticketType,
          runPipeline: true,
        }),
      });
      const json = unwrap(await res.json()) as {
        request?: string;
        error?: string;
      };
      if (!res.ok || !json.request) {
        throw new Error(json.error || 'Sagen kunne ikke oprettes');
      }
      onCreated(json.request);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setBusy(false);
    }
  }

  const steps = [
    { id: 0, label: 'Event' },
    { id: 1, label: 'Dato' },
    { id: 2, label: 'Adgang' },
    { id: 3, label: 'Liv' },
  ] as const;

  return (
    <div className="bg-black rounded-xl p-2 md:p-3">
      <div className="mb-3 flex flex-wrap items-center gap-2 md:gap-[14px]">
        {steps.map((item) => (
          <StepChip
            key={item.id}
            stepKey={`accreditation-${item.id}`}
            active={step === item.id}
            done={step > item.id}
            label={item.label}
            onClick={() => {
              if (item.id <= step) setStep(item.id);
            }}
          />
        ))}
        <button
          type="button"
          onClick={onBack}
          className="ml-auto text-[10px] text-white/40 hover:text-white/70"
        >
          Tilbage til artikel
        </button>
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-red-300/20 bg-red-300/[0.05] px-3 py-2 text-xs text-red-100/80">
          {error}
        </div>
      )}

      {step === 0 && (
        <div className="space-y-3">
          <div className="text-white/80 text-sm">Indsæt link til koncert eller festival</div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              className={fieldClass}
              placeholder="https://"
              value={eventUrl}
              onChange={(event) => setEventUrl(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && eventUrl.trim() && !busy) {
                  event.preventDefault();
                  void analyzeLink();
                }
              }}
            />
            <button
              type="button"
              className="min-h-10 shrink-0 rounded-lg border border-white/20 bg-white/5 px-4 text-xs text-white hover:bg-white/10 disabled:opacity-40"
              disabled={busy || !eventUrl.trim()}
              onClick={() => void analyzeLink()}
            >
              {busy ? 'Liv undersøger' : 'Find event'}
            </button>
          </div>
          <p className="text-[11px] text-white/35">
            Liv finder artist, venue, dato og den relevante presseindgang.
          </p>
        </div>
      )}

      {step === 1 && preview && (
        <div className="space-y-3">
          <div className="text-white/80 text-sm">Bekræft event og dato</div>
          <div className="rounded-lg border border-white/10 bg-white/[0.04] p-3">
            <p className="text-sm font-medium text-white">{artist}</p>
            <p className="mt-1 text-xs text-white/45">
              {[venue, eventDate].filter(Boolean).join(' · ') || 'Ret oplysningerne nedenfor'}
            </p>
            {preview.promoter && (
              <p className="mt-1 text-[10px] text-white/30">Arrangør: {preview.promoter}</p>
            )}
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            <input className={fieldClass} placeholder="Artist" value={artist} onChange={(event) => setArtist(event.target.value)} />
            <input className={fieldClass} placeholder="Venue" value={venue} onChange={(event) => setVenue(event.target.value)} />
            <input className={fieldClass} placeholder="Dato" value={eventDate} onChange={(event) => setEventDate(event.target.value)} />
          </div>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40"
            disabled={!artist.trim() || !eventDate.trim()}
            onClick={() => setStep(2)}
          >
            Fortsæt
          </button>
        </div>
      )}

      {step === 2 && (
        <div className="space-y-4">
          <div className="text-white/80 text-sm">Vælg adgang og skribent</div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/35">Billetantal</p>
            <div className="flex flex-wrap gap-2">
              {[1, 2, 3].map((quantity) => (
                <button
                  key={quantity}
                  type="button"
                  className={optionClass(ticketQuantity === quantity)}
                  onClick={() => setTicketQuantity(quantity)}
                >
                  {quantity}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-white/35">Type</p>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'presse', label: 'Presse' },
                { id: 'staapladser', label: 'Ståplads' },
                { id: 'photo', label: 'Fotopas' },
              ].map((option) => (
                <button
                  key={option.id}
                  type="button"
                  className={optionClass(ticketType === option.id)}
                  onClick={() => setTicketType(option.id)}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              className={fieldClass}
              placeholder="Hvem skal have akkrediteringen?"
              value={recipientName}
              onChange={(event) => setRecipientName(event.target.value)}
            />
            <input
              className={fieldClass}
              type="email"
              placeholder="Skribentens email"
              value={recipientEmail}
              onChange={(event) => setRecipientEmail(event.target.value)}
            />
          </div>
          <button
            type="button"
            className="rounded-lg border border-white/20 bg-white/5 px-4 py-2 text-xs text-white hover:bg-white/10 disabled:opacity-40"
            disabled={!recipientName.trim() || !recipientEmail.includes('@')}
            onClick={() => {
              setStep(3);
              void runResearchPreview();
            }}
          >
            Lad Liv researche og gennemgå
          </button>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-3">
          <div className="text-white/80 text-sm">Gennemgå med Liv før første mail</div>
          {researchBusy && (
            <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <p className="text-xs text-white/70">Liv researcher kontakt og tidligere dialog...</p>
              <div className="mt-2 h-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full w-2/3 animate-pulse rounded-full bg-white/70" />
              </div>
            </div>
          )}
          {researchPreview && (
            <div className="space-y-2 rounded-lg border border-white/10 bg-white/[0.04] p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-white">Livs plan</p>
                <span className="rounded-full border border-white/10 px-2 py-0.5 text-[9px] uppercase tracking-wider text-white/45">
                  {researchPreview.research.contactConfidence}
                </span>
              </div>
              <div className="grid gap-2 text-[11px] text-white/65 sm:grid-cols-2">
                <p>
                  <span className="text-white/35">Kontakt</span><br />
                  {researchPreview.research.contactName || researchPreview.research.promoter || 'Ikke sikkert endnu'}
                  {researchPreview.research.contactEmail
                    ? `, ${researchPreview.research.contactEmail}`
                    : ''}
                </p>
                <p>
                  <span className="text-white/35">Tidligere dialog</span><br />
                  {researchPreview.research.historyMatched ? 'Fundet i arkivet' : 'Ikke fundet i arkivet'}
                </p>
                <p className="sm:col-span-2">
                  <span className="text-white/35">Første mail</span><br />
                  {researchPreview.plan.subject}
                </p>
                <p>
                  <span className="text-white/35">Opfølgning</span><br />
                  {researchPreview.plan.followUp}
                </p>
                <p>
                  <span className="text-white/35">Afslutning</span><br />
                  {researchPreview.plan.delivery}
                </p>
              </div>
            </div>
          )}
          <div className="grid gap-2 rounded-lg border border-white/10 bg-white/[0.04] p-3 text-xs text-white/70 sm:grid-cols-2">
            <p>{artist}<br /><span className="text-white/35">{venue}, {eventDate}</span></p>
            <p>{recipientName}<br /><span className="text-white/35">{ticketQuantity} billet, {ticketType}</span></p>
          </div>
          <div className="max-h-44 space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-white/[0.02] p-3 nice-scrollbar">
            {chatBusy && chatMessages.length === 0 && (
              <p className="text-xs text-white/40">Liv gennemgår detaljerne...</p>
            )}
            {chatMessages.slice(-4).map((message) => (
              <p
                key={message.id}
                className={`text-xs leading-relaxed ${
                  message.role === 'user' ? 'text-white/40' : 'text-white/80'
                }`}
              >
                {message.role === 'user' ? 'Dig: ' : 'Liv: '}
                {message.content}
              </p>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              className={fieldClass}
              placeholder="Spørg Liv eller bed om en rettelse"
              value={chatInput}
              onChange={(event) => setChatInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && chatInput.trim() && !chatBusy) {
                  event.preventDefault();
                  const message = chatInput;
                  setChatInput('');
                  void askLiv(message);
                }
              }}
            />
            <button
              type="button"
              className="rounded-lg border border-white/20 px-3 text-xs text-white/70 disabled:opacity-40"
              disabled={chatBusy || !chatInput.trim()}
              onClick={() => {
                const message = chatInput;
                setChatInput('');
                void askLiv(message);
              }}
            >
              Send
            </button>
          </div>
          {!automationOn && (
            <p className="rounded-lg border border-amber-300/15 bg-amber-300/[0.04] px-3 py-2 text-[10px] text-amber-100/65">
              Liv er OFF. Sagen og første mailudkast oprettes, men intet sendes automatisk.
            </p>
          )}
          <button
            type="button"
            className="rounded-lg border border-white/30 bg-white/10 px-4 py-2 text-xs text-white hover:bg-white/15 disabled:opacity-40"
            disabled={busy || chatBusy || researchBusy || !researchPreview}
            onClick={() => void createAccreditation()}
          >
            {busy ? 'Opretter sag' : 'Godkend og lad Liv tage sagen'}
          </button>
        </div>
      )}
    </div>
  );
}
