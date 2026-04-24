'use client';

/**
 * AI-posting (Liv Brandt) — embedded klient i web-apps menuen.
 *
 * Følger Apropos design-systemet (`.cursor/rules/apropos-design-system.mdc`):
 * samme header, button-stile, surface-tints, sektion-row mønster og
 * dot-indikator-badges som NewsletterClient.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import {
  CollapsibleSection,
  EmbeddedAppHeader,
  EmbeddedSectionLabel,
  StickyAppActionBar,
} from '@/components/embedded-app';
import { useAuth } from '@/lib/auth-context';

interface LivPostingClientProps {
  embedded?: boolean;
  onClose?: () => void;
}

interface PreviewTopic {
  title: string;
  score: number;
  category?: string;
  tags?: string[];
  source?: {
    title?: string;
    url?: string;
    excerpt?: string;
    sourceName?: string;
    publishedAt?: string;
  };
}

interface PreviewArticle {
  title: string;
  subtitle: string;
  intro: string;
  content: string;
  slug: string;
  excerpt: string;
  section: string;
  tags: string[];
  seoTitle?: string;
  seoDescription?: string;
  primaryKeyword?: string;
  wordCount: number;
  researchSources?: Array<{
    title: string;
    source: string;
    url?: string | null;
    snippet?: string;
  }>;
  imageSuggestions?: Array<{
    url: string;
    source: string;
    title?: string;
  }>;
  qa?: {
    verifiedResearchSourceCount?: number;
    verifiedClaimsCount?: number;
    researchConfidence?: 'low' | 'medium' | 'high';
    lineupNamesUsed?: string[];
    requiresLineupNames?: boolean;
    canAutoPublish?: boolean;
    blockers?: string[];
  };
}

interface PreviewResponse {
  ok: boolean;
  dayKey: string;
  topic: PreviewTopic | null;
  previewImageUrl?: string | null;
  previewExpandedDirective?: string | null;
  topicMatchedTrending?: boolean;
  warnings?: string[];
  gatePass?: boolean;
  gateResults?: GateResult[];
  plan?: LivDailyPlan | null;
  reason?: string;
  article?: PreviewArticle;
  error?: string;
}

interface LivDailyPlan {
  dayKey: string;
  topicHint?: string;
  directiveHint?: string;
  expandedDirective?: string;
  mustUseTrending: boolean;
  status: 'pending' | 'used' | 'failed';
}

interface PlanResponse {
  ok?: boolean;
  dayKey?: string;
  plan?: LivDailyPlan | null;
  error?: string;
}

interface GateResult { name: string; pass: boolean; detail?: string; skipped?: boolean }

type LivStatus =
  | 'processing'
  | 'published'
  | 'draft'
  | 'skipped_no_topic'
  | 'skipped_factcheck'
  | 'skipped_moderation'
  | 'skipped_tov'
  | 'skipped_duplicate'
  | 'failed';

interface StatusEntry {
  id: string;
  dayKey: string;
  status: LivStatus;
  topic?: string | null;
  title?: string | null;
  slug?: string | null;
  webflowItemId?: string | null;
  reason?: string | null;
  gateResults?: GateResult[];
  finishedAt: string | null;
}

interface LivStatusConfig {
  livDailyWebflowStatus: 'draft' | 'published';
  livDailyPaused: boolean;
  designerBaseUrl: string | null;
  hasArticlesCollectionId: boolean;
  cronNote?: string;
}

interface StatusResponse {
  ok?: boolean;
  limit?: number;
  counts?: Record<string, number>;
  entries?: StatusEntry[];
  error?: string;
  config?: LivStatusConfig;
}

const STATUS_META: Record<LivStatus, { label: string; tone: 'ok' | 'warn' | 'err' | 'idle' }> = {
  processing: { label: 'I gang', tone: 'idle' },
  published: { label: 'Publiceret', tone: 'ok' },
  draft: { label: 'Draft i CMS', tone: 'idle' },
  skipped_no_topic: { label: 'Intet emne', tone: 'warn' },
  skipped_factcheck: { label: 'Stoppet · factcheck', tone: 'warn' },
  skipped_moderation: { label: 'Stoppet · moderation', tone: 'warn' },
  skipped_tov: { label: 'Stoppet · tone', tone: 'warn' },
  skipped_duplicate: { label: 'Duplikat', tone: 'warn' },
  failed: { label: 'Fejlede', tone: 'err' },
};

const TONE_DOT: Record<'ok' | 'warn' | 'err' | 'idle', string> = {
  ok: 'bg-emerald-400',
  warn: 'bg-amber-400',
  err: 'bg-rose-400',
  idle: 'bg-white/40',
};

function formatDateDk(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('da-DK', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatRelativeDate(iso: string | undefined): string | null {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleDateString('da-DK', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch {
    return null;
  }
}

const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
    active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75'
  }`;

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

/** Samme hvide glow som design-system hovedhandling i aktiv tilstand (AI-writer/nyhedsbrev-mønster). */
const primaryActionBusy =
  'shadow-[0_0_32px_-8px_rgba(255,255,255,0.2)] !border-white/25 !bg-white/12 !opacity-100 ring-1 ring-white/15 cursor-wait disabled:cursor-wait';

function primaryBtnState(loading: boolean) {
  return loading ? `inline-flex items-center justify-center gap-2 ${primaryBtn} ${primaryActionBusy}` : primaryBtn;
}

function LivBusySpinner() {
  return (
    <svg className="size-4 shrink-0 animate-spin text-white" viewBox="0 0 24 24" aria-hidden>
      <circle className="opacity-20" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="2" fill="none" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
      />
    </svg>
  );
}

const secondaryBtn =
  'w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const pillLink =
  'px-3 py-1.5 rounded-lg border border-white/12 text-sm text-white/65 hover:bg-white/[0.06] hover:text-white/90 transition-all duration-200 active:scale-[0.98]';

const quickPillBtn =
  'px-2.5 py-1.5 rounded-lg border border-white/12 bg-white/[0.03] text-[11px] text-white/75 hover:bg-white/[0.08] hover:border-white/20 hover:text-white transition-all duration-200 active:scale-[0.98]';

const LIV_EXCLUDED_STORAGE_KEY = 'liv-posting-excluded-titles';

const QUICK_TOPIC_PILLS = [
  'Sabrina Carpenter',
  'Roskilde line-up',
  'Ny dansk albumrelease',
  'Queer klubkultur i København',
  'Kvindelige headlinere 2026',
  'Overturisme i Nyhavn',
  'Cykelkultur vs. cykelturister i København',
];

/** Standard: lukket — prioriter emnekort → handling → udkast */
const LIV_EDITORIAL_OPEN_KEY = 'liv-posting-editorial-open';

/** Flere kan vælges samtidig; snippets flettes i én vinkelstreng til API. */
const LIV_DIRECTIVE_MODES = [
  { id: 'lineup', label: 'Lineup', snippet: 'lineup mode: navne + kønsbalance + DK relevans' },
  { id: 'genz', label: 'Gen Z', snippet: 'gen Z perspektiv' },
  { id: 'feminist', label: 'Feministisk', snippet: 'feministisk kulturkritik' },
  { id: 'kritisk', label: 'Kritisk, empatisk', snippet: 'kritisk men empatisk' },
  { id: 'sensation', label: 'Sansning', snippet: 'start i en sansning' },
  { id: 'fakta', label: 'Faktatung', snippet: 'personlig men faktatung' },
  { id: 'antinyhavn', label: 'Anti-postkort', snippet: 'anti-postkort-København (Nyhavn som symbol)' },
] as const;

const modeSnippetToId = new Map<string, string>(LIV_DIRECTIVE_MODES.map((m) => [m.snippet, m.id] as [string, string]));

function buildDirectiveHint(modeIds: string[], custom: string): string {
  const snips = LIV_DIRECTIVE_MODES.filter((m) => modeIds.includes(m.id)).map((m) => m.snippet);
  const t = custom.trim();
  if (!t) return snips.join('; ');
  if (snips.length === 0) return t;
  return `${snips.join('; ')}; ${t}`;
}

function parseDirectiveString(s: string): { modeIds: string[]; custom: string } {
  const parts = s
    .split(';')
    .map((p) => p.trim())
    .filter(Boolean);
  const found = new Set<string>();
  const unknown: string[] = [];
  for (const p of parts) {
    const id = modeSnippetToId.get(p);
    if (id) found.add(id);
    else unknown.push(p);
  }
  return {
    modeIds: LIV_DIRECTIVE_MODES.map((m) => m.id).filter((id) => found.has(id)),
    custom: unknown.join('; ').trim(),
  };
}

const quickPillBtnActive = `${quickPillBtn} border-emerald-400/35 bg-emerald-500/[0.1] text-emerald-100/90`;

export default function LivPostingClient({ embedded = false, onClose }: LivPostingClientProps) {
  const { user } = useAuth();
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [generateLoading, setGenerateLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<StatusEntry[]>([]);
  const [historyCounts, setHistoryCounts] = useState<Record<string, number>>({});
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [livConfig, setLivConfig] = useState<LivStatusConfig | null>(null);
  const [activeTab, setActiveTab] = useState<'topic' | 'history'>('topic');
  const [topicHint, setTopicHint] = useState('');
  const [activeDirectiveModes, setActiveDirectiveModes] = useState<string[]>([]);
  const [directiveCustom, setDirectiveCustom] = useState('');
  const [mustUseTrending, setMustUseTrending] = useState(true);
  const [excludedTopics, setExcludedTopics] = useState<string[]>([]);
  const [plan, setPlan] = useState<LivDailyPlan | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [planError, setPlanError] = useState<string | null>(null);
  const [editorialOpen, setEditorialOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return localStorage.getItem(LIV_EDITORIAL_OPEN_KEY) === '1';
  });
  const [flowHelpOpen, setFlowHelpOpen] = useState(false);

  const topicHintRef = useRef(topicHint);
  const directiveHintRef = useRef('');
  const mustUseTrendingRef = useRef(mustUseTrending);
  const excludedTopicsRef = useRef(excludedTopics);
  const directiveHint = useMemo(
    () => buildDirectiveHint(activeDirectiveModes, directiveCustom),
    [activeDirectiveModes, directiveCustom]
  );
  topicHintRef.current = topicHint;
  directiveHintRef.current = directiveHint;
  mustUseTrendingRef.current = mustUseTrending;
  excludedTopicsRef.current = excludedTopics;

  const authHeader = useCallback(async () => {
    if (!user) throw new Error('Log ind for at bruge AI-posting');
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
  }, [user]);

  const loadPreview = useCallback(
    async (opts: {
      generate?: boolean;
      topicHint?: string;
      directiveHint?: string;
      mustUseTrending?: boolean;
      excludedTitles?: string[];
    } = {}) => {
      const {
        generate = false,
        topicHint: topicHintOverride,
        directiveHint: directiveHintOverride,
        mustUseTrending: mustUseTrendingOverride,
        excludedTitles: excludedTitlesOverride,
      } = opts;
      try {
        setError(null);
        if (generate) setGenerateLoading(true);
        else setPreviewLoading(true);
        const headers = await authHeader();
        const res = await fetch('/api/liv/preview', {
          method: 'POST',
          headers: {
            ...headers,
            'Content-Type': 'application/json',
          },
          cache: 'no-store',
          body: JSON.stringify({
            generate,
            topicHint: (topicHintOverride ?? topicHintRef.current).trim() || undefined,
            directiveHint: (directiveHintOverride ?? directiveHintRef.current).trim() || undefined,
            mustUseTrending: mustUseTrendingOverride ?? mustUseTrendingRef.current,
            excludedTitles: excludedTitlesOverride ?? excludedTopicsRef.current,
          }),
        });
        const data: PreviewResponse = await res.json();
        if (!res.ok) {
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        const usedTopicHint = (topicHintOverride ?? topicHintRef.current).trim();
        const usedMustUseTrending = mustUseTrendingOverride ?? mustUseTrendingRef.current;
        if (generate && !data.topic && usedTopicHint && usedMustUseTrending) {
          setError('Ingen trending-match til emnet endnu. Fjern "Brug kun trending-emner" eller vælg et andet emne.');
        }
        setPreview((prev) => {
          if (!generate && prev?.article && prev.topic?.title === data.topic?.title) {
            return { ...data, article: prev.article };
          }
          return data;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Kunne ikke hente preview');
      } finally {
        setPreviewLoading(false);
        setGenerateLoading(false);
      }
    },
    [authHeader]
  );

  const loadHistory = useCallback(async () => {
    try {
      setHistoryError(null);
      setHistoryLoading(true);
      const headers = await authHeader();
      const res = await fetch('/api/liv/status?limit=60&includeCms=1', { headers, cache: 'no-store' });
      const data: StatusResponse = await res.json();
      if (!res.ok) {
        throw new Error(data.error || `HTTP ${res.status}`);
      }
      setHistory(Array.isArray(data.entries) ? data.entries : []);
      setHistoryCounts(data.counts || {});
      setLivConfig(data.config ?? null);
    } catch (e) {
      setHistoryError(e instanceof Error ? e.message : 'Kunne ikke hente historik');
    } finally {
      setHistoryLoading(false);
    }
  }, [authHeader]);

  const runQuickStart = useCallback(
    async (nextTopic: string, nextDirection?: string) => {
      const t = nextTopic.trim();
      excludedTopicsRef.current = [];
      setExcludedTopics([]);
      setTopicHint(t);
      if (nextDirection !== undefined) {
        const p = parseDirectiveString(nextDirection);
        setActiveDirectiveModes(p.modeIds);
        setDirectiveCustom(p.custom);
        await loadPreview({
          generate: true,
          topicHint: t,
          directiveHint: buildDirectiveHint(p.modeIds, p.custom).trim() || undefined,
          excludedTitles: [],
        });
        return;
      }
      await loadPreview({
        generate: true,
        topicHint: t,
        directiveHint: directiveHintRef.current.trim() || undefined,
        excludedTitles: [],
      });
    },
    [loadPreview]
  );

  const rejectCurrentTopic = useCallback(async () => {
    const currentTitle = preview?.topic?.title?.trim();
    if (!currentTitle) return;
    const nextExcluded = Array.from(new Set([...excludedTopicsRef.current, currentTitle]));
    excludedTopicsRef.current = nextExcluded;
    setExcludedTopics(nextExcluded);
    setError(null);
    await loadPreview({
      generate: false,
      excludedTitles: nextExcluded,
    });
  }, [loadPreview, preview?.topic?.title]);

  /** Rotér forslag: ekskluder altid det emne der vises nu (ellers ender API på samme nr. 1). */
  const excludedTitlesForRotation = useCallback(() => {
    const cur = preview?.topic?.title?.trim();
    const base = excludedTopicsRef.current;
    if (!cur) return [...base];
    return Array.from(new Set([...base, cur]));
  }, [preview?.topic?.title]);

  const loadNextSuggestion = useCallback(async () => {
    setError(null);
    const merged = excludedTitlesForRotation();
    excludedTopicsRef.current = merged;
    setExcludedTopics(merged);
    await loadPreview({
      generate: false,
      excludedTitles: merged,
    });
  }, [excludedTitlesForRotation, loadPreview]);

  const toggleDirectiveMode = useCallback((id: string) => {
    setActiveDirectiveModes((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }, []);

  const loadPlan = useCallback(async () => {
    try {
      setPlanError(null);
      setPlanLoading(true);
      const headers = await authHeader();
      const res = await fetch('/api/liv/plan?for=tomorrow', { headers, cache: 'no-store' });
      const data: PlanResponse = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPlan(data.plan || null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Kunne ikke hente plan');
    } finally {
      setPlanLoading(false);
    }
  }, [authHeader]);

  const savePlan = useCallback(async () => {
    try {
      setPlanError(null);
      setPlanLoading(true);
      const headers = await authHeader();
      const res = await fetch('/api/liv/plan?for=tomorrow', {
        method: 'POST',
        headers: {
          ...headers,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicHint: topicHint.trim() || undefined,
          directiveHint: directiveHint.trim() || undefined,
          mustUseTrending,
        }),
      });
      const data: PlanResponse = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPlan(data.plan || null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Kunne ikke gemme plan');
    } finally {
      setPlanLoading(false);
    }
  }, [authHeader, directiveHint, mustUseTrending, topicHint]);

  const clearPlan = useCallback(async () => {
    try {
      setPlanError(null);
      setPlanLoading(true);
      const headers = await authHeader();
      const res = await fetch('/api/liv/plan?for=tomorrow', {
        method: 'DELETE',
        headers,
      });
      const data: PlanResponse = await res.json();
      if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
      setPlan(null);
    } catch (e) {
      setPlanError(e instanceof Error ? e.message : 'Kunne ikke slette plan');
    } finally {
      setPlanLoading(false);
    }
  }, [authHeader]);

  const skipExcludedPersistRef = useRef(true);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      let initialExcluded: string[] = [];
      try {
        const raw = typeof window !== 'undefined' ? localStorage.getItem(LIV_EXCLUDED_STORAGE_KEY) : null;
        if (raw) {
          const parsed = JSON.parse(raw) as unknown;
          if (Array.isArray(parsed)) {
            initialExcluded = parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
          }
        }
      } catch {
        /* ignore */
      }
      if (cancelled) return;
      if (initialExcluded.length) {
        excludedTopicsRef.current = initialExcluded;
        setExcludedTopics(initialExcluded);
      }
      await loadPreview({ excludedTitles: initialExcluded });
      if (cancelled) return;
      await loadHistory();
      if (cancelled) return;
      await loadPlan();
    })();
    return () => {
      cancelled = true;
    };
  }, [user, loadPreview, loadHistory, loadPlan]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (skipExcludedPersistRef.current) {
      skipExcludedPersistRef.current = false;
      return;
    }
    if (excludedTopics.length === 0) {
      localStorage.removeItem(LIV_EXCLUDED_STORAGE_KEY);
    } else {
      localStorage.setItem(LIV_EXCLUDED_STORAGE_KEY, JSON.stringify(excludedTopics));
    }
  }, [excludedTopics]);

  useEffect(() => {
    if (!plan) return;
    if (!topicHint && plan.topicHint) setTopicHint(plan.topicHint);
    if (!directiveHint && plan.directiveHint) {
      const p = parseDirectiveString(plan.directiveHint);
      setActiveDirectiveModes(p.modeIds);
      setDirectiveCustom(p.custom);
    }
    setMustUseTrending(plan.mustUseTrending !== false);
  }, [plan, topicHint, directiveHint]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(LIV_EDITORIAL_OPEN_KEY, editorialOpen ? '1' : '0');
  }, [editorialOpen]);

  const topic = preview?.topic ?? null;
  const article = preview?.article ?? null;
  const previewImageUrl = preview?.previewImageUrl ?? null;
  const sourceUrl = topic?.source?.url || null;
  const sourceHost = useMemo(() => {
    if (!sourceUrl) return null;
    try {
      return new URL(sourceUrl).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }, [sourceUrl]);

  const todayLabel = useMemo(() => {
    if (!preview?.dayKey) return null;
    try {
      return new Date(`${preview.dayKey}T00:00:00Z`).toLocaleDateString('da-DK', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
      });
    } catch {
      return preview.dayKey;
    }
  }, [preview?.dayKey]);

  const anyBusy = previewLoading || generateLoading;

  /** Samme 08:00 UTC som i cron (viser typisk København-tid for «i dag»). */
  const cronLocalCopenhagen = useMemo(() => {
    const d = new Date();
    d.setUTCHours(8, 0, 0, 0);
    return d.toLocaleTimeString('da-DK', { timeZone: 'Europe/Copenhagen', hour: '2-digit', minute: '2-digit' });
  }, []);

  const gateStatus = (g: GateResult): { label: string; labelClass: string } => {
    if (g.skipped) {
      return { label: 'Sprunget over', labelClass: 'text-amber-200/90' };
    }
    if (g.pass) {
      return { label: 'OK', labelClass: 'text-emerald-300/90' };
    }
    return { label: 'Fejl', labelClass: 'text-rose-300/90' };
  };

  if (!user) {
    return (
      <div className={`flex flex-col items-center justify-center text-center p-8 text-white/70 font-poppins ${embedded ? 'h-full' : 'min-h-[100dvh]'}`}>
        <p className="text-[14px] text-white/75">Log ind for at se AI-posting</p>
        <Link href="/auth/sign-in" className={`mt-4 ${pillLink}`}>Log ind</Link>
      </div>
    );
  }

  return (
    <div className={embedded
      ? 'flex flex-col h-full min-h-0 text-white bg-transparent font-poppins'
      : 'min-h-[100dvh] flex flex-col text-white bg-[#0a0a0a] font-poppins'}
    >
      <EmbeddedAppHeader
        embedded={embedded}
        title="Liv · AI-posting"
        subtitle="Forhåndsvisning her sender ikke til Webflow. Emne, udkast og redaktion følger den samme logik som morgen-cron; kladde vs. live efter kørsel ses under Drift."
        onClose={onClose}
        trailing={
          <div
            className="hidden md:flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm"
            role="tablist"
            aria-label="AI-posting faner"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'topic'}
              id="liv-tab-topic"
              onClick={() => setActiveTab('topic')}
              className={segBtn(activeTab === 'topic')}
            >
              Dagens emne
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'history'}
              id="liv-tab-history"
              onClick={() => setActiveTab('history')}
              className={segBtn(activeTab === 'history')}
            >
              Historik
            </button>
          </div>
        }
      />

      <div
        className="md:hidden flex gap-0.5 p-2 border-b border-white/10 bg-black/25 backdrop-blur-md"
        role="tablist"
        aria-label="AI-posting faner"
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'topic'}
          onClick={() => setActiveTab('topic')}
          className={`flex-1 ${segBtn(activeTab === 'topic')}`}
        >
          Dagens emne
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === 'history'}
          onClick={() => setActiveTab('history')}
          className={`flex-1 ${segBtn(activeTab === 'history')}`}
        >
          Historik
        </button>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        <div className="px-3 lg:px-4 py-3 lg:py-4 space-y-4">

          {error && (
            <p className="text-[13px] text-red-400/95">{error}</p>
          )}

          <div className="rounded-xl border border-white/[0.10] bg-gradient-to-b from-white/[0.04] to-transparent p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <p className="text-[10px] uppercase tracking-[0.18em] text-white/30 font-medium">Drift (produktion)</p>
              <button
                type="button"
                onClick={() => { void loadHistory(); void loadPlan(); void loadPreview(); }}
                disabled={anyBusy || historyLoading}
                className="text-[11px] text-white/45 hover:text-white/80 transition-colors disabled:opacity-40"
              >
                {previewLoading || historyLoading ? 'Opdaterer…' : 'Opdater'}
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-center">
                <p className="text-[12px] font-semibold text-white/90 tabular-nums leading-tight">08:00 UTC</p>
                <p className="text-[9px] text-white/32 mt-0.5">≈ {cronLocalCopenhagen} København</p>
                <p className="text-[10px] text-white/35 mt-0.5">Daglig cron</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-center">
                <p
                  className={`text-[15px] font-semibold leading-tight ${
                    !livConfig ? 'text-white/30' : livConfig.livDailyWebflowStatus === 'published' ? 'text-emerald-400/95' : 'text-amber-200/90'
                  }`}
                >
                  {!livConfig ? '—' : livConfig.livDailyWebflowStatus === 'published' ? 'Live' : 'Kladde'}
                </p>
                <p className="text-[9px] text-white/32 mt-0.5">Webflow efter cron</p>
                <p className="text-[10px] text-white/35 mt-0.5">LIV_DAILY_WEBFLOW_STATUS</p>
              </div>
              <div className="rounded-lg bg-white/[0.04] px-2.5 py-2 text-center">
                <p
                  className={`text-[15px] font-semibold tabular-nums ${
                    !livConfig
                      ? 'text-white/30'
                      : livConfig.livDailyPaused
                        ? 'text-rose-400/95'
                        : 'text-emerald-400/90'
                  }`}
                >
                  {!livConfig ? '—' : livConfig.livDailyPaused ? 'Pause' : 'Aktiv'}
                </p>
                <p className="text-[10px] text-white/35 mt-0.5">LIV_DAILY_PAUSED</p>
              </div>
            </div>
            {livConfig?.designerBaseUrl && (
              <a
                href={livConfig.designerBaseUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex text-[11px] text-sky-300/90 hover:text-sky-200/95 underline-offset-2"
              >
                Åbn Webflow Designer (artikel-indsamling) ↗
              </a>
            )}
            <p className="text-[10px] text-white/32 leading-relaxed">
              <span className="text-white/45">Forhåndsvisning</span> i dette panel skriver <span className="text-white/50">ikke</span> til
              CMS. <span className="text-white/45">Daglig cron</span> opretter/ajourfører artiklen i Webflow; standard er{' '}
              <code className="text-white/55">kladde</code> i CMS, så den behøver ikke være synlig på aproposmagazine.com, før
              I publicerer. Vil I have cron til at sætte status til publiceret, kan I sætte miljøvariablen{' '}
              <code className="text-white/55">LIV_DAILY_WEBFLOW_STATUS=published</code> i Vercel (kontrol over drift findes
              i kortene ovenfor).
            </p>
          </div>

          <CollapsibleSection
            open={flowHelpOpen}
            onOpenChange={setFlowHelpOpen}
            title="Trin: hvad gør hvad?"
            subtitle="Kort overblik — kronologi som i nyhedsbrev-sektionen"
          >
            <ol className="list-decimal list-outside pl-4 space-y-2 text-[11px] text-white/55 leading-relaxed">
              <li>
                <span className="text-white/75">Dagens emne</span> — samme udvælgelse som morgen-cron (trending, filtreret til
                Livs temaer). Ingenting i forhåndsvisningen skriver til Webflow. «Afvis» og «Næste forslag» styrer kun, hvad I
                ser i panelet.
              </li>
              <li>
                <span className="text-white/75">Generér udkast / preview</span> — kalder preview-API. Det er sikkert at
                prøve vinkler om og om igen: der sker ingen CMS-ændring herfra.
              </li>
              <li>
                <span className="text-white/75">Redaktion + «Planlæg til i morgen»</span> — gemmer emne, vinkel (knapper +
                fritekst) og «kun trending» i Firestore til næste dags cron, når I bekræfter.
              </li>
              <li>
                <span className="text-white/75">Daglig cron (08:00 UTC)</span> — genererer artikel, kører sikkerhed og
                skriver til Webflow med status fra <code className="text-white/50">LIV_DAILY_WEBFLOW_STATUS</code> (kladde
                som standard; typisk ikke ude på sitet, før I publicerer i Webflow Designer).
              </li>
            </ol>
          </CollapsibleSection>

          <p className="text-[11px] text-white/40 px-0.5">
            Preview-dag: <span className="text-white/65">{preview?.dayKey ?? '—'}</span>
            {todayLabel ? <span> · {todayLabel}</span> : null}
          </p>

          {/* ═══ TOPIC TAB ═══ */}
          {activeTab === 'topic' && (
            <>
              <EmbeddedSectionLabel step={1}>Dagens emne</EmbeddedSectionLabel>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/40 mb-2 px-0.5">Automatisk emne · samme logik som daglig cron</p>
              {/* Dagens emne — kort */}
              <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                <div className="flex flex-col sm:flex-row">
                  <div className="sm:w-32 sm:h-auto h-24 bg-[#141414] border-b sm:border-b-0 sm:border-r border-white/[0.08] flex items-center justify-center relative overflow-hidden flex-shrink-0">
                    {previewImageUrl ? (
                      <img
                        src={previewImageUrl}
                        alt={sourceHost || 'kilde'}
                        className="w-12 h-12 rounded-lg opacity-90"
                      />
                    ) : (
                      <span className="text-[11px] uppercase tracking-wider text-white/30">Liv</span>
                    )}
                  </div>

                  <div className="flex-1 min-w-0 px-4 py-3.5">
                    <div className="flex items-center flex-wrap gap-1.5 mb-2">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
                        <span className="size-1.5 rounded-full bg-white/40" /> Næste auto-publish
                      </span>
                      {topic ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/55">
                          Score {topic.score}
                        </span>
                      ) : null}
                      {topic?.category ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/55">
                          {topic.category}
                        </span>
                      ) : null}
                    </div>

                    {previewLoading && !topic ? (
                      <p className="text-[13px] text-white/55">Indlæser dagens emne…</p>
                    ) : !topic ? (
                      <div>
                        <p className="text-[13px] font-medium text-white/85 mb-1">Intet emne valgt i dag</p>
                        <p className="text-[12px] text-white/45 leading-relaxed">
                          {preview?.reason || 'Ingen trending-artikler matcher Liv\'s temaer lige nu. Cron\'en springer dagen over og prøver igen i morgen.'}
                        </p>
                      </div>
                    ) : (
                      <div>
                        <h2 className="text-[15px] font-medium text-white leading-snug mb-1">{topic.title}</h2>
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-white/45 mb-2">
                          {topic.source?.sourceName ? <span>{topic.source.sourceName}</span> : null}
                          {topic.source?.publishedAt ? <span>· {formatRelativeDate(topic.source.publishedAt) || topic.source.publishedAt}</span> : null}
                          {sourceHost ? <span>· {sourceHost}</span> : null}
                        </div>
                        {topic.source?.excerpt && (
                          <p className="text-[12px] text-white/65 leading-relaxed line-clamp-3">{topic.source.excerpt}</p>
                        )}
                        {Array.isArray(topic.tags) && topic.tags.length > 0 && (
                          <div className="flex flex-wrap gap-1 mt-2.5">
                            {topic.tags.slice(0, 8).map((t) => (
                              <span key={t} className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/55">#{t}</span>
                            ))}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/* Action row — sticky så primær handling er synlig ved scroll */}
              {topic && (
                <StickyAppActionBar>
                  <div className="flex gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => loadPreview({ generate: true })}
                    disabled={generateLoading}
                    className={primaryBtnState(!!generateLoading) + ' flex-1 min-w-[10rem]'}
                    aria-busy={generateLoading}
                  >
                    {generateLoading ? (
                      <>
                        <LivBusySpinner />
                        <span>Skriver Livs udkast…</span>
                      </>
                    ) : article ? (
                      'Generér nyt udkast'
                    ) : (
                      'Generér forhåndsvisning'
                    )}
                  </button>
                  {sourceUrl && (
                    <a
                      href={sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`shrink-0 inline-flex items-center justify-center px-4 py-3 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 transition-all duration-200 active:scale-[0.98]`}
                    >
                      Kilde ↗
                    </a>
                  )}
                  <button
                    type="button"
                    onClick={rejectCurrentTopic}
                    disabled={generateLoading}
                    className="shrink-0 inline-flex items-center justify-center px-3 py-3 rounded-xl border border-rose-300/20 text-[13px] text-rose-200/90 hover:bg-rose-500/[0.08] hover:border-rose-300/35 transition-all duration-200 active:scale-[0.98]"
                    title="Afvis dette emne"
                  >
                    X Afvis
                  </button>
                  <button
                    type="button"
                    onClick={loadNextSuggestion}
                    disabled={generateLoading || previewLoading}
                    className="shrink-0 inline-flex items-center justify-center px-3 py-3 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 transition-all duration-200 active:scale-[0.98]"
                  >
                    Næste forslag
                  </button>
                  </div>
                </StickyAppActionBar>
              )}
              </div>

              <EmbeddedSectionLabel step={2}>Redaktion og plan</EmbeddedSectionLabel>
              <CollapsibleSection
                open={editorialOpen}
                onOpenChange={setEditorialOpen}
                title="Redaktion · valgfrit"
                subtitle="Hurtige emner, vinkler og plan for næste cron"
              >
                <div className="flex flex-col gap-0.5 sm:flex-row sm:items-center sm:justify-between gap-3 pb-1">
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-white/40 mb-0.5">Redaktion · valgfrit</p>
                    <p className="text-[12px] font-medium text-white/80">Retning og plan til i morgen</p>
                  </div>
                  <span className="text-[10px] text-white/35 uppercase tracking-wider shrink-0">Felterne overstyrer ikke cron før du gemmer plan</span>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] text-white/55">Emne (valgfrit)</span>
                  <p className="text-[10px] text-white/40 leading-relaxed -mt-0.5">
                    Tvinger omdrejningspunktet, hvis I vil væk fra det automatiske forslag. Bruges i preview med det samme og
                    bliver en del af morgen-cron, når I gemmer en plan.
                  </p>
                  <input
                    value={topicHint}
                    onChange={(e) => setTopicHint(e.target.value)}
                    placeholder="Fx Syd for solen lineup, Sabrina Carpenter, Roskilde line-up, queer klubkultur i København"
                    className="apropos-input-dark w-full rounded-lg border px-3 py-2.5 text-[13px]"
                  />
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {QUICK_TOPIC_PILLS.map((pill) => (
                      <button
                        key={pill}
                        type="button"
                        onClick={() => runQuickStart(pill)}
                        disabled={generateLoading || planLoading}
                        className={quickPillBtn}
                      >
                        {pill}
                      </button>
                    ))}
                  </div>
                </label>

                <div className="block space-y-1.5">
                  <span className="text-[11px] text-white/55">Vinkel / redaktionel intention</span>
                  <p className="text-[10px] text-white/40 leading-relaxed -mt-0.5">
                    Vælg én eller flere færdige vinkler nedenfor (de kan kombineres, fx Lineup <span className="text-white/50">+</span>{' '}
                    Gen Z) og uddyb i fritekstfeltet under, hvis I vil pege skarper — tone, særligt fokus, sammenligning med
                    andre festivaler osv. Det hele lægges sammen og sendes som én retning til preview og plan.
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-white/32 pt-0.5">Hurtige vinkler (tænd/sluk)</p>
                  <div
                    className="flex flex-wrap gap-1.5"
                    role="group"
                    aria-label="Foruddefinerede vinkler"
                  >
                    {LIV_DIRECTIVE_MODES.map((m) => {
                      const on = activeDirectiveModes.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => toggleDirectiveMode(m.id)}
                          className={on ? quickPillBtnActive : quickPillBtn}
                          aria-pressed={on}
                        >
                          {m.label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-[11px] text-white/55">Egen vinkel, nuancer og fritekst (valgfrit)</span>
                  <p className="text-[10px] text-white/40 leading-relaxed -mt-0.5">
                    Tilføjes <span className="text-white/50">efter</span> de valgte hurtige vinkler. Brug det til sætninger,
                    særlige krav, eller hvis I kun vil skrive fritekst uden at bruge knapperne.
                  </p>
                  <textarea
                    value={directiveCustom}
                    onChange={(e) => setDirectiveCustom(e.target.value)}
                    placeholder="Fx kritisk men empatisk, gen Z-perspektiv, start i en sansning fra koncertsalen; fokus på danske artister; undgå ren lineup-liste, find én holdning"
                    rows={4}
                    className="apropos-input-dark w-full rounded-lg border px-3 py-2.5 text-[13px] resize-y"
                  />
                </label>

                <label className="flex items-start gap-2 text-[12px] text-white/65">
                  <input
                    type="checkbox"
                    checked={mustUseTrending}
                    onChange={(e) => setMustUseTrending(e.target.checked)}
                    className="size-4 mt-0.5 rounded border-white/25 bg-black/40"
                  />
                  <span>
                    <span className="text-white/80">Brug kun trending-emner</span>
                    <span className="block text-[10px] text-white/40 leading-relaxed mt-0.5">
                      Når det er <span className="text-white/50">af</span>, kan Liv tage udgangspunkt i jeres emne (fx en
                      festival), selv hvis det ikke ligger helt tæt på dagens trending-pulje — ellers søger den et tæt match
                      i trends først.
                    </span>
                  </span>
                </label>

                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => loadPreview({ generate: true })}
                      disabled={generateLoading || planLoading}
                      className={primaryBtnState(!!generateLoading) + ' sm:col-span-1'}
                      aria-busy={generateLoading}
                    >
                      {generateLoading ? (
                        <>
                          <LivBusySpinner />
                          <span>Liv skriver forhåndsudkast…</span>
                        </>
                      ) : (
                        'Preview med retning'
                      )}
                    </button>
                    <button
                      type="button"
                      onClick={savePlan}
                      disabled={planLoading}
                      className={secondaryBtn}
                    >
                      {planLoading ? 'Gemmer…' : 'Planlæg til i morgen'}
                    </button>
                    <button
                      type="button"
                      onClick={clearPlan}
                      disabled={planLoading || !plan}
                      className={secondaryBtn}
                    >
                      Slet plan
                    </button>
                  </div>
                  {generateLoading ? (
                    <p className="text-[10px] text-white/40 leading-relaxed flex items-center gap-1.5">
                      <span className="size-1.5 rounded-full bg-white/30 animate-pulse" aria-hidden />
                      Liv tænker, undersøger og skriver (typisk 20–90 sek.) — vent her; Webflow røres ikke.
                    </p>
                  ) : null}
                </div>

                {excludedTopics.length > 0 && (
                  <p className="text-[11px] text-white/45 leading-relaxed">
                    Afviste emner (gemmes i denne browser): {excludedTopics.length}.
                    «Næste forslag» og «Afvis» tilføjer det viste emne til listen.
                    {' '}
                    <button
                      type="button"
                      onClick={() => {
                        excludedTopicsRef.current = [];
                        setExcludedTopics([]);
                      }}
                      className="ml-1 text-white/70 hover:text-white underline underline-offset-2"
                    >
                      nulstil
                    </button>
                  </p>
                )}

                {planError && <p className="text-[12px] text-red-400/95">{planError}</p>}

                {plan && (
                  <div className="rounded-lg border border-white/[0.08] bg-black/20 px-3 py-2.5">
                    <p className="text-[11px] text-white/70">
                      Aktiv plan: <span className="text-white/90">{plan.dayKey}</span> · {plan.status}
                    </p>
                    {plan.topicHint ? <p className="text-[11px] text-white/55 mt-1">Emne: {plan.topicHint}</p> : null}
                    {plan.directiveHint ? (
                      <p className="text-[11px] text-white/50 mt-0.5 line-clamp-2">Vinkel: {plan.directiveHint}</p>
                    ) : null}
                  </div>
                )}
              </CollapsibleSection>

              <EmbeddedSectionLabel step={3}>Udkast og kvalitet</EmbeddedSectionLabel>

              {Array.isArray(preview?.warnings) && preview.warnings.length > 0 && (
                <section className="rounded-xl border border-amber-400/25 bg-amber-500/[0.06] px-4 py-3">
                  {preview.warnings.map((w) => (
                    <p key={w} className="text-[12px] text-amber-200/90 leading-relaxed">
                      {w}
                    </p>
                  ))}
                </section>
              )}

              {Array.isArray(preview?.gateResults) && preview.gateResults.length > 0 && (
                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] uppercase tracking-wider text-white/45">Safety Gates</p>
                    <span
                      className={`text-[10px] uppercase tracking-wider ${
                        !preview.gatePass
                          ? 'text-amber-300/90'
                          : preview.gateResults.some((x) => x.skipped)
                            ? 'text-amber-200/90'
                            : 'text-emerald-300/90'
                      }`}
                    >
                      {!preview.gatePass
                        ? 'Kræver review'
                        : preview.gateResults.some((x) => x.skipped)
                          ? 'Pass · med advarsler'
                          : 'Pass'}
                    </span>
                  </div>
                  <div className="space-y-1.5">
                    {preview.gateResults.map((g) => {
                      const gs = gateStatus(g);
                      return (
                      <div
                        key={`${g.name}-${g.detail || ''}`}
                        className="rounded-lg border border-white/[0.08] bg-black/20 px-2.5 py-2"
                      >
                        <p className="text-[11px] text-white/85">
                          {g.name}:{' '}
                          <span className={gs.labelClass}>{gs.label}</span>
                        </p>
                        {g.detail ? (
                          <p className="text-[11px] text-white/50 mt-0.5 leading-relaxed">{g.detail}</p>
                        ) : null}
                      </div>
                    );})}
                  </div>
                </section>
              )}

              {preview?.previewExpandedDirective && (
                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-3">
                  <p className="text-[10px] uppercase tracking-wider text-white/45 mb-1.5">AI-udvidet retning</p>
                  <p className="text-[12px] text-white/75 whitespace-pre-wrap leading-relaxed">
                    {preview.previewExpandedDirective}
                  </p>
                </section>
              )}

              {/* Forhåndsvisning */}
              {generateLoading && !article && (
                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-4 py-4">
                  <p className="text-[12px] text-white/55">Liv skriver udkast — typisk 20-60 sekunder…</p>
                </section>
              )}

              {article && (
                <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
                  <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
                    <div className="flex items-center gap-1.5">
                      <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70">
                        <span className="size-1.5 rounded-full bg-emerald-400" /> Forhåndsvisning
                      </span>
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md border border-white/[0.08] bg-white/[0.03] text-[10px] uppercase tracking-wider text-white/55">
                        {article.section}
                      </span>
                      <span className="text-[11px] text-white/45">{article.wordCount} ord</span>
                    </div>
                    <span className="text-[11px] text-white/30 truncate max-w-[40%]">/{article.slug}</span>
                  </header>

                  <StickyAppActionBar className="!-mx-0 border-b border-white/[0.08] bg-[#0a0a0a]/90 !px-4">
                    <button
                      type="button"
                      onClick={() => loadPreview({ generate: true })}
                      disabled={generateLoading}
                      className={primaryBtnState(!!generateLoading) + ' w-full sm:w-auto min-w-[12rem]'}
                      aria-busy={generateLoading}
                    >
                      {generateLoading ? (
                        <>
                          <LivBusySpinner />
                          <span>Skriver nyt udkast…</span>
                        </>
                      ) : (
                        'Generér nyt udkast'
                      )}
                    </button>
                  </StickyAppActionBar>

                  <div className="px-4 py-4 space-y-3">
                    <div>
                      <h2 className="text-[18px] font-medium text-white leading-tight tracking-tight">{article.title}</h2>
                      {article.subtitle && (
                        <p className="text-white/65 text-[13px] mt-1 leading-snug">{article.subtitle}</p>
                      )}
                    </div>

                    {article.intro && (
                      <p className="text-white/85 text-[13px] leading-relaxed border-l border-white/15 pl-3">{article.intro}</p>
                    )}

                    <div className="text-white/75 text-[13px] leading-[1.7] whitespace-pre-wrap">
                      {article.content}
                    </div>

                    <div className="rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-white/45">SEO &amp; META</p>
                      <div>
                        <p className="text-[10px] text-white/45 mb-0.5">Title ({(article.seoTitle || '').length} tegn)</p>
                        <p className="text-[12px] text-white/85">{article.seoTitle || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-white/45 mb-0.5">Description ({(article.seoDescription || '').length} tegn)</p>
                        <p className="text-[12px] text-white/75 leading-relaxed">{article.seoDescription || '—'}</p>
                      </div>
                      {article.primaryKeyword && (
                        <p className="text-[10px] text-white/45">
                          Primært keyword: <span className="text-white/65">{article.primaryKeyword}</span>
                        </p>
                      )}
                    </div>

                    <div className="rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-3 space-y-2">
                      <p className="text-[10px] uppercase tracking-wider text-white/45">Research QA</p>
                      <div className="flex flex-wrap gap-1.5">
                        <span
                          className={`px-1.5 py-0.5 rounded-md border text-[10px] ${
                            article.qa?.canAutoPublish
                              ? 'border-emerald-400/30 text-emerald-300'
                              : 'border-amber-300/30 text-amber-200'
                          }`}
                        >
                          {article.qa?.canAutoPublish ? 'Auto-publish: klar' : 'Auto-publish: blokeret'}
                        </span>
                        {article.qa?.requiresLineupNames && (
                          <span className="px-1.5 py-0.5 rounded-md border border-white/[0.12] text-[10px] text-white/60">
                            Lineup-krav aktivt
                          </span>
                        )}
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                        <p className="text-[11px] text-white/70">
                          Kilder (URL):{' '}
                          <span className="text-white">
                            {article.qa?.verifiedResearchSourceCount ?? 0}
                          </span>
                        </p>
                        <p className="text-[11px] text-white/70">
                          Verificerede claims:{' '}
                          <span className="text-white">{article.qa?.verifiedClaimsCount ?? 0}</span>
                        </p>
                        <p className="text-[11px] text-white/70">
                          Confidence:{' '}
                          <span
                            className={
                              article.qa?.researchConfidence === 'high'
                                ? 'text-emerald-300'
                                : article.qa?.researchConfidence === 'medium'
                                  ? 'text-amber-300'
                                  : 'text-rose-300'
                            }
                          >
                            {article.qa?.researchConfidence || 'low'}
                          </span>
                        </p>
                      </div>
                      {Array.isArray(article.qa?.lineupNamesUsed) && article.qa.lineupNamesUsed.length > 0 && (
                        <div className="flex flex-wrap gap-1 pt-1">
                          {article.qa.lineupNamesUsed.map((n) => (
                            <span
                              key={n}
                              className="px-1.5 py-0.5 rounded-md bg-white/[0.04] border border-white/[0.08] text-[10px] text-white/65"
                            >
                              {n}
                            </span>
                          ))}
                        </div>
                      )}
                      {Array.isArray(article.qa?.blockers) && article.qa.blockers.length > 0 && (
                        <div className="pt-1 space-y-1">
                          {article.qa.blockers.map((b) => (
                            <p key={b} className="text-[11px] text-amber-200/90">
                              {b}
                            </p>
                          ))}
                        </div>
                      )}
                    </div>

                    {Array.isArray(article.imageSuggestions) && article.imageSuggestions.length > 0 && (
                      <div className="rounded-lg border border-white/[0.08] bg-[#141414] px-3 py-3 space-y-2">
                        <p className="text-[10px] uppercase tracking-wider text-white/45">Billedeforslag</p>
                        <div className="space-y-1.5">
                          {article.imageSuggestions.slice(0, 4).map((img) => (
                            <a
                              key={img.url}
                              href={img.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="block text-[11px] text-white/75 hover:text-white underline underline-offset-2 break-all"
                            >
                              {img.title || img.source || 'Billede'} ↗
                            </a>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </section>
              )}
            </>
          )}

          {/* ═══ HISTORY TAB ═══ */}
          {activeTab === 'history' && (
            <section className="rounded-xl border border-white/[0.08] bg-white/[0.02] overflow-hidden">
              <header className="flex items-center justify-between gap-3 px-4 py-2.5 border-b border-white/[0.06]">
                <div className="min-w-0">
                  <p className="text-[12px] font-medium text-white/80">Seneste historik (kørsler + CMS)</p>
                  {historyCounts && Object.keys(historyCounts).length > 0 && (
                    <p className="text-[10px] text-white/30 truncate">
                      {Object.entries(historyCounts)
                        .map(([k, v]) => `${STATUS_META[k as LivStatus]?.label || k}: ${v}`)
                        .join(' · ')}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => loadHistory()}
                  disabled={historyLoading}
                  className="text-[11px] text-white/45 hover:text-white/75 disabled:opacity-50 transition-colors"
                >
                  {historyLoading ? 'Henter…' : 'Opdater'}
                </button>
              </header>

              <div className="px-3 py-2">
                {historyError && (
                  <p className="text-[12px] text-red-400/95 px-1 py-1">{historyError}</p>
                )}

                {history.length === 0 && !historyLoading && !historyError ? (
                  <p className="text-[12px] text-white/45 px-1 py-2">
                    Ingen historik fundet endnu. Når artikler findes i Webflow CMS eller cron-log, vises de her.
                  </p>
                ) : (
                  <ul className="space-y-1">
                    {history.map((h) => {
                      const meta = STATUS_META[h.status] || { label: h.status, tone: 'idle' as const };
                      return (
                        <li
                          key={h.id}
                          className="flex items-start gap-3 px-3 py-2 rounded-lg border border-white/[0.06] hover:bg-white/[0.03] transition-colors"
                        >
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70 whitespace-nowrap mt-0.5">
                            <span className={`size-1.5 rounded-full ${TONE_DOT[meta.tone]}`} /> {meta.label}
                          </span>
                          <div className="flex-1 min-w-0">
                            <p className="text-[12px] text-white/85 truncate">{h.title || h.topic || '—'}</p>
                            <p className="text-[10px] text-white/35 truncate">
                              {h.dayKey} · {formatDateDk(h.finishedAt)}
                              {h.reason ? ` · ${h.reason}` : ''}
                            </p>
                          </div>
                          <div className="flex flex-col items-end gap-0.5 shrink-0 mt-0.5">
                            {h.slug && h.status === 'published' && (
                              <a
                                href={`https://aproposmagazine.com/artikler/${h.slug}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-emerald-200/80 hover:text-emerald-100/95 whitespace-nowrap"
                              >
                                Live ↗
                              </a>
                            )}
                            {livConfig?.designerBaseUrl && h.status === 'draft' && (
                              <a
                                href={livConfig.designerBaseUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-[11px] text-sky-200/80 hover:text-sky-100/90 whitespace-nowrap"
                                title="Åbn Webflow Designer — find udkastet i artikel-indsamlingen"
                              >
                                Webflow ↗
                              </a>
                            )}
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </section>
          )}

          {/* Footer hint */}
          <p className="text-[10px] text-white/30 px-1 pt-1 leading-relaxed">
            Cron kører kl. 08:00 UTC. Test uden publish:{' '}
            <code className="text-white/55">/api/cron/liv-daily-article?dryRun=1</code>
            {' · '}
            Global blokliste (UI + cron): env{' '}
            <code className="text-white/55">LIV_TOPIC_TITLE_BLOCKLIST</code> (komma, fx <code className="text-white/55">kanye west</code>).
          </p>
        </div>
      </div>

      {/* Secondary action — fixed in footer area for parity with newsletter */}
      {topic && activeTab === 'topic' && (
        <div className="border-t border-white/10 px-3 lg:px-4 py-2.5 bg-black/25 backdrop-blur-md">
          <button
            type="button"
            onClick={() => loadNextSuggestion()}
            disabled={previewLoading}
            className={secondaryBtn}
          >
            {previewLoading ? 'Henter nyt emne…' : 'Spring dette emne'}
          </button>
        </div>
      )}
    </div>
  );
}
