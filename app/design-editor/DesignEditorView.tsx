'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Amiri } from 'next/font/google';
import SocialEditorToolbar from './SocialEditorToolbar';
import styles from './SocialEditor.module.css';
import SocialCardCanvas, { type SocialCardData, type SocialCardSize, DIMENSIONS } from './SocialCardCanvas';
import { exportCardToPng, exportCardToJpegBlob } from './exportCardToPng';
import { useCardSubtitle } from './useCardSubtitle';
import { useCardTextSize } from './useCardTextSize';
import SubtitleControls from './SubtitleControls';
import { useCardTitle } from './useCardTitle';
import TitleControls from './TitleControls';
import { socialConfigured } from '@/lib/social-publish-feedback';
import { useAuth } from '@/lib/auth-context';
import { useSocialDraft } from './useSocialDraft';
import { useSocialPublishing, type SocialPostSpec } from './useSocialPublishing';
import PublicationReceipts from './PublicationReceipts';

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

const CAPTION_FOOTER_TEXT = 'Læs gratis med – uden reklamer, pop-ups eller anden støj: www.aproposmagazine.com';
const ARTICLE_BASE_URL = 'https://www.aproposmagazine.com/articles';

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

function normalizeArticle(item: { id: string; fieldData?: Record<string, unknown>; socialSubtitles?: { square: string; story: string } }) {
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
    socialSubtitles: item.socialSubtitles,
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
  const { user } = useAuth();
  const [articles, setArticles] = useState<NormalizedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NormalizedArticle | null>(null);
  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [size, setSize] = useState<SocialCardSize>('square');
  const identity = JSON.stringify([selected?.id, selected?.title, selected?.excerpt]);
  const draft = useSocialDraft(identity, selected?.id ?? '');
  const [hydrated, setHydrated] = useState('');
  const hydrationKey = draft.key+':'+draft.loadVersion;
  const editorReady = draft.ready && hydrated === hydrationKey;
  const cardTitle = useCardTitle(selected?.id ?? '', selected?.title ?? '', selected?.excerpt ?? '', size, editorReady);
  const subtitle = useCardSubtitle(selected?.id ?? '', selected?.title ?? '', selected?.excerpt ?? '', size, amiri.style.fontFamily, selected?.socialSubtitles?.[size], editorReady);
  const textSize = useCardTextSize(JSON.stringify([selected?.id, selected?.title, selected?.excerpt]));
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  /** I AI Writer (embed) start med kanvas: undgå overlap med header. Desktop viser artikelpanel. */
  const [articlesOpen, setArticlesOpen] = useState(!embedMode);
  const [articleSearch, setArticleSearch] = useState('');
  const showPreview = false;
  const [articlesPanelWidth, setArticlesPanelWidth] = useState(DEFAULT_PANEL_WIDTH);
  const [isResizingArticles, setIsResizingArticles] = useState(false);
  const [caption, setCaption] = useState('');
  const publishing = useSocialPublishing(selected?.id ?? '');
  const postingToInstagram = publishing.posting;
  const publishStep = publishing.step;
  const instagramError = publishing.error;
  const [facebook, setFacebook] = useState(false);
  const [facebookConfigured, setFacebookConfigured] = useState(false);
  const [confirmation, setConfirmation] = useState<{ spec: SocialPostSpec; card: SocialCardData; size: SocialCardSize } | null>(null);
  const [copyState, setCopyState] = useState('');
  const [metadataReady, setMetadataReady] = useState(false);
  const [eyebrowOverrides, setEyebrowOverrides] = useState<Record<string, string[]>>({});
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
      setMetadataReady(true);
      setAuthors(Array.isArray(auth) ? auth.map((a: { id: string; name?: string }) => ({ id: a.id, name: a.name ?? 'Ukendt' })) : []);
      setSections(Array.isArray(sec) ? sec.map((s: { id: string; name?: string; slug?: string }) => ({ id: s.id, name: s.name ?? s.slug ?? '' })).filter((s: { name: string }) => s.name) : []);
      setTopics(Array.isArray(top) ? top.map((t: { id: string; name?: string; slug?: string }) => ({ id: t.id, name: t.name ?? t.slug ?? '' })).filter((t: { name: string }) => t.name) : []);
    }).catch(() => {
      if (!cancelled) { setAuthors([]); setSections([]); setTopics([]); setMetadataReady(true); }
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
      if (cleanLabel) chips.push({ type: 'section', value: val, label: cleanLabel,
        options: [...new Set([selected.section, selected.category].filter(Boolean) as string[])]
          .map(id => ({ id, name: resolveName(id, sections) })).filter(option => option.name && !isWebflowId(option.name)) });
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
    const saved = eyebrowOverrides[identity];
    setEyebrowChips(chips.map((chip, index) => {
      const option = chip.options?.find(option => option.id === saved?.[index]);
      return option ? { ...chip, value: option.id, label: option.name } : chip;
    }));
  }, [selected?.id, selected?.section, selected?.primaryTopic, selected?.topics, selected?.category, selected?.authorId, sections, topics, authors, resolveName, identity, eyebrowOverrides]);

  // Når artikel skiftes: foreslå caption fra titel + excerpt (uden Foto); altid afslutte med footer
  useEffect(() => {
    if (!selected) return;
    setCaption(buildDefaultCaption(selected));
  }, [selected?.id, selected?.title, selected?.excerpt, selected?.intro]);

  // Tjek om Instagram-publish er konfigureret (til test / brugertilbagemelding)
  useEffect(() => {
    let cancelled = false;
    fetch('/api/instagram/publish')
      .then(async r => { const data = await r.json().catch(() => null);
        if (!cancelled) setFacebookConfigured(r.ok && data?.facebookConfigured === true);
        return socialConfigured(r.status, data); })
      .then(configured => {
        if (!cancelled) setInstagramConfigured(configured);
      })
      .catch(() => {
        if (!cancelled) setInstagramConfigured(null);
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
      const padding = getComputedStyle(el);
      const w = el.clientWidth - parseFloat(padding.paddingLeft) - parseFloat(padding.paddingRight);
      const h = el.clientHeight - parseFloat(padding.paddingTop) - parseFloat(padding.paddingBottom);
      if (w && h) setScale(Math.min(w / cardW, matchMedia('(min-width: 1024px)').matches ? h / cardH : Infinity, 1));
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [size]);

  const cycleEyebrowChip = useCallback((index: number) => {
    const chip = eyebrowChips[index];
    if (!chip) return;
    const options = chip.type === 'section' && selected
      ? [...new Set([selected.section, selected.category].filter(Boolean) as string[])].map(value => ({ id: value, name: resolveName(value, sections) }))
      : chip.options ?? [];
    if (options.length < 2) return;
    const active = options.findIndex(option => option.id === chip.value);
    const value = options[(active + 1) % options.length].id;
    const values = eyebrowChips.map((item, i) => i === index ? value : item.value);
    setEyebrowOverrides(previous => ({ ...previous, [identity]: values }));
  }, [identity, eyebrowChips, selected, sections, resolveName]);

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
      title: cardTitle.text,
      titleSizePercent: textSize.title.percent,
      subtitleSizePercent: textSize.subtitle.percent,
      titleSubtitleGap: textSize.spacing.gap,
      excerpt: subtitle.text || undefined,
      theme,
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
  }, [subtitle.text, cardTitle.text, textSize.title.percent, textSize.subtitle.percent, textSize.spacing.gap, selected?.excerpt, selected?.imageUrl, selected?.category, selected?.section, selected?.primaryTopic, selected?.topics, selected?.rating, selected?.authorId, eyebrowChips, authors, sections, topics, resolveName, size, storyMetaShuffleSeed, theme]);

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
  const renderedCanvasWidth = Math.max(1, Math.round(DIMENSIONS[size].width * scale));
  const renderedCanvasHeight = Math.max(1, Math.round(DIMENSIONS[size].height * scale));

  // Preview must use the exact same rendering pipeline as export (WYSIWYG)
  useEffect(() => {
    let cancelled = false;
    setPreviewError(null);
    exportCardToPng(cardData, size, { amiriFontFamily: amiri.style.fontFamily })
      .then((url) => { if (!cancelled) setRenderedCardDataUrl(url); })
      .catch(error => { if (!cancelled) {
        setRenderedCardDataUrl(null);
        setPreviewError(error instanceof Error ? error.message : 'Forhåndsvisningen kunne ikke dannes.');
      } });
    return () => { cancelled = true; };
  }, [size, cardData]);

  useEffect(() => {
    let cancelled = false;
    if (!user) return;
    setLoading(true);
    Promise.all([
      fetch('/api/webflow/sample-articles').then(response => response.json()),
      fetch('/api/design-editor/draft').then(response => response.ok ? response.json() : {}).catch(() => ({})) as Promise<{ lastArticleId?: string }>,
    ]).then(([data, saved]) => {
      if (cancelled) return;
      const list = (data.items || []).map((item: { id: string; fieldData?: Record<string, unknown> }) => normalizeArticle(item));
      setArticles(list);
      setSelected(list.find((article: NormalizedArticle) => article.id === saved.lastArticleId) ?? list[0] ?? null);
    }).catch(() => { if (!cancelled) setArticles([]); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [user?.uid]);

  useEffect(() => {
    if (!draft.ready || hydrated === hydrationKey) return;
    const saved = draft.draft;
    if (saved) {
      cardTitle.edit(saved.title);
      if (saved.subtitle !== null) subtitle.edit(saved.subtitle, saved.subtitleStatus);
      else subtitle.reset();
      setCaption(saved.caption); setTheme(saved.theme); setSize(saved.size);
      textSize.restore(saved.titleSizePercent, saved.subtitleSizePercent, saved.titleSubtitleGap);
      setStoryMetaShuffleSeed(saved.storyMetaShuffleSeed); setFacebook(saved.facebook);
      setEyebrowOverrides(previous => ({ ...previous, [identity]: saved.eyebrowValues }));
    } else {
      cardTitle.restore(); subtitle.reset(); textSize.restore(100, 100);
      setCaption(buildDefaultCaption(selected)); setTheme('light'); setSize('square');
      setStoryMetaShuffleSeed(0); setFacebook(false);
    }
    setHydrated(hydrationKey);
  }, [draft.ready, hydrationKey]);

  useEffect(() => {
    if (!editorReady || !selected || !metadataReady) return;
    draft.update({ title: cardTitle.text, subtitle: subtitle.checking && !subtitle.hasEntry ? null : subtitle.text,
      subtitleStatus: subtitle.status ?? 'original', caption, theme, size,
      titleSizePercent: textSize.title.percent, subtitleSizePercent: textSize.subtitle.percent,
      titleSubtitleGap: textSize.spacing.gap,
      eyebrowValues: eyebrowChips.map(chip => chip.value), storyMetaShuffleSeed, facebook });
  }, [editorReady, selected?.id, cardTitle.text, subtitle.text, subtitle.checking, subtitle.hasEntry, subtitle.status,
    caption, theme, size, textSize.title.percent, textSize.subtitle.percent, textSize.spacing.gap, eyebrowChips, storyMetaShuffleSeed, facebook, metadataReady]);

  // Safety net: ensure first article is selected if selected is missing.
  useEffect(() => {
    if (!selected && articles.length > 0) {
      setSelected(articles[0]);
    }
  }, [selected, articles]);

  const handleExportPng = useCallback(async () => {
    if (!subtitle.ready) { alert('Underteksten skal forkortes, før billedet kan hentes.'); return; }
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
  }, [size, cardData, subtitle.ready]);

  const requestPostToInstagram = () => {
    if (!editorReady || !subtitle.ready || !selected || !selectedArticleUrl || !!previewError) return;
    setConfirmation({ card: structuredClone(cardData), size, spec: { articleId: selected.id, caption: size === 'story' ? '' : captionForPublish,
      articleUrl: selectedArticleUrl, isStory: size === 'story', card: structuredClone(cardData), channels: { instagram: true, facebook: size === 'square' && facebook && facebookConfigured } } });
    setConfirmInstagramPostOpen(true);
  };
  const handlePostToInstagram = async () => {
    if (!confirmation) return;
    const snapshot = confirmation;
    setConfirmInstagramPostOpen(false);
    await publishing.publish({ ...snapshot.spec, channels: { instagram: true, facebook: !snapshot.spec.isStory && facebook && facebookConfigured } },
      () => exportCardToJpegBlob(snapshot.card, snapshot.size, 0.92, { amiriFontFamily: amiri.style.fontFamily }));
  };
  const copyArticleLink = async () => {
    if (!selectedArticleUrl) return;
    try { await navigator.clipboard.writeText(selectedArticleUrl); setCopyState('Link kopieret'); }
    catch { setCopyState('Markér og kopiér linket herunder.'); }
  };

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
                {instagramError && <p role="alert" className={styles.copyError}>{instagramError}</p>}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <div
          ref={previewRef}
          className={`${styles.workspace} flex-1 min-h-0 w-full flex flex-col items-center overflow-y-auto overflow-x-hidden touch-pan-y [overscroll-behavior:contain] justify-start app-safe-bottom`}
        >
          <div className={styles.workspaceContent}>
            {selected && <>
              <div className={styles.saveStatus} role="status" aria-live="polite">{draft.status === 'saved' ? 'Gemt' : draft.status === 'saving' ? 'Gemmer…' : draft.status === 'conflict' ? 'Nyere version på en anden enhed' : draft.status === 'offline' ? 'Ikke synkroniseret' : 'Henter kladde…'}</div>
              {draft.error && <div className={styles.syncNotice}><p>{draft.error}</p>{draft.status === 'conflict' ? <div className={styles.copyActions}>
                <button type="button" className={styles.textButton} onClick={draft.useServer}>Brug gemt version</button>
                <button type="button" className={styles.textButton} onClick={draft.keepLocal}>Gem mine ændringer</button>
              </div> : <button type="button" className={styles.textButton} onClick={() => { void draft.retry(); }}>Prøv synkronisering igen</button>}</div>}
              <fieldset disabled={!editorReady || postingToInstagram} className={styles.copyGroup}>
              <TitleControls key={cardTitle.key} title={cardTitle} sizing={textSize.title} spacing={selected.excerpt ? textSize.spacing : undefined} />
              {selected.excerpt && <SubtitleControls key={subtitle.key} subtitle={subtitle} sizing={textSize.subtitle} />}
            </fieldset></>}
            {eyebrowChips.length > 0 && size !== 'story' && (
              <div className={`${styles.metaControls} no-scrollbar`}>
                {eyebrowChips.map((chip, index) => (
                  <button
                    key={`${chip.type}-${index}-${chip.value}`}
                    type="button"
                    disabled={!editorReady || postingToInstagram}
                    onClick={() => cycleEyebrowChip(index)}
                    className={styles.metaButton}
                    title="Klik for at vælge næste"
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            )}
            {size === 'story' && (
              <div className={styles.metaControls}>
                <button disabled={!editorReady || postingToInstagram}
                  type="button"
                  onClick={() => setStoryMetaShuffleSeed((prev) => prev + 1)}
                  className={styles.metaButton}
                  title="Byt rundt på story-felter"
                >
                  Byt felter
                </button>
                <button
                  type="button"
                  onClick={() => setStoryMetaShuffleSeed(0)}
                  disabled={storyMetaShuffleSeed === 0 || !editorReady || postingToInstagram}
                  className={styles.metaButton}
                  title="Gendan de oprindelige felter"
                >
                  Nulstil
                </button>
              </div>
            )}
            {size === 'story' && selectedArticleUrl && <div className={styles.storyExport}>
              <div className={styles.copyActions}><button type="button" className={styles.textButton} disabled={exporting || !editorReady || !subtitle.ready || !!previewError} onClick={handleExportPng}>Download Story</button>
                <button type="button" className={styles.textButton} onClick={() => { void copyArticleLink(); }}>Kopiér artikellink</button></div>
              <input aria-label="Artikellink til Story" value={selectedArticleUrl} readOnly onFocus={event => event.target.select()} />
              <p role="status">{copyState || 'Tilføj linket med Instagrams linkmærkat. Læs nu på billedet er grafik.'}</p>
            </div>}
            {postingToInstagram && <p role="status" className={styles.copyNote}>{publishStep}</p>}
            <PublicationReceipts receipts={publishing.receipts} check={publishing.check} />
            {publishing.unconfirmedRequestId && <button type="button" className={styles.textButton}
              onClick={() => { void publishing.check(publishing.unconfirmedRequestId!); }}>Hent manglende kvittering</button>}
            {publishing.error && <p role="alert" className={styles.copyError}>{publishing.error}</p>}
            {previewError && <p role="alert" className={styles.copyError} data-layout-error>{previewError}</p>}
            <div
              hidden={!!previewError}
              data-social-preview
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
              <div className={styles.caption} style={{ width: renderedCanvasWidth }}>
                <div>
                  <label htmlFor="social-post-caption" className={styles.captionLabel}>Opslagstekst</label>
                  <textarea
                    disabled={!editorReady || postingToInstagram}
                    value={caption}
                    onChange={(e) => setCaption(e.target.value)}
                    id="social-post-caption"
                    placeholder="Skriv opslagstekst…"
                    rows={5}
                  />
                  <div className="mt-2">
                    {instagramError && <p role="alert" className={styles.copyError}>{instagramError}</p>}
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
    ? `flex flex-col h-full min-h-0 text-white bg-black overflow-hidden ${amiri.variable}`
    : `min-h-[100dvh] h-[100dvh] bg-black p-0 flex flex-col md:flex-row relative overflow-hidden ${amiri.variable}`;

  const toolbar = <SocialEditorToolbar embedded={embedMode} articlesOpen={articlesOpen}
    onArticles={() => setArticlesOpen(value => !value)} size={size}
    onSize={next => { if (size !== next) { subtitle.carryToNextFormat(); setSize(next); } }}
    dark={theme === 'dark'} onTheme={() => setTheme(value => value === 'light' ? 'dark' : 'light')}
    publishing={postingToInstagram} editingDisabled={!editorReady || postingToInstagram} publishDisabled={!editorReady || !subtitle.ready || postingToInstagram || instagramConfigured !== true || !!previewError} onPublish={requestPostToInstagram}
    exporting={exporting} exportDisabled={!editorReady || !!previewError} onExport={handleExportPng} onClose={onBack} />;

  return (
    <div ref={rootRef} className={`${rootClass} ${styles.root}`}>
      {embedMode ? (
        <>
          {toolbar}
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
            <main className="flex-1 min-w-0 min-h-0 flex flex-col overflow-hidden bg-black">
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
          {toolbar}
          {editorCanvas}
        </div>
      </div>

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
              {confirmation?.spec.isStory ? 'Instagram Story' : 'Opslag'}
            </p>
            <h2 id="instagram-confirm-title" className="text-[17px] font-medium tracking-tight text-white">
              Er du sikker på, at du vil poste?
            </h2>
            <p className="mt-2 text-[13px] leading-relaxed text-white/65">
              {confirmation?.spec.isStory ? 'Udgiv 9:16 Story på Instagram.' : 'Udgiv 1:1-opslaget på de valgte kanaler.'}
            </p>
            <div className={styles.channelChoices}>
              <label><input type="checkbox" checked readOnly aria-label="Instagram valgt" /> Instagram{confirmation?.spec.isStory ? ' Story' : ''}</label>
              {!confirmation?.spec.isStory && <label><input type="checkbox" checked={facebook && facebookConfigured} disabled={!facebookConfigured} onChange={event => setFacebook(event.target.checked)} /> Facebook{!facebookConfigured ? ' (ikke tilsluttet)' : ''}</label>}
            </div>
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
                {postingToInstagram ? 'Udgiver…' : 'Udgiv nu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
