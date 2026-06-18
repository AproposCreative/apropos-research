'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { EmbeddedAppHeader, EmbeddedSectionLabel } from '@/components/embedded-app';
import {
  EDITORIAL_ARTICLE_TYPE_OPTIONS,
  EDITORIAL_SIGNAL_PUBLISHED_EVENT,
  addCoveredEditorialTopic,
  addPublishedEditorialSignalId,
  getEditorialArticleTypeOption,
  isEditorialTopicCovered,
  readCoveredEditorialTopics,
  readPublishedEditorialSignalIds,
  type CoveredEditorialTopic,
  type EditorialArticleType,
} from '@/lib/editorial/signal-store';
import type { EditorialResearchResult, EditorialSignal, QualityGate } from '@/lib/editorial/types';

type DeskTab = 'radar' | 'brief' | 'workflow';
type ApprovedBriefPayload = {
  signalId: string;
  signalTitle: string;
  briefText: string;
  articleType: EditorialArticleType;
  targetWordCount: number;
  targetLengthLabel: string;
  editorialResearch?: EditorialResearchResult;
};

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const secondaryBtn =
  'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const signals: EditorialSignal[] = [
  {
    id: 'festival-lineups',
    title: 'Festivalprogrammerne begynder at ligne streaminglogik',
    source: 'Radar: musik, kulturkalender, SoMe',
    beat: 'Kultur',
    urgency: 82,
    originality: 76,
    brandFit: 91,
    risk: 28,
    audience: 'Kulturinteresserede læsere, der vil forstå tendensen før plakaten bliver gammel.',
    angle:
      'Ikke endnu en lineup-nyhed, men en analyse af hvordan festivaler kuraterer som platforme: fastholdelse, nicher og mikrofællesskaber.',
    evidence: [
      'Flere festivaler splitter annonceringer i mindre bølger.',
      'Headliners fylder mindre i kommunikationen end fællesskab og format.',
      'Mulig lokal vinkel: hvad betyder det for danske mellemstore festivaler?',
    ],
    nextAction: 'Bestil kort researchbrief og kontakt 2 bookere for citater.',
  },
  {
    id: 'true-crime-fatigue',
    title: 'True crime-træthed skaber plads til den langsomme dokumentar',
    source: 'Radar: streaming, anmeldelser, Reddit',
    beat: 'Film & TV',
    urgency: 68,
    originality: 84,
    brandFit: 87,
    risk: 42,
    audience: 'Streamere og seriepublikum, der leder efter kvalitet frem for endnu en chokfortælling.',
    angle:
      'Et kuraterende overblik: de nye dokumentarer sælger ikke kun forbrydelse, men tillid, tempo og eftertanke.',
    evidence: [
      'Anmeldelser kritiserer oftere sensationalisme.',
      'Platformene fremhæver instruktør og adgang frem for gerningsdetaljer.',
      'Risiko: kræver tydelig kildeafgrænsning for ikke at generalisere.',
    ],
    nextAction: 'Lav watchlist og lad AI Writer bygge første anbefalingskladde.',
  },
  {
    id: 'game-preservation',
    title: 'Spilbranchen opdager arkivet som kulturkamp',
    source: 'Radar: gaming, branchemedier, fora',
    beat: 'Gaming',
    urgency: 74,
    originality: 89,
    brandFit: 79,
    risk: 36,
    audience: 'Gaminglæsere, kulturjournalister og nostalgikere med interesse for ejerskab.',
    angle:
      'Fra patch notes til kulturarv: hvorfor gamle spil pludselig handler om adgang, rettigheder og kollektiv hukommelse.',
    evidence: [
      'Flere lukkede stores og servere skaber debat om ejerskab.',
      'Museer og fanmiljøer arbejder parallelt, men med forskellige interesser.',
      'God mulighed for forklarende artikel med cases.',
    ],
    nextAction: 'Sæt en forklarende longread i workflow med faktaboks.',
  },
  {
    id: 'concert-economy',
    title: 'Koncertbilletter er blevet kulturens nye luksusvare',
    source: 'Radar: billetplatforme, arenaer, fanfora',
    beat: 'Musik',
    urgency: 78,
    originality: 81,
    brandFit: 88,
    risk: 34,
    audience: 'Koncertgængere og musiklæsere, der mærker at livekultur kræver mere planlægning og flere penge.',
    angle:
      'En analyse af hvordan dynamiske priser, VIP-pakker og presale-koder ændrer koncertoplevelsen før musikken overhovedet begynder.',
    evidence: [
      'Flere store turnéer arbejder med differentierede billetlag.',
      'Fans bruger mere tid på adgangssystemet end på musikopdagelsen.',
      'Dansk vinkel: hvad sker der med mellemstore spillesteder og unge publikummer?',
    ],
    nextAction: 'Lav webresearch på billetpriser, presale-modeller og danske koncertsteder.',
  },
  {
    id: 'streaming-bundles',
    title: 'Streamingpakkerne er langsomt ved at genopfinde kabel-tv',
    source: 'Radar: streaming, tech, forbrugerøkonomi',
    beat: 'Film & TV',
    urgency: 73,
    originality: 78,
    brandFit: 86,
    risk: 30,
    audience: 'Streamingbrugere der føler at friheden er blevet dyrere og mere rodet.',
    angle:
      'Fra valgfrihed til bundle-logik: en kommentar om hvordan streamingmarkedet vender tilbage til det system, det lovede at afskaffe.',
    evidence: [
      'Platforme samler tjenester i pakker og annoncefinansierede niveauer.',
      'Prisstigninger og rettighedsflytninger gør brugeroplevelsen mere fragmenteret.',
      'Mulig Apropos-vinkel: den kulturelle træthed ved konstant at vælge.',
    ],
    nextAction: 'Research aktuelle streamingpakker, prisændringer og brugerreaktioner.',
  },
  {
    id: 'festival-volunteers',
    title: 'Festivalfrivillige er blevet den oversete kulturmotor',
    source: 'Radar: festivaler, lokalmedier, kulturøkonomi',
    beat: 'Kultur',
    urgency: 70,
    originality: 86,
    brandFit: 84,
    risk: 32,
    audience: 'Læseren der elsker festivaler, men sjældent ser arbejdet bag hegnet.',
    angle:
      'En feature om den sociale og økonomiske infrastruktur under festivalsommeren: fællesskab, gratis billetter og usynligt arbejde.',
    evidence: [
      'Festivaler rekrutterer tusindvis af frivillige hvert år.',
      'Frivilligkultur sælges som fællesskab, men bærer også driften.',
      'God case-mulighed: interview med frivillige og koordinatorer.',
    ],
    nextAction: 'Find friske cases og tal på frivillighed i dansk festivalsæson.',
  },
];

const workflowSteps = [
  { title: 'Radar', body: 'Scanner kilder, trends og egne stofområder for redaktionelle muligheder.' },
  { title: 'Vinkel', body: 'Omsætter signaler til journalistiske vinkler med brand fit og originalitet.' },
  { title: 'Brief', body: 'Bygger researchspørgsmål, kildekrav, risici og næste handling.' },
  { title: 'Draft', body: 'Sender godkendte briefs videre til AI Writer eller CMS som kladde.' },
];

function score(signal: EditorialSignal) {
  return Math.round(signal.urgency * 0.25 + signal.originality * 0.3 + signal.brandFit * 0.35 - signal.risk * 0.1);
}

const fallbackQualityGate = (signal: EditorialSignal): QualityGate => ({
  ready: false,
  score: 0,
  sourceCount: signal.sources?.length || 0,
  sourceDiversity: signal.sources?.length || 0,
  checks: [
    { id: 'source-count', label: 'Mindst 3 kilder', ok: false, detail: 'Research afventer engine' },
    { id: 'source-diversity', label: 'Kildediversitet', ok: false, detail: 'Research afventer engine' },
    { id: 'danish-angle', label: 'Dansk vinkel', ok: false, detail: 'Research afventer engine' },
    { id: 'claim-risk', label: 'Lav claim-risiko', ok: false, detail: 'Research afventer engine' },
    { id: 'duplicate-risk', label: 'Lav overlap-risiko', ok: !signal.duplicateRisk, detail: `Overlap-score ${signal.duplicateRisk || 0}` },
  ],
});

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

function StatusBadge({ label, tone }: { label: string; tone: 'ok' | 'warn' | 'idle' }) {
  const dot = tone === 'ok' ? 'bg-emerald-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-white/40';
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
      <span className={`size-1.5 rounded-full ${dot}`} />
      {label}
    </span>
  );
}

export default function EditorialCockpitClient({
  embedded = false,
  onClose,
  onApproveBrief,
}: {
  embedded?: boolean;
  onClose?: () => void;
  onApproveBrief?: (payload: ApprovedBriefPayload) => Promise<void> | void;
}) {
  const [activeTab, setActiveTab] = useState<DeskTab>('radar');
  const [selectedId, setSelectedId] = useState(signals[0].id);
  const [approveBusy, setApproveBusy] = useState(false);
  const [approveStatus, setApproveStatus] = useState<string | null>(null);
  const [publishedSignalIds, setPublishedSignalIds] = useState<Set<string>>(() => new Set(readPublishedEditorialSignalIds()));
  const [coveredTopics, setCoveredTopics] = useState<CoveredEditorialTopic[]>(() => readCoveredEditorialTopics());
  const [dynamicSignals, setDynamicSignals] = useState<EditorialSignal[]>([]);
  const [signalsBusy, setSignalsBusy] = useState(false);
  const [signalsError, setSignalsError] = useState<string | null>(null);
  const autoLoadedSignalsRef = useRef(false);
  const [researchBusy, setResearchBusy] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const [researchBySignalId, setResearchBySignalId] = useState<Record<string, EditorialResearchResult>>({});
  const [researchStatus, setResearchStatus] = useState('Afventer brief');
  const [articleType, setArticleType] = useState<EditorialArticleType>('feature');
  const articleTypeOption = getEditorialArticleTypeOption(articleType);
  const allSignals = useMemo(() => [...dynamicSignals, ...signals], [dynamicSignals]);
  const visibleSignals = useMemo(
    () => allSignals.filter((item) => !publishedSignalIds.has(item.id) && !isEditorialTopicCovered(item, coveredTopics)),
    [allSignals, coveredTopics, publishedSignalIds]
  );
  const selected = useMemo(() => visibleSignals.find((item) => item.id === selectedId) || visibleSignals[0] || signals[0], [selectedId, visibleSignals]);
  const selectedScore = score(selected);
  const selectedResearchResult = researchBySignalId[selected.id] || null;
  const selectedDossier = selectedResearchResult?.dossier || null;
  const selectedResearch = selectedDossier?.sources || [];
  const qualityGate = selectedResearchResult?.qualityGate || fallbackQualityGate(selected);

  useEffect(() => {
    if (visibleSignals.length > 0 && !visibleSignals.some((item) => item.id === selectedId)) {
      setSelectedId(visibleSignals[0].id);
    }
  }, [selectedId, visibleSignals]);

  useEffect(() => {
    const handlePublished = (event: Event) => {
      const detail = (event as CustomEvent<{
        signalId?: string;
        signalTitle?: string;
        title?: string;
        slug?: string;
        topic?: string;
      }>).detail;
      const signalId = detail?.signalId;
      if (!signalId) return;
      setPublishedSignalIds((prev) => {
        const next = new Set(prev);
        next.add(signalId);
        try { addPublishedEditorialSignalId(signalId); } catch {}
        return next;
      });
      try {
        const nextCovered = addCoveredEditorialTopic({
          signalId,
          signalTitle: detail?.signalTitle,
          title: detail?.title,
          slug: detail?.slug,
          topic: detail?.topic,
        });
        setCoveredTopics(nextCovered);
      } catch {
        setCoveredTopics(readCoveredEditorialTopics());
      }
    };
    window.addEventListener(EDITORIAL_SIGNAL_PUBLISHED_EVENT, handlePublished);
    return () => window.removeEventListener(EDITORIAL_SIGNAL_PUBLISHED_EVENT, handlePublished);
  }, []);

  const tabClass = (tab: DeskTab) =>
    `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
      activeTab === tab ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
    }`;

  const buildApprovedBrief = (signal: EditorialSignal) => {
    if (selectedResearchResult?.brief?.text) return selectedResearchResult.brief.text;
    const evidenceLines = signal.evidence.map((line) => `- ${line}`).join('\n');
    const researchLines = selectedResearch
      .slice(0, 5)
      .map((item, index) => `${index + 1}. ${item.title}${item.url ? ` (${item.url})` : ''}\n   ${item.content}`)
      .join('\n');
    return [
      `Redaktionel brief: ${signal.title}`,
      '',
      `Beat: ${signal.beat}`,
      `Vinkel: ${signal.angle}`,
      `Målgruppe: ${signal.audience}`,
      `Artikeltype: ${articleTypeOption.label} (${articleTypeOption.targetLengthLabel})`,
      `Næste handling: ${signal.nextAction}`,
      `Research quality gate: ${qualityGate.ready ? 'Klar' : 'Kræver ekstra redaktionel opmærksomhed'}`,
      '',
      'Kilde- og faktakrav:',
      evidenceLines,
      researchLines ? '\nSupplerende webresearch:' : '',
      researchLines,
      '',
      'Skriv et skarpt første udkast med tydelig struktur, verificerbare pointer og dansk redaktionel tone.',
    ].filter(Boolean).join('\n');
  };

  const loadDynamicSignals = useCallback(async () => {
    if (signalsBusy) return;
    setSignalsBusy(true);
    setSignalsError(null);
    try {
      const res = await fetch('/api/editorial/signals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ limit: 8, coveredTopics }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Kunne ikke hente friske signaler');
      const incoming = Array.isArray(data.data?.signals) ? data.data.signals : [];
      setDynamicSignals(incoming);
      if (incoming[0]?.id) setSelectedId(incoming[0].id);
    } catch (error) {
      setSignalsError(error instanceof Error ? error.message : 'Kunne ikke hente friske signaler');
    } finally {
      setSignalsBusy(false);
    }
  }, [coveredTopics, signalsBusy]);

  useEffect(() => {
    if (autoLoadedSignalsRef.current) return;
    autoLoadedSignalsRef.current = true;
    void loadDynamicSignals();
  }, [loadDynamicSignals]);

  const runNextActionResearch = useCallback(async (force = false) => {
    if (researchBusy) return;
    if (!force && researchBySignalId[selected.id]) return;
    setResearchBusy(true);
    setResearchError(null);
    setResearchStatus('Finder kilder');
    try {
      const res = await fetch('/api/editorial/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ signal: selected, coveredTopics }),
      });
      setResearchStatus('Vurderer kilder');
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.error || 'Research fejlede');
      const result = data?.data as EditorialResearchResult | undefined;
      if (!result?.dossier || !result?.brief || !result?.qualityGate) throw new Error('Research svarede uden dossier');
      setResearchStatus('Bygger artikelbrief');
      setResearchBySignalId((prev) => ({
        ...prev,
        [selected.id]: result,
      }));
      setArticleType(result.brief.articleType);
      setResearchStatus(result.qualityGate.ready ? 'Klar til AI Writer' : 'Kræver redaktionel opmærksomhed');
    } catch (error) {
      setResearchError(error instanceof Error ? error.message : 'Research fejlede');
      setResearchStatus('Research fejlede');
    } finally {
      setResearchBusy(false);
    }
  }, [coveredTopics, researchBusy, researchBySignalId, selected]);

  useEffect(() => {
    if (activeTab !== 'brief') return;
    void runNextActionResearch(false);
  }, [activeTab, runNextActionResearch]);

  const handleApproveBrief = async () => {
    if (!onApproveBrief || approveBusy) return;
    setApproveBusy(true);
    setApproveStatus(null);
    try {
      await onApproveBrief({
        signalId: selected.id,
        signalTitle: selected.title,
        briefText: buildApprovedBrief(selected),
        articleType,
        targetWordCount: selectedResearchResult?.brief.targetWordCount || articleTypeOption.targetWordCount,
        targetLengthLabel: selectedResearchResult?.brief.targetLengthLabel || articleTypeOption.targetLengthLabel,
        editorialResearch: selectedResearchResult || undefined,
      });
      setApproveStatus('Brief sendt til AI Writer.');
    } catch {
      setApproveStatus('Kunne ikke sende brief til AI Writer.');
    } finally {
      setApproveBusy(false);
    }
  };

  return (
    <div className="h-full w-full flex flex-col font-poppins rounded-xl bg-black/40 md:bg-black backdrop-blur-xl md:backdrop-blur-0 border border-white/15 overflow-hidden md:outline md:outline-[1.5px] md:outline-offset-[-1.5px] md:outline-zinc-800">
      <EmbeddedAppHeader
        embedded={embedded}
        title="AI-redaktionschef"
        subtitle="Et test-cockpit for redaktionelle signaler, vinkler, brief og workflow før AI Writer eller CMS."
        onClose={onClose}
        trailing={
          <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
            <button type="button" className={tabClass('radar')} onClick={() => setActiveTab('radar')}>
              Radar
            </button>
            <button type="button" className={tabClass('brief')} onClick={() => setActiveTab('brief')}>
              Brief
            </button>
            <button type="button" className={tabClass('workflow')} onClick={() => setActiveTab('workflow')}>
              Flow
            </button>
          </div>
        }
      />

      <div className="flex-1 min-h-0 overflow-y-auto nice-scrollbar p-3 lg:p-4 space-y-4">
        <section className="rounded-2xl border border-white/15 bg-white/[0.03] p-4">
          <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/35">Dagens redaktionelle anbefaling</p>
              <h2 className="mt-2 text-[18px] font-medium tracking-tight text-white">{selected.title}</h2>
              <p className="mt-2 text-[12px] leading-relaxed text-white/55">{selected.angle}</p>
            </div>
            <div className="shrink-0 rounded-xl border border-white/12 bg-black/30 px-3 py-2 text-right">
              <p className="text-[9px] uppercase tracking-[0.16em] text-white/35">Priority score</p>
              <p className="mt-1 text-[28px] font-medium tabular-nums text-white">{selectedScore}</p>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-2">
            <StatusBadge label={selected.beat} tone="idle" />
            <StatusBadge label={qualityGate.ready ? 'Klar til brief' : 'Kræver research'} tone={qualityGate.ready ? 'ok' : 'warn'} />
            <StatusBadge label={articleTypeOption.label} tone="idle" />
            <StatusBadge label={selected.source} tone="idle" />
          </div>
        </section>

        {activeTab === 'radar' && (
          <div className="grid gap-3 xl:grid-cols-[1.1fr_0.9fr]">
            <section className="space-y-2">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <EmbeddedSectionLabel step={1}>Signal Radar</EmbeddedSectionLabel>
                <button
                  type="button"
                  onClick={() => void loadDynamicSignals()}
                  disabled={signalsBusy}
                  className="min-h-11 rounded-xl border border-white/12 bg-white/[0.05] px-3 py-2 text-[12px] text-white/75 transition-all duration-200 hover:border-white/20 hover:bg-white/10 disabled:opacity-40 active:scale-[0.98]"
                >
                  {signalsBusy ? 'Henter automatisk…' : 'Opdater signaler'}
                </button>
              </div>
              {signalsError && (
                <p className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-2 text-[12px] text-red-400/95">{signalsError}</p>
              )}
              {visibleSignals.map((signal) => {
                const isSelected = signal.id === selected.id;
                return (
                  <button
                    key={signal.id}
                    type="button"
                    onClick={() => {
                      setSelectedId(signal.id);
                      setActiveTab('brief');
                    }}
                    className={`w-full rounded-xl border px-3.5 py-3 text-left transition-all duration-200 active:scale-[0.98] ${
                      isSelected ? 'border-white/20 bg-white/[0.06]' : 'border-white/[0.06] bg-white/[0.02] hover:bg-white/[0.04]'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-medium leading-snug text-white/85">{signal.title}</p>
                        <p className="mt-1 text-[11px] text-white/35">{signal.source}</p>
                        {signal.duplicateRisk ? (
                          <p className="mt-1 text-[10px] text-amber-300">Mulig overlap-score: {signal.duplicateRisk}</p>
                        ) : null}
                      </div>
                      <span className="shrink-0 rounded-lg border border-white/12 bg-white/[0.05] px-2 py-1 text-[11px] tabular-nums text-white/70">
                        {score(signal)}
                      </span>
                    </div>
                  </button>
                );
              })}
              {visibleSignals.length === 0 && (
                <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-3 text-[12px] text-white/45">
                  Alle aktuelle signaler er markeret som udgivet.
                </div>
              )}
            </section>

            <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
              <EmbeddedSectionLabel step={2}>Redaktionel score</EmbeddedSectionLabel>
              <ScoreBar label="Aktualitet" value={selected.urgency} />
              <ScoreBar label="Originalitet" value={selected.originality} />
              <ScoreBar label="Brand fit" value={selected.brandFit} />
              <ScoreBar label="Risiko" value={selected.risk} />
              <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Målgruppe</p>
                <p className="mt-2 text-[12px] leading-relaxed text-white/65">{selected.audience}</p>
              </div>
            </section>
          </div>
        )}

        {activeTab === 'brief' && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-4">
            <EmbeddedSectionLabel step={1}>AI-brief til redaktionen</EmbeddedSectionLabel>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Artikeltype og længde</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {EDITORIAL_ARTICLE_TYPE_OPTIONS.map((option) => {
                  const active = articleType === option.id;
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => setArticleType(option.id)}
                      className={`min-h-11 rounded-lg border px-3 py-2 text-left text-[12px] transition-all duration-200 active:scale-[0.98] ${
                        active
                          ? 'border-white/40 bg-white/10 text-white shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)]'
                          : 'border-white/10 bg-white/[0.03] text-white/60 hover:border-white/20 hover:bg-white/[0.06]'
                      }`}
                    >
                      <span className="block font-medium">{option.label}</span>
                      <span className="block text-[10px] text-white/35">{option.targetLengthLabel}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div className="grid gap-3 md:grid-cols-2">
              <div className="rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Vinkel</p>
                <p className="mt-2 text-[13px] leading-relaxed text-white/75">{selected.angle}</p>
              </div>
              <button
                type="button"
                onClick={() => void runNextActionResearch(true)}
                disabled={researchBusy}
                className={`rounded-xl border p-3 text-left transition-all duration-200 active:scale-[0.98] ${
                  researchBusy || selectedResearch.length > 0
                    ? 'border-white/40 bg-white/10 text-white shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)]'
                    : 'border-white/[0.06] bg-white/[0.03] hover:bg-white/[0.05] text-white/75'
                } disabled:opacity-70`}
              >
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Engine status</p>
                <p className="mt-2 text-[13px] leading-relaxed">
                  {researchBusy ? `${researchStatus}…` : selectedResearchResult ? researchStatus : 'Starter research automatisk'}
                </p>
                <p className="mt-1 text-[11px] text-white/35">{researchBusy ? 'Pipeline kører' : 'Tryk for at researche igen'}</p>
              </button>
            </div>
            {(selectedResearch.length > 0 || researchError) && (
              <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Research tilføjet</p>
                {researchError ? (
                  <p className="mt-2 text-[12px] text-red-400/95">{researchError}</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {selectedDossier?.keyFacts?.length ? (
                      <ul className="space-y-2">
                        {selectedDossier.keyFacts.slice(0, 4).map((item) => (
                          <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-white/65">
                            <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/40" />
                            <span>{item}</span>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                    <div className="space-y-2">
                      {selectedResearch.slice(0, 5).map((item) => (
                        <div key={`${item.title}-${item.url || item.source}`} className="text-[12px] leading-relaxed text-white/65">
                          <span className="text-white/85">{item.title}</span>
                          <span className="text-white/35"> · {item.source}</span>
                          {item.url && <span className="text-white/35"> · {item.url}</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
              <div className="flex items-center justify-between gap-3">
                <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Research quality gate</p>
                <StatusBadge label={qualityGate.ready ? 'Klar' : 'Tjek'} tone={qualityGate.ready ? 'ok' : 'warn'} />
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {qualityGate.checks.map((check) => (
                  <div key={check.label} className="flex items-center gap-2 rounded-lg border border-white/[0.06] bg-white/[0.03] px-3 py-2">
                    <span className={`size-1.5 rounded-full ${check.ok ? 'bg-emerald-400' : 'bg-amber-400'}`} />
                    <span className="text-[12px] text-white/65">{check.label}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-xl border border-white/[0.06] bg-black/25 p-3">
              <p className="text-[11px] uppercase tracking-[0.14em] text-white/35">Kilde- og faktakrav</p>
              <ul className="mt-3 space-y-2">
                {selected.evidence.map((item) => (
                  <li key={item} className="flex gap-2 text-[12px] leading-relaxed text-white/65">
                    <span className="mt-2 size-1.5 shrink-0 rounded-full bg-white/40" />
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="grid gap-2 sm:grid-cols-2">
              <button type="button" className={primaryBtn} onClick={() => void handleApproveBrief()} disabled={!onApproveBrief || approveBusy}>
                {approveBusy ? 'Sender brief…' : 'Godkend brief til AI Writer'}
              </button>
              <button type="button" className={secondaryBtn}>
                Marker som kræver menneskelig research
              </button>
            </div>
            {approveStatus && (
              <p className="text-[12px] text-white/70">{approveStatus}</p>
            )}
          </section>
        )}

        {activeTab === 'workflow' && (
          <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 space-y-3">
            <EmbeddedSectionLabel step={1}>Produkt-workflow</EmbeddedSectionLabel>
            {workflowSteps.map((step, index) => (
              <div key={step.title} className="flex gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] p-3">
                <div className="flex size-7 shrink-0 items-center justify-center rounded-lg bg-white/[0.06] text-[11px] text-white/55">
                  {index + 1}
                </div>
                <div>
                  <p className="text-[13px] font-medium text-white/80">{step.title}</p>
                  <p className="mt-1 text-[12px] leading-relaxed text-white/45">{step.body}</p>
                </div>
              </div>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}
