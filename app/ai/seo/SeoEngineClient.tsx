'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import { useAuth } from '@/lib/auth-context';
import ArchiveAuditPanel from '@/components/seo/ArchiveAuditPanel';
import OpportunityQueuePanel from '@/components/seo/OpportunityQueuePanel';
import {
  ARTICLE_TYPE_OPTIONS,
  EDITOR_FIELD_ORDER,
  buildCopyBundleFromEditable,
  fieldValueAsEditableString,
  normalizeSearchSignalsUiNote,
  parseEditableString,
  parseRelatedAproposText,
  relatedAproposToText,
  searchSignalsStatusDotClass,
  selectDiffPair,
} from '@/lib/seo-engine/ui-helpers';
import type { AllowlistedFieldPath } from '@/lib/seo-engine/schema';

const primaryBtn =
  'w-full px-4 py-3 rounded-xl text-[14px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]';

const secondaryBtn =
  'px-3 py-2 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/18 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const dangerOutlineBtn =
  'w-full py-2.5 rounded-xl border border-white/25 text-[13px] text-white/90 hover:bg-white/[0.08] disabled:opacity-40 transition-all duration-200 active:scale-[0.98]';

const fieldClass =
  'apropos-input-dark w-full rounded-lg border border-white/[0.12] bg-[#141414] px-3 py-2.5 text-[13px] text-white focus:border-white/25 focus:outline-none focus:ring-1 focus:ring-white/10 [color-scheme:dark]';

/** Client flag: pair with server SEO_ENGINE_DEMO to use ephemeral analyze/strategize. */
const CLIENT_EPHEMERAL_DEMO = process.env.NEXT_PUBLIC_SEO_ENGINE_DEMO === 'true';

type MainTab = 'arkiv' | 'optimering' | 'artikel';

const segBtn = (active: boolean) =>
  `rounded-lg px-3 py-1.5 text-[12px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] touch-target ${
    active
      ? 'bg-white/12 text-white shadow-sm border border-white/10'
      : 'text-white/45 hover:text-white/75'
  }`;

type Seed = {
  title?: string;
  body?: string;
  subtitle?: string;
  intro?: string;
  author?: string;
  section?: string;
  articleType?: string;
  rating?: number;
  platform?: string;
  festival?: string;
  venue?: string;
  city?: string;
  publishDate?: string;
  eventDate?: string;
  premiereOrReleaseDate?: string;
  existingUrl?: string;
  existingSlug?: string;
  imageUrl?: string;
  imageDescription?: string;
  ticketLink?: string;
  streamingLink?: string;
  trailerLink?: string;
  notesForAi?: string;
  knownFacts?: string[];
  relatedAproposArticles?: Array<{ id?: string; url?: string; title?: string }>;
  freshnessHint?: 'evergreen' | 'timely' | 'both';
  language?: 'da' | 'en';
  webflowItemId?: string;
  articleKey?: string;
  existingSeoTitle?: string | null;
  existingMetaDescription?: string | null;
};

type SeoEngineClientProps = {
  embedded?: boolean;
  onClose?: () => void;
  initialTitle?: string;
  initialBody?: string;
  seed?: Seed;
};

type FieldState = {
  value: string;
  locked: boolean;
  rationale?: string;
  warnings?: string[];
  confidence?: number;
};

type ValidationIssue = { code?: string; message: string; fieldPath?: string };

async function authHeaders(
  user: { getIdToken: () => Promise<string> } | null,
  opts?: { ephemeral?: boolean }
) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (user) headers.Authorization = `Bearer ${await user.getIdToken()}`;
  if (opts?.ephemeral) headers['x-seo-engine-ephemeral-demo'] = '1';
  return headers;
}

function BandDot({ band }: { band?: string }) {
  const color =
    band === 'high' ? 'bg-emerald-400' : band === 'medium' ? 'bg-amber-400' : 'bg-white/40';
  return <span className={`size-1.5 rounded-full ${color}`} />;
}

function seedToInput(seed: Seed, overrides: Record<string, unknown>) {
  const pick = (key: string, fallback?: string) => {
    const v = overrides[key] ?? (seed as Record<string, unknown>)[key] ?? fallback ?? '';
    const s = String(v || '').trim();
    return s || undefined;
  };
  const imageUrl = pick('imageUrl') || seed.imageUrl || undefined;
  const imageDescription = pick('imageDescription') || seed.imageDescription || undefined;
  const related =
    (overrides.relatedAproposArticles as Seed['relatedAproposArticles']) ||
    seed.relatedAproposArticles;
  return {
    editorialTitle: String(overrides.title || seed.title || '').trim(),
    language: (overrides.language as 'da' | 'en') || seed.language || 'da',
    body: String(overrides.body || seed.body || ''),
    subtitle: pick('subtitle'),
    intro: pick('intro'),
    author: pick('author'),
    section: pick('section'),
    articleType: pick('articleType'),
    rating:
      typeof overrides.rating === 'number'
        ? overrides.rating
        : typeof seed.rating === 'number'
          ? seed.rating
          : undefined,
    streamingPlatform: pick('platform'),
    festival: pick('festival'),
    venue: pick('venue'),
    city: pick('city'),
    publishDate: pick('publishDate'),
    eventDate: pick('eventDate'),
    premiereOrReleaseDate: pick('premiereOrReleaseDate'),
    existingUrl: pick('existingUrl'),
    existingSlug: pick('existingSlug'),
    primaryImage:
      imageUrl || imageDescription
        ? {
            url: imageUrl,
            description: imageDescription,
          }
        : undefined,
    ticketLink: pick('ticketLink'),
    streamingLink: pick('streamingLink'),
    trailerLink: pick('trailerLink'),
    relatedAproposArticles: related?.length ? related : undefined,
    knownFacts: Array.isArray(overrides.knownFacts)
      ? (overrides.knownFacts as string[])
      : seed.knownFacts,
    notesForAi: pick('notesForAi'),
    freshnessHint: (overrides.freshnessHint as Seed['freshnessHint']) || seed.freshnessHint,
    existingSeoTitle: seed.existingSeoTitle ?? null,
    existingMetaDescription: seed.existingMetaDescription ?? null,
  };
}

function IssueList({
  title,
  items,
  tone,
}: {
  title: string;
  items: ValidationIssue[];
  tone: 'err' | 'warn' | 'info';
}) {
  if (!items.length) return null;
  const dot =
    tone === 'err' ? 'bg-rose-400' : tone === 'warn' ? 'bg-amber-400' : 'bg-white/40';
  return (
    <div className="space-y-1">
      <p className="text-[11px] font-medium text-white/55 flex items-center gap-1.5">
        <span className={`size-1.5 rounded-full ${dot}`} />
        {title}
      </p>
      <ul className="space-y-0.5">
        {items.map((it, i) => (
          <li key={`${it.code || 'x'}-${i}`} className="text-[11px] text-white/45">
            {it.fieldPath ? (
              <span className="text-white/65">{it.fieldPath}: </span>
            ) : null}
            {it.message}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function SeoEngineClient({
  embedded = false,
  onClose,
  initialTitle = '',
  initialBody = '',
  seed: seedProp,
}: SeoEngineClientProps) {
  const { user } = useAuth();
  const seed: Seed = useMemo(
    () => ({
      title: initialTitle,
      body: initialBody,
      ...seedProp,
    }),
    [initialTitle, initialBody, seedProp]
  );

  const [title, setTitle] = useState(seed.title || '');
  const [body, setBody] = useState(seed.body || '');
  const [subtitle, setSubtitle] = useState(seed.subtitle || '');
  const [intro, setIntro] = useState(seed.intro || '');
  const [author, setAuthor] = useState(seed.author || '');
  const [section, setSection] = useState(seed.section || '');
  const [articleType, setArticleType] = useState(seed.articleType || '');
  const [rating, setRating] = useState(seed.rating ? String(seed.rating) : '');
  const [platform, setPlatform] = useState(seed.platform || '');
  const [festival, setFestival] = useState(seed.festival || '');
  const [venue, setVenue] = useState(seed.venue || '');
  const [city, setCity] = useState(seed.city || '');
  const [publishDate, setPublishDate] = useState(seed.publishDate || '');
  const [eventDate, setEventDate] = useState(seed.eventDate || '');
  const [premiereOrReleaseDate, setPremiereOrReleaseDate] = useState(
    seed.premiereOrReleaseDate || ''
  );
  const [existingUrl, setExistingUrl] = useState(seed.existingUrl || '');
  const [existingSlug, setExistingSlug] = useState(seed.existingSlug || '');
  const [imageUrl, setImageUrl] = useState(seed.imageUrl || '');
  const [imageDescription, setImageDescription] = useState(seed.imageDescription || '');
  const [ticketLink, setTicketLink] = useState(seed.ticketLink || '');
  const [streamingLink, setStreamingLink] = useState(seed.streamingLink || '');
  const [trailerLink, setTrailerLink] = useState(seed.trailerLink || '');
  const [knownFactsText, setKnownFactsText] = useState((seed.knownFacts || []).join('\n'));
  const [relatedArticlesText, setRelatedArticlesText] = useState(
    relatedAproposToText(seed.relatedAproposArticles)
  );
  const [notesForAi, setNotesForAi] = useState(seed.notesForAi || '');
  const [freshnessHint, setFreshnessHint] = useState<Seed['freshnessHint']>(
    seed.freshnessHint || 'both'
  );
  const [language, setLanguage] = useState<'da' | 'en'>(seed.language || 'da');
  const [showAdvancedInput, setShowAdvancedInput] = useState(false);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [analyze, setAnalyze] = useState<any>(null);
  const [strategy, setStrategy] = useState<any>(null);
  const [revision, setRevision] = useState(1);
  const [seoVersionId, setSeoVersionId] = useState<string | null>(null);
  const [articleKey, setArticleKey] = useState<string | null>(seed.articleKey || null);
  const [fieldEdits, setFieldEdits] = useState<Partial<Record<AllowlistedFieldPath, FieldState>>>(
    {}
  );
  const [regenInstr, setRegenInstr] = useState<Partial<Record<string, string>>>({});
  const [activeAlt, setActiveAlt] = useState<number | null>(null);
  const [history, setHistory] = useState<any>(null);
  const [diffA, setDiffA] = useState<string | null>(null);
  const [diffB, setDiffB] = useState<string | null>(null);
  const [diffs, setDiffs] = useState<Array<{ fieldPath: string; previous: unknown; next: unknown }>>(
    []
  );
  const [copyNotice, setCopyNotice] = useState<string | null>(null);
  const [ephemeralMode, setEphemeralMode] = useState(false);
  const [mainTab, setMainTab] = useState<MainTab>(
    seed.title || seed.body ? 'artikel' : 'arkiv'
  );

  const viewingAlt = activeAlt !== null;
  const altReadOnly = viewingAlt;

  useEffect(() => {
    setTitle(seed.title || '');
    setBody(seed.body || '');
    setImageUrl(seed.imageUrl || '');
    setRelatedArticlesText(relatedAproposToText(seed.relatedAproposArticles));
  }, [seed.title, seed.body, seed.imageUrl, seed.relatedAproposArticles]);

  const hydrateFieldsFromPack = useCallback((pack: any) => {
    const fields = pack?.recommended?.fields || {};
    const next: Partial<Record<AllowlistedFieldPath, FieldState>> = {};
    for (const key of EDITOR_FIELD_ORDER) {
      const f = fields[key];
      if (!f) continue;
      next[key] = {
        value: fieldValueAsEditableString(f.value),
        locked: Boolean(f.locked),
        rationale: f.rationale,
        warnings: f.warnings,
        confidence: f.confidence,
      };
    }
    setFieldEdits(next);
  }, []);

  const currentInput = useCallback(() => {
    const ratingNum = rating ? Number(rating) : undefined;
    return seedToInput(seed, {
      title,
      body,
      subtitle,
      intro,
      author,
      section,
      articleType,
      rating: Number.isFinite(ratingNum) ? ratingNum : undefined,
      platform,
      festival,
      venue,
      city,
      publishDate,
      eventDate,
      premiereOrReleaseDate,
      existingUrl,
      existingSlug,
      imageUrl,
      imageDescription,
      ticketLink,
      streamingLink,
      trailerLink,
      knownFacts: knownFactsText
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean),
      relatedAproposArticles: parseRelatedAproposText(relatedArticlesText),
      notesForAi,
      freshnessHint,
      language,
    });
  }, [
    seed,
    title,
    body,
    subtitle,
    intro,
    author,
    section,
    articleType,
    rating,
    platform,
    festival,
    venue,
    city,
    publishDate,
    eventDate,
    premiereOrReleaseDate,
    existingUrl,
    existingSlug,
    imageUrl,
    imageDescription,
    ticketLink,
    streamingLink,
    trailerLink,
    knownFactsText,
    relatedArticlesText,
    notesForAi,
    freshnessHint,
    language,
  ]);

  const runPipeline = useCallback(async () => {
    setBusy(true);
    setError(null);
    setStrategy(null);
    setDiffs([]);
    setActiveAlt(null);
    try {
      const wantEphemeral = CLIENT_EPHEMERAL_DEMO;
      const headers = await authHeaders(user, { ephemeral: wantEphemeral });
      const input = currentInput();
      const aRes = await fetch('/api/seo-engine/analyze', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          input,
          articleKey: seed.articleKey || articleKey,
          webflowItemId: seed.webflowItemId,
          forceDemo: false,
          ephemeralDemo: wantEphemeral || undefined,
        }),
      });
      const aJson = await aRes.json();
      if (!aRes.ok || !aJson.ok) throw new Error(aJson.error || 'Analyse fejlede');
      setAnalyze(aJson);
      setArticleKey(aJson.articleKey || null);
      const isEphemeral = Boolean(aJson.ephemeral || aJson.persistDisabled);
      setEphemeralMode(isEphemeral);

      const sRes = await fetch('/api/seo-engine/strategize', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          analysisRunId: aJson.analysisRunId,
          currentInput: input,
          ephemeralDemo: wantEphemeral || undefined,
        }),
      });
      const sJson = await sRes.json();
      if (!sRes.ok || !sJson.ok) throw new Error(sJson.error || 'Strategi fejlede');
      setStrategy(sJson);
      setSeoVersionId(sJson.seoVersionId);
      setRevision(sJson.revision || 1);
      if (sJson.ephemeral || sJson.persistDisabled) setEphemeralMode(true);
      hydrateFieldsFromPack(sJson.pack);
      setActiveAlt(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [user, currentInput, seed.articleKey, seed.webflowItemId, articleKey, hydrateFieldsFromPack]);

  const saveAll = useCallback(async (): Promise<number | null> => {
    if (!seoVersionId) return null;
    if (ephemeralMode) {
      setError('Gem er utilgængeligt i ephemeral demo');
      return null;
    }
    if (viewingAlt) {
      setError('Skift til anbefalet eller tryk «Brug denne retning» før gem');
      return null;
    }
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders(user);
      const patches = EDITOR_FIELD_ORDER.flatMap((fieldPath) => {
        const st = fieldEdits[fieldPath];
        if (!st) return [];
        try {
          return [
            {
              fieldPath,
              value: parseEditableString(fieldPath, st.value),
              locked: st.locked,
            },
          ];
        } catch {
          throw new Error(`Ugyldigt indhold i ${fieldPath}`);
        }
      });
      const res = await fetch('/api/seo-engine/save-fields', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          seoVersionId,
          expectedRevision: revision,
          patches,
          currentInput: currentInput(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Gem fejlede');
      setRevision(j.revision);
      setStrategy((prev: any) => ({ ...prev, pack: j.pack, revision: j.revision }));
      hydrateFieldsFromPack(j.pack);
      return j.revision as number;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return null;
    } finally {
      setBusy(false);
    }
  }, [
    seoVersionId,
    ephemeralMode,
    viewingAlt,
    user,
    fieldEdits,
    revision,
    currentInput,
    hydrateFieldsFromPack,
  ]);

  const adoptAltDirection = useCallback(async () => {
    if (activeAlt === null || !strategy?.pack?.alternatives?.[activeAlt]) return;
    if (!seoVersionId) {
      setError('Ingen seoVersion — kør strategi først');
      return;
    }
    if (ephemeralMode) {
      setError('Adoption utilgængelig i ephemeral demo');
      return;
    }
    const alt = strategy.pack.alternatives[activeAlt];
    setBusy(true);
    setError(null);
    try {
      const headers = await authHeaders(user);
      const res = await fetch('/api/seo-engine/save-fields', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          seoVersionId,
          expectedRevision: revision,
          patches: [],
          adoptStrategyId: alt.id,
          currentInput: currentInput(),
        }),
      });
      const j = await res.json();
      if (!res.ok || !j.ok) throw new Error(j.error || 'Adoption fejlede');
      setRevision(j.revision);
      setStrategy((prev: any) => ({ ...prev, pack: j.pack, revision: j.revision }));
      hydrateFieldsFromPack(j.pack);
      setActiveAlt(null);
      setCopyNotice('Retning adopteret (server-valideret)');
      setTimeout(() => setCopyNotice(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }, [
    activeAlt,
    strategy,
    seoVersionId,
    ephemeralMode,
    user,
    revision,
    currentInput,
    hydrateFieldsFromPack,
  ]);

  const regenerate = useCallback(
    async (fieldPath: AllowlistedFieldPath) => {
      if (!seoVersionId) return;
      if (ephemeralMode) {
        setError('Regenerate utilgængelig i ephemeral demo');
        return;
      }
      if (viewingAlt) {
        setError('Regenerate kun på anbefalet — brug «Brug denne retning» først');
        return;
      }
      if (fieldEdits[fieldPath]?.locked) {
        setError('Feltet er låst');
        return;
      }
      setBusy(true);
      setError(null);
      try {
        const savedRevision = await saveAll();
        if (savedRevision == null) return;
        const headers = await authHeaders(user);
        const res = await fetch('/api/seo-engine/regenerate-field', {
          method: 'POST',
          headers,
          body: JSON.stringify({
            seoVersionId,
            fieldPath,
            expectedRevision: savedRevision,
            editorInstruction: regenInstr[fieldPath] || undefined,
            currentInput: currentInput(),
          }),
        });
        const j = await res.json();
        if (!res.ok || !j.ok) throw new Error(j.error || 'Regenerate fejlede');
        setRevision(j.revision);
        setFieldEdits((prev) => ({
          ...prev,
          [fieldPath]: {
            value: fieldValueAsEditableString(j.field?.value),
            locked: Boolean(j.field?.locked),
            rationale: j.field?.rationale,
            warnings: j.field?.warnings,
            confidence: j.field?.confidence,
          },
        }));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setBusy(false);
      }
    },
    [
      seoVersionId,
      ephemeralMode,
      viewingAlt,
      fieldEdits,
      saveAll,
      user,
      regenInstr,
      currentInput,
    ]
  );

  const copyOne = async (fieldPath: AllowlistedFieldPath) => {
    try {
      const v = fieldEdits[fieldPath]?.value || '';
      await navigator.clipboard.writeText(v);
      setCopyNotice(`Kopieret ${fieldPath}`);
      setTimeout(() => setCopyNotice(null), 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kopiering fejlede');
    }
  };

  const copyAll = async () => {
    try {
      const { text, skipped } = buildCopyBundleFromEditable(fieldEdits);
      await navigator.clipboard.writeText(text);
      setCopyNotice(
        skipped.length
          ? `Kopieret (sprang over ugyldig JSON: ${skipped.join(', ')})`
          : 'Kopieret alle felter'
      );
      setTimeout(() => setCopyNotice(null), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Kopiering fejlede');
    }
  };

  const loadHistory = async () => {
    if (!articleKey) return;
    if (ephemeralMode) {
      setError('Historik er utilgængelig i ephemeral demo');
      return;
    }
    const headers = await authHeaders(user);
    const res = await fetch(`/api/seo-engine/history?articleKey=${encodeURIComponent(articleKey)}`, {
      headers,
    });
    const j = await res.json();
    if (!res.ok || !j.ok) {
      setError(j.error || 'Historik fejlede');
      return;
    }
    setHistory(j);
    const ids = (j.versions || []).map((v: any) => v.id);
    const pair = selectDiffPair(ids, diffA, diffB);
    setDiffA(pair.a);
    setDiffB(pair.b);
  };

  const loadDiff = async () => {
    if (!diffA || !diffB) return;
    if (ephemeralMode) {
      setError('Diff utilgængelig i ephemeral demo');
      return;
    }
    const headers = await authHeaders(user);
    const res = await fetch(
      `/api/seo-engine/history?seoVersionIdA=${encodeURIComponent(diffA)}&seoVersionIdB=${encodeURIComponent(diffB)}`,
      { headers }
    );
    const j = await res.json();
    if (!res.ok || !j.ok) {
      setError(j.error || 'Diff fejlede');
      return;
    }
    setDiffs(j.diffs || []);
  };

  const softDelete = async () => {
    if (!articleKey) return;
    if (ephemeralMode) {
      setError('Soft-delete utilgængelig i ephemeral demo');
      return;
    }
    if (!window.confirm('Soft-delete SEO-historik for denne artikel?')) return;
    const headers = await authHeaders(user);
    const res = await fetch(
      `/api/seo-engine/history?articleKey=${encodeURIComponent(articleKey)}`,
      { method: 'DELETE', headers }
    );
    const j = await res.json();
    if (!res.ok || !j.ok) {
      setError(j.error || 'Sletning fejlede');
      return;
    }
    setHistory(null);
    setCopyNotice('Soft-deleted');
  };

  const publishability = strategy?.pack?.cmsPublishability || {};
  const analysisDoc = analyze?.analysis;
  const searchSignalsUiNote = analyze
    ? normalizeSearchSignalsUiNote(analyze.searchSignalsProvenance?.uiNote)
    : null;
  const searchSignalsSetupStatus =
    typeof analyze?.searchSignalsProvenance?.setupStatus === 'string'
      ? analyze.searchSignalsProvenance.setupStatus
      : null;
  const validation = (strategy?.validation || analyze?.validation) as
    | { errors?: ValidationIssue[]; warnings?: ValidationIssue[]; suggestions?: ValidationIssue[] }
    | undefined;
  const recommendedFields = strategy?.pack?.recommended?.fields;
  const checklist = (recommendedFields?.checklist?.value || []) as Array<{
    id: string;
    label: string;
    done: boolean;
    severity: string;
  }>;
  const risks = (recommendedFields?.risks?.value || []) as Array<{
    code: string;
    message: string;
    severity: string;
  }>;

  return (
    <div className="flex flex-col h-full min-h-0 text-white bg-transparent font-poppins">
      <EmbeddedAppHeader embedded={embedded} title="SEO Engine" onClose={onClose} />
      <div className="flex-1 min-h-0 overflow-y-auto nice-scrollbar p-3 lg:p-4 space-y-4">
        <div className="flex flex-wrap items-center gap-1.5">
          <button type="button" className={segBtn(mainTab === 'arkiv')} onClick={() => setMainTab('arkiv')}>
            Arkiv
          </button>
          <button
            type="button"
            className={segBtn(mainTab === 'optimering')}
            onClick={() => setMainTab('optimering')}
          >
            Optimering
          </button>
          <button
            type="button"
            className={segBtn(mainTab === 'artikel')}
            onClick={() => setMainTab('artikel')}
          >
            Artikel
          </button>
        </div>

        {(CLIENT_EPHEMERAL_DEMO || ephemeralMode) && (
          <div className="rounded-xl border border-amber-400/30 bg-white/[0.04] px-3 py-2.5 space-y-1">
            <p className="text-[12px] text-white/85 flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-amber-400" />
              Ephemeral demo
            </p>
            <p className="text-[11px] text-white/45">
              Gem, historik og auto-publish er utilgængelige. Analyse/strategi kører in-memory uden
              Firebase/OpenAI (kræver SEO_ENGINE_DEMO + header).
            </p>
          </div>
        )}

        {mainTab === 'arkiv' && <ArchiveAuditPanel />}

        {mainTab === 'optimering' && <OpportunityQueuePanel />}

        {mainTab === 'artikel' && (
          <>
        <section className="space-y-2">
          <p className="text-[13px] font-medium text-white/85">Én artikel</p>
          <p className="text-[11px] text-white/40 -mt-1">
            Skriv eller indsæt titel og brødtekst for at analysere SEO manuelt.
          </p>
          <label className="text-[11px] text-white/45">Titel</label>
          <input className={fieldClass} value={title} onChange={(e) => setTitle(e.target.value)} />
          <label className="text-[11px] text-white/45">Brødtekst</label>
          <textarea
            className={`${fieldClass} min-h-[120px]`}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
          <button
            type="button"
            className={secondaryBtn}
            onClick={() => setShowAdvancedInput((v) => !v)}
          >
            {showAdvancedInput ? 'Skjul avanceret input' : 'Avanceret input'}
          </button>
          {showAdvancedInput && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 rounded-xl border border-white/10 p-3 bg-white/[0.02]">
              <input className={fieldClass} placeholder="Undertitel" value={subtitle} onChange={(e) => setSubtitle(e.target.value)} />
              <input className={fieldClass} placeholder="Intro" value={intro} onChange={(e) => setIntro(e.target.value)} />
              <input className={fieldClass} placeholder="Forfatter" value={author} onChange={(e) => setAuthor(e.target.value)} />
              <input className={fieldClass} placeholder="Sektion" value={section} onChange={(e) => setSection(e.target.value)} />
              <select className={fieldClass} value={articleType} onChange={(e) => setArticleType(e.target.value)}>
                {ARTICLE_TYPE_OPTIONS.map((o) => (
                  <option key={o || 'empty'} value={o}>
                    {o || 'Artikeltype…'}
                  </option>
                ))}
              </select>
              <input className={fieldClass} placeholder="Rating 1–6" value={rating} onChange={(e) => setRating(e.target.value)} />
              <input className={fieldClass} placeholder="Platform" value={platform} onChange={(e) => setPlatform(e.target.value)} />
              <input className={fieldClass} placeholder="Festival" value={festival} onChange={(e) => setFestival(e.target.value)} />
              <input className={fieldClass} placeholder="Venue" value={venue} onChange={(e) => setVenue(e.target.value)} />
              <input className={fieldClass} placeholder="By" value={city} onChange={(e) => setCity(e.target.value)} />
              <input className={fieldClass} placeholder="Publish date" value={publishDate} onChange={(e) => setPublishDate(e.target.value)} />
              <input className={fieldClass} placeholder="Event date" value={eventDate} onChange={(e) => setEventDate(e.target.value)} />
              <input className={fieldClass} placeholder="Premiere/release" value={premiereOrReleaseDate} onChange={(e) => setPremiereOrReleaseDate(e.target.value)} />
              <input className={fieldClass} placeholder="URL" value={existingUrl} onChange={(e) => setExistingUrl(e.target.value)} />
              <input className={fieldClass} placeholder="Slug" value={existingSlug} onChange={(e) => setExistingSlug(e.target.value)} />
              <input
                className={fieldClass}
                placeholder="Primært billede URL"
                value={imageUrl}
                onChange={(e) => setImageUrl(e.target.value)}
              />
              <input className={fieldClass} placeholder="Billedbeskrivelse" value={imageDescription} onChange={(e) => setImageDescription(e.target.value)} />
              <input className={fieldClass} placeholder="Ticket link" value={ticketLink} onChange={(e) => setTicketLink(e.target.value)} />
              <input className={fieldClass} placeholder="Streaming link" value={streamingLink} onChange={(e) => setStreamingLink(e.target.value)} />
              <input className={fieldClass} placeholder="Trailer link" value={trailerLink} onChange={(e) => setTrailerLink(e.target.value)} />
              <select className={fieldClass} value={language} onChange={(e) => setLanguage(e.target.value as 'da' | 'en')}>
                <option value="da">Dansk</option>
                <option value="en">English</option>
              </select>
              <select
                className={fieldClass}
                value={freshnessHint || 'both'}
                onChange={(e) => setFreshnessHint(e.target.value as Seed['freshnessHint'])}
              >
                <option value="evergreen">Evergreen</option>
                <option value="timely">Timely</option>
                <option value="both">Both</option>
              </select>
              <textarea
                className={`${fieldClass} md:col-span-2 min-h-[70px]`}
                placeholder="Known facts (én pr. linje)"
                value={knownFactsText}
                onChange={(e) => setKnownFactsText(e.target.value)}
              />
              <textarea
                className={`${fieldClass} md:col-span-2 min-h-[70px]`}
                placeholder="Relaterede Apropos-artikler (titel | url — én pr. linje)"
                value={relatedArticlesText}
                onChange={(e) => setRelatedArticlesText(e.target.value)}
              />
              <textarea
                className={`${fieldClass} md:col-span-2 min-h-[70px]`}
                placeholder="Noter til AI"
                value={notesForAi}
                onChange={(e) => setNotesForAi(e.target.value)}
              />
            </div>
          )}
          <button type="button" className={primaryBtn} disabled={busy || !title.trim() || body.trim().length < 200} onClick={() => void runPipeline()}>
            {busy ? 'Kører…' : 'Analysér + strategi'}
          </button>
        </section>

        {error && <p className="text-[12px] text-red-400/95">{error}</p>}
        {copyNotice && <p className="text-[11px] text-white/50">{copyNotice}</p>}

        {analyze && (
          <section className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-2">
            <div className="flex items-center gap-2 text-[12px] text-white/70 flex-wrap">
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06]">
                <BandDot band={analyze.confidenceBand?.band} />
                {analyze.confidenceBand?.band || 'low'}
              </span>
              <span className="text-white/40">
                {analyze.ephemeral
                  ? 'Ephemeral demo'
                  : analyze.mode === 'demo'
                    ? 'Demo-heuristik'
                    : 'AI Fase A'}
              </span>
              {searchSignalsUiNote && (
                <span
                  className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-white/15 bg-white/[0.06] text-[10px] uppercase tracking-wider text-white/70"
                  title={searchSignalsSetupStatus || 'Search Console-status for denne analyse'}
                >
                  <span
                    className={`size-1.5 rounded-full ${searchSignalsStatusDotClass(searchSignalsUiNote)}`}
                  />
                  {searchSignalsUiNote}
                </span>
              )}
            </div>
            <p className="text-[13px] text-white/85">{analysisDoc?.topic?.value}</p>
            <p className="text-[11px] text-white/40">{analysisDoc?.angleOrThesis?.value}</p>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
              <div className="rounded-lg border border-white/[0.06] p-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Primær entitet</p>
                <p className="text-[12px] text-white/80">
                  {analysisDoc?.primaryEntity?.asWritten || '—'}
                  {analysisDoc?.primaryEntity?.entityType
                    ? ` · ${analysisDoc.primaryEntity.entityType}`
                    : ''}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] p-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Artikeltype</p>
                <p className="text-[12px] text-white/80">
                  {analysisDoc?.articleType?.suggested || '—'}
                  {analysisDoc?.articleType?.conflict ? ' (konflikt med editor)' : ''}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] p-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Intent</p>
                <p className="text-[12px] text-white/80">
                  {analysisDoc?.searchIntent?.primary || '—'}
                  {analysisDoc?.searchIntent?.secondary
                    ? ` / ${analysisDoc.searchIntent.secondary}`
                    : ''}
                </p>
              </div>
              <div className="rounded-lg border border-white/[0.06] p-2 space-y-1">
                <p className="text-[10px] uppercase tracking-wider text-white/30">Verdict</p>
                <p className="text-[12px] text-white/80">
                  {analysisDoc?.stanceOrVerdict?.value || '—'}
                </p>
              </div>
            </div>

            {(analysisDoc?.secondaryEntities || []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
                  Sekundære entiteter
                </p>
                <ul className="flex flex-wrap gap-1.5">
                  {(analysisDoc.secondaryEntities as any[]).map((e, i) => (
                    <li
                      key={`${e.name}-${i}`}
                      className="text-[11px] px-2 py-0.5 rounded-md border border-white/12 text-white/60"
                    >
                      {e.name}
                      {e.entityType ? ` · ${e.entityType}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(analysisDoc?.facts?.missing || []).length > 0 && (
              <div>
                <p className="text-[10px] uppercase tracking-wider text-white/30 mb-1">
                  Manglende fakta
                </p>
                <ul className="space-y-0.5">
                  {(analysisDoc.facts.missing as string[]).map((f) => (
                    <li key={f} className="text-[11px] text-amber-300/80">
                      {f}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(analyze.confidenceBand?.reasons || []).map((r: string) => (
              <p key={r} className="text-[10px] text-white/30">
                {r}
              </p>
            ))}
          </section>
        )}

        {strategy && (
          <section className="space-y-3">
            {validation && (
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-2">
                <p className="text-[12px] font-medium text-white/70">Validering</p>
                <IssueList title="Fejl" items={validation.errors || []} tone="err" />
                <IssueList title="Advarsler" items={validation.warnings || []} tone="warn" />
                <IssueList title="Forslag" items={validation.suggestions || []} tone="info" />
                {!validation.errors?.length &&
                  !validation.warnings?.length &&
                  !validation.suggestions?.length && (
                    <p className="text-[11px] text-white/35">Ingen issues</p>
                  )}
              </div>
            )}

            {(checklist.length > 0 || risks.length > 0) && (
              <div className="rounded-xl border border-white/12 bg-white/[0.03] p-3 space-y-2">
                {checklist.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-white/70">Checklist</p>
                    <ul className="space-y-1">
                      {checklist.map((c) => (
                        <li key={c.id} className="text-[11px] text-white/55 flex items-start gap-2">
                          <span
                            className={`mt-1 size-1.5 shrink-0 rounded-full ${
                              c.severity === 'block'
                                ? 'bg-rose-400'
                                : c.severity === 'warn'
                                  ? 'bg-amber-400'
                                  : 'bg-white/40'
                            }`}
                          />
                          <span>
                            {c.done ? '✓ ' : ''}
                            {c.label}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                {risks.length > 0 && (
                  <div className="space-y-1">
                    <p className="text-[12px] font-medium text-white/70">Risici</p>
                    <ul className="space-y-1">
                      {risks.map((r) => (
                        <li key={r.code} className="text-[11px] text-white/55 flex items-start gap-2">
                          <span
                            className={`mt-1 size-1.5 shrink-0 rounded-full ${
                              r.severity === 'block' ? 'bg-rose-400' : 'bg-amber-400'
                            }`}
                          />
                          {r.message}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}

            <div className="flex flex-wrap gap-2 items-center">
              <p className="text-[13px] text-white/80 flex-1 min-w-0">
                {strategy.pack?.recommended?.family} — {strategy.pack?.recommended?.whyFits}
              </p>
              <button type="button" className={secondaryBtn} onClick={() => void copyAll()} disabled={busy}>
                Kopiér alle
              </button>
              <button
                type="button"
                className={secondaryBtn}
                onClick={() => void saveAll()}
                disabled={busy || ephemeralMode || viewingAlt}
                title={
                  viewingAlt
                    ? 'Brug «Brug denne retning» først'
                    : ephemeralMode
                      ? 'Utilgængelig i ephemeral demo'
                      : undefined
                }
              >
                Gem felter
              </button>
            </div>

            {(strategy.pack?.alternatives || []).length > 0 && (
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => {
                    setActiveAlt(null);
                    hydrateFieldsFromPack(strategy.pack);
                  }}
                >
                  Anbefalet
                </button>
                {(strategy.pack.alternatives as any[]).map((alt, idx) => (
                  <button
                    key={alt.id || idx}
                    type="button"
                    className={secondaryBtn}
                    onClick={() => {
                      setActiveAlt(idx);
                      hydrateFieldsFromPack({ recommended: alt });
                    }}
                  >
                    Alt: {alt.family || idx + 1}
                  </button>
                ))}
              </div>
            )}

            {viewingAlt && (
              <div className="rounded-xl border border-amber-400/25 bg-white/[0.03] p-3 space-y-2">
                <p className="text-[11px] text-amber-300/90">
                  Visning af alternativ — kun læsning. Gem overskriver ikke recommended, før du
                  eksplicit adopterer retningen.
                </p>
                <button
                  type="button"
                  className={secondaryBtn}
                  onClick={() => void adoptAltDirection()}
                  disabled={busy || ephemeralMode}
                >
                  Brug denne retning
                </button>
              </div>
            )}

            <div className="space-y-3">
              {EDITOR_FIELD_ORDER.map((fieldPath) => {
                const st = fieldEdits[fieldPath];
                if (!st) return null;
                const pub = publishability[fieldPath];
                return (
                  <div key={fieldPath} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[12px] font-medium text-white/80">{fieldPath}</p>
                      {pub === 'generated_not_published' && (
                        <span className="text-[10px] uppercase tracking-wider text-white/45 border border-white/15 rounded-md px-1.5 py-0.5">
                          Genereret — publiceres ikke
                        </span>
                      )}
                      <label className="ml-auto flex items-center gap-1.5 text-[11px] text-white/50">
                        <input
                          type="checkbox"
                          checked={st.locked}
                          disabled={altReadOnly || ephemeralMode}
                          onChange={(e) =>
                            setFieldEdits((prev) => ({
                              ...prev,
                              [fieldPath]: { ...st, locked: e.target.checked },
                            }))
                          }
                        />
                        Lås
                      </label>
                      <button type="button" className={secondaryBtn} onClick={() => void copyOne(fieldPath)}>
                        Kopiér
                      </button>
                      <button
                        type="button"
                        className={secondaryBtn}
                        disabled={busy || st.locked || altReadOnly || ephemeralMode}
                        onClick={() => void regenerate(fieldPath)}
                      >
                        Regenerér
                      </button>
                    </div>
                    <textarea
                      className={`${fieldClass} ${
                        fieldPath === 'jsonLd' ||
                        fieldPath === 'internalLinks' ||
                        fieldPath === 'externalLinks'
                          ? 'min-h-[120px] font-mono text-[12px]'
                          : 'min-h-[64px]'
                      }`}
                      value={st.value}
                      disabled={st.locked || altReadOnly}
                      readOnly={altReadOnly}
                      onChange={(e) =>
                        setFieldEdits((prev) => ({
                          ...prev,
                          [fieldPath]: { ...st, value: e.target.value },
                        }))
                      }
                    />
                    {!altReadOnly && (
                      <input
                        className={fieldClass}
                        placeholder="Instruktion til regenerate…"
                        value={regenInstr[fieldPath] || ''}
                        onChange={(e) =>
                          setRegenInstr((prev) => ({ ...prev, [fieldPath]: e.target.value }))
                        }
                      />
                    )}
                    {st.rationale && <p className="text-[10px] text-white/35">{st.rationale}</p>}
                    {(st.warnings || []).length > 0 && (
                      <ul className="space-y-0.5">
                        {(st.warnings || []).map((w) => (
                          <li key={w} className="text-[10px] text-amber-300/80">
                            {w}
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="rounded-xl border border-white/10 p-3 space-y-2">
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              className={secondaryBtn}
              disabled={!articleKey || ephemeralMode}
              onClick={() => void loadHistory()}
            >
              Historik
            </button>
            <button
              type="button"
              className={secondaryBtn}
              disabled={!diffA || !diffB || ephemeralMode}
              onClick={() => void loadDiff()}
            >
              Vis diff
            </button>
            <button
              type="button"
              className={dangerOutlineBtn}
              disabled={!articleKey || ephemeralMode}
              onClick={() => void softDelete()}
            >
              Soft-delete
            </button>
          </div>
          {history?.versions?.length > 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              <select className={fieldClass} value={diffA || ''} onChange={(e) => setDiffA(e.target.value)}>
                {history.versions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    A: {v.id.slice(0, 8)} r{v.revision} {v.stale ? '(stale)' : ''}
                  </option>
                ))}
              </select>
              <select className={fieldClass} value={diffB || ''} onChange={(e) => setDiffB(e.target.value)}>
                {history.versions.map((v: any) => (
                  <option key={`b-${v.id}`} value={v.id}>
                    B: {v.id.slice(0, 8)} r{v.revision} {v.createdAt ? new Date(v.createdAt).toLocaleString() : ''}
                  </option>
                ))}
              </select>
            </div>
          )}
          {diffs.length > 0 && (
            <ul className="space-y-1">
              {diffs.map((d) => (
                <li key={d.fieldPath} className="text-[11px] text-white/60 border-b border-white/[0.06] py-1">
                  <span className="text-white/80">{d.fieldPath}</span>
                  <div className="text-white/35 line-through">{fieldValueAsEditableString(d.previous)}</div>
                  <div>{fieldValueAsEditableString(d.next)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
          </>
        )}
      </div>
    </div>
  );
}
