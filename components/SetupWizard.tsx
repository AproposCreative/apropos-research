'use client';

import { useEffect, useMemo, useState, useRef, useCallback } from 'react';
import type { PointerEvent as ReactPointerEvent, MouseEvent as ReactMouseEvent } from 'react';
import { WebflowAuthor } from '@/lib/webflow-service';
import type { ArticleData } from '@/types/article';
import StepChip from '@/components/ui/StepChip';

type Step = 'template' | 'source' | 'trending' | 'inspiration' | 'analysis' | 'author' | 'section' | 'topic' | 'platform' | 'rating' | 'press';

interface SetupWizardProps {
  initialData?: Partial<ArticleData>;
  onComplete: (articleData: Partial<ArticleData>) => void;
  onChange?: (data: Partial<ArticleData>) => void;
}

type Option = { id: string; name: string; slug: string };

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
  const [trendingItems, setTrendingItems] = useState<Array<{ title:string; date?:string; source?:string; url?:string; keyPoints?:string[]; content?:string }>>([]);
  const [loadingTrending, setLoadingTrending] = useState(false);
  const trendingAbortRef = useRef<AbortController | null>(null);
  const dragInfoRef = useRef<{ active: boolean; pointerId: number | null; startX: number; scrollLeft: number; moved: boolean }>({ active: false, pointerId: null, startX: 0, scrollLeft: 0, moved: false });
  const [isDragging, setIsDragging] = useState(false);
  const [scrollFade, setScrollFade] = useState<{ left: boolean; right: boolean }>({ left: false, right: false });
  
  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '';
      
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
    aiDraft: initialData?.aiDraft || null,
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
        setAuthors(j.authors || []);
        // load sections/topics from Webflow collections if env ids are set
        const [secRes, topRes] = await Promise.all([
          fetch('/api/webflow/sections'),
          fetch('/api/webflow/topics')
        ]);
        const sec = secRes.ok ? (await secRes.json()).items || [] : [];
        const top = topRes.ok ? (await topRes.json()).items || [] : [];
        setSections(sec);
        setTopics(top);
      } catch {} finally { setLoadingAuthors(false); setLoadingTaxonomies(false); }
    };
    run();
  }, []);

  // Load streaming services (platforms)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/webflow/streaming-services');
        const j = await res.json();
        setServices(j.items || []);
      } catch {}
      finally { setLoadingServices(false); }
    };
    run();
  }, []);

  // Load media sources (for research inspiration)
  useEffect(() => {
    const run = async () => {
      try {
        const res = await fetch('/api/media-sources');
        const j = await res.json();
        setMediaSources((j.sources||[]).map((s:any)=>({ id: s.id, name: s.name })));
      } catch {}
      finally { setLoadingSources(false); }
    };
    run();
  }, []);

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
  const toneInstruction = (() => {
    if (rawTone) {
      const normalized = rawTone.endsWith('.') ? rawTone : `${rawTone}.`;
      return /^brug/i.test(rawTone) ? normalized : `Brug ${normalized}`;
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
    if (from==='template') return setStep(data.template==='research' ? 'source' : 'author');
    if (from==='source') return setStep('trending');
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
        // last step answered -> complete automatically
        complete();
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


  // StepChip now reusable component

  const canContinue = () => {
    if (step==='template') return !!data.template;
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

  const complete = () => {
    const selectedTopics = Array.isArray(data.topicsSelected)
      ? data.topicsSelected
      : (data.topic ? [data.topic] : []);
    const primaryTopic = selectedTopics[0] || '';
    const tags = Array.from(new Set([data.section, ...selectedTopics].filter(Boolean)));
    onComplete({
      author: data.author,
      authorId: data.authorId,
      authorTOV: data.authorTOV,
      template: data.template,
      inspirationSource: data.inspirationSource,
      researchSelected: data.researchSelected,
      inspirationAcknowledged: data.inspirationAcknowledged,
      aiDraft: data.aiDraft,
      category: data.section,
      tags,
      platform: data.platform,
      streaming_service: data.platform,
      rating: data.rating,
      ratingSkipped: data.ratingSkipped,
      press: data.press,
      title: data.title,
      subtitle: data.subtitle,
      topic: primaryTopic,
      topicsSelected: selectedTopics
    });
  };

  const Progress = () => {
    const ratingDone = !!data.rating && data.rating > 0 || !!data.ratingSkipped;
    const segments: boolean[] = [];

    // Base steps – always present
    segments.push(!!data.template); // template

    const includeResearchSteps = data.template === 'research';
    if (includeResearchSteps) {
      // research specific steps
      segments.push(!!data.inspirationSource); // source
      segments.push(!!data.researchSelected); // trending
      segments.push(!!data.inspirationAcknowledged); // inspiration confirmation
      segments.push(Boolean(data.aiDraft?.completed)); // analysis
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
    <div className="bg-black rounded-xl p-2 md:p-3">
      {/* Stepper */}
      <div className="relative mb-3 md:mb-[14px]">
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
          {data.template==='research' && (
            <>
              <StepChip stepKey="source" active={step==='source'} done={!!data.inspirationSource} label="Kilde" onClick={()=>setStep('source')} />
            <StepChip stepKey="trending" active={step==='trending'} done={!!data.researchSelected} label="Trending" onClick={()=>setStep('trending')} />
            <StepChip stepKey="inspiration" active={step==='inspiration'} done={!!data.inspirationAcknowledged} label="Opsummering" onClick={()=>setStep('inspiration')} />
            <StepChip stepKey="analysis" active={step==='analysis'} done={Boolean(data.aiDraft?.completed)} label="Analyse" onClick={()=>setStep('analysis')} />
            </>
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
        <div className={`pointer-events-none absolute inset-y-0 left-0 w-10 bg-[linear-gradient(90deg,_#050505,_rgba(5,5,5,0.7),_rgba(5,5,5,0))] transition-opacity duration-300 ${scrollFade.left ? 'opacity-100' : 'opacity-0'}`} />
        <div className={`pointer-events-none absolute inset-y-0 right-0 w-10 bg-[linear-gradient(270deg,_#050505,_rgba(5,5,5,0.7),_rgba(5,5,5,0))] transition-opacity duration-300 ${scrollFade.right ? 'opacity-100' : 'opacity-0'}`} />
      </div>

      {/* Step content (auto-height, no inner scrollbar) */}
      <div className="overflow-visible pb-[12px]">
      {step==='template' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg template</div>
          <div className="flex flex-wrap gap-x-3 md:gap-x-[16px] gap-y-2 md:gap-y-[10px]">
            {[
              { key: 'notes', label: 'Skriv artikel ud fra egne noter' },
              { key: 'research', label: 'Research' },
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
                      }, 'template', (opt.key==='research' ? 'source' : 'author'));
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

      {step==='source' && data.template==='research' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">Vælg medie (kilde)</div>
          <div className="flex flex-wrap gap-x-3 md:gap-x-[16px] gap-y-2 md:gap-y-[10px]">
            {(
              loadingSources ? ['Indlæser…'] : (mediaSources.length ? mediaSources.map(s=>s.name) : [])
            ).map((name:string)=> {
              const selected = data.inspirationSource === name;
              return (
                <button
                  key={name}
                  onClick={async ()=> {
                    if (selected) {
          updateData((d:any)=> ({ ...d, inspirationSource: '', researchSelected: null, inspirationAcknowledged: false }));
                      setTrendingItems([]);
                      return;
                    }
                    updateData((d:any)=> ({ ...d, inspirationSource: name, researchSelected: null, inspirationAcknowledged: false }), 'source');
                    // Preload trending for smoother UX
                    try {
                      setLoadingTrending(true);
                      const id = (mediaSources.find(s=>s.name===name)?.id)||name;
                      // Abort previous request if any
                      if (trendingAbortRef.current) {
                        try { trendingAbortRef.current.abort(); } catch {}
                      }
                      const controller = new AbortController();
                      trendingAbortRef.current = controller;
                      const res = await fetch(`/api/trending?source=${encodeURIComponent(id)}`, { signal: controller.signal });
                      const j = await res.json();
                      const items = (j.trendingTemplates?.[0]?.articles || j.trendingTemplates?.flatMap((t:any)=>t.articles)||[]) as any[];
                      setTrendingItems(items.slice(0,8).map((a:any)=> ({ title: a.title || a.name || '', date: a.date, source: a.source, url: a.url, keyPoints: a.keyPoints || [], content: a.content })));
                    } catch {}
                    finally { setLoadingTrending(false); }
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
          <div className="text-white/80 text-sm">Trending fra {data.inspirationSource || 'valgt medie'}</div>
          <div className="max-h-64 overflow-y-auto scrollbar-thin scrollbar-thumb-white/20 scrollbar-track-transparent">
            <div className="grid gap-2 md:gap-[10px]">
            {loadingTrending && (<div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>)}
            {!loadingTrending && trendingItems.slice(0,8).map((it, idx)=> {
              const selected = data.researchSelected?.title === it.title;
              return (
                <button
                  key={idx}
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, researchSelected: null, inspirationAcknowledged: false }))
                    : updateData((d:any)=> ({ ...d, researchSelected: it, inspirationAcknowledged: false }), 'trending', 'inspiration')
                  }
                  className={`text-left px-3 py-2 rounded-lg transition-all border ${selected ? 'bg-white/5 text-white border-white/40' : 'bg-white/0 text-white/80 border-white/10 hover:border-white/20 hover:bg-white/5'}`}
                >
                  <div className="text-[13px] leading-snug">{it.title || 'Ukendt titel'}</div>
                  <div className="text-white/40 text-xs mt-1">{it.source ? `${it.source} · `:''}{formatDate(it.date)}</div>
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
            className="rounded-lg border border-white/10 bg-white/5 p-3 cursor-pointer hover:bg-white/10 transition-colors"
            role="button"
            tabIndex={0}
            onClick={()=> { updateData((d:any)=> ({ ...d, inspirationAcknowledged: true }), 'inspiration'); }}
            onKeyDown={(e)=>{ if (e.key==='Enter' || e.key===' ') { e.preventDefault(); updateData((d:any)=> ({ ...d, inspirationAcknowledged: true }), 'inspiration'); } }}
          >
            <div className="flex items-center justify-between mb-1">
              <div className="text-white font-medium">{data.researchSelected.title}</div>
              <div className="text-xs text-white/50">{data.researchSelected.source ? `${data.researchSelected.source} · `:''}{data.researchSelected.date || ''}</div>
            </div>
            <div className="text-white/70 text-sm mb-2">{(data.researchSelected.content || '').replace(/\s+/g,' ').trim()}</div>
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

      {step==='analysis' && data.template==='research' && (
        <div className="space-y-3 md:space-y-[14px]">
          <div className="text-white/80 text-sm">AI Draft analyse</div>
          {(() => {
            const defaultPrompt = data.researchSelected
              ? `Skriv en dybdegående artikel baseret på "${data.researchSelected.title}". Inkluder de vigtigste pointer, udvid med kontekst, eksperter og statistikker. ${toneInstruction}`
              : `Skriv en dybdegående artikel. ${toneInstruction}`;
            const promptValue = data.aiDraft?.prompt ?? defaultPrompt;
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
                  <div className="text-white/70 text-xs mb-1">Trend Analyse</div>
                  <div className="text-white/80 text-xs space-y-1">
                    <div>Trend: <span className="px-2 py-0.5 rounded bg-white/10">Stabil</span></div>
                    <div>Vinkel: <span className="opacity-80">Balanceret analyse</span></div>
                    <div>Målgruppe: <span className="opacity-80">Generel læser</span></div>
                  </div>
                </div>
                <div className="bg-white/5 rounded-lg border border-white/10 p-3">
                  <div className="text-white/70 text-xs mb-2">AI Forslag</div>
                  <ul className="text-white/80 text-xs list-disc list-inside space-y-1">
                    {(
                      data.aiDraft?.suggestions || [
                        'Tilføj ekspertcitater for relevante fagfolk',
                        'Inkluder statistik eller data for at understøtte argumenter',
                        'Uddyb baggrundshistorien for bedre kontekst',
                      ]
                    ).map((s:string, i:number)=> (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
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
                  onClick={()=> selected
                    ? updateData((d:any)=> ({ ...d, author: '', authorId: '', authorTOV: '' }))
                    : updateData((d:any)=> ({ ...d, author: a.name, authorId: a.id, authorTOV: a.tov }), 'author')
                  }
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
              onClick={()=> updateData((d:any)=> ({ ...d, press: true }), 'press')}
              className={`px-3 py-1.5 rounded-lg text-xs transition-all border ${data.press===true ? 'bg-white/10 text-white border-white/40' : 'bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10'}`}
            >Ja, der er pressekontakt/akkreditering</button>
            <button
              onClick={()=> updateData((d:any)=> ({ ...d, press: false }), 'press')}
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
