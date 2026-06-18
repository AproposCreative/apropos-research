'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Amiri } from 'next/font/google';
import { EmbeddedAppHeader } from '@/components/embedded-app';
import SocialCardCanvas, { type SocialCardData, type SocialCardSize, DIMENSIONS } from './SocialCardCanvas';
import { exportCardToPng, exportCardToJpegBlob } from './exportCardToPng';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const amiri = Amiri({
  weight: ['400', '700'],
  style: ['normal', 'italic'],
  subsets: ['latin'],
  variable: '--font-amiri',
});

const DEFAULT_PANEL_WIDTH = 300;
const MIN_PANEL_WIDTH = 240;
const MAX_PANEL_WIDTH = 520;
const PANEL_GAP = 12;
const SQUARE_H1_PADDING_H = 100;
const SQUARE_H1_FONT_SIZE = 80;
const BYLINE_FONT_SIZE_SQUARE = 48;
const STORY_H1_PADDING_H = 40;
const STORY_H1_FONT_SIZE = 100;
const BYLINE_FONT_SIZE_STORY = 60;
const STORY_TITLE_MAX_WIDTH = 992;
const STORY_BYLINE_MAX_WIDTH = 1000;

const CAPTION_FOOTER_TEXT = 'Læs gratis med – uden reklamer, pop-ups eller anden støj: www.aproposmagazine.com';
const ARTICLE_BASE_URL = 'https://www.aproposmagazine.com/articles';

/** Oversæt klient-fejl (eksport / Storage-upload / netværk) til forståelig dansk besked. */
function describePublishError(error: unknown, stage: 'export' | 'upload' | 'publish'): string {
  const code =
    error && typeof error === 'object' && 'code' in error
      ? String((error as { code?: unknown }).code || '')
      : '';
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (stage === 'export') {
    return `Kunne ikke generere billedet (${message || 'ukendt fejl'}). Vælg en anden artikel eller genindlæs siden.`;
  }

  if (stage === 'upload') {
    if (code === 'storage/unauthorized' || /unauthorized|permission/i.test(message)) {
      return 'Du har ikke adgang til at uploade billedet (Firebase Storage afviste det). Log ud og ind igen — eller bed en admin om at deploye storage-reglerne (npm run deploy:storage).';
    }
    if (code === 'storage/unauthenticated' || /unauthenticated/i.test(message)) {
      return 'Din session er udløbet. Log ud og ind igen, og prøv så at poste på ny.';
    }
    if (code === 'storage/retry-limit-exceeded' || code === 'storage/canceled') {
      return 'Upload af billedet blev afbrudt (netværk). Tjek forbindelsen og prøv igen.';
    }
    if (/cors|network|failed to fetch/i.test(message)) {
      return 'Billedet kunne ikke uploades (netværk eller CORS på Firebase Storage). Prøv igen — kontakt admin hvis det fortsætter.';
    }
    return `Billedet kunne ikke uploades (${code || message || 'ukendt fejl'}). Prøv igen.`;
  }

  if (/failed to fetch|networkerror|load failed/i.test(message)) {
    return 'Kunne ikke nå Instagram-tjenesten (netværk). Tjek forbindelsen og prøv igen.';
  }
  return `Der opstod en fejl (${message || 'ukendt'}). Prøv igen.`;
}

/** Samme segment-knapper som Liv / Nyhedsbrev (apropos-design-system). */
const segBtn = (active: boolean) =>
  `rounded-lg px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-all duration-200 active:scale-[0.97] ${
    active ? 'bg-white/12 text-white shadow-sm border border-white/10' : 'text-white/45 hover:text-white/75 border border-transparent'
  }`;

const embedHeaderIconBtn = (active?: boolean) =>
  `touch-target flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border transition-all duration-200 active:scale-[0.97] ${
    active
      ? 'border-white/25 bg-white/10 text-white'
      : 'border-white/12 bg-white/[0.06] text-white/75 hover:bg-white/[0.12] hover:border-white/18 hover:text-white'
  } disabled:opacity-40 disabled:pointer-events-none`;

const embedHeaderPostBtn =
  'touch-target flex h-10 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] px-3.5 text-[12px] font-medium text-white/85 transition-all duration-200 hover:bg-white/[0.12] hover:border-white/18 hover:text-white active:scale-[0.97] disabled:opacity-40 disabled:pointer-events-none';

function PublishFeedback({
  success,
  warning,
  error,
}: {
  success: string | null;
  warning: string | null;
  error: string | null;
}) {
  if (!success && !warning && !error) return null;
  return (
    <div className="space-y-1.5">
      {success ? (
        <p className="inline-flex items-center gap-1.5 text-sm text-white/85">
          <span className="size-1.5 rounded-full bg-emerald-400 shrink-0" />
          {success}
        </p>
      ) : null}
      {warning ? <p className="text-xs text-amber-300/90 leading-snug pl-3">{warning}</p> : null}
      {error ? <p className="text-sm text-red-400/95">{error}</p> : null}
    </div>
  );
}

function stripHtmlForPrompt(input: string): string {
  return input
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<p[^>]*>/gi, '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function wrapTextForWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && current) {
      lines.push(current);
      if (lines.length >= maxLines) return lines;
      current = word;
    } else {
      current = next;
    }
  }
  if (current) lines.push(current);
  return lines;
}

function truncateToFit(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number
): string {
  const normalized = text.replace(/\s+/g, ' ').trim();
  if (!normalized) return '';
  const lines = wrapTextForWidth(ctx, normalized, maxWidth, maxLines);
  if (lines.length <= maxLines) return normalized;

  const words = normalized.split(' ');
  while (words.length > 1) {
    words.pop();
    const candidate = `${words.join(' ').replace(/[.,;:!?-]+$/g, '').trim()}…`;
    if (!candidate || candidate === '…') continue;
    const candidateLines = wrapTextForWidth(ctx, candidate, maxWidth, maxLines);
    if (candidateLines.length <= maxLines) return candidate;
  }
  return `${normalized.slice(0, 18).trim()}…`;
}

function trimDanglingHeadlineEnding(text: string): string {
  const trailing = new Set(['med', 'et', 'en', 'at', 'på', 'for', 'og', 'i', 'til', 'som', 'der', 'når', 'hvor']);
  const words = text.replace(/\s+/g, ' ').trim().split(' ').filter(Boolean);
  while (words.length > 2) {
    const last = words[words.length - 1].replace(/[.,;:!?…]+$/g, '').toLowerCase();
    if (!trailing.has(last)) break;
    words.pop();
  }
  return words.join(' ').trim();
}

function normalizeLabelForCompare(value: string): string {
  return value
    .toLowerCase()
    .replace(/[|,.;:!?]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function rotateLabels(labels: string[], seed: number): string[] {
  if (labels.length <= 1) return labels;
  const offset = ((seed % labels.length) + labels.length) % labels.length;
  return [...labels.slice(offset), ...labels.slice(0, offset)];
}

function normalizeArticle(item: { id: string; fieldData?: Record<string, unknown> }) {
  const fd = item.fieldData || {};
  const title = (fd.name as string) || (fd['article-title'] as string) || (fd.title as string) || '';
  const slug = (fd.slug as string) || (fd['article-slug'] as string) || item.id;
  // Byline under headline should primarily come from Webflow subtitle.
  const excerpt =
    (fd.subtitle as string) ||
    (fd['article-subtitle'] as string) ||
    (fd.excerpt as string) ||
    (fd['article-excerpt'] as string) ||
    (fd.intro as string) ||
    (fd.metaDescription as string) ||
    '';
  const intro =
    (fd.intro as string) ||
    (fd['article-intro'] as string) ||
    '';
  const rawContent =
    (fd['post-body'] as string) ||
    (fd.content as string) ||
    (fd['article-body'] as string) ||
    '';
  const content = stripHtmlForPrompt(rawContent);
  const mobileImage =
    (fd['mobile-image'] as { url?: string })?.url ??
    (fd['mobile-image'] as string) ??
    (fd.mobileImage as string);
  const thumb = (fd.thumb as { url?: string })?.url ?? (fd.thumb as string);
  const featuredImage =
    (typeof mobileImage === 'string' ? mobileImage : undefined) ||
    (fd['article-featured-image'] as string) ||
    (fd.featuredImage as string) ||
    (typeof thumb === 'string' ? thumb : undefined);
  const category =
    (fd.section as string) || (fd.category as string) || (fd['article-category'] as string) || '';
  const ratingRaw = fd.stjerne ?? fd.rating ?? fd['article-rating'];
  const rating =
    typeof ratingRaw === 'number' ? Math.min(6, Math.max(0, Math.round(ratingRaw))) : undefined;
  const authorId = (fd.author as string) || (fd['article-author'] as string) || undefined;
  const section = (fd.section as string) || (fd['article-section'] as string) || category || '';
  const primaryTopic = (fd.topic as string) || (fd['primary-topic'] as string) || (fd['article-topic'] as string) || '';
  const topicsRaw = fd.topics ?? fd['article-topics'] ?? fd.tags;
  const topics = Array.isArray(topicsRaw)
    ? topicsRaw.map((t: unknown) => (typeof t === 'string' ? t : (t as { id?: string })?.id ?? '').trim()).filter(Boolean)
    : [];
  return {
    id: item.id,
    title: String(title).trim() || 'Uden titel',
    slug,
    excerpt: String(excerpt).trim(),
    intro: String(intro).trim() || undefined,
    content: content || undefined,
    imageUrl: featuredImage || undefined,
    category: String(category).trim() || undefined,
    rating: rating ?? undefined,
    authorId: authorId && String(authorId).trim() ? String(authorId).trim() : undefined,
    section: String(section).trim() || undefined,
    primaryTopic: String(primaryTopic).trim() || undefined,
    topics: topics.length ? topics : undefined,
  };
}

type NormalizedArticle = ReturnType<typeof normalizeArticle>;

function buildDefaultCaption(article: NormalizedArticle | null): string {
  if (!article) return CAPTION_FOOTER_TEXT;
  const parts = [article.title, article.excerpt].filter(Boolean) as string[];
  if (article.intro && article.intro !== article.excerpt) {
    parts.push(article.intro);
  }
  return parts.length ? `${parts.join('\n\n')}\n\n${CAPTION_FOOTER_TEXT}` : CAPTION_FOOTER_TEXT;
}

interface DesignEditorViewProps {
  /** I hub: tilbage-knap kalder dette i stedet for at navigere */
  onBack?: () => void;
  /** I hub: true = fyld container, ingen egen højre menu */
  embedMode?: boolean;
}

export default function DesignEditorView({ onBack, embedMode }: DesignEditorViewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [articles, setArticles] = useState<NormalizedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NormalizedArticle | null>(null);
  const [size, setSize] = useState<SocialCardSize>('square');
  const [exporting, setExporting] = useState(false);
  /** I AI Writer (embed) start med kanvas: undgå overlap med header. Desktop viser artikelpanel. */
  const [articlesOpen, setArticlesOpen] = useState(!embedMode);
  const [articleSearch, setArticleSearch] = useState('');
  const showPreview = false;
  const [articlesPanelWidth, setArticlesPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizingArticles, setIsResizingArticles] = useState(false);
  const [caption, setCaption] = useState('');
  const [postingToInstagram, setPostingToInstagram] = useState(false);
  const [publishStep, setPublishStep] = useState('');
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [publishSuccess, setPublishSuccess] = useState<string | null>(null);
  const [publishWarning, setPublishWarning] = useState<string | null>(null);
  const [instagramConfigured, setInstagramConfigured] = useState<boolean | null>(null);
  const [confirmInstagramPostOpen, setConfirmInstagramPostOpen] = useState(false);
  const [renderedCardDataUrl, setRenderedCardDataUrl] = useState<string | null>(null);
  const [authors, setAuthors] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [eyebrowChips, setEyebrowChips] = useState<{ type: 'section' | 'primaryTopic' | 'topic' | 'author' | 'topicOrAuthor'; value: string; label: string; options?: { id: string; name: string }[] }[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);
  const [storyMetaShuffleSeed, setStoryMetaShuffleSeed] = useState(0);
  const [isDesktop, setIsDesktop] = useState(false);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 768);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  const isWebflowId = useCallback((value: string) => /^[a-f0-9]{24}$/i.test(value.trim()), []);

  const resolveName = useCallback(
    (idOrName: string, list: { id: string; name: string }[]): string => {
      const byId = list.find((x) => x.id === idOrName);
      if (byId) return byId.name;
      const byName = list.find((x) => x.name === idOrName);
      if (byName) return byName.name;
      // Never show raw CMS IDs in UI chips.
      if (isWebflowId(idOrName)) return '';
      return idOrName;
    },
    [isWebflowId]
  );

  // Load authors, sections, topics from Webflow (Head & Eyebrow + caption)
  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch('/api/webflow/authors').then((r) => r.json()),
      fetch('/api/webflow/sections').then((r) => r.json()),
      fetch('/api/webflow/topics').then((r) => r.json()),
    ]).then(([jAuthors, jSections, jTopics]) => {
      if (cancelled) return;
      const auth = jAuthors.data?.authors || jAuthors.authors || [];
      const sec = jSections.items || jSections.data?.items || [];
      const top = jTopics.items || jTopics.data?.items || [];
      setAuthors(Array.isArray(auth) ? auth.map((a: { id: string; name?: string }) => ({ id: a.id, name: a.name ?? 'Ukendt' })) : []);
      setSections(Array.isArray(sec) ? sec.map((s: { id: string; name?: string; slug?: string }) => ({ id: s.id, name: s.name ?? s.slug ?? '' })).filter((s: { name: string }) => s.name) : []);
      setTopics(Array.isArray(top) ? top.map((t: { id: string; name?: string; slug?: string }) => ({ id: t.id, name: t.name ?? t.slug ?? '' })).filter((t: { name: string }) => t.name) : []);
    }).catch(() => {
      if (!cancelled) { setAuthors([]); setSections([]); setTopics([]); }
    });
    return () => { cancelled = true; };
  }, []);

  // Build Head & Eyebrow: felt 1 = section. Felt 2 = kun én af gangen (topic eller author) – toggle mellem dem ved klik.
  useEffect(() => {
    if (!selected) {
      setEyebrowChips([]);
      return;
    }
    const chips: { type: 'section' | 'topicOrAuthor'; value: string; label: string; options?: { id: string; name: string }[] }[] = [];
    if (selected.section || selected.category) {
      const val = selected.section || selected.category || '';
      const label = selected.section && sections.length ? resolveName(selected.section, sections) : (selected.category || val);
      const cleanLabel = isWebflowId(label) ? '' : label;
      if (cleanLabel) chips.push({ type: 'section', value: val, label: cleanLabel });
    }
    const topicVals = [selected.primaryTopic, ...(selected.topics ?? [])].filter(Boolean) as string[];
    const seenTopic = new Set<string>();
    const topicOpts = topicVals
      .filter((v) => !seenTopic.has(v) && (seenTopic.add(v), true))
      .map((v) => ({ id: v, name: topics.length ? resolveName(v, topics) : v }))
      .filter((x) => x.name && !isWebflowId(x.name));
    const authorOpt = selected.authorId
      ? { id: selected.authorId, name: authors.length ? resolveName(selected.authorId, authors) : selected.authorId }
      : null;
    const options: { id: string; name: string }[] = [...topicOpts];
    if (authorOpt && authorOpt.name) options.push(authorOpt);
    if (options.length) {
      chips.push({
        type: 'topicOrAuthor',
        value: options[0].id,
        label: options[0].name,
        options,
      });
    }
    setEyebrowChips(chips);
  }, [selected?.id, selected?.section, selected?.primaryTopic, selected?.topics, selected?.category, selected?.authorId, sections, topics, authors, resolveName]);

  // Når artikel skiftes: foreslå caption fra titel + excerpt (uden Foto); altid afslutte med footer
  useEffect(() => {
    if (!selected) return;
    setCaption(buildDefaultCaption(selected));
  }, [selected?.id, selected?.title, selected?.excerpt, selected?.intro]);

  // Tjek om Instagram-publish er konfigureret (til test / brugertilbagemelding)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/instagram/publish')
      .then((r) => r.json())
      .then((data: { configured?: boolean }) => {
        if (!cancelled) setInstagramConfigured(!!data.configured);
      })
      .catch(() => {
        if (!cancelled) setInstagramConfigured(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const ensureCaptionFooter = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return '\n\n' + CAPTION_FOOTER_TEXT;
    return t.endsWith(CAPTION_FOOTER_TEXT) ? t : t + '\n\n' + CAPTION_FOOTER_TEXT;
  }, []);

  const captionForPublish = useMemo(() => {
    const trimmed = caption.trim();
    const footerOnly = trimmed === CAPTION_FOOTER_TEXT;
    const genericReadMoreOnly = /^læs\s+(hele|nu|gratis)?[\s\S]{0,80}apropos/i.test(trimmed);
    const source = !trimmed || footerOnly || genericReadMoreOnly
      ? buildDefaultCaption(selected)
      : trimmed;
    return ensureCaptionFooter(source);
  }, [caption, ensureCaptionFooter, selected]);

  const selectedArticleUrl = useMemo(() => {
    const slug = selected?.slug?.trim();
    return slug ? `${ARTICLE_BASE_URL}/${slug}` : undefined;
  }, [selected?.slug]);

  useEffect(() => {
    if (!isResizingArticles) return;
    const handlePointerMove = (e: PointerEvent) => {
      const bounds = rootRef.current?.getBoundingClientRect();
      if (!bounds) return;
      const dynamicMax = Math.min(MAX_PANEL_WIDTH, Math.floor(bounds.width * 0.6));
      const next = Math.round(e.clientX - bounds.left);
      setArticlesPanelWidth(Math.max(MIN_PANEL_WIDTH, Math.min(dynamicMax, next)));
    };
    const handlePointerUp = () => setIsResizingArticles(false);
    document.addEventListener('pointermove', handlePointerMove);
    document.addEventListener('pointerup', handlePointerUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
    return () => {
      document.removeEventListener('pointermove', handlePointerMove);
      document.removeEventListener('pointerup', handlePointerUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizingArticles]);

  useEffect(() => {
    const el = previewRef.current;
    if (!el) return;
    const cardW = DIMENSIONS[size].width;
    const cardH = DIMENSIONS[size].height;
    const update = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      if (w && h) setScale(Math.min(w / cardW, h / cardH));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  const cycleEyebrowChip = useCallback(
    (index: number) => {
      const chip = eyebrowChips[index];
      if (!chip) return;
      if (chip.type === 'section' && selected) {
        const vals = [selected.section, selected.category].filter(Boolean) as string[];
        const seen = new Set<string>();
        const sectionList = vals
          .filter((v) => !seen.has(v) && (seen.add(v), true))
          .map((v) => ({ id: v, name: sections.length ? resolveName(v, sections) : v }))
          .filter((x) => x.name);
        if (sectionList.length <= 1) return;
        const i = sectionList.findIndex((x) => x.id === chip.value || x.name === chip.label);
        const nextIndex = i < 0 ? 0 : (i + 1) % sectionList.length;
        const next = sectionList[nextIndex];
        setEyebrowChips((prev) => {
          const out = [...prev];
          out[index] = { ...chip, value: next.id, label: next.name };
          return out;
        });
        return;
      }
      if (chip.type === 'topicOrAuthor' && chip.options && chip.options.length > 1) {
        const i = chip.options.findIndex((x) => x.id === chip.value || x.name === chip.label);
        const nextIndex = i < 0 ? 0 : (i + 1) % chip.options.length;
        const next = chip.options[nextIndex];
        setEyebrowChips((prev) => {
          const out = [...prev];
          out[index] = { ...chip, value: next.id, label: next.name };
          return out;
        });
      }
    },
    [eyebrowChips, selected, sections, resolveName]
  );

  const cardData: SocialCardData = useMemo(() => {
    const isStory = size === 'story';
    const authorName = selected?.authorId
      ? (authors.length ? resolveName(selected.authorId, authors) : selected.authorId)
      : '';
    const categoryName = selected?.category
      ? (sections.length ? resolveName(selected.category, sections) : selected.category)
      : '';
    const sectionName = selected?.section
      ? (sections.length ? resolveName(selected.section, sections) : selected.section)
      : '';
    const primaryTopicName = selected?.primaryTopic
      ? (topics.length ? resolveName(selected.primaryTopic, topics) : selected.primaryTopic)
      : '';
    const topicNames = (selected?.topics ?? [])
      .map((topic) => (topics.length ? resolveName(topic, topics) : topic))
      .filter(Boolean);
    const topicOrAuthorChip = eyebrowChips.find((chip) => chip.type === 'topicOrAuthor');
    const sectionChip = eyebrowChips.find((chip) => chip.type === 'section');
    const topStoryLabels = [sectionChip?.label, topicOrAuthorChip?.label]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    const topStoryLabelsNormalized = new Set(topStoryLabels.map((label) => normalizeLabelForCompare(label)));

    const storyPrimaryCandidates = [
      categoryName,
      primaryTopicName,
      sectionName,
      ...topicNames,
      topicOrAuthorChip?.label || '',
      sectionChip?.label || '',
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean);

    const storyPrimaryMeta = storyPrimaryCandidates.find((candidate) => {
      const normalized = normalizeLabelForCompare(candidate);
      if (!normalized) return false;
      if (topStoryLabelsNormalized.has(normalized)) return false;
      if (authorName && normalized === normalizeLabelForCompare(authorName)) return false;
      return true;
    }) || '';

    const storyBottomMetaLabels = [storyPrimaryMeta, authorName]
      .map((v) => String(v || '').trim())
      .filter(Boolean);
    const dedupedStoryBottomMetaLabels = storyBottomMetaLabels.filter((label, index, arr) => {
      const normalized = normalizeLabelForCompare(label);
      if (!normalized) return false;
      return index === arr.findIndex((candidate) => normalizeLabelForCompare(candidate) === normalized);
    });

    const storyCandidates = [
      ...topStoryLabels,
      categoryName,
      sectionName,
      primaryTopicName,
      ...topicNames,
      authorName,
      ...dedupedStoryBottomMetaLabels,
    ]
      .map((v) => String(v || '').trim())
      .filter(Boolean)
      .filter((label, index, arr) => {
        const normalized = normalizeLabelForCompare(label);
        return !!normalized && index === arr.findIndex((candidate) => normalizeLabelForCompare(candidate) === normalized);
      });

    const orderedStoryCandidates = rotateLabels(storyCandidates, storyMetaShuffleSeed);
    const storyTopMetaLabels = orderedStoryCandidates.slice(0, 2);
    const remainingForBottom = orderedStoryCandidates.filter(
      (label) => !storyTopMetaLabels.some((topLabel) => normalizeLabelForCompare(topLabel) === normalizeLabelForCompare(label))
    );
    let finalStoryBottom = remainingForBottom.slice(0, 2);
    if (finalStoryBottom.length < 2 && authorName) {
      const authorNormalized = normalizeLabelForCompare(authorName);
      if (!finalStoryBottom.some((label) => normalizeLabelForCompare(label) === authorNormalized)) {
        finalStoryBottom = [...finalStoryBottom, authorName];
      }
    }
    if (finalStoryBottom.length < 2) {
      const fallback = orderedStoryCandidates.find(
        (label) => !finalStoryBottom.some((b) => normalizeLabelForCompare(b) === normalizeLabelForCompare(label))
      );
      if (fallback) finalStoryBottom = [...finalStoryBottom, fallback];
    }

    return {
      title: selected?.title ?? '',
      excerpt: selected?.excerpt ?? undefined,
      imageUrl: selected?.imageUrl ?? undefined,
      category: selected?.category ?? undefined,
      categorySecondary: undefined,
      eyebrowLabels: isStory
        ? (storyTopMetaLabels.length > 0 ? storyTopMetaLabels : undefined)
        : (eyebrowChips.length > 0 ? eyebrowChips.map((c) => c.label) : undefined),
      storyBottomMetaLabels: isStory
        ? (finalStoryBottom.filter(Boolean).slice(0, 2).length > 0 ? finalStoryBottom.filter(Boolean).slice(0, 2) : undefined)
        : (dedupedStoryBottomMetaLabels.length > 0 ? dedupedStoryBottomMetaLabels : undefined),
      rating: selected?.rating ?? undefined,
    };
  }, [selected?.title, selected?.excerpt, selected?.imageUrl, selected?.category, selected?.section, selected?.primaryTopic, selected?.topics, selected?.rating, selected?.authorId, eyebrowChips, authors, sections, topics, resolveName, size, storyMetaShuffleSeed]);

  const filteredArticles = useMemo(() => {
    const q = articleSearch.trim().toLowerCase();
    if (!q) return articles;
    return articles.filter((art) => {
      const haystack = [
        art.title,
        art.excerpt,
        art.category,
        art.section,
        art.primaryTopic,
        ...(art.topics ?? []),
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [articles, articleSearch]);

  const previewAspectRatio = size === 'story' ? '9 / 16' : '1 / 1';
  const previewMaxHeight = size === 'story' ? 996 : 468;
  const renderedCanvasWidth = Math.max(220, Math.round(DIMENSIONS[size].width * scale));
  const renderedCanvasHeight = Math.max(220, Math.round(DIMENSIONS[size].height * scale));

  // Preview must use the exact same rendering pipeline as export (WYSIWYG)
  useEffect(() => {
    let cancelled = false;
    exportCardToPng(cardData, size, { amiriFontFamily: amiri.style.fontFamily })
      .then((url) => { if (!cancelled) setRenderedCardDataUrl(url); })
      .catch(() => { if (!cancelled) setRenderedCardDataUrl(null); });
    return () => { cancelled = true; };
  }, [size, cardData]);

  useEffect(() => {
    let cancelled = false;
    fetch('/api/webflow/sample-articles')
      .then((res) => res.json())
      .then((data) => {
        if (cancelled) return;
        const items = data.items || [];
        setArticles(items.map((it: { id: string; fieldData?: Record<string, unknown> }) => normalizeArticle(it)));
        if (items.length > 0 && !selected) setSelected(normalizeArticle(items[0]));
      })
      .catch(() => { if (!cancelled) setArticles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Safety net: ensure first article is selected if selected is missing.
  useEffect(() => {
    if (!selected && articles.length > 0) {
      setSelected(articles[0]);
    }
  }, [selected, articles]);

  const handleExportPng = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await exportCardToPng(cardData, size, { amiriFontFamily: amiri.style.fontFamily });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `apropos-social-${size}-${Date.now()}.png`;
      a.click();
    } catch (e) {
      console.error('Export failed', e);
      alert('Kunne ikke eksportere PNG. Prøv igen.');
    } finally {
      setExporting(false);
    }
  }, [size, cardData]);

  const clearPublishFeedback = useCallback(() => {
    setInstagramError(null);
    setPublishSuccess(null);
    setPublishWarning(null);
  }, []);

  const handlePostToInstagram = useCallback(async () => {
    setConfirmInstagramPostOpen(false);
    setPostingToInstagram(true);
    clearPublishFeedback();
    setPublishStep('Eksporterer billede…');
    let instagramPublishStarted = false;
    let stage: 'export' | 'upload' | 'publish' = 'export';
    try {
      if (!storage) {
        setInstagramError('Firebase Storage er ikke tilgængelig.');
        return;
      }
      const blob = await exportCardToJpegBlob(cardData, size, 0.92, { amiriFontFamily: amiri.style.fontFamily });
      setPublishStep('Uploader billede…');
      stage = 'upload';
      const path = `instagram-publish/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const imageUrl = await getDownloadURL(storageRef);
      setPublishStep('Publicerer til Instagram…');
      stage = 'publish';
      const isStory = size === 'story';
      instagramPublishStarted = true;
      const apiRes = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          imageUrl,
          isStory,
          caption: isStory ? undefined : captionForPublish,
          articleUrl: isStory ? undefined : selectedArticleUrl,
        }),
      });
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        setInstagramError(data.error ?? 'Kunne ikke poste til Instagram.');
        return;
      }
      setInstagramError(null);
      if (size === 'story') {
        setPublishSuccess('Story er publiceret på Instagram.');
      } else if (data.facebookPublished === true) {
        setPublishSuccess('Publiceret på Instagram og Facebook.');
        if (data.facebookCommentPublished !== true && selectedArticleUrl) {
          setPublishWarning(
            'Artikellinket blev ikke lagt som første kommentar på Facebook — tilføj linket manuelt i opslaget.'
          );
        }
      } else if (data.facebookPublished === false) {
        setPublishSuccess('Publiceret på Instagram.');
        setPublishWarning(
          typeof data.facebookError === 'string' && data.facebookError.trim()
            ? `Facebook: ${data.facebookError.trim()}`
            : 'Facebook-opslaget blev ikke oprettet.'
        );
      } else {
        setPublishSuccess('Publiceret på Instagram.');
      }
    } catch (e) {
      console.error('Instagram publish failed', e);
      // Story-kaldet kan være nået frem selvom forbindelsen faldt — vis blødt svar.
      if (size === 'story' && instagramPublishStarted) {
        setPublishSuccess('Story-kaldet er sendt — tjek Instagram om et øjeblik.');
        return;
      }
      setInstagramError(describePublishError(e, stage));
    } finally {
      setPostingToInstagram(false);
      setPublishStep('');
    }
  }, [size, cardData, captionForPublish, selectedArticleUrl, clearPublishFeedback]);

  const requestPostToInstagram = useCallback(() => {
    clearPublishFeedback();
    setConfirmInstagramPostOpen(true);
  }, [clearPublishFeedback]);

  useEffect(() => {
    let cancelled = false;
    const fitCurrentText = async () => {
      if (!selected) return;
      await Promise.allSettled([
        document.fonts.load(`400 ${size === 'square' ? SQUARE_H1_FONT_SIZE : size === 'story' ? STORY_H1_FONT_SIZE : 44}px ${amiri.style.fontFamily}`),
        document.fonts.load(`italic 400 ${size === 'square' ? BYLINE_FONT_SIZE_SQUARE : size === 'story' ? BYLINE_FONT_SIZE_STORY : 40}px ${amiri.style.fontFamily}`),
        document.fonts.ready,
      ]);
      if (cancelled) return;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      const padding = size === 'square' ? SQUARE_H1_PADDING_H : size === 'story' ? STORY_H1_PADDING_H : 56;
      const maxTextWidth = size === 'story' ? STORY_TITLE_MAX_WIDTH : DIMENSIONS[size].width - padding * 2;
      const maxBylineWidth = size === 'story' ? STORY_BYLINE_MAX_WIDTH : DIMENSIONS[size].width - padding * 2;
      const titleSize = size === 'square' ? SQUARE_H1_FONT_SIZE : size === 'story' ? STORY_H1_FONT_SIZE : 44;
      const excerptSize = size === 'square' ? BYLINE_FONT_SIZE_SQUARE : size === 'story' ? BYLINE_FONT_SIZE_STORY : 40;
      const excerptMaxLines = size === 'story' ? 3 : 2;

      const currentTitle = String(selected.title || '').trim();
      const currentExcerpt = String(selected.excerpt || '').trim();

      ctx.font = `400 ${titleSize}px ${amiri.style.fontFamily}`;
      const roughFittedTitle = truncateToFit(ctx, currentTitle, maxTextWidth, 2);
      const polishedTitle = trimDanglingHeadlineEnding(roughFittedTitle) || roughFittedTitle;
      const fittedTitle = truncateToFit(ctx, polishedTitle, maxTextWidth, 2);

      ctx.font = `italic 400 ${excerptSize}px ${amiri.style.fontFamily}`;
      const fittedExcerpt = truncateToFit(ctx, currentExcerpt, maxBylineWidth, excerptMaxLines);

      if (fittedTitle === currentTitle && fittedExcerpt === currentExcerpt) return;

      setSelected((prev) => {
        if (!prev || prev.id !== selected.id) return prev;
        return {
          ...prev,
          title: fittedTitle,
          excerpt: fittedExcerpt,
        };
      });

      setArticles((prev) =>
        prev.map((item) =>
          item.id === selected.id
            ? { ...item, title: fittedTitle, excerpt: fittedExcerpt }
            : item
        )
      );
    };

    fitCurrentText();
    return () => {
      cancelled = true;
    };
  }, [selected?.id, selected?.title, selected?.excerpt, size]);

  /** Brødtekst for editor (preview vs canvas) — delt mellem standalone og AI Writer embed. */
  const editorCanvas = (
    <>
      {showPreview ? (
        <div className="flex-1 min-h-0 flex flex-col items-center overflow-y-auto bg-black/30 p-2 md:p-4">
          {/* Instagram-style post preview */}
          <div className="w-full flex flex-col rounded-xl overflow-hidden border border-white/12 bg-black/40 backdrop-blur-xl" style={{ maxWidth: size === 'story' ? 620 : 468 }}>
            {/* Profil-række */}
            <div className="flex items-center gap-3 px-3 py-2.5 border-b border-white/10">
              <img
                src="/images/05AproposMagazine_Random.webp"
                alt=""
                className="w-8 h-8 rounded-full object-cover flex-shrink-0 bg-white/10"
              />
              <span className="font-semibold text-white text-sm">aproposmagazineofficial</span>
              <span className="flex-shrink-0 w-4 h-4 rounded-full bg-[#1877F2] flex items-center justify-center" title="Meta verified">
                <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-white"><path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
              </span>
              <span className="text-white/50 text-xs ml-auto">• nu</span>
            </div>
            {/* Opslagsbillede = kortet */}
            <div className="flex items-center justify-center bg-black/30 w-full" style={{ aspectRatio: previewAspectRatio, maxHeight: previewMaxHeight }}>
              {renderedCardDataUrl ? (
                <img
                  src={renderedCardDataUrl}
                  alt=""
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <SocialCardCanvas data={cardData} size={size} className="w-full h-full" />
              )}
            </div>
            {/* Caption: brugernavn + redigerbar tekst under opslaget */}
            <div className="px-3 py-2">
              <p className="text-white text-sm mb-1.5">
                <span className="font-semibold">aproposmagazineofficial</span>
                <span className="inline-flex w-4 h-4 rounded-full bg-[#1877F2] align-middle ml-1 mr-1.5" title="Meta verified">
                  <svg width="10" height="10" viewBox="0 0 12 12" fill="none" className="text-white m-auto block"><path d="M2.5 6L5 8.5L9.5 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
                </span>
              </p>
              <textarea
                value={caption}
                onChange={(e) => setCaption(e.target.value)}
                placeholder="Skriv eller rediger teksten under opslaget…"
                className="apropos-input-dark w-full min-h-[112px] px-3 py-2.5 rounded-lg border text-sm resize-y"
                rows={4}
              />
              {selected?.authorId && authors.length > 0 && (
                <p className="text-white/50 text-xs mt-1">
                  Forfatter til opslag: {authors.find((a) => a.id === selected.authorId)?.name ?? '—'}
                </p>
              )}
              <div className="mt-3 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={requestPostToInstagram}
                  disabled={postingToInstagram || instagramConfigured === false}
                  className="w-full py-2.5 px-4 rounded-xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 disabled:opacity-50 disabled:pointer-events-none text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                >
                  {postingToInstagram ? (
                    <span className="animate-pulse">{publishStep || 'Publicerer…'}</span>
                  ) : (
                    <>
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-1.657 0-3-1.343-3-3 0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.657-1.343 3-3 3zm6.205-11.947c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                      {size === 'story' ? 'Post til Instagram Story' : 'Post til Instagram'}
                    </>
                  )}
                </button>
                {instagramConfigured === false && (
                  <p className="text-amber-400/90 text-xs">Instagram-publish er ikke konfigureret. Sæt INSTAGRAM_ACCOUNT_ID og INSTAGRAM_ACCESS_TOKEN (se docs/INSTAGRAM_PUBLISH.md).</p>
                )}
                <PublishFeedback success={publishSuccess} warning={publishWarning} error={instagramError} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={previewRef}
          className="flex-1 min-h-0 w-full flex flex-col items-center overflow-y-auto overflow-x-hidden touch-pan-y [overscroll-behavior:contain] md:justify-start justify-start bg-black/25 p-2 md:p-4 app-safe-bottom"
        >
          <div className="w-full flex min-h-min flex-col items-center gap-3 md:gap-5 pt-3 md:pt-10 pb-8">
            {eyebrowChips.length > 0 && size !== 'story' && (
              <div className="inline-flex max-w-full overflow-x-auto no-scrollbar justify-start items-center gap-1.5 md:gap-2 rounded-2xl border border-white/15 bg-black/65 p-1.5 md:p-2 mb-2 md:mb-5 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                {eyebrowChips.map((chip, index) => (
                  <button
                    key={`${chip.type}-${index}-${chip.value}`}
                    type="button"
                    onClick={() => cycleEyebrowChip(index)}
                    className="shrink-0 px-3 md:px-5 py-1.5 md:py-2 rounded-xl text-white text-xs md:text-[15px] font-medium bg-white/15 border border-white/25 transition-all duration-200 hover:bg-white/25 hover:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                    title="Klik for at vælge næste"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            {size === 'story' && (
              <div className="inline-flex max-w-full justify-start items-center gap-1.5 md:gap-2 rounded-2xl border border-white/15 bg-black/65 p-1.5 md:p-2 mb-2 md:mb-5 backdrop-blur-md shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
                <button
                  type="button"
                  onClick={() => setStoryMetaShuffleSeed((prev) => prev + 1)}
                  className="shrink-0 px-4 md:px-5 py-2 rounded-xl text-white text-sm md:text-[15px] font-medium bg-white/15 border border-white/25 transition-all duration-200 hover:bg-white/25 hover:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/40"
                  title="Byt rundt på story-felter"
                >
                  Byt felter
                </button>
                <button
                  type="button"
                  onClick={() => setStoryMetaShuffleSeed(0)}
                  disabled={storyMetaShuffleSeed === 0}
                  className="shrink-0 w-9 h-9 rounded-xl text-white text-sm font-semibold bg-white/8 border border-white/30 shadow-[0_0_14px_rgba(255,255,255,0.12)] transition-all duration-200 hover:bg-white/14 hover:border-white/50 focus:outline-none focus:ring-2 focus:ring-white/35 disabled:opacity-45 disabled:pointer-events-none"
                  title="Nulstil til første step"
                >
                  X
                </button>
              </div>
            )}
            {size === 'story' && (
              <div className="w-full max-w-[480px] -mt-1 md:-mt-2 mb-1 md:mb-2 px-2 md:px-0">
                <button
                  type="button"
                  onClick={requestPostToInstagram}
                  disabled={postingToInstagram || instagramConfigured === false}
                  className="w-full py-2.5 px-4 rounded-xl border border-white/12 bg-white/[0.04] hover:bg-white/[0.08] hover:border-white/20 disabled:opacity-50 disabled:pointer-events-none text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                  title="Post det viste story-design direkte til Instagram Story"
                >
                  {postingToInstagram ? <span className="animate-pulse">{publishStep || 'Publicerer Story…'}</span> : 'Post til Instagram Story'}
                </button>
                {instagramConfigured === false && (
                  <p className="text-amber-400/90 text-xs mt-2">Instagram-publish er ikke konfigureret. Sæt INSTAGRAM_ACCOUNT_ID og INSTAGRAM_ACCESS_TOKEN (se docs/INSTAGRAM_PUBLISH.md).</p>
                )}
                <div className="mt-2">
                  <PublishFeedback success={publishSuccess} warning={publishWarning} error={instagramError} />
                </div>
              </div>
            )}

            <div
              className="relative overflow-hidden"
              style={{
                width: renderedCanvasWidth,
                height: renderedCanvasHeight,
              }}
            >
              <div
                className="w-full h-full"
                style={{
                  width: DIMENSIONS[size].width,
                  height: DIMENSIONS[size].height,
                  transform: `scale(${scale})`,
                  transformOrigin: 'top left',
                }}
              >
                {renderedCardDataUrl ? (
                  <img
                    src={renderedCardDataUrl}
                    alt=""
                    className="w-full h-full object-contain"
                    draggable={false}
                  />
                ) : (
                  <SocialCardCanvas data={cardData} size={size} />
                )}
              </div>
            </div>
            {size === 'square' && (
              <div className="px-2 pb-2" style={{ width: renderedCanvasWidth }}>
                <div className="rounded-xl border border-white/12 bg-black/55 p-3">
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <p className="text-[12px] font-medium text-white/80">Tekst under opslaget</p>
                    <span className="text-[10px] uppercase tracking-wider text-white/35">1:1 post</span>
                  </div>
                  <textarea
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    placeholder="Skriv eller rediger teksten under opslaget…"
                    className="apropos-input-dark w-full min-h-[184px] rounded-lg border px-3 py-2.5 text-[13px] resize-y"
                    rows={7}
                  />
                  <div className="mt-2">
                    <PublishFeedback success={publishSuccess} warning={publishWarning} error={instagramError} />
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );

  const rootClass = embedMode
    ? `flex flex-col h-full min-h-0 text-white bg-[#0a0a0a] lg:bg-transparent font-poppins overflow-hidden ${amiri.variable}`
    : `min-h-[100dvh] h-[100dvh] bg-[#0a0a0a] md:bg-[#0a0a0a] md:p-[1%] p-0 flex flex-col md:flex-row relative overflow-hidden ${amiri.variable}`;

  /** 1:1 + 9:16 + forhåndsvisning + eksport — i header på desktop; egen række under header på mobil (nyhedsbreb-mønster). */
  const embedToolbarControlsInner = (
    <>
      <div
        className="flex h-10 shrink-0 items-center rounded-lg border border-white/12 bg-black/30 p-0.5 gap-0.5 backdrop-blur-sm"
        role="group"
        aria-label="Kortformat"
      >
        <button
          type="button"
          onClick={() => setSize('square')}
          className={segBtn(size === 'square')}
          title="1080×1080 (kvadrat)"
        >
          1:1
        </button>
        <button
          type="button"
          onClick={() => setSize('story')}
          className={segBtn(size === 'story')}
          title="1080×1920 (story)"
        >
          9:16
        </button>
      </div>
      <button
        type="button"
        onClick={requestPostToInstagram}
        disabled={postingToInstagram || instagramConfigured === false}
        className={embedHeaderPostBtn}
        title={size === 'story' ? 'Post det viste story-design direkte til Instagram Story' : 'Post det viste opslag direkte til Instagram'}
        aria-label={size === 'story' ? 'Post til Instagram Story' : 'Post til Instagram'}
      >
        {postingToInstagram ? 'Poster…' : 'Post'}
      </button>
      <button
        type="button"
        onClick={handleExportPng}
        disabled={exporting}
        className={embedHeaderIconBtn()}
        title="Eksporter PNG"
        aria-label={exporting ? 'Eksporterer…' : 'Eksporter PNG'}
      >
        <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
      </button>
    </>
  );
  const embedToolbarForDesktopHeader = <div className="flex flex-wrap items-center justify-end gap-2">{embedToolbarControlsInner}</div>;

  return (
    <div ref={rootRef} className={rootClass}>
      {embedMode ? (
        <>
          <EmbeddedAppHeader
            embedded
            title="SoMe Posting"
            onClose={onBack}
            leading={
              <button
                type="button"
                onClick={() => setArticlesOpen((o) => !o)}
                className="lg:hidden touch-target w-9 h-9 shrink-0 flex items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white hover:bg-white/[0.1] transition-colors"
                title={articlesOpen ? 'Luk artikelliste' : 'Mine artikler'}
                aria-label={articlesOpen ? 'Luk artikelliste' : 'Mine artikler'}
                aria-pressed={articlesOpen}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
            }
            trailing={<div className="hidden lg:block">{embedToolbarForDesktopHeader}</div>}
          />
          <div
            className="shrink-0 z-20 flex lg:hidden flex-nowrap items-center justify-end gap-2 border-b border-white/8 bg-black/45 px-3 py-2 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
            role="toolbar"
            aria-label="Format, forhåndsvisning og eksport"
          >
            {embedToolbarControlsInner}
          </div>

          <div className="flex-1 flex min-h-0 overflow-hidden flex-col lg:flex-row">
            <aside className="hidden lg:flex w-[min(300px,100%)] shrink-0 flex-col border-r border-white/10 bg-black/10 overflow-hidden">
              <div className="px-4 py-3 border-b border-white/10 shrink-0">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    value={articleSearch}
                    onChange={(e) => setArticleSearch(e.target.value)}
                    placeholder="Søg i artikler…"
                    className="apropos-input-dark w-full rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 no-scrollbar">
                {loading ? (
                  <p className="text-white/50 text-sm py-4">Henter artikler fra Webflow…</p>
                ) : filteredArticles.length === 0 ? (
                  <p className="text-white/50 text-sm py-4">Ingen artikler. Tjek Webflow.</p>
                ) : (
                  <ul className="space-y-1">
                    {filteredArticles.map((art) => (
                      <li key={art.id}>
                        <button
                          type="button"
                          onClick={() => setSelected(art)}
                          className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                            selected?.id === art.id ? 'bg-white/15 text-white border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white border border-transparent'
                          }`}
                        >
                          <span className="line-clamp-2">{art.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </aside>

            {/* Samme mønster som NewsletterClient embedded: ingen ekstra “kort” indeni — kun ydre embeddedPanelShell */}
            <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-[#0a0a0a] lg:bg-transparent p-3">
              {editorCanvas}
            </main>
          </div>

          {/* Mobil: fuldskærms artikel-liste (over header/toolbar) */}
          <div
            className={`lg:hidden fixed inset-0 z-[100] bg-[#0a0a0a] backdrop-blur-2xl app-safe-top app-safe-bottom ${articlesOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300`}
          >
            <div className="h-full flex flex-col">
              <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
                <h3 className="text-white text-base font-medium">Mine artikler</h3>
                <button onClick={() => setArticlesOpen(false)} className="p-2 text-white/60 hover:text-white" aria-label="Luk">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
                </button>
              </div>
              <div className="px-3 pt-3 pb-2 border-b border-white/10">
                <div className="relative">
                  <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="11" cy="11" r="8" />
                    <path d="M21 21l-4.3-4.3" />
                  </svg>
                  <input
                    value={articleSearch}
                    onChange={(e) => setArticleSearch(e.target.value)}
                    placeholder="Søg i artikler..."
                    className="apropos-input-dark w-full rounded-lg pl-9 pr-3 py-2 text-sm"
                  />
                </div>
              </div>
              <div className="flex-1 overflow-y-auto p-3">
                {loading ? <p className="text-white/50 text-sm">Henter artikler…</p> : (
                  <ul className="space-y-2">
                    {filteredArticles.map((art) => (
                      <li key={art.id}>
                        <button type="button" onClick={() => { setSelected(art); setArticlesOpen(false); }} className={`w-full text-left px-3 py-3 rounded-xl text-sm ${selected?.id === art.id ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'}`}>
                          <span className="line-clamp-2">{art.title}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        </>
      ) : (
      <>
      {/* Venstre panel: Artikler */}
      <div
        className="hidden md:block absolute top-0 bottom-0 left-0 z-40 transition-all duration-300 ease-out overflow-hidden"
        style={{
          width: articlesOpen ? `${articlesPanelWidth}px` : '0px',
          opacity: articlesOpen ? 1 : 0,
          pointerEvents: articlesOpen ? 'auto' : 'none',
          transition: isResizingArticles ? 'none' : undefined,
        }}
      >
        <div
          className="h-full flex flex-col rounded-xl border border-white/20 overflow-hidden bg-[#070707]/90 backdrop-blur-3xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]"
          style={{
            transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
            transform: articlesOpen ? 'translateX(0)' : 'translateX(-8px)',
          }}
        >
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between flex-shrink-0">
            <h3 className="text-white text-base font-medium">Mine artikler</h3>
            <button onClick={() => setArticlesOpen(false)} className="p-2 text-white/60 hover:text-white rounded-lg transition-colors" aria-label="Luk">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-3 pt-3 pb-2 border-b border-white/10">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={articleSearch}
                onChange={(e) => setArticleSearch(e.target.value)}
                placeholder="Søg i artikler..."
                className="apropos-input-dark w-full rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 no-scrollbar">
            {loading ? (
              <p className="text-white/50 text-sm py-4">Henter artikler fra Webflow…</p>
            ) : filteredArticles.length === 0 ? (
              <p className="text-white/50 text-sm py-4">Ingen artikler. Tjek Webflow.</p>
            ) : (
              <ul className="space-y-1">
                {filteredArticles.map((art) => (
                  <li key={art.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(art)}
                      className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-colors ${
                        selected?.id === art.id ? 'bg-white/15 text-white border border-white/20' : 'text-white/80 hover:bg-white/10 hover:text-white border border-transparent'
                      }`}
                    >
                      <span className="line-clamp-2">{art.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        {articlesOpen && (
          <div
            onPointerDown={(e) => {
              e.preventDefault();
              setIsResizingArticles(true);
            }}
            className="absolute top-0 bottom-0 right-0 w-4 cursor-col-resize hover:bg-white/20 transition-colors z-50 group"
            style={{ touchAction: 'none' }}
            aria-hidden="true"
          >
            <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-1 h-16 bg-white/10 group-hover:bg-white/40 rounded-full transition-colors" />
            </div>
        )}
      </div>

      {/* Mobil: fuldskærms artikel-liste */}
      <div className={`md:hidden fixed inset-0 z-[100] bg-black/80 backdrop-blur-2xl app-safe-top app-safe-bottom ${articlesOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300`}>
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-white text-base font-medium">Mine artikler</h3>
            <button onClick={() => setArticlesOpen(false)} className="p-2 text-white/60 hover:text-white" aria-label="Luk">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="px-3 pt-3 pb-2 border-b border-white/10">
            <div className="relative">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-white/50" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <path d="M21 21l-4.3-4.3" />
              </svg>
              <input
                value={articleSearch}
                onChange={(e) => setArticleSearch(e.target.value)}
                placeholder="Søg i artikler..."
                className="apropos-input-dark w-full rounded-lg pl-9 pr-3 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? <p className="text-white/50 text-sm">Henter artikler…</p> : (
              <ul className="space-y-2">
                {filteredArticles.map((art) => (
                  <li key={art.id}>
                    <button type="button" onClick={() => { setSelected(art); setArticlesOpen(false); }} className={`w-full text-left px-3 py-3 rounded-xl text-sm ${selected?.id === art.id ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'}`}>
                      <span className="line-clamp-2">{art.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>

      {/* Hovedvindue */}
      <div
        className="flex-1 min-w-0 flex flex-col md:absolute md:top-0 md:bottom-0 z-10 transition-[left] duration-300"
        style={{
          left: isDesktop && articlesOpen ? `${articlesPanelWidth + PANEL_GAP}px` : '0',
          right: 0,
          transition: isResizingArticles ? 'none' : undefined,
        }}
      >
        <div className="h-full flex flex-col rounded-xl border border-white/15 overflow-hidden bg-black/55 md:bg-[#070707]/90 backdrop-blur-2xl md:backdrop-blur-xl shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
          {/* Top bar */}
          <div className="sticky top-0 z-20 flex-shrink-0 flex items-center justify-between gap-2 px-3 py-2 md:p-4 app-safe-top border-b border-white/10 bg-[#0a0a0a]/90 backdrop-blur-3xl">
            <div className="flex items-center gap-2 min-w-0 shrink-0">
              <button onClick={() => setArticlesOpen(true)} className="touch-target w-10 h-10 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors md:hidden" aria-label="Artikler">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="hidden md:block text-white/90 text-[15px] font-medium tracking-tight leading-tight">
                Apropos SoMe Posting
              </h1>
            </div>
            <div className="flex flex-wrap md:flex-nowrap items-center justify-end gap-2">
              <div
                className="flex rounded-lg border border-white/12 p-0.5 gap-0.5 bg-black/30 backdrop-blur-sm"
                role="group"
                aria-label="Kortformat"
              >
                <button type="button" onClick={() => setSize('square')} className={segBtn(size === 'square')} title="1080×1080 (kvadrat)">
                  1:1
                </button>
                <button type="button" onClick={() => setSize('story')} className={segBtn(size === 'story')} title="1080×1920 (story)">
                  9:16
                </button>
              </div>
              <button
                type="button"
                onClick={() => setArticlesOpen((v) => !v)}
                className={embedHeaderIconBtn(articlesOpen)}
                title="Mine artikler"
                aria-label="Mine artikler"
              >
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button
                type="button"
                onClick={requestPostToInstagram}
                disabled={postingToInstagram || instagramConfigured === false}
                className={embedHeaderPostBtn}
                title={size === 'story' ? 'Post det viste story-design direkte til Instagram Story' : 'Post det viste opslag direkte til Instagram'}
                aria-label={size === 'story' ? 'Post til Instagram Story' : 'Post til Instagram'}
              >
                {postingToInstagram ? 'Poster…' : 'Post'}
              </button>
              <button
                type="button"
                onClick={handleExportPng}
                disabled={exporting}
                className={embedHeaderIconBtn()}
                title="Eksporter PNG"
                aria-label={exporting ? 'Eksporterer…' : 'Eksporter PNG'}
              >
                <svg className="size-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.12] active:scale-[0.97]"
                  aria-label="Luk SoMe Posting"
                  title="Luk"
                >
                  <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ) : (
                <a
                  href="/ai"
                  className="flex size-8 shrink-0 items-center justify-center rounded-lg border border-white/12 bg-white/[0.06] text-white transition-all duration-200 hover:bg-white/[0.12] active:scale-[0.97]"
                  aria-label="Tilbage til AI Writer"
                  title="Tilbage til AI Writer"
                >
                  <svg className="size-3.5" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </a>
              )}
            </div>
          </div>
          {editorCanvas}
        </div>
      </div>

      {/* Højre menu kun når ikke embedMode (standalone side) */}
      {!embedMode && (
        <div className="hidden md:flex absolute top-[1%] right-[1%] z-20 border border-white/20 rounded-2xl overflow-hidden bg-black/90" style={{ height: 50, padding: 4 }}>
          <button onClick={() => setArticlesOpen((v) => !v)} className="w-10 h-full flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors" title="Artikler">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
          </button>
          <a href="/ai" className="w-10 h-full flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors text-white/80 hover:text-white" title="AI Writer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" /></svg>
          </a>
        </div>
      )}
      </>
      )}
      {confirmInstagramPostOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/75 px-4 backdrop-blur-xl app-safe-top app-safe-bottom">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="instagram-confirm-title"
            className="w-full max-w-sm rounded-2xl border border-white/15 bg-[#0c0c0c] p-4 shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)]"
          >
            <p className="mb-1 text-[10px] uppercase tracking-wider text-white/40">
              {size === 'story' ? 'Instagram Story' : 'Instagram feed'}
            </p>
            <h2 id="instagram-confirm-title" className="text-[17px] font-medium tracking-tight text-white">
              Er du sikker på, at du vil poste?
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">
              Det valgte {size === 'story' ? '9:16 story-design' : '1:1 opslag'} bliver publiceret direkte på Instagram-kontoen.
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => setConfirmInstagramPostOpen(false)}
                disabled={postingToInstagram}
                className="w-full py-2.5 rounded-xl border border-white/12 text-[13px] text-white/75 hover:bg-white/[0.05] hover:border-white/20 disabled:opacity-40 transition-all duration-200 active:scale-[0.98]"
              >
                Annuller
              </button>
              <button
                type="button"
                onClick={handlePostToInstagram}
                disabled={postingToInstagram}
                className="w-full px-4 py-2.5 rounded-xl text-[13px] font-medium text-white transition-all duration-200 border border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10 hover:shadow-[0_0_32px_-8px_rgba(255,255,255,0.18)] disabled:opacity-40 active:scale-[0.99]"
              >
                {postingToInstagram ? 'Poster…' : 'Post nu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
