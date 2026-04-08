'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter, useSearchParams, usePathname } from 'next/navigation';
import { type UploadedFile } from '@/lib/file-upload-service';
import MainChatPanel from './MainChatPanel';
import SetupWizard from '@/components/SetupWizard';
import ReviewPanel from '@/components/ReviewPanel';
import DraftsShelf from '@/components/DraftsShelf';
import WebAppsPanel from '@/components/WebAppsPanel';
import MiniMenu from '@/components/MiniMenu';
import PreviewPanel from './PreviewPanel';
import DesignEditorView from '@/app/design-editor/DesignEditorView';
import AuthModal from '@/components/AuthModal';
import ChatSearchModal from '@/components/ChatSearchModal';
import SourcesPanel from '@/components/SourcesPanel';
import SettingsPanel from '@/components/SettingsPanel';
import NewsletterClient from '@/app/ai/newsletter/NewsletterClient';
import { useAuth } from '@/lib/auth-context';
import { saveDraft, getDraft, type ArticleDraft } from '@/lib/firebase-service';
import { autoSaveService } from '@/lib/auto-save-service';
import type { ArticleData } from '@/types/article';
import type { ThinkingStep, ThinkingStatus } from '@/types/thinking';
import { PROMPT_ARCHITECT_CONTEXT_KEY } from '@/lib/prompt-architect-constants';
import { loadPromptModuleToggles } from '@/lib/prompt-architect-storage';
import { SPLINE_BACKGROUNDS, STORAGE_KEY_SPLINE_BG } from '@/lib/spline-backgrounds';

const buildDefaultArticleData = (): ArticleData => ({
  title: '',
  subtitle: '',
  category: '',
  author: '',
  content: '',
  rating: 0,
  ratingSkipped: false,
  tags: [],
  platform: '',
  press: null,
  intro: '',
  aiDraft: null,
  previewTitle: '',
  aiSuggestion: null,
  template: '',
  inspirationSource: '',
  researchSelected: null,
  inspirationAcknowledged: false,
  recommendedSelected: null,
  seoTitle: '',
  seoDescription: '',
  publishDate: '',
  status: 'draft',
  authorId: '',
  authorTOV: '',
  section: '',
  topic: '',
  topicsSelected: [],
  streaming_service: '',
  featuredImage: '',
  generationMode: 'editorial'
});

const normalizeArticleData = (incoming?: Partial<ArticleData>): ArticleData => {
  const base = buildDefaultArticleData();
  if (!incoming) return base;
  return {
    ...base,
    ...incoming,
    tags: Array.isArray(incoming.tags) ? incoming.tags : base.tags,
    topicsSelected: Array.isArray(incoming.topicsSelected) ? incoming.topicsSelected : base.topicsSelected,
    generationMode: incoming.generationMode === 'fast' ? 'fast' : 'editorial'
  };
};

const BASE_THINKING_STEPS: ThinkingStep[] = [
  { id: 'analysis', label: 'Analyserer brief og noter', status: 'pending', icon: 'dot' },
  { id: 'analysis-read', label: 'Indlæser template & noter', status: 'pending', icon: 'doc', indent: 1 },
  { id: 'analysis-verify', label: 'Verificerer længdekrav', status: 'pending', icon: 'dot', indent: 1 },
  { id: 'research', label: 'Finder referencer & fakta', status: 'pending', icon: 'dot' },
  { id: 'research-source', label: 'Scanner kulturkilder', status: 'pending', icon: 'doc', indent: 1 },
  { id: 'draft', label: 'Skriver Apropos-udkast', status: 'pending', icon: 'dot' },
  { id: 'draft-shape', label: 'Former intro, brødtekst, eftertanke', status: 'pending', icon: 'doc', indent: 1 },
  { id: 'polish', label: 'Finpudser tone & struktur', status: 'pending', icon: 'dot' }
];

const APP_VERSION = process.env.NEXT_PUBLIC_APP_VERSION || '0.0.0';
const BUILD_ID = process.env.NEXT_PUBLIC_BUILD_ID || 'local';
const BUILD_LABEL = process.env.NEXT_PUBLIC_BUILD_LABEL || `${APP_VERSION}.${BUILD_ID}`;
const GENERATION_MODE_OPTIONS: Array<{ id: 'fast' | 'editorial'; label: string; description: string }> = [
  { id: 'fast', label: 'Fast mode', description: 'Hurtig sparring uden tung research' },
  { id: 'editorial', label: 'Editorial', description: 'Fuld redaktionel pipeline med research' }
];

function resolveViewFromSearchParams(sp: { get: (key: string) => string | null }): 'ai' | 'design-editor' | 'newsletter' {
  const view = sp.get('view');
  if (view === 'newsletter') return 'newsletter';
  if (view === 'design-editor') return 'design-editor';
  if (view === 'ai') return 'ai';
  const n = sp.get('newsletter');
  const w = sp.get('webapp');
  if (n === '1' || n === 'true' || w === 'newsletter') return 'newsletter';
  return 'ai';
}

// using shared ArticleData type

export default function AIWriterClient() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, logout } = useAuth();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showWizard, setShowWizard] = useState(true);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [webAppsOpen, setWebAppsOpen] = useState(false);
  const [sourcesOpen, setSourcesOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [activeView, setActiveView] = useState<'ai' | 'design-editor' | 'newsletter' | null>('ai');
  const leftPanelOpen = shelfOpen || webAppsOpen;

  /** Opdater aktiv visning og URL, så refresh og deling bevarer fx nyhedsbrev (`?view=newsletter`). */
  const applyActiveView = useCallback(
    (view: 'ai' | 'design-editor' | 'newsletter' | null) => {
      setActiveView(view);
      const params = new URLSearchParams(searchParams.toString());
      params.delete('newsletter');
      params.delete('webapp');
      if (view === 'newsletter') {
        params.set('view', 'newsletter');
      } else if (view === 'design-editor') {
        params.set('view', 'design-editor');
      } else {
        params.delete('view');
      }
      const q = params.toString();
      router.replace(q ? `${pathname}?${q}` : pathname, { scroll: false });
    },
    [router, pathname, searchParams]
  );
  const [selectedSplineBg, setSelectedSplineBg] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem(STORAGE_KEY_SPLINE_BG) || 'robot';
    }
    return 'robot';
  });
  const [articleData, setArticleData] = useState<ArticleData>(() => normalizeArticleData());

  const [notes, setNotes] = useState('');
  const openPromptArchitect = useCallback(() => {
    try {
      sessionStorage.setItem(
        PROMPT_ARCHITECT_CONTEXT_KEY,
        JSON.stringify({
          articleData,
          notes,
          authorTOV: articleData.authorTOV || '',
          authorName: articleData.author || '',
        })
      );
    } catch {
      /* ignore */
    }
    router.push('/ai/prompt-architect');
  }, [articleData, notes, router]);

  const [chatTitle, setChatTitle] = useState('Ny artikkel');
  const [refreshTrigger, setRefreshTrigger] = useState(0);
  const [newArticleKey, setNewArticleKey] = useState(0);
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    files?: UploadedFile[];
  }>>([]);
  const [editorialWarnings, setEditorialWarnings] = useState<string[]>([]);
  const [thinkingSteps, setThinkingSteps] = useState<ThinkingStep[]>([]);
  const [lastFailedMessage, setLastFailedMessage] = useState<string | null>(null);
  const thinkingTimersRef = useRef<number[]>([]);
  const progressPollIntervalRef = useRef<number | null>(null);
  const [chatWidth, setChatWidth] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('ai-chat-width');
      return saved ? parseInt(saved, 10) : 500;
    }
    return 500;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth : 1440
  );
  const chatPanelRef = useRef<HTMLDivElement>(null);
  const isDesktop = viewportWidth >= 768;
  const isNarrowDesktop = viewportWidth < 1280;
  const showMiniMenu = viewportWidth >= 1150;
  const stopThinkingTimeline = useCallback(() => {
    if (thinkingTimersRef.current.length) {
      thinkingTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      thinkingTimersRef.current = [];
    }
  }, []);

  // Handle chat panel resize
  useEffect(() => {
    if (!isResizing) return;

    const handleMouseMove = (e: MouseEvent) => {
      e.preventDefault();
      const newWidth = e.clientX;
      const minWidth = 400;
      const maxWidth = window.innerWidth * 0.6;
      const clampedWidth = Math.max(minWidth, Math.min(maxWidth, newWidth));
      setChatWidth(clampedWidth);
      localStorage.setItem('ai-chat-width', clampedWidth.toString());
    };

    const stopResizing = () => setIsResizing(false);

    window.addEventListener('mousemove', handleMouseMove, { capture: true });
    window.addEventListener('mouseup', stopResizing, { capture: true });
    window.addEventListener('mouseleave', stopResizing);
    window.addEventListener('blur', stopResizing);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    return () => {
      window.removeEventListener('mousemove', handleMouseMove, { capture: true });
      window.removeEventListener('mouseup', stopResizing, { capture: true });
      window.removeEventListener('mouseleave', stopResizing);
      window.removeEventListener('blur', stopResizing);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handleResize = () => {
      setViewportWidth(window.innerWidth);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    const next = resolveViewFromSearchParams(searchParams);
    setActiveView((prev) => (prev === next ? prev : next));
    if (next === 'newsletter') {
      setReviewOpen(false);
      setSourcesOpen(false);
      setSettingsOpen(false);
      setWebAppsOpen(false);
      setShelfOpen(false);
    }
  }, [searchParams]);

  const handleSelectWebApp = useCallback(
    (id: string) => {
      setWebAppsOpen(false);
      if (id === 'newsletter') {
        applyActiveView('newsletter');
        return;
      }
      applyActiveView(id === 'design-editor' ? 'design-editor' : 'ai');
    },
    [applyActiveView]
  );

  // Keep width in a sane range, so panels do not overlap on smaller screens.
  useEffect(() => {
    if (!isDesktop) return;
    const minWidth = viewportWidth < 1100 ? 340 : 400;
    const maxRatio = viewportWidth < 1280 ? 0.72 : 0.6;
    const maxWidth = Math.max(minWidth + 40, Math.round(viewportWidth * maxRatio));
    const next = Math.max(minWidth, Math.min(maxWidth, chatWidth));
    if (next !== chatWidth) {
      setChatWidth(next);
      localStorage.setItem('ai-chat-width', String(next));
    }
  }, [chatWidth, isDesktop, viewportWidth]);

  // On narrow desktop, avoid having left shelf and right drawer open simultaneously.
  useEffect(() => {
    if (!isDesktop || !isNarrowDesktop) return;
    if (reviewOpen && (shelfOpen || webAppsOpen)) {
      setShelfOpen(false);
      setWebAppsOpen(false);
    }
  }, [reviewOpen, shelfOpen, webAppsOpen, isDesktop, isNarrowDesktop]);

  // Make design editor open larger by default on desktop.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (activeView !== 'design-editor') return;
    if (!isDesktop) return;
    const target = Math.min(Math.round(viewportWidth * 0.75), 1000);
    setChatWidth(prev => {
      if (prev >= target) return prev;
      localStorage.setItem('ai-chat-width', target.toString());
      return target;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView, isDesktop, viewportWidth]);

  const startThinkingTimeline = useCallback(() => {
    stopThinkingTimeline();
    const initial = BASE_THINKING_STEPS.map((step, index) => ({
      ...step,
      status: index === 0 ? 'active' : 'pending'
    })) as ThinkingStep[];
    setThinkingSteps(initial);

    const scheduleAdvance = (delay: number, currentId: string, nextId?: string) => {
      const timer = window.setTimeout(() => {
        setThinkingSteps((prev) =>
          prev.map((step) => {
            if (step.id === currentId) {
              return { ...step, status: 'completed' };
            }
            if (nextId && step.id === nextId && step.status === 'pending') {
              return { ...step, status: 'active' };
            }
            return step;
          })
        );
      }, delay);
      thinkingTimersRef.current.push(timer);
    };

    const stepDelay = 700;
    BASE_THINKING_STEPS.forEach((step, index) => {
      const nextStep = BASE_THINKING_STEPS[index + 1];
      scheduleAdvance(stepDelay * (index + 1), step.id, nextStep?.id);
    });
  }, [stopThinkingTimeline]);

  const finishThinkingTimeline = useCallback(() => {
    stopThinkingTimeline();
    setThinkingSteps((prev) =>
      prev.length > 0 ? prev.map((step) => ({ ...step, status: 'completed' })) : prev
    );
  }, [stopThinkingTimeline]);

  const handleSplineBgChange = useCallback((bgId: string) => {
    setSelectedSplineBg(bgId);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY_SPLINE_BG, bgId);
    }
  }, []);

  const currentSplineBg = SPLINE_BACKGROUNDS.find(bg => bg.id === selectedSplineBg) || SPLINE_BACKGROUNDS[0];

  // Auto-save to localStorage whenever data changes
  useEffect(() => {
    if (chatMessages.length > 0 || articleData.title || notes) {
      autoSaveService.save({
        messages: chatMessages,
        chatTitle,
        articleData,
        notes,
        showWizard,
        currentDraftId
      });
    }
  }, [chatMessages, chatTitle, articleData, notes, showWizard, currentDraftId]);


  useEffect(() => {
    if (!isThinking) {
      stopThinkingTimeline();
      setThinkingSteps([]);
    }
  }, [isThinking, stopThinkingTimeline]);

  useEffect(() => () => stopThinkingTimeline(), [stopThinkingTimeline]);
  // Restore data from localStorage on page load.
  // Disabled by default so users always land in a clean lobby state on login.
  // Toggle with localStorage key "ai-writer-restore-autosave" = "true" for manual testing.
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const shouldRestore = localStorage.getItem('ai-writer-restore-autosave') === 'true';
      if (!shouldRestore) return;
    }

    const restoreData = () => {
      try {
        const savedData = autoSaveService.load();
        
        if (savedData.messages.length > 0) {
          setChatMessages(savedData.messages);
        }
        
        if (savedData.chatTitle && savedData.chatTitle !== 'Ny artikkel') {
          setChatTitle(savedData.chatTitle);
        }
        
        if (savedData.articleData && Object.keys(savedData.articleData).length > 0) {
          setArticleData(normalizeArticleData(savedData.articleData));
        }
        
        if (savedData.notes) {
          setNotes(savedData.notes);
        }
        
        if (savedData.currentDraftId) {
          setCurrentDraftId(savedData.currentDraftId);
        }
        
        // Restore wizard state based on whether setup is complete
        const hasAuthor = Boolean(savedData.articleData?.author || savedData.articleData?.authorId);
        const hasCategory = Boolean(savedData.articleData?.category || savedData.articleData?.section);
        const hasTemplate = Boolean(savedData.articleData?.template);
        const setupComplete = hasAuthor && hasCategory && hasTemplate;
        
        setShowWizard(!setupComplete);
        
        // Restore Preflight data (will be passed to MainChatPanel via props)
        if (savedData.preflightWarnings || savedData.preflightCriticTips || savedData.preflightFactResults) {
          // Store in a ref or state that can be passed to MainChatPanel
          // For now, we'll let MainChatPanel restore its own Preflight data
        }
        
        console.log('🔄 Restored data from localStorage:', {
          messages: savedData.messages.length,
          chatTitle: savedData.chatTitle,
          hasArticleData: Object.keys(savedData.articleData).length > 0,
          hasNotes: !!savedData.notes,
          showWizard: !setupComplete
        });
      } catch (error) {
        console.error('Failed to restore data from localStorage:', error);
      }
    };

    restoreData();
  }, []); // Only run on mount

  // Listen for mobile menu background change events
  useEffect(() => {
    const onBgChange = (e: any) => {
      const id = e?.detail?.id;
      if (typeof id === 'string') handleSplineBgChange(id);
    };
    window.addEventListener('spline-bg-change', onBgChange as any);
    return () => window.removeEventListener('spline-bg-change', onBgChange as any);
  }, [handleSplineBgChange]);

  const updateArticleData = (updates: Partial<ArticleData>) => {
    setArticleData(prev => ({
      ...prev,
      ...updates,
      generationMode: updates.generationMode
        ? (updates.generationMode === 'fast' ? 'fast' : 'editorial')
        : (prev.generationMode || 'editorial')
    }));
  };

  const handleSetupWizardChange = useCallback((d: any) => {
    setArticleData(prev => ({ ...prev, ...d }));
  }, []);


  const addChatMessage = (role: 'user' | 'assistant', content: string, files?: UploadedFile[]) => {
    const newMessage = {
      id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      role,
      content,
      timestamp: new Date(),
      files
    };
    setChatMessages(prev => [...prev, newMessage]);
  };

  // Cache Webflow schema data to avoid fetching on every message
  const webflowSchemaCacheRef = useRef<{
    fieldMeta: any[];
    requiredSlugs: string[];
    mappingEntries: Array<{ webflowSlug: string; internal: string }>;
    mapSlugToInternal: Record<string, string>;
    samples: any[];
    lastFetched: number;
  } | null>(null);
  const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

  const getWebflowSchema = async (forceRefresh = false) => {
    const now = Date.now();
    const cache = webflowSchemaCacheRef.current;
    
    // Return cached data if still valid
    if (!forceRefresh && cache && (now - cache.lastFetched) < CACHE_DURATION) {
      return cache;
    }

    try {
      // Fetch fresh data
      const [schemaRes, mappingRes, samplesRes] = await Promise.all([
        fetch('/api/webflow/article-fields'),
        fetch('/api/webflow/mapping'),
        fetch('/api/webflow/sample-articles')
      ]);
      
      const schemaJson = schemaRes.ok ? await schemaRes.json() : { fields: [] };
      const mappingJson = mappingRes.ok ? await mappingRes.json() : { entries: [] };
      const samplesJson = samplesRes.ok ? await samplesRes.json() : { items: [] };
      
      const fieldMeta: any[] = Array.isArray(schemaJson.fields) ? schemaJson.fields : [];
      const requiredSlugs: string[] = fieldMeta.filter((f:any)=>f.required).map((f:any)=>f.slug);
      const mappingEntries: Array<{ webflowSlug: string; internal: string }> = Array.isArray(mappingJson.entries) ? mappingJson.entries : [];
      const mapSlugToInternal: Record<string,string> = mappingEntries.reduce((acc:any, e:any)=>{ acc[e.webflowSlug]=e.internal; return acc; }, {});

      // Update cache
      webflowSchemaCacheRef.current = {
        fieldMeta,
        requiredSlugs,
        mappingEntries,
        mapSlugToInternal,
        samples: (samplesJson.items || []).slice(0, 5),
        lastFetched: now
      };

      return webflowSchemaCacheRef.current;
    } catch (schemaError) {
      console.error('Failed to load Webflow schema, falling back to cache/default:', schemaError);
      if (webflowSchemaCacheRef.current) {
        return webflowSchemaCacheRef.current;
      }
      // Provide minimal fallback so chat can continue
      return {
        fieldMeta: [],
        requiredSlugs: [],
        mappingEntries: [],
        mapSlugToInternal: {},
        samples: [],
        lastFetched: now
      };
    }
  };

  const handleSendMessage = async (message: string, files?: UploadedFile[]) => {
    const trimmedMessage = message.trim();
    setLastFailedMessage(null); // Clear retry state on new send

    // Check if user is responding "Ja" to "Skal vi starte med en arbejdstitel og en indledning?"
    const lastAssistantMessage = chatMessages.filter(m => m.role === 'assistant').pop()?.content || '';
    const isTitleIntroQuestion = /arbejdstitel.*indledning|indledning.*arbejdstitel/i.test(lastAssistantMessage);
    const isAffirmativeResponse = /^(ja|yes|okay|ok|super|fint|god idé)\b/i.test(trimmedMessage);
    const isTitleIntroButton = /generer\s+(kun\s+)?(en\s+)?arbejdstitel|skriv\s+hele\s+artiklen/i.test(trimmedMessage);

    if (isTitleIntroQuestion && (isAffirmativeResponse || isTitleIntroButton)) {
      addChatMessage('user', message, files);
      if (isAffirmativeResponse) {
        // "Ja" = kun arbejdstitel og indledning (som knappen "Kun titel og indledning")
        await handleSendMessageInternal('Generer kun en arbejdstitel og en indledning.');
      } else {
        await handleSendMessageInternal(trimmedMessage);
      }
      return;
    }
    
    // Normal message flow
    addChatMessage('user', message, files);

    const isLikelyBrief = (() => {
      if (trimmedMessage.length < 40) return false;
      if (/^(ja|nej|okay|ok|tak|super|hej|hi|hello)\b/i.test(trimmedMessage)) return false;
      if (/\n|•|-|\d+\./.test(trimmedMessage)) return true;
      if (trimmedMessage.length >= 80) return true;
      return /(artikel|anmeldelse|noter|skal handle|fokus|vinkel|tone)/i.test(trimmedMessage);
    })();

    // Check if this is a simple greeting/short message that doesn't need Webflow schema
    const isSimpleMessage = /^(hej|hi|hello|hey|ja|nej|okay|ok|tak|super|tak|mange tak)\b/i.test(trimmedMessage) && trimmedMessage.length < 20;

    let notesPayload = notes;
    if (isLikelyBrief) {
      const combined = [notesPayload, trimmedMessage].filter((segment) => segment && segment.trim().length > 0).join('\n\n');
      // Prevent the notes payload from growing unbounded — keep last ~2000 chars
      notesPayload = combined.slice(-2000);
      setNotes(notesPayload);
    }

    await handleSendMessageInternal(trimmedMessage, files, isLikelyBrief, isSimpleMessage);
  };

  const handleSendMessageInternal = async (message: string, files?: UploadedFile[], isLikelyBrief?: boolean, isSimpleMessage?: boolean) => {
    const trimmedMessage = message.trim();
    
    // Determine isLikelyBrief if not provided
    const determinedIsLikelyBrief = isLikelyBrief ?? (() => {
      if (trimmedMessage.length < 40) return false;
      if (/^(ja|nej|okay|ok|tak|super|hej|hi|hello)\b/i.test(trimmedMessage)) return false;
      if (/\n|•|-|\d+\./.test(trimmedMessage)) return true;
      if (trimmedMessage.length >= 80) return true;
      return /(artikel|anmeldelse|noter|skal handle|fokus|vinkel|tone)/i.test(trimmedMessage);
    })();

    // Determine isSimpleMessage if not provided
    const determinedIsSimpleMessage = isSimpleMessage ?? (/^(hej|hi|hello|hey|ja|nej|okay|ok|tak|super|tak|mange tak)\b/i.test(trimmedMessage) && trimmedMessage.length < 20);

    let notesPayload = notes;
    if (determinedIsLikelyBrief) {
      const combined = [notesPayload, trimmedMessage].filter((segment) => segment && segment.trim().length > 0).join('\n\n');
      // Prevent the notes payload from growing unbounded — keep last ~2000 chars
      notesPayload = combined.slice(-2000);
      setNotes(notesPayload);
    }

    const sendAssistantError = (message: string, tip?: string) => {
      addChatMessage('assistant', tip ? `${message}\n\n${tip}` : message);
    };

    try {
      setIsThinking(true);
      const clientRequestId = typeof crypto !== 'undefined' && crypto.randomUUID
        ? crypto.randomUUID()
        : `req-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;

      // For editorial/long requests: show real progress from server via polling
      const useProgressPolling = !determinedIsSimpleMessage && (articleData?.generationMode !== 'fast');
      const SERVER_STEP_ORDER = [
        { id: 'prepare', label: 'Analyserer prompt og setup' },
        { id: 'web-search', label: 'Søger efter fakta og kilder' },
        { id: 'advanced-research', label: 'Indsamler redaktionel research' },
        { id: 'generation', label: 'Genererer artikeludkast' },
        { id: 'quality', label: 'Kører kvalitetskontrol' },
        { id: 'format', label: 'Formatterer svar til UI' },
      ];
      if (useProgressPolling) {
        setThinkingSteps(
          SERVER_STEP_ORDER.map((s, i) => ({
            id: s.id,
            label: s.label,
            status: (i === 0 ? 'active' : 'pending') as ThinkingStep['status'],
          }))
        );
        const pollProgress = async () => {
          try {
            const res = await fetch(`/api/ai-chat/progress?id=${encodeURIComponent(clientRequestId)}`);
            const data = await res.json();
            if (data.steps && Array.isArray(data.steps) && data.steps.length > 0) {
              setThinkingSteps(
                data.steps.map((step: { id: string; label: string; status: string }) => ({
                  id: step.id,
                  label: step.label,
                  status: step.status as ThinkingStep['status'],
                }))
              );
            }
          } catch (_) {}
        };
        progressPollIntervalRef.current = window.setInterval(pollProgress, 1800);
      } else {
        startThinkingTimeline();
      }

      // Only fetch Webflow schema for non-simple messages or if we need article generation
      let webflowData;
      if (!determinedIsSimpleMessage) {
        webflowData = await getWebflowSchema();
      } else {
        // Use cached data or minimal defaults for simple messages
        webflowData = webflowSchemaCacheRef.current || {
          fieldMeta: [],
          requiredSlugs: [],
          mappingEntries: [],
          mapSlugToInternal: {},
          samples: []
        };
      }
      
      const { fieldMeta, requiredSlugs, mappingEntries, mapSlugToInternal, samples } = webflowData;

      // Add timeout - must be >= server pipeline (research + generation + quality). Server maxDuration = 300s.
      const generationMode = articleData?.generationMode || 'editorial';
      const isFastMode = generationMode === 'fast';
      const controller = new AbortController();
      const timeoutId = determinedIsSimpleMessage 
        ? setTimeout(() => controller.abort(), 30000) // 30s simple
        : isFastMode
        ? setTimeout(() => controller.abort(), 90000) // 90s fast
        : setTimeout(() => controller.abort(), 300000); // 5 min editorial (matches Vercel maxDuration 300)

      const promptModuleToggles = loadPromptModuleToggles();

      let response: Response;
      try {
        response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
          signal: controller.signal,
        body: JSON.stringify({
          message,
          articleData,
          notes: notesPayload,
          chatHistory: chatMessages,
          authorTOV: articleData.authorTOV || '',
          authorName: articleData.author || '',
          clientRequestId,
          promptModuleToggles,
        }),
      });
      } catch (fetchError: any) {
        clearTimeout(timeoutId);
        // Re-throw AbortError to be handled below
        if (fetchError.name === 'AbortError') {
          throw fetchError;
        }
        throw fetchError;
      }

      clearTimeout(timeoutId);

      console.log('📡 API Response status:', response.status);

      if (response.ok) {
        const data = await response.json();
        console.log('✅ API Response received:', {
          hasResponse: !!data.response,
          responseLength: data.response?.length || 0,
          hasArticleUpdate: !!data.articleUpdate,
          articleUpdateKeys: data.articleUpdate ? Object.keys(data.articleUpdate) : [],
          warnings: data.warnings?.length || 0
        });
        
        if (!data.response) {
          console.error('❌ No response field in API data');
          sendAssistantError('Jeg fik ikke noget svar tilbage — prøv bare at sende igen.');
          setIsThinking(false);
          return;
        }

        addChatMessage('assistant', data.response);
        // Warnings are now suppressed on server side - don't show them
        setEditorialWarnings([]);
        // Live preview sync: try to extract a working title from the response
        try {
          const m = String(data.response || '').match(/^(?:arbejdstitel|titel)[:\-]\s*(.+)$/im) || String(data.response||'').match(/^#\s+(.+)$/m);
          if (m && m[1]) setArticleData(prev=>({ ...prev, previewTitle: m[1].trim() }));
        } catch {}
        
        // Keep lightweight chat context for training opt-in later
        const compactMessages = [...chatMessages, { id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`, role: 'assistant', content: data.response, timestamp: new Date() }];
        
        // Consolidate all article data updates into one call to prevent overwrites
        setArticleData(prev => {
          const articleUpdate = data.articleUpdate || {};
          
          // DEBUG: Log what we receive from API
          console.log('📥 API Response - articleUpdate:', {
            hasContent: !!articleUpdate.content,
            contentLength: articleUpdate.content?.length || 0,
            contentPreview: articleUpdate.content?.substring(0, 200) || 'N/A',
            hasIntro: !!articleUpdate.intro,
            introPreview: articleUpdate.intro?.substring(0, 100) || 'N/A',
            allKeys: Object.keys(articleUpdate)
          });
          
          let extractedFields: Record<string, string> = {};

          // Conservative fallback: only parse explicit "Arbejdstitel:" / "Undertitel:" labels.
          // Avoid inferring title/subtitle from first paragraphs, which can corrupt CMS fields.
          if (articleUpdate.content && Object.keys(articleUpdate).length === 1) {
            const content = articleUpdate.content;
            const titleMatch = content.match(/^\s*Arbejdstitel\s*:\s*(.+)$/im);
            const subtitleMatch = content.match(/^\s*Undertitel\s*:\s*(.+)$/im);

            const extractedTitle = titleMatch?.[1]?.trim() || '';
            const extractedSubtitle = subtitleMatch?.[1]?.trim() || '';

            if (extractedTitle) {
              const slug = extractedTitle
                .toLowerCase()
                .replace(/[^a-z0-9\s-]/g, '')
                .replace(/\s+/g, '-')
                .replace(/-+/g, '-')
                .trim();

              const seoTitle = extractedTitle.length > 60
                ? `${extractedTitle.substring(0, 57)}...`
                : extractedTitle;

              extractedFields = {
                title: extractedTitle,
                slug,
                seo_title: seoTitle,
                seoTitle,
              };
            }

            if (extractedSubtitle) {
              extractedFields = {
                ...extractedFields,
                subtitle: extractedSubtitle,
              };
            }
          }
          
          // Only update fields that have meaningful values (not empty strings or null)
          const meaningfulUpdate = Object.fromEntries(
            Object.entries(articleUpdate).filter(([key, value]) => {
              if (value === null || value === undefined) return false;
              if (typeof value === 'string' && value.trim() === '') return false;
              if (Array.isArray(value) && value.length === 0) return false;
              return true;
            })
          );

          // Extra failsafe: derive title/subtitle/intro from assistant response if missing in articleUpdate.
          const responseText = typeof data.response === 'string' ? data.response : '';
          const parsedTitle = responseText.match(/^\s*(?:\*\*)?\s*(?:Arbejdstitel|Titel)\s*(?:\*\*)?\s*[:\-–—]\s*(.+)$/im)?.[1]?.trim() || '';
          const parsedSubtitle = responseText.match(/^\s*(?:\*\*)?\s*(?:Undertitel|Subtitle)\s*(?:\*\*)?\s*[:\-–—]\s*(.+)$/im)?.[1]?.trim() || '';
          const parsedIntro = responseText
            .match(/^\s*(?:\*\*|__)?\s*(?:Intro|Indledning)\s*(?:\*\*|__)?\s*(?:[:\-–—]\s*|\s+)([\s\S]+?)(?:\n{2,}|$)/im)?.[1]
            ?.replace(/^(?:\*\*|__)?\s*(?:Intro|Indledning)\s*(?:\*\*|__)?\s*/i, '')
            ?.replace(/\s+/g, ' ')
            .trim() || '';

          // If labels are missing, infer first two meaningful lines as title/subtitle.
          const candidateLines = responseText
            .split('\n')
            .map((line: string) => line.trim())
            .filter(Boolean)
            .map((line: string) => line.replace(/^#+\s*/, '').replace(/^\*\*(.+)\*\*$/, '$1').trim())
            .filter((line: string) => !/^(arbejdstitel|titel|undertitel|subtitle|intro|indledning)\s*[:\-–—]/i.test(line));
          const inferredTitle = !parsedTitle && candidateLines[0] && candidateLines[0].length >= 6 && candidateLines[0].length <= 120 ? candidateLines[0] : '';
          const inferredSubtitle = !parsedSubtitle && candidateLines[1] && candidateLines[1].length >= 10 && candidateLines[1].length <= 180 ? candidateLines[1] : '';
          
          const updatedData = { 
            ...prev, 
            ...meaningfulUpdate,
            ...extractedFields,
            ...(!meaningfulUpdate.title && !extractedFields.title && (parsedTitle || inferredTitle) ? { title: parsedTitle || inferredTitle } : {}),
            ...(!meaningfulUpdate.subtitle && !extractedFields.subtitle && (parsedSubtitle || inferredSubtitle) ? { subtitle: parsedSubtitle || inferredSubtitle } : {}),
            ...(!meaningfulUpdate.intro && !extractedFields.intro && parsedIntro ? { intro: parsedIntro } : {}),
            ...(data.suggestion ? { aiSuggestion: data.suggestion } : {}),
            _chatMessages: compactMessages, 
            notes 
          };
          
          // DEBUG: Log what we're setting as articleData.content
          console.log('📝 Setting articleData.content:', {
            hasContent: !!updatedData.content,
            contentLength: updatedData.content?.length || 0,
            contentPreview: updatedData.content?.substring(0, 200) || 'N/A',
            startsWithIntro: updatedData.content?.startsWith('Intro:') || false,
            first100Chars: updatedData.content?.substring(0, 100) || 'N/A'
          });
          
          return updatedData;
        });

        // After AI response, proactively check for missing required fields and ask
        const meaningfulUpdate = Object.fromEntries(
          Object.entries(data.articleUpdate || {}).filter(([key, value]) => {
            if (value === null || value === undefined) return false;
            if (typeof value === 'string' && value.trim() === '') return false;
            if (Array.isArray(value) && value.length === 0) return false;
            return true;
          })
        );
        const nextData = { ...articleData, ...meaningfulUpdate } as any;
        const labelFor = (slug: string) => {
          const s = slug.toLowerCase();
          if (s==='name' || s==='title') return 'Titel';
          if (s==='post-body') return 'Indhold';
          if (s==='slug') return 'Slug';
          if (s==='seo-title') return 'SEO titel';
          if (s==='seo-description') return 'SEO beskrivelse';
          if (s==='publish-date') return 'Publiceringsdato';
          if (s==='author') return 'Forfatter';
          if (s==='category') return 'Kategori';
          return slug;
        };
        const missing: string[] = [];
        for (const slug of requiredSlugs) {
          const internal = mapSlugToInternal[slug] || slug;
          const val = nextData[internal];
          const isEmpty = val===undefined || val===null || val===''
            || (Array.isArray(val) && val.length===0);
          if (isEmpty) missing.push(slug);
        }
        if (missing.length>0) {
          const lines = missing.map(sl=>`- ${labelFor(sl)} (${sl})`);
          addChatMessage('assistant', `For at kunne udgive i Webflow mangler vi følgende felter:\n${lines.join('\n')}\n\nSkriv værdierne, så udfylder jeg dem ét for ét.`);
        }
      } else {
        const raw = await response.text();
        let errorData: Record<string, unknown> = {};
        try {
          if (raw.trim()) errorData = JSON.parse(raw) as Record<string, unknown>;
        } catch {
          errorData = { error: raw.trim().slice(0, 800) || 'Ukendt fejl (ikke JSON fra server)' };
        }
        const errMsg =
          typeof errorData.error === 'string' && errorData.error.trim()
            ? errorData.error.trim()
            : raw.trim().slice(0, 500) || `Tomt serversvar (HTTP ${response.status})`;
        if (typeof errorData.error !== 'string' || !errorData.error.trim()) {
          errorData = { ...errorData, error: errMsg };
        }
        // Stringify so DevTools does not show a collapsed "{}" for objects with a key named "error"
        console.error(`❌ API Error: ${response.status}`, JSON.stringify(errorData));
        setLastFailedMessage(trimmedMessage);

        let userLine: string;
        let tip: string | undefined;
        if (response.status === 429) {
          userLine =
            'Jeg kan ikke skrive lige nu — det ligner, at AI-kontoen er løbet tør (lidt som når mobilen har brugt datapakken).';
          tip = 'Gå ind på openai.com, tjek betaling og forbrugsgrænser, og prøv igen bagefter.';
        } else if (response.status === 401) {
          userLine = 'Jeg kan ikke få adgang til AI-tjenesten — nøglen passer ikke eller er udløbet.';
          tip = 'Den der har sat appen op skal tjekke API-nøglen (fx i Vercel eller .env).';
        } else if (response.status === 400) {
          userLine = 'Noget i beskeden blev ikke accepteret.';
          tip = 'Prøv at sende igen, eller skriv det lidt anderledes.';
        } else if (response.status >= 500) {
          userLine = 'Noget gik galt i baggrunden hos os.';
          tip = 'Prøv igen om lidt — hvis det bliver ved, er det nok ikke din fejl.';
        } else {
          userLine = 'Det gik ikke lige denne gang.';
          tip = 'Prøv igen om et øjeblik.';
        }
        sendAssistantError(userLine, tip);
      }
    } catch (error: any) {
      // Handle AbortError silently (expected timeout behavior)
      if (error.name === 'AbortError') {
        console.log('⏱️ Request timeout - this is expected for long-running requests');
        setLastFailedMessage(trimmedMessage);
        sendAssistantError(
          'Det tog for lang tid — jeg nåede ikke færdig.',
          'Prøv igen, eventuelt med en kortere besked.',
        );
      } else {
        console.error('❌ Fetch error:', error);
        setLastFailedMessage(trimmedMessage);
        const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
        sendAssistantError(
          offline
            ? 'Du ser ud til at være offline.'
            : 'Nettet driller, eller også svarer serveren ikke lige nu.',
          'Tjek forbindelsen og prøv igen om lidt.',
        );
      }
    } finally {
      if (progressPollIntervalRef.current) {
        clearInterval(progressPollIntervalRef.current);
        progressPollIntervalRef.current = null;
      }
      setIsThinking(false);
      finishThinkingTimeline();
      setThinkingSteps([]);
    }
  };

  const handleSetupWizardComplete = useCallback(async (setup: any) => {
    setArticleData(prev => ({ ...prev, ...setup }));
    setShowWizard(false);
    const topicsDisplay = Array.isArray(setup.topicsSelected) && setup.topicsSelected.length
      ? setup.topicsSelected.join(', ')
      : Array.isArray(setup.tags) && setup.tags.length
        ? setup.tags.join(', ')
        : 'Ikke valgt';
    const pressDisplay = setup.press === true ? 'Ja' : setup.press === false ? 'Nej' : 'Ikke valgt';
    const summary = [
      `Forfatter: ${setup.author || 'Ikke valgt'}`,
      `Section: ${setup.category || 'Ikke valgt'}`,
      `Topics: ${topicsDisplay}`,
      setup.template ? `Template: ${setup.template}` : null,
      setup.researchSelected && setup.researchSelected.title ? `Research artikel: "${setup.researchSelected.title}"${setup.researchSelected.source ? ` (${setup.researchSelected.source})` : ''}` : null,
      setup.rating ? `Rating: ${setup.rating}⭐` : null,
      `Presse: ${pressDisplay}`
    ].filter(Boolean).join('\n');
    
    // Auto-generate article if template is 'notes' and we have notes
    if (setup.template === 'notes' && notes && notes.length > 120) {
      addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nJeg genererer nu artiklen baseret på dine noter...`);
      // Auto-trigger article generation
      await handleSendMessage('Generer artikel baseret på mine noter');
    } else {
      addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nSkal vi starte med en arbejdstitel og en indledning?`);
    }
  }, [notes, addChatMessage, handleSendMessage]);

  // Automatically reveal review drawer when fresh article content arrives
  const previousContentRef = useRef(articleData.content || '');
  useEffect(() => {
    const prev = previousContentRef.current || '';
    const next = articleData.content || '';
    if (!reviewOpen && next && next !== prev) {
      setReviewOpen(true);
    }
    previousContentRef.current = next;
  }, [articleData.content, reviewOpen]);

  // Auto-save to Firebase when data changes
  useEffect(() => {
    if (!user || chatMessages.length === 0) return;

    const autoSaveTimeout = setTimeout(async () => {
      try {
        // Clean up data before saving to Firebase
        const cleanChatMessages = chatMessages.map(msg => ({
          ...msg,
          files: msg.files || [] // Ensure files is always an array
        }));

        const draftData = {
          id: currentDraftId || undefined,
          title: articleData.title || 'Untitled',
          chatTitle: chatTitle,
          messages: cleanChatMessages,
          articleData: {
            ...articleData,
            // Ensure all fields have values
            title: articleData.title || '',
            subtitle: articleData.subtitle || '',
            category: articleData.category || '',
            author: articleData.author || 'Frederik Kragh',
            authorTOV: articleData.authorTOV || '',
            content: articleData.content || '',
            rating: articleData.rating || 0,
            tags: articleData.tags || [],
            platform: articleData.platform || ''
          },
          notes: notes || '',
          userId: user.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastModified: new Date()
        };

        const draftId = await saveDraft(user.uid, draftData);
        
        if (!currentDraftId) {
          setCurrentDraftId(draftId);
          setRefreshTrigger(prev => prev + 1); // Trigger refresh for new drafts
        }
      } catch (error) {
        console.error('Error auto-saving to Firebase:', error);
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(autoSaveTimeout);
  }, [chatMessages, articleData, notes, user, currentDraftId, chatTitle]);

  const handleLoadDraft = (draft: ArticleDraft) => {
    
    setCurrentDraftId(draft.id);
    setChatMessages(draft.messages);
    setArticleData(normalizeArticleData(draft.articleData));
    setNotes(draft.notes || '');
    setChatTitle(draft.chatTitle || 'Ny artikkel');
    
    // Check if setup is already complete and collapse wizard
    const hasAuthor = Boolean(draft.articleData?.author || draft.articleData?.authorId);
    const hasCategory = Boolean(draft.articleData?.category || draft.articleData?.section);
    const hasTemplate = Boolean(draft.articleData?.template);
    const setupComplete = hasAuthor && hasCategory && hasTemplate;
    
    if (setupComplete) {
      setShowWizard(false);
    } else {
      setShowWizard(true);
    }
    
    applyActiveView('ai');
    setReviewOpen(true);
  };

  const handleSelectMessage = (draft: ArticleDraft, messageIndex: number) => {
    // Load the draft and scroll to the specific message
    handleLoadDraft(draft);
    
    // Scroll to the message after a short delay to allow for rendering
    setTimeout(() => {
      const messageElement = document.getElementById(`message-${messageIndex}`);
      if (messageElement) {
        messageElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        messageElement.classList.add('bg-blue-500/20');
        setTimeout(() => {
          messageElement.classList.remove('bg-blue-500/20');
        }, 3000);
      }
    }, 100);
  };

  const handleNewArticle = async () => {
    // Save current article if there's content before resetting
    const shouldPersistCurrent = user && (chatMessages.length > 0 || articleData.content || notes);
    let savedPreviousDraft = false;
    if (shouldPersistCurrent) {
      try {
        const cleanChatMessages = chatMessages.map(msg => ({
          ...msg,
          files: msg.files || []
        }));

        const draftData = {
          id: currentDraftId || undefined,
          title: articleData.title || 'Untitled',
          chatTitle: chatTitle,
          messages: cleanChatMessages,
          articleData: {
            ...articleData,
            title: articleData.title || '',
            subtitle: articleData.subtitle || '',
            category: articleData.category || '',
            author: articleData.author || 'Frederik Kragh',
            authorTOV: articleData.authorTOV || '',
            content: articleData.content || '',
            rating: articleData.rating || 0,
            tags: articleData.tags || [],
            platform: articleData.platform || ''
          },
          notes: notes || '',
          userId: user.uid,
          createdAt: new Date(),
          updatedAt: new Date(),
          lastModified: new Date()
        };

        await saveDraft(user.uid, draftData);
        setRefreshTrigger(prev => prev + 1); // Trigger refresh of drafts list
        savedPreviousDraft = true;
      } catch (error) {
        console.error('Error saving current article:', error);
      }
    }

    // Clear auto-save data
    autoSaveService.clear();

    // Reset everything for a new article
    setCurrentDraftId(null);
    setChatMessages([]);
    setArticleData(normalizeArticleData());
    setNotes('');
    setChatTitle('Ny artikkel');
    setShowWizard(true);
    setReviewOpen(false);
    setSettingsOpen(false);
    setSourcesOpen(false);
    applyActiveView('ai');
    setNewArticleKey((k) => k + 1);
    
  };

  const userInitials = (() => {
    const name = (user?.displayName || user?.email || '').trim();
    if (!name) return 'U';
    const [first, last] = name.replace(/@.+$/, '').split(/[\s._-]+/);
    const f = (first || '').charAt(0);
    const l = (last || '').charAt(0);
    return (f + (l || '')).toUpperCase();
  })();
  const activeGenerationMode = articleData.generationMode === 'fast' ? 'fast' : 'editorial';

  const avatarBg = (() => {
    const seed = (user?.uid || userInitials).split('').reduce((a,c)=>a+c.charCodeAt(0),0);
    const hues = [210, 260, 190, 330, 20, 150];
    const h = hues[seed % hues.length];
    return `hsl(${h} 70% 30%)`;
  })();
  const userName = (user?.displayName || user?.email?.split('@')[0] || 'Bruger');

  return (
    <>
      {!user && <AuthModal />}
      {user && <AuthModal />}
      {showSearchModal && (
        <ChatSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectMessage={handleSelectMessage}
        />
      )}
      <div className="h-[100dvh] min-h-[100dvh] bg-black md:bg-[#171717] md:p-[1%] p-0 flex md:flex-row flex-col gap-4 relative overflow-hidden">
        {/* Background Spline (desktop only — mobile WebGL causes white/blank screens) */}
        <div className="absolute inset-0 z-0 hidden md:block">
          <iframe 
            src={currentSplineBg.url}
            frameBorder="0" 
            width="100%" 
            height="100%"
            className="w-full h-full"
            title="AI Background"
            key={selectedSplineBg}
            loading="lazy"
          />
        </div>
        {/* Transparent overlay during resize to prevent iframe from stealing mouse events */}
        {isResizing && <div className="absolute inset-0 z-[5]" />}
        
        {user && (
          <>
            {/* Apropos Research Logo + build label */}
            <div className="absolute bottom-4 right-4 z-10 flex items-center gap-2">
              <div className="hidden md:block text-[11px] leading-none text-white/45 tracking-wide">
                <span className="uppercase">build</span> {BUILD_LABEL} · <span className="uppercase">version</span> {APP_VERSION}
              </div>
              <img
                src="/images/Apropos Research White.png"
                alt="Apropos Research"
                className="h-6 opacity-40 hover:opacity-60 transition-opacity"
              />
            </div>
            
            {/* Left panel: Web-apps or Mine artikler (desktop) */}
            <div className={`hidden md:block absolute top-[1%] bottom-[1%] left-[1%] z-40`} style={{ width: leftPanelOpen ? 'min(300px, 50vw)' : '0px', transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease', opacity: leftPanelOpen ? 1 : 0, pointerEvents: leftPanelOpen ? 'auto' : 'none' }}>
              <div className={`h-full flex flex-col rounded-xl border border-white/20 overflow-hidden transform bg-[#171717]`} style={{ transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: leftPanelOpen ? 'translateX(0px)' : 'translateX(-8px)' }}>
                {webAppsOpen && (
                  <WebAppsPanel
                  isOpen={webAppsOpen}
                  onClose={() => setWebAppsOpen(false)}
                  onSelectApp={handleSelectWebApp}
                />
                )}
                {shelfOpen && (
                  <DraftsShelf 
                    isOpen={shelfOpen} 
                    onSelect={(draft)=>{ 
                      setShelfOpen(false); 
                      handleLoadDraft(draft);
                    }} 
                    onClose={()=> setShelfOpen(false)}
                    onRenameLive={(draftId, newTitle) => {
                      setChatTitle(newTitle);
                      setArticleData(prev => ({
                        ...prev,
                        title: newTitle,
                        previewTitle: newTitle
                      }));
                    }}
                    refreshTrigger={refreshTrigger}
                  />
                )}
              </div>
            </div>
            {/* Mobile: Web-apps panel */}
            <div className={`md:hidden ${webAppsOpen ? 'absolute inset-0 z-40 translate-x-0' : 'hidden'} transition-transform duration-300`}>
              <div className="h-full flex flex-col rounded-none border-t border-white/10 bg-[#171717]">
                <WebAppsPanel
                  isOpen={webAppsOpen}
                  onClose={() => setWebAppsOpen(false)}
                  onSelectApp={handleSelectWebApp}
                />
              </div>
            </div>
            {/* Mobile: Mine artikler shelf */}
            <div className={`md:hidden ${shelfOpen ? 'absolute inset-0 z-40 translate-x-0' : 'hidden'} transition-transform duration-300`}>
              <div className="h-full flex flex-col rounded-none border-t border-white/10 bg-[#171717]">
                <DraftsShelf 
                  isOpen={shelfOpen} 
                  onSelect={(draft)=>{ 
                    setShelfOpen(false); 
                    handleLoadDraft(draft);
                  }} 
                  onClose={()=> setShelfOpen(false)}
                  onRenameLive={(draftId, newTitle) => {
                    setChatTitle(newTitle);
                    setArticleData(prev => ({
                      ...prev,
                      title: newTitle,
                      previewTitle: newTitle
                    }));
                  }}
                  refreshTrigger={refreshTrigger}
                />
              </div>
            </div>

            {/* Main content: AI Writer (chat) eller Design Editor – samme slot */}
            {(activeView === 'ai' || isClosing) && (
            <div
              ref={chatPanelRef}
              className="w-full flex-shrink-0 absolute top-0 bottom-0 left-0 md:top-[1%] md:bottom-[1%] md:left-[1%] z-10"
              style={{ 
                width: isDesktop ? `${chatWidth}px` : '100%',
                transition: isResizing ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', 
                transform: isClosing
                  ? 'translateX(-100vw)'
                  : leftPanelOpen
                    ? 'translateX(calc(12px + min(300px, 50vw)))'
                    : 'translateX(0)',
              }}
            >
              {/* Resize handle */}
              {isDesktop && (
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                  }}
                  className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-white/20 transition-colors z-30 group"
                  style={{ touchAction: 'none' }}
                >
                  <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-1 h-16 bg-white/0 group-hover:bg-white/30 rounded-full transition-colors" />
                </div>
              )}
              {/* Always keep chat visible underneath */}
              <MainChatPanel 
                messages={chatMessages}
                setChatMessages={setChatMessages}
                onSendMessage={handleSendMessage}
                articleData={articleData}
                isThinking={isThinking}
                thinkingSteps={thinkingSteps}
                chatTitle={chatTitle}
                onChatTitleChange={setChatTitle}
                editorialWarnings={editorialWarnings}
                onClearEditorialWarnings={() => setEditorialWarnings([])}
                onNewArticle={handleNewArticle}
                onOpenDraftsPanel={() => setShelfOpen(true)}
                onOpenReviewPanel={() => setReviewOpen(true)}
                onClose={() => {
                  setIsClosing(true);
                  setTimeout(() => {
                    setActiveView(null);
                    setIsClosing(false);
                  }, 320);
                }}
                onOpenSourcesPanel={() => { setReviewOpen(false); setSettingsOpen(false); setSourcesOpen(true); }}
                onOpenSettingsPanel={() => { setReviewOpen(false); setSourcesOpen(false); setSettingsOpen(true); }}
                onOpenPromptArchitect={openPromptArchitect}
                lastFailedMessage={lastFailedMessage}
                onRetryLast={lastFailedMessage ? () => { handleSendMessage(lastFailedMessage); setLastFailedMessage(null); } : undefined}
                wizardNode={(
                  <div>
                    {/* Persistent progress */}
                    <button type="button" onClick={()=>setShowWizard(true)} className="w-full px-3 py-2 md:py-3 flex gap-1 items-center cursor-pointer">
                        {(() => {
                          const templateDone = Boolean((articleData as any).template);
                          const sectionLower = String((articleData as any).category || (articleData as any).section || '').toLowerCase();
                          const rawTopic = (articleData as any).topic;
                          const topicsSelected = Array.isArray((articleData as any).topicsSelected)
                            ? (articleData as any).topicsSelected
                            : [];
                          const topicList = Array.isArray(rawTopic)
                            ? rawTopic
                            : typeof rawTopic === 'string'
                              ? rawTopic.split(',').map((t)=>t.trim()).filter(Boolean)
                              : [];
                          const tagList = Array.isArray(articleData.tags) ? articleData.tags : [];
                          const combinedTopics = [...topicList, ...tagList, ...topicsSelected].map((t)=>String(t).trim()).filter(Boolean);
                          const combinedTopicsLower = combinedTopics.map((t)=>t.toLowerCase());
                          const requiresPlatform = sectionLower.includes('serie') || sectionLower.includes('film') || combinedTopicsLower.some((t)=>t.includes('serie') || t.includes('film'));
                          const hasPlatform = Boolean((articleData as any).platform || (articleData as any).streaming_service);
                          const authorDone = Boolean(articleData.author || (articleData as any).authorId);
                          const sectionDone = Boolean((articleData as any).section || articleData.category);
                          const topicDone = topicsSelected.length >=2;
                          const ratingDone = Boolean((articleData as any).rating && Number((articleData as any).rating)>0) || Boolean((articleData as any).ratingSkipped);
                          const pressDone = typeof (articleData as any).press === 'boolean';
                          const segs: boolean[] = [
                            templateDone,
                            authorDone,
                            sectionDone,
                            topicDone
                          ];
                          if (requiresPlatform) {
                            segs.push(hasPlatform);
                          }
                          segs.push(ratingDone);
                          segs.push(pressDone);
                          return segs.map((ok, i)=> (
                            <div key={i} className={`h-1.5 flex-1 rounded ${ok ? 'bg-white shadow-[0_0_10px_#fff]' : 'bg-white/10'}`}></div>
                          ));
                        })()}
                    </button>
                    {/* Animated wizard container */}
                    <div className={`transition-all duration-300 ease-out overflow-x-hidden ${showWizard ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2 max-h-0 overflow-hidden pointer-events-none'}`}>
                      <div className="flex items-center justify-between px-3 py-2 md:p-3" style={{display: showWizard ? 'flex' : 'none'}}>
                      <h2 className="text-white text-base font-medium">
                        <span className="hidden md:inline">Artikel opsætning</span>
                        <span className="md:hidden inline">Setup</span>
                      </h2>
                      <div className="flex items-center gap-2 text-[9px] uppercase tracking-[0.18em]">
                        <div className="flex rounded-full border border-white/20 overflow-hidden bg-white/5">
                          {GENERATION_MODE_OPTIONS.map(option => {
                            const active = activeGenerationMode === option.id;
                            return (
                              <button
                                key={option.id}
                                type="button"
                                aria-pressed={active}
                                title={option.description}
                                onClick={() => {
                                  if (!active) {
                                    updateArticleData({ generationMode: option.id });
                                  }
                                }}
                                className={`px-3 py-1 transition-colors duration-200 ${active ? 'bg-white/90 text-black font-semibold' : 'text-white/60 hover:text-white'}`}
                              >
                                {option.label}
                              </button>
                            );
                          })}
                        </div>
                        <button type="button" onClick={()=>setShowWizard(false)} className="text-white/60 hover:text-white">Skjul</button>
                        </div>
                      </div>
                      <SetupWizard
                        key={`wizard-${newArticleKey}`}
                        initialData={articleData}
                        onChange={handleSetupWizardChange}
                        onComplete={handleSetupWizardComplete}
                      />
                    </div>
                  </div>
                )}
                notes={notes}
                setNotes={setNotes}
                onNewGamingArticle={() => {
                  updateArticleData({
                    title: '',
                    subtitle: '',
                    category: 'Gaming',
                    content: '',
                    tags: ['Gaming', 'Anmeldelse']
                  });
                }}
                onNewCultureArticle={() => {
                  updateArticleData({
                    title: '',
                    subtitle: '',
                    category: 'Kultur',
                    content: '',
                    tags: ['Kultur', 'Anmeldelse']
                  });
                }}
                updateArticleData={updateArticleData}
              />

            </div>
            )}

            {activeView === 'design-editor' && (
            <div
              className="w-full flex-shrink-0 absolute top-0 bottom-0 left-0 md:top-[1%] md:bottom-[1%] md:left-[1%] z-10"
              style={{
                width: isDesktop ? `${chatWidth}px` : '100%',
                transition: isResizing ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                transform: leftPanelOpen ? 'translateX(calc(12px + min(300px, 50vw)))' : 'translateX(0)',
              }}
            >
              {isDesktop && (
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                  }}
                  className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-white/20 transition-colors z-30 group"
                  style={{ touchAction: 'none' }}
                >
                  <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-1 h-16 bg-white/0 group-hover:bg-white/30 rounded-full transition-colors" />
                </div>
              )}
              <DesignEditorView embedMode onBack={() => applyActiveView('ai')} />
            </div>
            )}

            {activeView === 'newsletter' && (
            <div
              className="w-full flex-shrink-0 absolute top-0 bottom-0 left-0 md:top-[1%] md:bottom-[1%] md:left-[1%] z-10"
              style={{
                width: isDesktop ? `${chatWidth}px` : '100%',
                transition: isResizing ? 'none' : 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)',
                transform: leftPanelOpen ? 'translateX(calc(12px + min(300px, 50vw)))' : 'translateX(0)',
              }}
            >
              {isDesktop && (
                <div
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setIsResizing(true);
                  }}
                  className="absolute top-0 bottom-0 right-0 w-1 cursor-col-resize hover:bg-white/20 transition-colors z-30 group"
                  style={{ touchAction: 'none' }}
                >
                  <div className="absolute top-1/2 right-0 -translate-y-1/2 translate-x-1/2 w-1 h-16 bg-white/0 group-hover:bg-white/30 rounded-full transition-colors" />
                </div>
              )}
              <div className="h-full w-full flex flex-col font-poppins rounded-xl bg-black/40 md:bg-black backdrop-blur-xl md:backdrop-blur-0 border border-white/15 overflow-hidden md:outline md:outline-[1.5px] md:outline-offset-[-1.5px] md:outline-zinc-800">
                <NewsletterClient embedded onClose={() => applyActiveView('ai')} />
              </div>
            </div>
            )}

            {/* Layout placeholder for chat width so the mini-menu keeps its placement */}
            {activeView && <div className="hidden md:block flex-shrink-0" style={{ width: isDesktop ? `${chatWidth}px` : '500px', height: '1px' }} />}
            
            {/* Right Sidebar with action buttons (desktop) */}
            {showMiniMenu && <MiniMenu
              translateX={activeView === null
                ? (leftPanelOpen ? `translateX(calc(12px + min(300px, 50vw) + 12px))` : 'translateX(12px)')
                : leftPanelOpen
                  ? `translateX(calc(12px + min(300px, 50vw) + ${chatWidth}px + 12px))` 
                  : `translateX(calc(${chatWidth}px + 12px))`}
              onSearch={() => setShowSearchModal(true)}
              onToggleReview={() => { setSourcesOpen(false); setSettingsOpen(false); if (isNarrowDesktop) { setShelfOpen(false); setWebAppsOpen(false); } setReviewOpen(prev=>!prev); }}
              onToggleWebApps={() => { setShelfOpen(false); setReviewOpen(false); setSourcesOpen(false); setSettingsOpen(false); setWebAppsOpen(prev=>!prev); }}
              onToggleShelf={() => { setWebAppsOpen(false); setReviewOpen(false); setSourcesOpen(false); setSettingsOpen(false); setShelfOpen(prev=>!prev); }}
              onNewArticle={handleNewArticle}
              onToggleSources={() => { setReviewOpen(false); setSettingsOpen(false); setSourcesOpen(prev=>!prev); }}
              onToggleSettings={() => { setReviewOpen(false); setSourcesOpen(false); setSettingsOpen(prev=>!prev); }}
              onOpenPromptArchitect={openPromptArchitect}
            />}

            {/* Right flexible spacer (no overlay) */}
            <div className="flex-1 h-full hidden md:block" />
            
            {/* Floating mini menu removed (we use the original left menu) */}

            {/* Slide-in review drawer (right shelf) with same outer padding as left shelf */}
            <div className={`absolute md:top-[1%] md:bottom-[1%] md:right-[1%] top-0 right-0 bottom-0 ${reviewOpen ? '' : ''} z-50 md:w-[min(520px,90vw)] w-full transition-all duration-300 ${reviewOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[110%] opacity-0 pointer-events-none'}`}>
              <div className="h-full flex flex-col bg-[#171717] md:rounded-xl border-l md:border border-white/20">
                {/* Mobile header with close button */}
                <div className="md:hidden flex items-center justify-between px-4 py-3 border-b border-white/10">
                  <h2 className="text-white font-medium">Artikel preview</h2>
                  <button onClick={() => setReviewOpen(false)} className="text-white/60 hover:text-white">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M18 6L6 18M6 6l12 12"/>
                    </svg>
                  </button>
                </div>
                <div className="overflow-y-auto flex-1 p-3 md:p-[10px] no-scrollbar">
                  <ReviewPanel 
                    key={`${currentDraftId || 'new'}-${articleData?.title || ''}-${articleData?.content?.substring(0, 50) || ''}`}
                    articleData={articleData} 
                    frameless 
                    onUpdateArticle={(updates) => {
                      setArticleData(prev => ({ ...prev, ...updates }));
                    }}
                    onPreflightComplete={(warnings, criticTips, factResults, moderation) => {
                      // Store Preflight data in localStorage so MainChatPanel can access it
                      autoSaveService.save({
                        preflightWarnings: warnings,
                        preflightCriticTips: criticTips,
                        preflightFactResults: factResults,
                        preflightModeration: moderation
                      });
                    }}
                    onRecommendationsApplied={() => {
                      console.log('✅ Recommendations applied callback received');
                    }}
                  />
                </div>
              </div>
            </div>

            {/* Slide-in sources drawer (right shelf) */}
            <div className={`fixed md:absolute inset-0 md:inset-auto md:top-[1%] md:bottom-[1%] md:right-[1%] z-50 md:w-[min(380px,90vw)] transition-all duration-300 ${sourcesOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[110%] opacity-0 pointer-events-none'}`}>
              <SourcesPanel isOpen={sourcesOpen} onClose={() => setSourcesOpen(false)} />
            </div>

            {/* Slide-in settings drawer (right shelf) */}
            <div className={`fixed md:absolute inset-0 md:inset-auto md:top-[1%] md:bottom-[1%] md:right-[1%] z-50 md:w-[min(380px,90vw)] transition-all duration-300 ${settingsOpen ? 'translate-x-0 opacity-100 pointer-events-auto' : 'translate-x-[110%] opacity-0 pointer-events-none'}`}>
              <SettingsPanel
                isOpen={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                splineSelectedId={selectedSplineBg}
                onSplineBgChange={handleSplineBgChange}
              />
            </div>

          </>
        )}
                </div>
    </>
  );
}
