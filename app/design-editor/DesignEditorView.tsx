'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { Amiri } from 'next/font/google';
import SocialCardCanvas, { type SocialCardData, type SocialCardSize, DIMENSIONS } from './SocialCardCanvas';
import { exportCardToPng, exportCardToJpeg } from './exportCardToPng';
import { storage } from '@/lib/firebase';
import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';

const amiri = Amiri({ weight: ['400', '700'], subsets: ['latin'], variable: '--font-amiri' });

const PANEL_WIDTH = 'min(300px, 50vw)';

const CAPTION_FOOTER_TEXT = 'Læs gratis med – uden reklamer, pop-ups eller anden støj: www.aproposmagazine.com';

function normalizeArticle(item: { id: string; fieldData?: Record<string, unknown> }) {
  const fd = item.fieldData || {};
  const title = (fd.name as string) || (fd['article-title'] as string) || (fd.title as string) || '';
  const slug = (fd.slug as string) || (fd['article-slug'] as string) || item.id;
  const excerpt =
    (fd.excerpt as string) ||
    (fd['article-excerpt'] as string) ||
    (fd.intro as string) ||
    (fd.metaDescription as string) ||
    '';
  const thumb = (fd.thumb as { url?: string })?.url ?? (fd.thumb as string);
  const featuredImage =
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

interface DesignEditorViewProps {
  /** I hub: tilbage-knap kalder dette i stedet for at navigere */
  onBack?: () => void;
  /** I hub: true = fyld container, ingen egen højre menu */
  embedMode?: boolean;
}

export default function DesignEditorView({ onBack, embedMode }: DesignEditorViewProps) {
  const [articles, setArticles] = useState<NormalizedArticle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<NormalizedArticle | null>(null);
  const [size, setSize] = useState<SocialCardSize>('square');
  const [exporting, setExporting] = useState(false);
  const [articlesOpen, setArticlesOpen] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [caption, setCaption] = useState('');
  const [postingToInstagram, setPostingToInstagram] = useState(false);
  const [instagramError, setInstagramError] = useState<string | null>(null);
  const [authors, setAuthors] = useState<{ id: string; name: string }[]>([]);
  const [sections, setSections] = useState<{ id: string; name: string }[]>([]);
  const [topics, setTopics] = useState<{ id: string; name: string }[]>([]);
  const [eyebrowChips, setEyebrowChips] = useState<{ type: 'section' | 'primaryTopic' | 'topic' | 'author' | 'topicOrAuthor'; value: string; label: string; options?: { id: string; name: string }[] }[]>([]);
  const previewRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.5);

  const resolveName = useCallback(
    (idOrName: string, list: { id: string; name: string }[]): string => {
      const byId = list.find((x) => x.id === idOrName);
      if (byId) return byId.name;
      const byName = list.find((x) => x.name === idOrName);
      if (byName) return byName.name;
      return idOrName;
    },
    []
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
      setSections(Array.isArray(sec) ? sec.map((s: { id: string; name?: string }) => ({ id: s.id, name: s.name ?? s.slug ?? '' })).filter((s: { name: string }) => s.name) : []);
      setTopics(Array.isArray(top) ? top.map((t: { id: string; name?: string }) => ({ id: t.id, name: t.name ?? t.slug ?? '' })).filter((t: { name: string }) => t.name) : []);
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
      if (label) chips.push({ type: 'section', value: val, label });
    }
    const topicVals = [selected.primaryTopic, ...(selected.topics ?? [])].filter(Boolean) as string[];
    const seenTopic = new Set<string>();
    const topicOpts = topicVals
      .filter((v) => !seenTopic.has(v) && (seenTopic.add(v), true))
      .map((v) => ({ id: v, name: topics.length ? resolveName(v, topics) : v }))
      .filter((x) => x.name);
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

  // Når preview åbnes eller artikel skiftes: foreslå caption fra titel + excerpt (uden Foto); altid afslutte med footer
  useEffect(() => {
    if (!showPreview || !selected) return;
    const parts = [selected.title, selected.excerpt].filter(Boolean);
    setCaption(parts.join('\n\n') + '\n\n' + CAPTION_FOOTER_TEXT);
  }, [showPreview, selected?.id, selected?.title, selected?.excerpt]);

  const ensureCaptionFooter = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return '\n\n' + CAPTION_FOOTER_TEXT;
    return t.endsWith(CAPTION_FOOTER_TEXT) ? t : t + '\n\n' + CAPTION_FOOTER_TEXT;
  }, []);

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

  const cardData: SocialCardData = {
    title: selected?.title ?? '',
    excerpt: selected?.excerpt ?? undefined,
    imageUrl: selected?.imageUrl ?? undefined,
    category: selected?.category ?? undefined,
    categorySecondary: undefined,
    eyebrowLabels: eyebrowChips.length > 0 ? eyebrowChips.map((c) => c.label) : undefined,
    rating: selected?.rating ?? undefined,
  };

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

  const handleExportPng = useCallback(async () => {
    setExporting(true);
    try {
      const dataUrl = await exportCardToPng(cardData, size);
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

  const handlePostToInstagram = useCallback(async () => {
    setPostingToInstagram(true);
    setInstagramError(null);
    try {
      if (!storage) {
        setInstagramError('Firebase Storage er ikke tilgængelig.');
        return;
      }
      const jpegDataUrl = await exportCardToJpeg(cardData, size);
      const res = await fetch(jpegDataUrl);
      const blob = await res.blob();
      const path = `instagram-publish/${Date.now()}.jpg`;
      const storageRef = ref(storage, path);
      await uploadBytes(storageRef, blob, { contentType: 'image/jpeg' });
      const imageUrl = await getDownloadURL(storageRef);
      const apiRes = await fetch('/api/instagram/publish', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ imageUrl, caption: ensureCaptionFooter(caption.trim()) || undefined }),
      });
      const data = await apiRes.json().catch(() => ({}));
      if (!apiRes.ok) {
        setInstagramError(data.error ?? 'Kunne ikke poste til Instagram.');
        return;
      }
      setInstagramError(null);
      alert('Opslaget er publiceret på Instagram.');
    } catch (e) {
      console.error('Instagram publish failed', e);
      setInstagramError('Der opstod en fejl. Prøv igen.');
    } finally {
      setPostingToInstagram(false);
    }
  }, [size, cardData, caption, ensureCaptionFooter]);

  const rootClass = embedMode ? `h-full flex flex-col relative overflow-hidden ${amiri.variable}` : `h-screen bg-[#171717] md:p-[1%] p-0 flex flex-col md:flex-row relative overflow-hidden ${amiri.variable}`;

  return (
    <div className={rootClass}>
      {/* Venstre panel: Artikler */}
      <div
        className="hidden md:block absolute top-0 bottom-0 left-0 z-40 transition-all duration-300 ease-out overflow-hidden"
        style={{
          width: articlesOpen ? `calc(${PANEL_WIDTH})` : '0px',
          opacity: articlesOpen ? 1 : 0,
          pointerEvents: articlesOpen ? 'auto' : 'none',
        }}
      >
        <div
          className="h-full flex flex-col rounded-xl border border-white/20 overflow-hidden bg-[#171717]"
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
          <div className="flex-1 overflow-y-auto overflow-x-hidden p-2 no-scrollbar">
            {loading ? (
              <p className="text-white/50 text-sm py-4">Henter artikler fra Webflow…</p>
            ) : articles.length === 0 ? (
              <p className="text-white/50 text-sm py-4">Ingen artikler. Tjek Webflow.</p>
            ) : (
              <ul className="space-y-1">
                {articles.map((art) => (
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
      </div>

      {/* Mobil: fuldskærms artikel-liste */}
      <div className={`md:hidden fixed inset-0 z-40 bg-[#171717] ${articlesOpen ? 'translate-x-0' : '-translate-x-full'} transition-transform duration-300`}>
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-white/10 flex items-center justify-between">
            <h3 className="text-white text-base font-medium">Mine artikler</h3>
            <button onClick={() => setArticlesOpen(false)} className="p-2 text-white/60 hover:text-white" aria-label="Luk">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12" /></svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-3">
            {loading ? <p className="text-white/50 text-sm">Henter artikler…</p> : (
              <ul className="space-y-2">
                {articles.map((art) => (
                  <li key={art.id}>
                    <button type="button" onClick={() => setSelected(art)} className={`w-full text-left px-3 py-3 rounded-xl text-sm ${selected?.id === art.id ? 'bg-white/15 text-white' : 'text-white/80 hover:bg-white/10'}`}>
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
          left: articlesOpen ? `calc(12px + ${PANEL_WIDTH})` : '0',
          right: embedMode ? 0 : 'calc(60px)',
        }}
      >
        <div className="h-full flex flex-col rounded-xl border border-white/20 overflow-hidden bg-[#171717]">
          {/* Top bar – samme design som AI Writer */}
          <div className="flex-shrink-0 flex items-center justify-between p-4 border-b border-white/10 md:border-b md:border-zinc-800 bg-black/40 backdrop-blur-xl md:bg-transparent md:backdrop-blur-0">
            <div className="flex items-center gap-3">
              <button onClick={() => setArticlesOpen(true)} className="w-9 h-9 flex items-center justify-center hover:bg-white/10 rounded-xl transition-colors md:hidden" aria-label="Artikler">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <h1 className="text-white text-base font-medium md:block">
                <span
                  className="bg-gradient-to-r from-white/20 via-white/70 to-white/20 bg-clip-text text-transparent"
                  style={{ backgroundSize: '200% 100%', animation: 'gradient-shift 4s ease-in-out infinite' }}
                >
                  Apropos Magazine Designer
                </span>
              </h1>
            </div>
            <div className="flex items-center gap-2">
              <select
                value={size}
                onChange={(e) => setSize(e.target.value as SocialCardSize)}
                className="p-2 rounded-lg border border-white/15 bg-transparent text-white/70 hover:text-white hover:bg-white/5 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-white/20 transition-colors text-sm"
              >
                <option value="og">1200 × 630</option>
                <option value="square">1080 × 1080</option>
              </select>
              <button
                type="button"
                onClick={() => setArticlesOpen((v) => !v)}
                className={`p-2 rounded-lg border flex items-center justify-center transition-colors ${articlesOpen ? 'bg-white/10 text-white border-white/25' : 'border-white/15 text-white/70 hover:text-white hover:bg-white/5'}`}
                title="Mine artikler"
                aria-label="Mine artikler – vælg artikel fra Webflow"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M4 6h16M4 12h16M4 18h16" /></svg>
              </button>
              <button
                type="button"
                onClick={() => setShowPreview((v) => !v)}
                className={`p-2 rounded-lg border border-white/15 flex items-center justify-center transition-colors ${showPreview ? 'bg-white/10 text-white border-white/25' : 'text-white/70 hover:text-white hover:bg-white/5'}`}
                title={showPreview ? 'Luk forhåndsvisning' : 'Forhåndsvis opslag'}
                aria-label={showPreview ? 'Luk forhåndsvisning' : 'Forhåndsvis opslag'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
              </button>
              <button
                type="button"
                onClick={handleExportPng}
                disabled={exporting}
                className="p-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:bg-white/5 disabled:opacity-50 disabled:pointer-events-none transition-colors"
                title="Eksporter PNG"
                aria-label={exporting ? 'Eksporterer…' : 'Eksporter PNG'}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              </button>
              {onBack ? (
                <button
                  type="button"
                  onClick={onBack}
                  className="p-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
                  aria-label="Luk Designer"
                  title="Luk"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              ) : (
                <a
                  href="/ai"
                  className="p-2 rounded-lg border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors inline-flex items-center justify-center"
                  aria-label="Tilbage til AI Writer"
                  title="Tilbage til AI Writer"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </a>
              )}
            </div>
          </div>
          {showPreview ? (
            <div className="flex-1 min-h-0 flex flex-col items-center overflow-y-auto bg-[#0a0a0a] p-4">
              {/* Instagram-style post preview */}
              <div className="w-full max-w-[468px] flex flex-col rounded-lg overflow-hidden border border-white/10 bg-[#0a0a0a]">
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
                <div className="flex items-center justify-center bg-black/30 w-full" style={{ aspectRatio: '1/1', maxHeight: 468 }}>
                  <div
                    style={{
                      width: DIMENSIONS[size].width,
                      height: DIMENSIONS[size].height,
                      transform: `scale(${Math.min(468 / DIMENSIONS[size].width, 468 / DIMENSIONS[size].height)})`,
                      transformOrigin: 'center center',
                    }}
                  >
                    <SocialCardCanvas data={cardData} size={size} />
                  </div>
                </div>
                {/* Engagement (placeholder) */}
                <div className="flex items-center gap-4 px-3 py-2 border-b border-white/10">
                  <span className="flex items-center gap-1.5 text-white/80 text-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/90"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/></svg>
                    <span>0</span>
                  </span>
                  <span className="flex items-center gap-1.5 text-white/80 text-sm">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/90"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span>0</span>
                  </span>
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/90"><path d="M22 2L11 13M22 2l-7 20-4-9-9-4 20-7z"/></svg>
                  <span className="ml-auto"><svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white/90"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></span>
                </div>
                {/* Head & Eyebrow: 2 felter – klik for at skifte, hover = glow */}
                {eyebrowChips.length > 0 && (
                  <div className="px-3 py-2 border-b border-white/10">
                    <p className="text-white/50 text-xs mb-2">Head & Eyebrow — klik for næste</p>
                    <div className="flex flex-wrap gap-2">
                      {eyebrowChips.map((chip, index) => (
                        <button
                          key={`${chip.type}-${index}-${chip.value}`}
                          type="button"
                          onClick={() => cycleEyebrowChip(index)}
                          className="px-3 py-1.5 rounded-lg text-white text-sm font-medium bg-white/15 border border-white/25 transition-all duration-200 hover:bg-white/25 hover:border-white/50 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] focus:outline-none focus:ring-2 focus:ring-white/50"
                          title="Klik for at vælge næste"
                        >
                          {chip.label}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
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
                    className="w-full min-h-[100px] px-0 py-1 bg-transparent border-none text-white text-sm placeholder:text-white/40 focus:outline-none focus:ring-0 resize-y"
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
                      onClick={handlePostToInstagram}
                      disabled={postingToInstagram}
                      className="w-full py-2.5 px-4 rounded-lg bg-[#E1306C] hover:bg-[#C13584] disabled:opacity-50 disabled:pointer-events-none text-white font-medium text-sm transition-colors flex items-center justify-center gap-2"
                    >
                      {postingToInstagram ? (
                        <>Publicerer…</>
                      ) : (
                        <>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" className="shrink-0"><path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-1.657 0-3-1.343-3-3 0-1.657 1.343-3 3-3s3 1.343 3 3c0 1.657-1.343 3-3 3zm6.205-11.947c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z"/></svg>
                          Post til Instagram
                        </>
                      )}
                    </button>
                    {instagramError && (
                      <p className="text-red-400 text-sm">{instagramError}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div ref={previewRef} className="flex-1 min-h-0 flex flex-col items-center justify-center bg-black/20 gap-4 p-4">
              {/* Head & Eyebrow – altid synlige over kortet, klik for at skifte (2 felter + stjerner) */}
              {eyebrowChips.length > 0 && (
                <div className="flex flex-col items-center gap-2 w-full max-w-lg">
                  <p className="text-white/60 text-xs uppercase tracking-wider">Head & Eyebrow — klik for næste</p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    {eyebrowChips.map((chip, index) => (
                      <button
                        key={`${chip.type}-${index}-${chip.value}`}
                        type="button"
                        onClick={() => cycleEyebrowChip(index)}
                        className="px-4 py-2 rounded-lg text-white text-sm font-medium bg-white/15 border border-white/25 transition-all duration-200 hover:bg-white/25 hover:border-white/50 hover:shadow-[0_0_20px_rgba(255,255,255,0.4)] focus:outline-none focus:ring-2 focus:ring-white/50"
                        title="Klik for at vælge næste"
                      >
                        {chip.label}
                      </button>
                    ))}
                    {(selected?.rating ?? 0) > 0 && (
                      <span className="text-white/70 text-sm ml-1">
                        | ★ {selected?.rating}/6
                      </span>
                    )}
                  </div>
                </div>
              )}
              <div style={{ transform: `scale(${scale})`, transformOrigin: 'center center', width: DIMENSIONS[size].width, height: DIMENSIONS[size].height }}>
                <SocialCardCanvas data={cardData} size={size} />
              </div>
            </div>
          )}
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
    </div>
  );
}
