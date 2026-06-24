'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { WebflowAuthor } from '@/lib/webflow-service';
import type { ArticleData } from '@/types/article';
import StepChip from '@/components/ui/StepChip';
import { EDITORIAL_ARTICLE_TYPE_OPTIONS, getEditorialArticleTypeOption } from '@/lib/editorial/signal-store';

type Step = 'template' | 'articleType' | 'source' | 'trending' | 'inspiration' | 'recommended' | 'analysis' | 'author' | 'section' | 'topic' | 'platform' | 'rating' | 'press';

interface SetupWizardProps {
  initialData?: Partial<ArticleData>;
  onComplete: (articleData: Partial<ArticleData>) => void;
  onChange?: (data: Partial<ArticleData>) => void;
}

type Option = { id: string; name: string; slug: string };

const getDateTimestamp = (value?: string | number | null) => {
  if (value === null || value === undefined || value === '') return 0;
  
  // Handle number (timestamp)
  if (typeof value === 'number') {
    return value;
  }
  
  const dateStr = String(value);
  
  // Try parsing as-is first (works for ISO format)
  let date = new Date(dateStr);
  let time = date.getTime();
  if (!Number.isNaN(time)) return time;
  
  // Handle DD-MM-YYYY format (common in GAFFA articles)
  const ddmmyyyyPattern = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/;
  const match = dateStr.match(ddmmyyyyPattern);
  if (match) {
    const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
    const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}Z`;
    date = new Date(isoStr);
    time = date.getTime();
    if (!Number.isNaN(time)) return time;
  }
  
  return 0;
};

// Deduplicate articles by URL or title
const deduplicateArticles = <T extends { url?: string; title?: string }>(items: T[]): T[] => {
  const seen = new Set<string>();
  return items.filter(item => {
    // Use URL as primary key, fallback to title
    const key = (item.url || item.title || '').toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const sortByNewest = <T,>(items: T[], getDate: (item: T) => string | number | undefined | null) => {
  return [...items].sort(
    (a, b) => getDateTimestamp(getDate(b)) - getDateTimestamp(getDate(a))
  );
};

export default function SetupWizard({ initialData, onComplete, onChange }: SetupWizardProps) {
  const [step, setStep] = useState<Step>('template');
  const stepperRef = useRef<HTMLDivElement | null>(null);
  const [authors, setAuthors] = useState<WebflowAuthor[]>([]);
  const [loadingAuthors, setLoadingAuthors] = useState(true);
  const [sections, setSections] = useState<Option[]>([]);
  const [topics, setTopics] = useState<Option[]>([]);
  const [loadingTaxonomies, setLoadingTaxonomies] = useState(true);
  const [services, setServices] = useState<Option[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [mediaSources, setMediaSources] = useState<Array<{ id:string; name:string }>>([]);
  const [loadingSources, setLoadingSources] = useState(true);
  const [trendingItems, setTrendingItems] = useState<Array<{ title:string; date?:string; published_at?:string; publishDate?:string; source?:string; url?:string; keyPoints?:string[]; content?:string }>>([]);
  const [recommendedItems, setRecommendedItems] = useState<Array<{ title:string; date?:string; source?:string; url?:string; category?:string; type?:string; excerpt?:string }>>([]);
  const [loadingRecommended, setLoadingRecommended] = useState(false);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const [analysisData, setAnalysisData] = useState<{ trend: string; angle: string; audience: string; suggestions: string[] } | null>(null);
  const [loadingAnalysis, setLoadingAnalysis] = useState(false);
  const trendingAbortRef = useRef<AbortController | null>(null);
  const currentSourceRef = useRef<string>('');
  const dragInfoRef = useRef<{ active: boolean; pointerId: number | null; startX: number; scrollLeft: number; moved: boolean }>({ active: false, pointerId: null, startX: 0, scrollLeft: 0, moved: false });
  const [isDragging, setIsDragging] = useState(false);
  const [scrollFade, setScrollFade] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  
  // Normalize date string to Date object (handles DD-MM-YYYY format from GAFFA)
  const normalizeDate = (dateStr?: string): Date | null => {
    if (!dateStr) return null;
    
    try {
      // Try parsing as-is first (works for ISO format)
      let date = new Date(dateStr);
      if (!isNaN(date.getTime())) return date;
      
      // Handle DD-MM-YYYY format (common in GAFFA articles)
      const ddmmyyyyPattern = /^(\d{1,2})-(\d{1,2})-(\d{4})(?:\s+(\d{1,2}):(\d{1,2}):(\d{1,2}))?$/;
      const match = dateStr.match(ddmmyyyyPattern);
      if (match) {
        const [, day, month, year, hour = '00', minute = '00', second = '00'] = match;
        const isoStr = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}T${hour.padStart(2, '0')}:${minute.padStart(2, '0')}:${second.padStart(2, '0')}Z`;
        date = new Date(isoStr);
        if (!isNaN(date.getTime())) return date;
      }
      
      return null;
    } catch {
      return null;
    }
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    
    try {
      const date = normalizeDate(dateString);
      if (!date) return '';
      
      const now = new Date();
      const diffTime = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
      
      // If same year, don't show year
      if (date.getFullYear() === now.getFullYear()) {
        if (diffDays === 0) {
          return 'i dag';
        } else if (diffDays === 1) {
          return 'i går';
        } else if (diffDays < 7) {
          return `${diffDays} dage siden`;
        } else {
          return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short' });
        }
      } else {
        // Different year, show year
        return date.toLocaleDateString('da-DK', { day: 'numeric', month: 'short', year: '2-digit' });
      }
    } catch {
      return '';
    }
  };
  
  const [data, setData] = useState<any>({
    author: initialData?.author || '',
    authorId: initialData?.authorId || '',
    authorTOV: initialData?.authorTOV || '',
    section: initialData?.section || '',
    topic: initialData?.topic || '',
    topicsSelected: (()=> {
      const fromTopic = initialData?.topic
        ? (Array.isArray(initialData.topic) ? initialData.topic : [initialData.topic])
        : [];
      const fromTags = Array.isArray(initialData?.tags) ? initialData.tags : [];
      const sectionLower = initialData?.section ? String(initialData.section).trim().toLowerCase() : '';
      const merged = Array.from(new Set([...fromTopic, ...fromTags].map((t:any)=>String(t).trim()).filter(Boolean)));
      const filtered = merged.filter((t)=>t.toLowerCase() !== sectionLower);
      return filtered.slice(0,2);
    })(),
    platform: initialData?.platform || initialData?.streaming_service || '',
    template: initialData?.template || '',
    inspirationSource: initialData?.inspirationSource || '',
    researchSelected: initialData?.researchSelected || null,
    inspirationAcknowledged: initialData?.inspirationAcknowledged || false,
    recommendedSelected: initialData?.recommendedSelected || null,
    aiDraft: initialData?.aiDraft || null,
    articleType: getEditorialArticleTypeOption(initialData?.articleType).id,
    targetWordCount: initialData?.targetWordCount || getEditorialArticleTypeOption(initialData?.articleType).targetWordCount,
    targetLengthLabel: initialData?.targetLengthLabel || getEditorialArticleTypeOption(initialData?.articleType).targetLengthLabel,
    rating: initialData?.rating || 0,
    ratingSkipped: initialData?.ratingSkipped || false,
    press: typeof initialData?.press === 'boolean' ? initialData.press : null,
    title: initialData?.title || '',
    subtitle: initialData?.subtitle || '',
    tags: initialData?.tags || []
  });

  // Load authors from Webflow
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/webflow/authors');
        const j = await res.json();
        // Handle both old format (j.authors) and new format (j.data.authors)
        const authors = j.data?.authors || j.authors || [];
        setAuthors(Array.isArray(authors) ? authors : []);
        // load sections/topics from Webflow collections if env ids are set
        const [secRes, topRes] = await Promise.all([
          fetch('/api/webflow/sections'),
          fetch('/api/webflow/topics')
        ]);
        const secData = secRes.ok ? await secRes.json() : null;
        const topData = topRes.ok ? await topRes.json() : null;
        // Handle both old format (items) and new format (data.items)
        const sec = secData?.data?.items || secData?.items || [];
        const top = topData?.data?.items || topData?.items || [];
        setSections(Array.isArray(sec) ? sec : []);
        setTopics(Array.isArray(top) ? top : []);
      } catch (error) {
        console.error('Error loading authors/taxonomies:', error);
        setAuthors([]);
        setSections([]);
        setTopics([]);
      } finally { 
        setLoadingAuthors(false); 
        setLoadingTaxonomies(false); 
      }
    };
    run();
  }, []);

  // Load streaming services (platforms)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/webflow/streaming-services');
        const j = await res.json();
        // Handle both old format (j.items) and new format (j.data.items)
        const items = j.data?.items || j.items || [];
        setServices(Array.isArray(items) ? items : []);
      } catch (error) {
        console.error('Error loading streaming services:', error);
        setServices([]);
      } finally { 
        setLoadingServices(false); 
      }
    };
    run();
  }, []);

  // Load media sources (for research inspiration)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/media-sources');
        const j = await res.json();
        // Handle both old format (j.sources) and new format (j.data.sources)
        const sources = j.data?.sources || j.sources || [];
        setMediaSources(Array.isArray(sources) ? sources.map((s:any)=>({ id: s.id, name: s.name })) : []);
      } catch (error) {
        console.error('Error loading media sources:', error);
        setMediaSources([]);
      } finally { 
        setLoadingSources(false); 
      }
    };
    run();
  }, []);

  // Auto-refresh articles in background when SetupWizard opens (for research template)
  useEffect(() => {
    // Trigger refresh in background to get latest articles
    // This runs silently in the background - user doesn't need to wait
    fetch('/api/refresh', { 
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sinceHours: 72, limit: 200 }) // Last 3 days, up to 200 articles
    }).catch(() => {
      // Silently fail - this is just a background refresh
    });
  }, []); // Run once on mount

  const isPlatformRequired = useMemo(() => {
    const sec = (data.section || '').toLowerCase();
    const topicList = Array.isArray(data.topicsSelected)
      ? data.topicsSelected
      : data.topic
        ? [data.topic]
        : [];
    const topicsLower = topicList.map((t:string)=>t.toLowerCase());
    return sec.includes('serier') || sec.includes('film') || topicsLower.some((t)=>t.includes('serie') || t.includes('film'));
  }, [data.section, data.topic, data.topicsSelected]);

  const updateScrollFade = useCallback(() => {
    const container = stepperRef.current;
    if (!container) return;
    const { scrollLeft, clientWidth, scrollWidth } = container;
    const nextLeft = scrollLeft > 4;
    const nextRight = scrollLeft + clientWidth < scrollWidth - 4;
    setScrollFade(prev => (prev.left === nextLeft && prev.right === nextRight ? prev : { left: nextLeft, right: nextRight }));
  }, []);

  const topicsSelectedCount = Array.isArray(data.topicsSelected) ? data.topicsSelected.length : (data.topic ? 1 : 0);

  const rawTone = typeof data.authorTOV === 'string' ? data.authorTOV.trim() : '';
  const authorName = (data.author || '').trim();
  // Kort tone i aiDraft.prompt (til UI). Fuld TOV ligger i data.authorTOV og sendes til API → bruges i system-prompt (combinedTOV).
  const toneInstruction = (() => {
    if (rawTone && rawTone.length < 120 && /^brug\s+/i.test(rawTone)) {
      return rawTone.endsWith('.') ? rawTone : `${rawTone}.`;
    }
    if (authorName) {
      const suffix = /s$/i.test(authorName) ? '' : 's';
      return `Brug ${authorName}${suffix} tone.`;
    }
    return `Brug Apropos' tone.`;
  })();

  const handlePointerDown = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    const container = stepperRef.current;
    if (!container) return;
    const info = dragInfoRef.current;
    info.active = true;
    info.pointerId = e.pointerId;
    info.startX = e.clientX;
    info.scrollLeft = container.scrollLeft;
    info.moved = false;
    setIsDragging(true);
  }, []);

  const handlePointerMove = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    const info = dragInfoRef.current;
    if (!info.active) return;
    const container = stepperRef.current;
    if (!container) return;
    e.preventDefault();
    const delta = e.clientX - info.startX;
    if (!info.moved && Math.abs(delta) > 3) {
      info.moved = true;
      stepperRef.current?.setPointerCapture?.(e.pointerId);
    }
    container.scrollLeft = info.scrollLeft - delta;
    updateScrollFade();
  }, [updateScrollFade]);

  const finishDrag = useCallback(() => {
    const info = dragInfoRef.current;
    if (info.pointerId !== null && info.moved) {
      stepperRef.current?.releasePointerCapture?.(info.pointerId);
    }
    info.active = false;
    info.pointerId = null;
    info.startX = 0;
    info.scrollLeft = stepperRef.current?.scrollLeft || 0;
    info.moved = false;
    setIsDragging(false);
    updateScrollFade();
  }, [updateScrollFade]);

  const handlePointerUp = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    void e;
    finishDrag();
  }, [finishDrag]);

  const handlePointerLeave = useCallback((e: ReactPointerEvent<HTMLDivElement>) => {
    void e;
    if (dragInfoRef.current.active) finishDrag();
  }, [finishDrag]);

  const handleClickCapture = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    const info = dragInfoRef.current;
    if (info.moved) {
      e.preventDefault();
      e.stopPropagation();
    }
    info.moved = false;
  }, []);

  const nextStep = (from: Step) => {
    if (from==='template') {
      if (data.template==='import') return setStep('author'); // Import udleder type/længde selv
      if (data.template) return setStep('articleType');
      return setStep('author');
    }
    if (from==='articleType') {
      if (data.template==='research') return setStep('source');
      if (data.template==='notes' || data.template==='import') return setStep('author'); // Skip recommended for notes/import
      if (data.template) return setStep('recommended');
      return setStep('author');
    }
    if (from==='source') return setStep('trending');
    if (from==='recommended') return setStep('author');
    if (from==='trending') return setStep('inspiration');
    if (from==='inspiration') return setStep('analysis');
    if (from==='analysis') return setStep('author');
    if (from==='author') return setStep('section');
    if (from==='section') return setStep('topic');
    if (from==='topic') return setStep(isPlatformRequired ? 'platform' : 'rating');
    if (from==='platform') return setStep('rating');
    if (from==='rating') return setStep('press');
  };

  const updateData = (updater: (d:any)=>any, advanceFrom?: Step, advanceTo?: Step) => {
    setData((prev:any)=> (typeof updater==='function' ? updater(prev) : prev));
    if (advanceFrom) {
      if (advanceFrom === 'press') {
        // last step answered -> complete automatically.
        // Brug det FRISKE data-snapshot (setData er asynkron) så fx press-valget
        // ikke tabes ("Presse: Ikke valgt").
        const next = typeof updater === 'function' ? updater(data) : data;
        complete(next);
      } else if (advanceTo) {
        setStep(advanceTo);
      } else {
        nextStep(advanceFrom);
      }
    }
  };

  // Emit changes to parent OUTSIDE render to avoid updating parent during child render
  useEffect(() => {
    try { onChange?.(data); } catch {}
  }, [data, onChange]);

  // Ensure active step chip stays visible when steps overflow horizontally
  useEffect(() => {
    const container = stepperRef.current;
    if (!container) return;
    const activeButton = container.querySelector<HTMLButtonElement>(`[data-step="${step}"]`);
    if (!activeButton) return;
    const { offsetLeft, offsetWidth } = activeButton;
    const { scrollLeft, clientWidth } = container;
    const isFullyVisible = offsetLeft >= scrollLeft && (offsetLeft + offsetWidth) <= (scrollLeft + clientWidth);
    if (!isFullyVisible) {
      const target = offsetLeft - clientWidth * 0.25;
      container.scrollTo({ left: Math.max(target, 0), behavior: 'smooth' });
    }
    requestAnimationFrame(() => updateScrollFade());
  }, [step, data.template, isPlatformRequired, updateScrollFade]);

  useEffect(() => {
    const container = stepperRef.current;
    if (!container) return;
    updateScrollFade();
    const onScroll = () => updateScrollFade();
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [updateScrollFade]);

  useEffect(() => {
    updateScrollFade();
  }, [updateScrollFade, data.template, topicsSelectedCount, isPlatformRequired, data.researchSelected, data.platform]);

  // Helper function to load articles (trending or recommended)
  const loadArticles = useCallback(async (sourceName: string, forceRefresh = false) => {
    if (!sourceName || loadingTrending || loadingRecommended) return;
    
    // If "Anbefalet" is selected, load recommendations
    if (sourceName === 'Anbefalet') {
      try {
        setLoadingRecommended(true);
        const res = await fetch('/api/recommended?type=all&_t=' + Date.now(), {
          cache: 'no-store',
          headers: { 'Cache-Control': 'no-cache' }
        });
        if (!res.ok) {
          console.error('Recommended API error:', res.status, res.statusText);
          return;
        }
        const j = await res.json();
        const items = Array.isArray(j.recommendations) ? j.recommendations : [];
        const sortedRecommendations = sortByNewest(items, (item: any) => item.date || item.published_at || item.publishDate || item.releaseDate);
        setRecommendedItems(sortedRecommendations);
        const normalized = sortedRecommendations.map((it: any) => ({
          title: it.title,
          date: it.date || it.published_at || it.publishDate,
          published_at: it.published_at || it.date || it.publishDate,
          source: it.source,
          url: it.url,
          keyPoints: [],
          content: it.excerpt || ''
        }));
        // Deduplicate before sorting
        const uniqueNormalized = deduplicateArticles(normalized);
        const sortedNormalized = sortByNewest(
          uniqueNormalized,
          (item) => item.date || item.published_at
        );
        setTrendingItems(sortedNormalized);
      } catch (error) {
        console.error('Error loading recommended articles:', error);
      } finally {
        setLoadingRecommended(false);
      }
      return;
    }
    
    // Load trending articles for selected source
    const controller = new AbortController();
    try {
      setLoadingTrending(true);
      const id = (mediaSources.find(s => s.name === sourceName)?.id) || sourceName;
      if (trendingAbortRef.current) {
        try { trendingAbortRef.current.abort(); } catch {}
      }
      trendingAbortRef.current = controller;
      const timestamp = Date.now();
      const res = await fetch(`/api/trending?source=${encodeURIComponent(id)}&_t=${timestamp}`, { 
        signal: controller.signal,
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' }
      });
      if (!res.ok) {
        console.error('Trending API error:', res.status, res.statusText);
        return;
      }
      const j = await res.json();
      let items: any[] = [];
      if (Array.isArray(j.trendingTemplates)) {
        items = j.trendingTemplates.flatMap((t: any) => Array.isArray(t.articles) ? t.articles : []);
      }
      if (items.length === 0 && Array.isArray(j.articles)) {
        items = j.articles;
      }
      if (items.length === 0 && Array.isArray(j.trends?.relevantArticles)) {
        items = j.trends.relevantArticles;
      }
      if (items.length === 0 && Array.isArray(j.allArticles)) {
        items = j.allArticles;
      }
      // Map and deduplicate articles
      const mappedItems = items.map((a: any) => {
        // Extract date from various possible fields
        const articleDate = a.date || a.published_at || a.publishDate || undefined;
        return {
          title: a.title || a.name || 'Ukendt titel', 
          date: articleDate,
          published_at: articleDate,
          publishDate: articleDate,
          source: a.source || sourceName,
          url: a.url || a.link,
          keyPoints: Array.isArray(a.keyPoints) ? a.keyPoints : (a.keyPoints ? [a.keyPoints] : []),
          content: a.content || a.body_text || a.body || a.excerpt || ''
        };
      });
      // Deduplicate before sorting
      const uniqueItems = deduplicateArticles(mappedItems);
      const sortedItems = sortByNewest(
        uniqueItems,
        (item) => item.date || item.published_at || item.publishDate
      );
      setTrendingItems(sortedItems);
      currentSourceRef.current = sourceName;
    } catch (error) {
      if (controller.signal.aborted) return;
      console.error('Error loading trending articles:', error);
    } finally {
      if (trendingAbortRef.current === controller) {
        setLoadingTrending(false);
      }
    }
  }, [loadingTrending, loadingRecommended, mediaSources]);

  // Load trending articles when navigating to trending step if source is selected but articles not loaded
  useEffect(() => {
    const shouldLoad = step === 'trending' && 
                      data.template === 'research' && 
                      data.inspirationSource && 
                      (data.inspirationSource !== currentSourceRef.current || trendingItems.length === 0) && 
                      !loadingTrending &&
                      mediaSources.length > 0;
    
    if (shouldLoad) {
      currentSourceRef.current = data.inspirationSource;
      loadArticles(data.inspirationSource);
    }
  }, [step, data.template, data.inspirationSource, loadingTrending, mediaSources, trendingItems.length, loadArticles]);

  // Load dynamic analysis when entering analysis step with a research article
  useEffect(() => {
    const shouldAnalyze = step === 'analysis' && 
                         data.template === 'research' && 
                         data.researchSelected && 
                         !loadingAnalysis &&
                         (!analysisData || analysisData.trend === 'Stabil'); // Only analyze if we don't have dynamic data yet
    
    if (shouldAnalyze) {
      const analyzeResearch = async () => {
        setLoadingAnalysis(true);
        try {
          const res = await fetch('/api/analyze-research', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              title: data.researchSelected.title,
              content: data.researchSelected.content,
              keyPoints: data.researchSelected.keyPoints,
              source: data.researchSelected.source
            })
          });
          
          if (res.ok) {
            const result = await res.json();
            const analysis = result.data || result;
            if (analysis.trend && analysis.angle && analysis.audience && Array.isArray(analysis.suggestions)) {
              setAnalysisData(analysis);
              // Update aiDraft with suggestions
              updateData((d: any) => ({
                ...d,
                aiDraft: {
                  ...(d.aiDraft || {}),
                  suggestions: analysis.suggestions
                }
              }));
            }
          }
        } catch (error) {
          console.error('Error analyzing research article:', error);
        } finally {
          setLoadingAnalysis(false);
        }
      };
      
      analyzeResearch();
    }
  }, [step, data.template, data.researchSelected, loadingAnalysis, analysisData, updateData]);

  // Auto-refresh articles in background every 2 minutes when on trending step
  useEffect(() => {
    if (step !== 'trending' || !data.inspirationSource || data.template !== 'research') return;
    
    const interval = setInterval(() => {
      loadArticles(data.inspirationSource, true);
    }, 120000); // 2 minutes
    
    return () => clearInterval(interval);
  }, [step, data.inspirationSource, data.template, loadArticles]);



  // StepChip now reusable component

  const canContinue = () => {
    if (step==='template') return !!data.template;
    if (step==='articleType') return !!data.articleType;
    if (step==='source') return !!data.inspirationSource;
    if (step==='trending') return !!data.researchSelected || true;
    if (step==='inspiration') return !!data.researchSelected;
    if (step==='analysis') return !!data.aiDraft?.completed;
    if (step==='author') return !!data.authorId || !!data.author;
    if (step==='section') return !!data.section;
    if (step==='topic') return topicsSelectedCount >= 2;
    if (step==='platform') return isPlatformRequired ? !!data.platform : true;
    if (step==='rating') return data.rating>0 || data.ratingSkipped;
    return true;
  };

  const complete = (snapshot?: any) => {
    const src = snapshot ?? data;
    const selectedTopics = Array.isArray(src.topicsSelected)
      ? src.topicsSelected
      : (src.topic ? [src.topic] : []);
    const primaryTopic = selectedTopics[0] || '';
    const tags = Array.from(new Set([src.section, ...selectedTopics].filter(Boolean)));
    
    // Only include fields that have meaningful values
    const completionData: Partial<ArticleData> = {};
    
    if (src.author) completionData.author = src.author;
    if (src.authorId) completionData.authorId = src.authorId;
    if (src.authorTOV) completionData.authorTOV = src.authorTOV;
    if (src.template) completionData.template = src.template;
    if (src.inspirationSource) completionData.inspirationSource = src.inspirationSource;
    if (src.researchSelected) completionData.researchSelected = src.researchSelected;
    if (src.inspirationAcknowledged) completionData.inspirationAcknowledged = src.inspirationAcknowledged;
    if (src.recommendedSelected) completionData.recommendedSelected = src.recommendedSelected;
    if (src.aiDraft) completionData.aiDraft = src.aiDraft;
    if (src.articleType) {
      const typeOption = getEditorialArticleTypeOption(src.articleType);
      completionData.articleType = typeOption.id;
      completionData.targetWordCount = src.targetWordCount || typeOption.targetWordCount;
      completionData.targetLengthLabel = src.targetLengthLabel || typeOption.targetLengthLabel;
    }
    if (src.section) completionData.category = src.section;
    if (tags.length > 0) completionData.tags = tags;
    if (src.platform) {
      completionData.platform = src.platform;
      completionData.streaming_service = src.platform;
    }
    if (src.rating > 0) completionData.rating = src.rating;
    if (src.ratingSkipped) completionData.ratingSkipped = src.ratingSkipped;
    if (src.press !== null && src.press !== undefined) {
      completionData.press = src.press;
      completionData.presseakkreditering = src.press;
    }
    if (src.title) completionData.title = src.title;
    if (src.subtitle) completionData.subtitle = src.subtitle;
    if (primaryTopic) completionData.topic = primaryTopic;
    if (selectedTopics.length > 0) completionData.topicsSelected = selectedTopics;
    
    onComplete(completionData);
  };

  const Progress = () => {
    const ratingDone = !!data.rating && data.rating > 0 || !!data.ratingSkipped;
    const segments: boolean[] = [];

    // Base steps – always present
    segments.push(!!data.template); // template
    segments.push(!!data.articleType); // article type

    const includeResearchSteps = data.template === 'research';
    if (includeResearchSteps) {
      // research specific steps
      segments.push(!!data.inspirationSource); // source (includes Anbefalet)
      segments.push(!!data.researchSelected); // trending
      segments.push(!!data.inspirationAcknowledged); // inspiration confirmation
      segments.push(Boolean(data.aiDraft?.completed)); // analysis
    } else if (data.template && data.template !== 'notes') {
      // non-research template steps (but not notes template)
      segments.push(!!data.recommendedSelected); // recommended
    }

    segments.push(!!data.authorId || !!data.author); // author
    segments.push(!!data.section); // section
    segments.push(topicsSelectedCount >= 2); // topic

    if (isPlatformRequired) {
      segments.push(!!data.platform); // platform when required
    }

    segments.push(ratingDone); // rating
    segments.push(typeof data.press === 'boolean'); // press
    return (
      <div className="w-full flex gap-1 mb-3">
        {segments.map((ok, i)=>(
          <div key={i} className={`h-1.5 flex-1 rounded ${ok ? 'bg-white shadow-[0_0_10px_#fff]' : 'bg-white/10'}`}></div>
        ))}
      </div>
    );
  };

  return (
    <div className="bg-black rounded-xl p-2 md:p-3" style={{ minHeight: 'fit-content' }}>
      {/* Stepper */}
      <div className="relative mb-3 md:mb-[14px] overflow-visible">
        <div
          ref={stepperRef}
          className={`flex items-center gap-2 md:gap-[14px] overflow-x-auto pb-2 md:pb-0 scrollbar-hide select-none ${isDragging ? 'cursor-grabbing' : 'cursor-grab active:cursor-grab'}`}
          style={{ touchAction: 'pan-y', WebkitOverflowScrolling: 'touch' }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerLeave}
          onClickCapture={handleClickCapture}
        >
          <StepChip stepKey="template" active={step==='template'} done={!!data.template} label="Template" onClick={()=>setStep('template')} />
          {data.template && (
            <StepChip stepKey="articleType" active={step==='articleType'} done={!!data.articleType} label="Type" onClick={()=>setStep('articleType')} />
          )}
          {data.template==='research' && (
            <>
              <StepChip stepKey="source" active={step==='source'} done={!!data.inspirationSource} label="Kilde" onClick={()=>setStep('source')} />
            <StepChip stepKey="trending" active={step==='trending'} done={!!data.researchSelected} label="Trending" onClick={()=>setStep('trending')} />
            <StepChip stepKey="inspiration" active={step==='inspiration'} done={!!data.inspirationAcknowledged} label="Opsummering" onClick={()=>setStep('inspiration')} />
            <StepChip stepKey="analysis" active={step==='analysis'} done={Boolean(data.aiDraft?.completed)} label="Analyse" onClick={()=>setStep('analysis')} />
            </>
          )}
          {data.template && data.template!=='research' && data.template !== 'notes' && (
            <StepChip stepKey="recommended" active={step==='recommended'} done={!!data.recommendedSelected} label="Anbefalet" onClick={()=>setStep('recommended')} />
          )}
          <StepChip stepKey="author" active={step==='author'} done={!!data.authorId || !!data.author} label="Author" onClick={()=>setStep('author')} />
          <StepChip stepKey="section" active={step==='section'} done={!!data.section} label="Section" onClick={()=>setStep('section')} />
          <StepChip stepKey="topic" active={step==='topic'} done={topicsSelectedCount >= 2} label="Topic" onClick={()=>setStep('topic')} />
          {isPlatformRequired && (
            <StepChip stepKey="platform" active={step==='platform'} done={!!data.platform} label="Platform" onClick={()=>setStep('platform')} />
          )}
          <StepChip stepKey="rating" active={step==='rating'} done={data.rating>0 || data.ratingSkipped} label="Rating" onClick={()=>setStep('rating')} />
          <StepChip stepKey="press" active={step==='press'} done={typeof data.press === 'boolean'} label="Press" onClick={()=>setStep('press')} />
        </div>
        <div
          className={`pointer-events-none absolute inset-y-0 left-0 w-10 transition-opacity duration-300 ${scrollFade.left ? 'opacity-100' : 'opacity-0'}`}
          style={{
            backgroundColor: 'inherit',
            WebkitMaskImage: 'linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,1))',
            maskImage: 'linear-gradient(90deg, rgba(0,0,0,0), rgba(0,0,0,1))'
          }}
        />
        <div
          className={`pointer-events-none absolute inset-y-0 right-0 w-10 transition-opacity duration-300 ${scrollFade.right ? 'opacity-100' : 'opacity-0'}`}
          style={{
            backgroundColor: 'inherit',
            WebkitMaskImage: 'linear-gradient(270deg, rgba(0,0,0,0), rgba(0,0,0,1))',
            maskImage: 'linear-gradient(270deg, rgba(0,0,0,0), rgba(0,0,0,1))'
          }}
        />
      </div>

      {/* Step content (auto-height, allows scrolling for specific steps) */}
      <div className="pb-[12px]">
      {step==='template' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg template</div>
          <div className="flex flex-wrap gap-x-3 md:gap-x-[16px] gap-y-2 md:gap-y-[10px]">
            {[
              { key: 'notes', label: 'Skriv artikel ud fra egne noter' },
              { key: 'research', label: 'Research' },
              { key: 'import', label: 'Importér artikel' },
            ].map(opt => {
              const selected = data.template === opt.key;
              return (
                <button
                  key={opt.key}
                  onClick={()=> {
                    if (selected) {
                      updateData((d:any)=> ({ ...d, template: '', inspirationSource: '', researchSelected: null, inspirationAcknowledged: false }));
                    } else {
                      updateData((d:any)=> {
                        const next = { ...d, template: opt.key };
                        if (opt.key !== 'research') {
                          next.inspirationSource = '';
                          next.researchSelected = null;
                          next.inspirationAcknowledged = false;
                        }
                        return next;
                      }, 'template', opt.key === 'import' ? 'author' : 'articleType');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  <span className={`${selected ? 'text-sheen-glow' : ''}`}>{opt.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step==='articleType' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg artikeltype og længde</div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {EDITORIAL_ARTICLE_TYPE_OPTIONS.map((option) => {
              const selected = data.articleType === option.id;
              return (
                <button
                  key={option.id}
                  onClick={() => {
                    updateData(
                      (d:any) => ({
                        ...d,
                        articleType: option.id,
                        targetWordCount: option.targetWordCount,
                        targetLengthLabel: option.targetLengthLabel,
                      }),
                      'articleType'
                    );
                  }}
                  className={`min-h-11 rounded-lg border px-3 py-2 text-left text-xs transition-all active:scale-[0.98] ${
                    selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white/75 border-white/10 hover:border-white/20 hover:bg-white/10'
                  }`}
                >
                  <span className="block font-medium">{option.label}</span>
                  <span className="mt-0.5 block text-[10px] text-white/40">{option.description} · {option.targetLengthLabel}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step==='source' && data.template==='research' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg medie (kilde)</div>
          <div className="flex flex-wrap gap-x-3 md:gap-x-[16px] gap-y-2 md:gap-y-[10px]">
            {(
              loadingSources ? ['Indlæser…'] : (['Anbefalet', ...mediaSources.map(s=>s.name)])
            ).map((name:string)=> {
              const selected = data.inspirationSource === name;
              return (
                <button
                  key={name}
                  onClick={()=> {
                    if (selected) {
          updateData((d:any)=> ({ ...d, inspirationSource: '', researchSelected: null, inspirationAcknowledged: false }));
                      setTrendingItems([]);
                      return;
                    }
                    updateData((d:any)=> ({ ...d, inspirationSource: name, researchSelected: null, inspirationAcknowledged: false }), 'source');
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  {name}
                </button>
              );
            })}
            {!loadingSources && mediaSources.length===0 && (
              <div className="text-white/60 text-xs">Ingen medier fundet</div>
            )}
          </div>
        </div>
      )}

      {step==='trending' && data.template==='research' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">
            {data.inspirationSource === 'Anbefalet' ? 'Anbefalet anmeldelser' : `Trending fra ${data.inspirationSource || 'valgt medie'}`}
            {loadingTrending && <span className="ml-2 text-white/40 text-xs">(Opdaterer automatisk...)</span>}
          </div>
          <div className="overflow-y-auto nice-scrollbar pr-1" style={{ height: '500px', maxHeight: '600px', WebkitOverflowScrolling: 'touch' }}>
            <div className="grid gap-2 md:gap-[10px]">
            {loadingTrending && (<div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>)}
            {!loadingTrending && trendingItems.map((it, idx)=> {
              const selected = data.researchSelected?.title === it.title || data.researchSelected?.url === it.url;
              return (
                <button
                  key={it.url || it.title || idx}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, researchSelected: null, inspirationAcknowledged: false }))
                    : updateData((d:any)=> ({ ...d, researchSelected: it, inspirationAcknowledged: false }), 'trending', 'inspiration')
                  }
                  className={`text-left px-3 py-2 rounded-lg transition-all border ${selected ? 'bg-white/5 text-white border-white/40' : 'bg-white/0 text-white/80 border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                >
                  <div className="text-[13px] leading-snug">{it.title || 'Ukendt titel'}</div>
                  <div className="text-white/40 text-xs mt-1">{it.source ? `${it.source} · `:''}{formatDate(it.date || (it as any).published_at || (it as any).publishDate)}</div>
                </button>
              );
            })}
            {!loadingTrending && trendingItems.length===0 && (
              <div className="text-white/60 text-xs">Ingen artikler fundet</div>
            )}
            </div>
          </div>
        </div>
      )}

      {step==='inspiration' && data.template==='research' && !!data.researchSelected && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Opsummering</div>
          <div
            className="rounded-lg border border-white/10 bg-white/5 p-3 cursor-pointer hover:bg-white/10 transition-colors w-full max-h-[70vh] md:max-h-[80vh] overflow-y-auto nice-scrollbar pr-1"
            role="button"
            tabIndex={0}
            onClick={()=> { updateData((d:any)=> ({ ...d, inspirationAcknowledged: true }), 'inspiration'); }}
            onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); updateData((d:any)=> ({ ...d, inspirationAcknowledged: true }), 'inspiration'); } }}
            style={{ WebkitOverflowScrolling: 'touch' }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-white font-medium">{data.researchSelected.title}</div>
              <div className="text-xs text-white/50">{data.researchSelected.source ? `${data.researchSelected.source} · `:''}{formatDate(data.researchSelected.date)}</div>
            </div>
            <div className="text-white/70 text-sm mb-2">
              {(() => {
                const content = (data.researchSelected.content || '').replace(/\s+/g,' ').trim();
                // Extract author if present (look for "Af [Name]" pattern)
                const authorMatch = content.match(/Af\s+([^']+?)(?:\s|$)/);
                if (authorMatch) {
                  const author = authorMatch[1].trim();
                  // Get first sentence after author for brief summary
                  const afterAuthor = content.substring(authorMatch.index + authorMatch[0].length).trim();
                  const firstSentence = afterAuthor.split('.')[0];
                  return `Af ${author}${firstSentence ? '. ' + firstSentence + '.' : ''}`;
                }
                // If no author found, just show first 100 characters
                return content.length > 100 ? content.substring(0, 100) + '...' : content;
              })()}
            </div>
            {Array.isArray(data.researchSelected.keyPoints) && data.researchSelected.keyPoints.length > 0 && (
              <div className="text-white/80 text-sm mb-2">
                <div className="font-medium mb-1">Nøglepunkter:</div>
                <ul className="list-disc list-inside space-y-1 text-white/80">
                  {data.researchSelected.keyPoints.slice(0,3).map((p:string, i:number)=> (
                    <li key={i}>{p.replace(/\s+/g,' ').trim()}</li>
                  ))}
                </ul>
              </div>
            )}
            {data.researchSelected.url && (
              <a href={data.researchSelected.url} target="_blank" rel="noopener noreferrer" className="text-white/80 text-sm underline" onClick={(e)=> e.stopPropagation()}>Læs original artikel →</a>
            )}
          </div>
        </div>
      )}

      {step==='recommended' && data.template && data.template !== 'research' && data.template !== 'notes' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Anbefalet anmeldelser</div>
          <div className="overflow-y-auto nice-scrollbar pr-1" style={{ height: '500px', maxHeight: '600px', WebkitOverflowScrolling: 'touch' }}>
            <div className="grid gap-2 md:gap-[10px]">
            {loadingRecommended && (<div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>)}
            {!loadingRecommended && recommendedItems.map((it, idx)=> {
              const selected = data.recommendedSelected?.title === it.title;
              const typeLabels: Record<string, string> = {
                'concert': '🎵 Koncert',
                'tv-series': '📺 TV-serie',
                'film': '🎬 Film',
                'game': '🎮 Spil'
              };
              const typeLabel = typeLabels[it.type || 'film'] || '📝 Anmeldelse';
              return (
                <button
                  key={idx}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, recommendedSelected: null }))
                    : updateData((d:any)=> ({ ...d, recommendedSelected: it }), 'recommended')
                  }
                  className={`text-left px-3 py-2 rounded-lg transition-all border ${selected ? 'bg-white/5 text-white border-white/40' : 'bg-white/0 text-white/80 border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs text-white/50">{typeLabel}</span>
                    {it.category && <span className="text-xs text-white/40">· {it.category}</span>}
                  </div>
                  <div className="text-[13px] leading-snug">{it.title || 'Ukendt titel'}</div>
                  <div className="text-white/40 text-xs mt-1">{it.source ? `${it.source} · `:''}{it.date ? formatDate(it.date) : ''}</div>
                  {it.excerpt && (
                    <div className="text-white/60 text-xs mt-2 line-clamp-2">{it.excerpt}</div>
                  )}
                </button>
              );
            })}
            {!loadingRecommended && recommendedItems.length===0 && (
              <div className="text-white/60 text-xs">Ingen anbefalinger fundet</div>
            )}
            </div>
          </div>
        </div>
      )}

      {step==='analysis' && data.template==='research' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">AI Draft analyse</div>
          {(() => {
            // Build comprehensive prompt with research article context
            const buildResearchPrompt = () => {
              if (!data.researchSelected) {
                return `Skriv en dybdegående artikel. ${toneInstruction}`;
              }
              
              const title = data.researchSelected.title || '';
              const source = data.researchSelected.source || 'kilden';
              const keyPoints = Array.isArray(data.researchSelected.keyPoints) && data.researchSelected.keyPoints.length > 0
                ? data.researchSelected.keyPoints.slice(0, 5).map((kp: string, i: number) => `${i + 1}. ${kp}`).join('\n')
                : 'Ingen nøglepunkter specificeret';
              const contentPreview = data.researchSelected.content 
                ? data.researchSelected.content.substring(0, 300).replace(/\s+/g, ' ').trim() + '...'
                : '';
              
              return `Skriv en dybdegående, original artikel inspireret af emnet fra "${title}" (${source}).

**RESEARCH KILDE (Brug som inspiration - IKKE kopier direkte):**
- Titel: "${title}"
- Kilde: ${source}
${contentPreview ? `- Indholdseksempel: ${contentPreview}\n` : ''}
- Nøglepunkter fra research:
${keyPoints}

**KRITISKE INSTRUKTIONER FOR ORIGINALITET:**
1. Parafrasér ALTID - omskriv alle fakta og pointer i dine egne ord
2. Tilføj din egen vinkel og analyse - brug ikke samme struktur som originalen
3. Udvid med nye elementer: ekspertcitater, statistikker, historisk kontekst, kulturelle referencer
4. Brug forskellige eksempler end originalen - find dine egne cases og sammenligninger
5. Skriv med din egen forfatterstemme og stil - ikke samme tone som kilden
6. Strukturer artiklen anderledes - brug din egen logik og flow
7. Tilføj nye perspektiver og indsigt som ikke er i originalen

**MÅL:**
- Skriv en artikel der er inspireret af emnet, men helt original i formulering, struktur og indhold
- Minimum 800-1200 ord med dybdegående analyse
- Inkluder verificerede fakta, eksperter og statistikker fra eksterne kilder
- Brug research-artiklen som udgangspunkt, men skriv din egen unikke artikel

${toneInstruction}`;
            };
            
            const defaultPrompt = buildResearchPrompt();
            // If prompt exists, ensure it uses current tone instruction
            const existingPrompt = data.aiDraft?.prompt;
            let promptValue = existingPrompt ?? defaultPrompt;
            
            // Always ensure prompt uses current tone instruction (in case author was selected after prompt creation)
            if (existingPrompt) {
              // Replace any tone instruction with current one
              promptValue = existingPrompt.replace(/Brug (Apropos'|[^']+s?) tone\.?/g, toneInstruction);
              // If no tone instruction found, append it
              if (!promptValue.includes('tone')) {
                promptValue = promptValue.trim() + '\n\n' + toneInstruction;
              }
            } else {
              // Use default prompt with current tone instruction
              promptValue = defaultPrompt;
            }
            return (
              <>
                <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                  <div className="text-white/70 text-xs mb-1">AI Prompt</div>
                  <textarea
                    className="w-full bg-transparent text-white text-xs rounded resize-none min-h-[120px] outline-none focus:outline-none focus:ring-0"
                    value={promptValue}
                    onChange={(e)=> updateData((d:any)=> ({ ...d, aiDraft: { ...(d.aiDraft||{}), prompt: e.target.value } }))}
                  />
                </div>
                <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                  <div className="text-white/70 text-xs mb-1">Trend Analyse {loadingAnalysis && <span className="text-white/40">(Analyserer...)</span>}</div>
                  {loadingAnalysis ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span className="text-white/60 text-xs">Analyserer research-artikel...</span>
                    </div>
                  ) : (
                    <div className="text-white/80 text-xs space-y-1">
                      <div>Trend: <span className="px-2 py-0.5 rounded bg-white/10">{analysisData?.trend || 'Stabil'}</span></div>
                      <div>Vinkel: <span className="opacity-80">{analysisData?.angle || 'Balanceret analyse'}</span></div>
                      <div>Målgruppe: <span className="opacity-80">{analysisData?.audience || 'Generel læser'}</span></div>
                    </div>
                  )}
                </div>
                <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                  <div className="text-white/70 text-xs mb-2">AI Forslag (for at undgå plagiering) {loadingAnalysis && <span className="text-white/40">(Genererer...)</span>}</div>
                  {loadingAnalysis ? (
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                      <span className="text-white/60 text-xs">Genererer forslag...</span>
                    </div>
                  ) : (
                    <ul className="text-white/80 text-xs list-disc list-inside space-y-1">
                      {(
                        analysisData?.suggestions || data.aiDraft?.suggestions || [
                          'Tilføj ekspertcitater fra nye kilder - ikke samme eksperter som originalen',
                          'Inkluder statistikker og data fra alternative kilder for at understøtte argumenter',
                          'Uddyb baggrundshistorien med nye fakta og perspektiver',
                          'Find lignende cases eller eksempler fra andre kontekster',
                          'Tilføj kulturelle referencer og sammenligninger der ikke er i originalen',
                          'Brug forskellige eksempler og anekdoter end research-artiklen',
                          'Omskriv alle pointer i dine egne ord med din egen analyse',
                        ]
                      ).map((s:string, i:number)=> (
                        <li key={i}>{s}</li>
                      ))}
                    </ul>
                  )}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={()=> updateData((d:any)=> {
                      const next = { ...(d.aiDraft||{}) };
                      if (!next.prompt) next.prompt = defaultPrompt;
                      return { ...d, aiDraft: { ...next, completed: true } };
                    }, 'analysis')}
                    className="px-3 py-1.5 rounded-lg text-xs border border-white/20 text-white bg-white/10 hover:bg-white/15"
                  >Fortsæt</button>
                </div>
              </>
            );
          })()}
        </div>
      )}

      {/* Progress handled at parent level (top bar) */}

      {/* Content */}
      {step==='author' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg forfatter</div>
          <div className="flex flex-wrap gap-x-[16px] gap-y-[10px]">
            {loadingAuthors ? (
              <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
            ) : authors.map(a=> {
              const selected = data.authorId === a.id;
              return (
                <button
                  key={a.id}
                  onClick={()=> {
                    if (selected) {
                      updateData((d:any)=> ({ 
                        ...d, 
                        author: '', 
                        authorId: '', 
                        authorTOV: '',
                        // Update prompt to remove author-specific tone if it exists
                        aiDraft: d.aiDraft?.prompt ? {
                          ...d.aiDraft,
                          prompt: d.aiDraft.prompt.replace(/Brug [^']+s? tone\.?/g, "Brug Apropos' tone.")
                        } : d.aiDraft
                      }));
                    } else {
                      updateData((d:any)=> {
                        const updated = { 
                          ...d, 
                          author: a.name, 
                          authorId: a.id, 
                          authorTOV: a.tov 
                        };
                        // Update prompt with new author TOV if prompt exists
                        // aiDraft.prompt = kun kort linje til visning i Review Panel. Fuld TOV sendes via authorTOV til API og bruges i system-prompten.
                        if (d.aiDraft?.prompt) {
                          const shortToneInstruction = `Brug ${a.name}${/s$/i.test(a.name) ? '' : 's'} tone.`;
                          updated.aiDraft = {
                            ...d.aiDraft,
                            prompt: d.aiDraft.prompt.replace(/Brug (Apropos'|[^']+s?) tone\.?/g, shortToneInstruction)
                          };
                          // Remove any full TOV block that might have been pasted (multi-line author persona)
                          if (updated.aiDraft.prompt.length > 500) {
                            const withoutLongTov = updated.aiDraft.prompt.replace(/\n\n(?:Du er |LIV BRANDT|FREDERIK EMIL|EVA LINDE)[\s\S]*?(?=\n\n\*\*MÅL:|\n\nSkriv|$)/gi, '\n\n');
                            if (withoutLongTov.length < updated.aiDraft.prompt.length) updated.aiDraft.prompt = withoutLongTov.trim();
                          }
                        }
                        return updated;
                      }, 'author');
                    }
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  <span className={selected ? 'text-sheen-glow' : ''}>{a.name}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {step==='section' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg section</div>
          <div className="flex flex-wrap gap-x-[16px] gap-y-[10px]">
            {(
              loadingTaxonomies ? ['Indlæser…'] : (sections.length ? sections.map(s=>s.name) : [])
            ).map((s:string)=> {
              const selected = data.section === s;
              return (
                <button
                  key={s}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, section: '', topic: '', topicsSelected: [], tags: [] }))
                    : updateData((d:any)=> ({ ...d, section: s, topic: '', topicsSelected: [], tags: [] }), 'section')
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  <span className={selected ? 'text-sheen-glow' : ''}>{s}</span>
                </button>
              );
            })}
            {!loadingTaxonomies && sections.length===0 && (
              <div className="text-white/60 text-xs">Ingen sections fundet fra Webflow</div>
            )}
          </div>
        </div>
      )}

      {step==='topic' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg topic</div>
          <div className="flex flex-wrap gap-x-[16px] gap-y-[10px]">
            {(
              loadingTaxonomies ? ['Indlæser…'] : (topics.length ? topics.map(t=>t.name) : [])
            ).map((t:string)=> {
              const currentSelected = Array.isArray(data.topicsSelected)
                ? data.topicsSelected
                : (data.topic ? [data.topic] : []);
              const selected = currentSelected.includes(t);
              return (
                <button
                  key={t}
                  onClick={()=> {
                    const baseSelected = Array.isArray(data.topicsSelected)
                      ? [...data.topicsSelected]
                      : (data.topic ? [data.topic] : []);
                    let nextSelected = baseSelected.includes(t)
                      ? baseSelected.filter((name)=>name!==t)
                      : (() => {
                          const updated = [...baseSelected];
                          if (!updated.includes(t)) {
                            if (updated.length >= 2) {
                              updated.shift();
                            }
                            updated.push(t);
                          }
                          return updated;
                        })();
                    nextSelected = Array.from(new Set(nextSelected));
                    const shouldAdvance = nextSelected.length >= 2;
                    const requiresPlatformNext = (() => {
                      const secLower = String(data.section || '').toLowerCase();
                      const topicsLower = nextSelected.map((name)=>name.toLowerCase());
                      return secLower.includes('serier') || secLower.includes('film') || topicsLower.some((name)=>name.includes('serie') || name.includes('film'));
                    })();
                    const advanceToStep = shouldAdvance ? (requiresPlatformNext ? 'platform' : 'rating') : undefined;
                    updateData((d:any)=> {
                      const tags = Array.from(new Set([d.section, ...nextSelected].filter(Boolean)));
                      return {
                        ...d,
                        topicsSelected: nextSelected,
                        topic: nextSelected[0] || '',
                        tags
                      };
                    }, shouldAdvance ? 'topic' : undefined, advanceToStep);
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  <span className={selected ? 'text-sheen-glow' : ''}>{t}</span>
                </button>
              );
            })}
            {!loadingTaxonomies && topics.length===0 && (
              <div className="text-white/60 text-xs">Ingen topics fundet fra Webflow</div>
            )}
            {/* Fortsæt knap - vises hvis mindst 1 topic er valgt */}
            {!loadingTaxonomies && topicsSelectedCount >= 1 && (
              <button
                onClick={() => {
                  const currentSelected = Array.isArray(data.topicsSelected)
                    ? data.topicsSelected
                    : (data.topic ? [data.topic] : []);
                  const requiresPlatformNext = (() => {
                    const secLower = String(data.section || '').toLowerCase();
                    const topicsLower = currentSelected.map((name: string) => name.toLowerCase());
                    return secLower.includes('serier') || secLower.includes('film') || topicsLower.some((name: string) => name.includes('serie') || name.includes('film'));
                  })();
                  const advanceToStep = requiresPlatformNext ? 'platform' : 'rating';
                  updateData((d: any) => {
                    const tags = Array.from(new Set([d.section, ...currentSelected].filter(Boolean)));
                    return {
                      ...d,
                      topicsSelected: currentSelected,
                      topic: currentSelected[0] || '',
                      tags
                    };
                  }, 'topic', advanceToStep);
                }}
                className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10"
              >
                <span>Fortsæt</span>
              </button>
            )}
          </div>
        </div>
      )}

      {step==='platform' && isPlatformRequired && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg platform/streaming service</div>
          <div className="flex flex-wrap gap-x-[16px] gap-y-[10px]">
            {(
              loadingServices ? ['Indlæser…'] : (services.length ? services.map(s=>s.name) : [])
            ).map((p:string)=> {
              const selected = data.platform === p;
              return (
                <button
                  key={p}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, platform: '' }))
                    : updateData((d:any)=> ({ ...d, platform: p }), 'platform')
                  }
                  className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${selected ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
                >
                  {p}
                </button>
              );
            })}
            {!loadingServices && services.length===0 && (
              <div className="text-white/60 text-xs">Ingen services fundet fra Webflow</div>
            )}
          </div>
        </div>
      )}

      {step==='press' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Presseakkreditering?</div>
          <div className="flex gap-x-[16px]">
            <button
              onClick={()=> updateData((d:any)=> ({ ...d, press: true, presseakkreditering: true }), 'press')}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${data.press===true ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
            >Ja, der er pressekontakt/akkreditering</button>
            <button
              onClick={()=> updateData((d:any)=> ({ ...d, press: false, presseakkreditering: false }), 'press')}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${data.press===false ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
            >Nej, der er ikke modtaget presse-akkreditering</button>
          </div>
        </div>
      )}

      {step==='rating' && (
        <div className="space-y-[14px]">
          <div className="text-white/80 text-sm">Rating (ved anmeldelser)</div>
          <div className="flex flex-wrap items-center gap-x-[16px] gap-y-[10px]">
            {([1,2,3,4,5,6] as const).map(r=> (
              <button
                key={r}
                onClick={()=> updateData((d:any)=> {
                  const same = d.rating === r;
                  return { ...d, rating: same ? 0 : r, ratingSkipped: false };
                }, 'rating')}
                className={`px-3 py-1.5 rounded-lg border text-xs ${data.rating===r ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/20 hover:border-white/40 hover:bg-white/10'}`}
              >{r} ⭐</button>
            ))}
            <button
              onClick={()=> updateData((d:any)=> ({ ...d, rating: 0, ratingSkipped: true }), 'rating')}
              className={`ml-auto px-3 py-1.5 rounded-lg border text-xs ${data.ratingSkipped ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/20 hover:border-white/40 hover:bg-white/10'}`}
            >skip</button>
          </div>
        </div>
      )}
      </div>

      {/* Review step removed as pr. request */}

      {/* Actions removed - auto-advance; Start chat happens outside after review or via parent */}
    </div>
  );
}
