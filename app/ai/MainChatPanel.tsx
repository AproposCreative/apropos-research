'use client';

import { useState, useRef, useEffect, ReactNode, useCallback, useMemo } from 'react';
import WizardAutoHeight from '@/components/ui/WizardAutoHeight';
import FileDropZone from '@/components/FileDropZone';
import ArticleTemplates from '@/components/ArticleTemplates';
import AuthorSelection from '@/components/AuthorSelection';
import ArticleSuggestions from '@/components/ArticleSuggestions';
import ArticlePicker from '@/components/ArticlePicker';
import CategorySelection from '@/components/CategorySelection';
import { WebflowAuthor } from '@/lib/webflow-service';
import { useAuth } from '@/lib/auth-context';
import { type UploadedFile, uploadImportImage, isImageFile } from '@/lib/file-upload-service';
import PreflightRecommendations from '@/components/PreflightRecommendations';
import PreflightStatus from '@/components/PreflightStatus';
import type { ThinkingStep, ThinkingStatus } from '@/types/thinking';
import { THINKING_TEXTS } from '@/components/main-chat/constants';
import type { ChatMessage, LocalArticleData } from '@/components/main-chat/types';

interface MainChatPanelProps {
  messages: ChatMessage[];
  setChatMessages: (messages: ChatMessage[]) => void;
  onSendMessage: (message: string, files?: UploadedFile[]) => void;
  articleData: LocalArticleData;
  isThinking?: boolean;
  thinkingSteps?: ThinkingStep[];
  wizardNode?: ReactNode; // optional docket wizard rendered above input
  notes: string;
  setNotes: (notes: string) => void;
  onNewGamingArticle: () => void;
  onNewCultureArticle: () => void;
  updateArticleData: (data: Partial<LocalArticleData>) => void;
  chatTitle: string;
  onChatTitleChange: (title: string) => void;
  editorialWarnings: string[];
  onClearEditorialWarnings: () => void;
  onNewArticle?: () => void;
  onOpenDraftsPanel?: () => void;
  onOpenReviewPanel?: () => void;
  onClose?: () => void;
  onOpenSourcesPanel?: () => void;
  onOpenSettingsPanel?: () => void;
  onOpenPromptArchitect?: () => void;
  lastFailedMessage?: string | null;
  onRetryLast?: () => void;
  /** "Importér artikel"-template aktiv — åbner dropzone + kræver 3 billeder. */
  importMode?: boolean;
  /** Ægte Storage-URLs + filnavne for de uploadede import-billeder (hero, body1, body2). */
  importImages?: { url: string; name: string }[];
  onImportImagesChange?: (images: { url: string; name: string }[]) => void;
  /** Router import-afsendelse til AIWriterClient.handleImportArticle. */
  onImportSubmit?: (text: string, images: { url: string; name: string }[]) => void;
}

export default function MainChatPanel({
  messages,
  setChatMessages,
  onSendMessage,
  articleData,
  isThinking,
  thinkingSteps = [],
  wizardNode,
  notes,
  setNotes,
  onNewGamingArticle,
  onNewCultureArticle,
  updateArticleData,
  chatTitle,
  onChatTitleChange,
  editorialWarnings,
  onClearEditorialWarnings,
  onNewArticle,
  onOpenDraftsPanel,
  onOpenReviewPanel,
  onClose,
  onOpenSourcesPanel,
  onOpenSettingsPanel,
  onOpenPromptArchitect,
  lastFailedMessage = null,
  onRetryLast,
  importMode = false,
  importImages = [],
  onImportImagesChange,
  onImportSubmit,
}: MainChatPanelProps) {
  const { user, logout } = useAuth();
  const [inputMessage, setInputMessage] = useState('');
  const [hoveredMessage, setHoveredMessage] = useState<string | null>(null);
  const [editingMessage, setEditingMessage] = useState<string | null>(null);
  const [editContent, setEditContent] = useState('');
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [showFileDrop, setShowFileDrop] = useState(false);
  const [importUploading, setImportUploading] = useState(false);
  const [importSubmitAttempted, setImportSubmitAttempted] = useState(false);
  const importAttemptTimeoutRef = useRef<number | null>(null);
  const [showUrlInput, setShowUrlInput] = useState(false);
  const [urlInputValue, setUrlInputValue] = useState('');
  const urlInputRef = useRef<HTMLInputElement>(null);
  const [urlLoading, setUrlLoading] = useState(false);
  const [urlError, setUrlError] = useState('');
  const [attachedSources, setAttachedSources] = useState<Array<{ url: string; title: string; text: string }>>([]);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  // const [showAISuggestions, setShowAISuggestions] = useState(false);
  const [selectedText, setSelectedText] = useState('');
  const [selectionStep, setSelectionStep] = useState<'category' | 'template' | 'author' | 'chat'>('category');
  const [selectedCategory, setSelectedCategory] = useState<any>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<any>(null);
  const [selectedAuthor, setSelectedAuthor] = useState<WebflowAuthor | null>(null);
  const [showArticlePicker, setShowArticlePicker] = useState(false);
  const [trendingTemplate, setTrendingTemplate] = useState<any>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const autoSaveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const messageListRef = useRef<HTMLDivElement>(null);
  const [messageScrollFade, setMessageScrollFade] = useState(false);
  const [thinkingText, setThinkingText] = useState('Finder vinklen…');
  const [fadeIn, setFadeIn] = useState(true);
  const [thinkingProgress, setThinkingProgress] = useState(0);
  const progressIntervalRef = useRef<number | null>(null);
  const [visibleSteps, setVisibleSteps] = useState<Set<string>>(new Set());
  const [stepOpacities, setStepOpacities] = useState<Map<string, number>>(new Map());
  const stepAnimationTimeoutsRef = useRef<Map<string, number>>(new Map());
  const previousStepsRef = useRef<ThinkingStep[]>([]);
  const progressResetTimeoutRef = useRef<number | null>(null);
  const progressDisplay = Math.min(100, Math.max(0, Math.round(thinkingProgress)));
  const [mobileWizardCollapsed, setMobileWizardCollapsed] = useState<boolean>((messages?.length || 0) > 0);
  const inputContainerRef = useRef<HTMLDivElement | null>(null);
  const [inputSpacerHeight, setInputSpacerHeight] = useState(0);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [mobileMenuVisible, setMobileMenuVisible] = useState(false);
  const openMobileMenu = () => {
    setMobileMenuVisible(true);
    // allow next paint so transition runs
    requestAnimationFrame(() => setMobileMenuOpen(true));
  };
  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    window.setTimeout(() => setMobileMenuVisible(false), 320);
  };

  useEffect(() => {
    if (!mobileMenuVisible) return;
    const originalOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = originalOverflow;
    };
  }, [mobileMenuVisible]);

  useEffect(() => {
    const updateHeight = () => {
      if (!inputContainerRef.current) {
        setInputSpacerHeight(0);
        return;
      }
      const isDesktop = typeof window !== 'undefined' && window.innerWidth >= 768;
      if (isDesktop) {
        setInputSpacerHeight(0);
        return;
      }
      const rect = inputContainerRef.current.getBoundingClientRect();
      setInputSpacerHeight(rect.height);
    };

    updateHeight();

    let resizeObserver: ResizeObserver | null = null;
    const hasWindow = typeof window !== 'undefined';

    if (hasWindow) {
      window.addEventListener('resize', updateHeight);
      if (typeof ResizeObserver !== 'undefined' && inputContainerRef.current) {
        resizeObserver = new ResizeObserver(() => updateHeight());
        resizeObserver.observe(inputContainerRef.current);
      }
    }

    return () => {
      if (hasWindow) {
        window.removeEventListener('resize', updateHeight);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
    };
  }, [wizardNode, mobileWizardCollapsed, showFileDrop, inputMessage]);

const fallbackThinkingSteps: ThinkingStep[] = [
  { id: 'prepare', label: 'Forbereder prompt…', status: 'active', icon: 'dot' },
  { id: 'generation', label: 'Afventer modelsvar…', status: 'pending', icon: 'dot' }
];

  const isFastMode = articleData?.generationMode === 'fast';
  const showThinkingTimeline = isThinking && !isFastMode;
  const showSimpleThinkingIndicator = isThinking && isFastMode;

  // Memoize stepsToRender to prevent unnecessary re-renders
  const stepsToRender = useMemo(() => {
    if (!showThinkingTimeline) return [];
    return thinkingSteps.length > 0 ? thinkingSteps : fallbackThinkingSteps;
  }, [showThinkingTimeline, thinkingSteps]);

  // Track visible steps with animation
  useEffect(() => {
    if (!showThinkingTimeline || stepsToRender.length === 0) {
      // Only reset if we actually have visible steps
      setVisibleSteps(prev => {
        if (prev.size === 0) return prev;
        return new Set();
      });
      setStepOpacities(prev => {
        if (prev.size === 0) return prev;
        return new Map();
      });
      // Cleanup timeouts
      stepAnimationTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      stepAnimationTimeoutsRef.current.clear();
      previousStepsRef.current = [];
      return;
    }

    // Create a stable comparison key from steps
    const stepsKey = stepsToRender.map(s => `${s.id}:${s.status}`).join('|');
    const previousKey = previousStepsRef.current.map(s => `${s.id}:${s.status}`).join('|');
    
    // Check if steps have actually changed
    if (stepsKey === previousKey) {
      return;
    }

    const previousSteps = previousStepsRef.current;
    previousStepsRef.current = stepsToRender.map(s => ({ ...s })); // Store a deep copy

    const newVisibleSteps = new Set<string>();
    const newOpacities = new Map<string, number>();

    // Process steps to determine visibility and opacities
    stepsToRender.forEach((step) => {
      // Show step when it becomes active or completed
      if (step.status === 'active' || step.status === 'completed') {
        newVisibleSteps.add(step.id);
        
        // Check if this is a newly visible step by comparing with previous steps
        const previousStep = previousSteps.find(s => s.id === step.id);
        const wasVisible = previousStep && (previousStep.status === 'active' || previousStep.status === 'completed');
        
        if (!wasVisible) {
          // New step - start with 0 opacity
          newOpacities.set(step.id, 0);
          // Clear any existing timeout for this step
          const existingTimeout = stepAnimationTimeoutsRef.current.get(step.id);
          if (existingTimeout) {
            clearTimeout(existingTimeout);
          }
          // Trigger animation after a brief delay to allow CSS transition
          const timeoutId = window.setTimeout(() => {
            setStepOpacities(prev => {
              const updated = new Map(prev);
              updated.set(step.id, 1);
              return updated;
            });
            stepAnimationTimeoutsRef.current.delete(step.id);
          }, 50);
          stepAnimationTimeoutsRef.current.set(step.id, timeoutId);
        }
      }
    });

    // Only update state if there are actual changes
    setVisibleSteps(prev => {
      const prevArray = Array.from(prev).sort();
      const newArray = Array.from(newVisibleSteps).sort();
      if (prevArray.length === newArray.length && prevArray.every((id, i) => id === newArray[i])) {
        return prev; // No change, return previous state
      }
      return newVisibleSteps;
    });

    // Update opacities - preserve existing opacities for steps that are still visible
    setStepOpacities(prev => {
      const updated = new Map(prev);
      let hasChanges = false;
      
      newOpacities.forEach((value, key) => {
        if (prev.get(key) !== value) {
          updated.set(key, value);
          hasChanges = true;
        }
      });
      
      // Keep existing opacities for steps that are still visible but weren't just added
      stepsToRender.forEach((step) => {
        if ((step.status === 'active' || step.status === 'completed') && !newOpacities.has(step.id)) {
          const existingOpacity = prev.get(step.id);
          if (existingOpacity === undefined) {
            updated.set(step.id, 1);
            hasChanges = true;
          }
        }
      });
      
      // Only return new map if there are changes
      if (!hasChanges && updated.size === prev.size) {
        return prev;
      }
      return updated;
    });

    // Cleanup function
    return () => {
      stepAnimationTimeoutsRef.current.forEach(timeoutId => clearTimeout(timeoutId));
      stepAnimationTimeoutsRef.current.clear();
    };
  }, [showThinkingTimeline, stepsToRender]);

  const getStepTextClass = (status: ThinkingStatus) => {
    switch (status) {
      case 'active':
        return 'text-white';
      case 'completed':
        return 'text-white/70';
      default:
        return 'text-white/45';
    }
  };

  const getStepOpacity = (stepId: string) => {
    return stepOpacities.get(stepId) ?? 0;
  };

  const scrollToBottom = () => {
    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
      // Also scroll the message list container to ensure visibility
      if (messageListRef.current) {
        messageListRef.current.scrollTop = messageListRef.current.scrollHeight;
      }
    });
  };

  useEffect(() => {
    // Scroll to bottom when messages change or when thinking stops (AI finished responding)
    const scrollTimeout = setTimeout(() => {
      scrollToBottom();
    }, 100); // Small delay to ensure DOM is updated
    
    // Reset title if no messages
    if (messages.length === 0 && chatTitle !== 'Ny artikkel') {
      onChatTitleChange('Ny artikkel');
    }
    
    // Generate chat title from first user message using AI
    if (messages.length > 0 && chatTitle === 'Ny artikkel') {
      const firstUserMessage = messages.find(msg => msg.role === 'user');
      if (firstUserMessage) {
        generateSmartTitle(firstUserMessage.content);
      }
    }
    
    return () => clearTimeout(scrollTimeout);
  }, [messages, chatTitle, isThinking]);

  // Reset selection step when messages are cleared (new article)
  useEffect(() => {
    if (messages.length === 0) {
      setSelectionStep('category');
      setSelectedCategory(null);
      setSelectedTemplate(null);
      setSelectedAuthor(null);
      setShowArticlePicker(false);
      setTrendingTemplate(null);
    }
  }, [messages.length]);

  useEffect(() => {
    if (!isThinking) return;
    let isMounted = true;
    let timeoutId: number | null = null;
    const pick = () => THINKING_TEXTS[Math.floor(Math.random() * THINKING_TEXTS.length)];
    setThinkingText(pick());
    setFadeIn(true);

    const interval = window.setInterval(() => {
      if (!isMounted) return;
      setFadeIn(false);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
      timeoutId = window.setTimeout(() => {
        if (!isMounted) return;
        setThinkingText(pick());
        setFadeIn(true);
      }, 260);
    }, 2200);

    return () => {
      isMounted = false;
      window.clearInterval(interval);
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [isThinking]);

  useEffect(() => {
    // Sync collapsed state with whether there are messages
    setMobileWizardCollapsed((messages?.length || 0) > 0);
  }, [messages?.length]);

  useEffect(() => {
    if (progressIntervalRef.current !== null) {
      window.clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (progressResetTimeoutRef.current !== null) {
      window.clearTimeout(progressResetTimeoutRef.current);
      progressResetTimeoutRef.current = null;
    }

    if (isThinking) {
      let progress = 0;
      setThinkingProgress(progress);
      const advance = () => {
        // Slow down as we approach 96% to avoid getting stuck
        const remaining = 96 - progress;
        const increment = remaining > 10 ? 6 + Math.random() * 9 : 1 + Math.random() * 2;
        progress = Math.min(96, progress + increment);
        setThinkingProgress(Math.round(progress));
      };
      advance();
      progressIntervalRef.current = window.setInterval(advance, 600);
    } else {
      setThinkingProgress((prev) => (prev === 0 ? 0 : 100));
      progressResetTimeoutRef.current = window.setTimeout(() => {
        setThinkingProgress(0);
        progressResetTimeoutRef.current = null;
      }, 500);
    }

    return () => {
      if (progressIntervalRef.current !== null) {
        window.clearInterval(progressIntervalRef.current);
        progressIntervalRef.current = null;
      }
      if (progressResetTimeoutRef.current !== null) {
        window.clearTimeout(progressResetTimeoutRef.current);
        progressResetTimeoutRef.current = null;
      }
    };
  }, [isThinking]);

  const updateMessageScrollFade = useCallback(() => {
    const node = messageListRef.current;
    if (!node) return;
    setMessageScrollFade(node.scrollTop > 4);
  }, []);

  useEffect(() => {
    if (showUrlInput) {
      setTimeout(() => urlInputRef.current?.focus(), 100);
    } else {
      setUrlInputValue('');
    }
  }, [showUrlInput]);

  // Auto-save functionality
  const saveToLocalStorage = () => {
    try {
      const chatData = {
        messages,
        chatTitle,
        notes,
        articleData,
        lastModified: new Date().toISOString()
      };
      localStorage.setItem('ai-writer-draft', JSON.stringify(chatData));
      setLastSaved(new Date());
    } catch (error) {
      console.error('Failed to save draft:', error);
    }
  };

  const loadFromLocalStorage = () => {
    try {
      const savedData = localStorage.getItem('ai-writer-draft');
      if (savedData) {
        const parsed = JSON.parse(savedData);
        if (parsed.messages && Array.isArray(parsed.messages)) {
          // Convert timestamp strings back to Date objects
          const messagesWithDates = parsed.messages.map((msg: any) => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          
          // Update parent component with loaded data
          if (parsed.messages.length > 0) {
            // Note: This would need to be passed up to parent component
            // For now, we'll just set the chat title
            if (parsed.chatTitle && parsed.chatTitle !== 'Ny artikkel') {
              onChatTitleChange(parsed.chatTitle);
            }
          }
        }
      }
    } catch (error) {
      console.error('Failed to load draft:', error);
    }
  };

  // Auto-save when messages change (with debounce)
  useEffect(() => {
    if (messages.length > 0) {
      // Clear existing timeout
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
      
      // Set new timeout for auto-save (2 seconds after last change)
      autoSaveTimeoutRef.current = setTimeout(() => {
        setIsAutoSaving(true);
        saveToLocalStorage();
        setTimeout(() => setIsAutoSaving(false), 1000); // Show saving indicator for 1 second
      }, 2000);
    }

    // Cleanup timeout on unmount
    return () => {
      if (autoSaveTimeoutRef.current) {
        clearTimeout(autoSaveTimeoutRef.current);
      }
    };
  }, [messages, chatTitle, notes, articleData]);

  // Load saved data on component mount
  useEffect(() => {
    loadFromLocalStorage();
  }, []);

  // Add text selection listener
  useEffect(() => {
    document.addEventListener('mouseup', handleTextSelection);
    return () => {
      document.removeEventListener('mouseup', handleTextSelection);
    };
  }, []);

  useEffect(() => {
    const node = messageListRef.current;
    if (!node) return;
    updateMessageScrollFade();
    const onScroll = () => updateMessageScrollFade();
    node.addEventListener('scroll', onScroll, { passive: true });
    return () => node.removeEventListener('scroll', onScroll);
  }, [updateMessageScrollFade]);

  useEffect(() => {
    updateMessageScrollFade();
  }, [messages.length, updateMessageScrollFade]);

  const runPreflightChecks = async (title: string, content: string) => {
    try {
      console.log('🔍 Running Preflight checks...');
      setPreflightRunning(true);
      setPreflightCompleted(false);
      setPreflightCurrentStep(0);
      setPreflightStepName('Starter analyse...');
      
      const warnings: string[] = [];
      
      // Step 1: Moderation check
      setPreflightCurrentStep(1);
      setPreflightStepName('Moderation Check');
      const modRes = await fetch('/api/moderation/check', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, content })
      }).then(r => r.ok ? r.json() : null);
      
      if (modRes) {
        setPreflightModeration(modRes);
        if (modRes.metrics?.plagiarismRisk === 'high') {
          warnings.push('Høj lighed med eksisterende tekst. Omskriv før publicering.');
        }
      }
      
      // Step 2: Critic TOV check
      setPreflightCurrentStep(2);
      setPreflightStepName('TOV Analysis');
      const criticRes = await fetch('/api/critic/tov', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      }).then(r => r.ok ? r.json() : null);
      
      if (criticRes && criticRes.tips) {
        setPreflightCriticTips(criticRes.tips);
      }
      
      // Step 3: Fact check
      setPreflightCurrentStep(3);
      setPreflightStepName('Fact Check');
      const factRes = await fetch('/api/factcheck', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content })
      }).then(r => r.ok ? r.json() : null);
      
      if (factRes && factRes.results) {
        setPreflightFactResults(factRes.results);
        const unknown = factRes.results.filter((x: any) => x.status !== 'true');
        if (unknown.length > 0) {
          warnings.push('Nogle påstande er ikke verificeret. Overvej at tilføje kilder eller omformulere.');
        }
      }
      
      setPreflightWarnings(warnings);
      setPreflightRunning(false);
      setPreflightStepName('Færdig!');
      setPreflightCompleted(true);
      
      // Auto-apply recommendations if any issues found
      if (warnings.length > 0 || criticRes?.tips || (factRes?.results && factRes.results.length > 0)) {
        console.log('🔄 Auto-applying Preflight recommendations...');
        
        const improvements: string[] = [];
        
        // Add critical fixes
        if (warnings.length > 0) {
          improvements.push(`KRITISK: Fix disse problemer:\n${warnings.map(w => `• ${w}`).join('\n')}`);
        }
        
        // Add fact check improvements
        if (factRes?.results) {
          const unverified = factRes.results.filter((x: any) => x.status !== 'true');
          if (unverified.length > 0) {
            improvements.push(`Fakta forbedringer: Tilføj kilder eller omformulér:\n${unverified.map(f => `• "${f.claim}"`).join('\n')}`);
          }
        }
        
        // Add TOV improvements
        if (criticRes?.tips) {
          improvements.push(`TOV forbedring: ${criticRes.tips}`);
        }
        
        if (improvements.length > 0) {
          const message = `Anvend disse Preflight anbefalinger automatisk:\n\n${improvements.join('\n\n')}\n\nForbedre artiklen med fokus på disse punkter, men behold den samme struktur og længde.`;
          onSendMessage(message);
        }
      }
      
      console.log('✅ Preflight checks completed:', { warnings: warnings.length, hasCriticTips: !!criticRes?.tips, factResults: factRes?.results?.length || 0 });
    } catch (error) {
      console.error('Error running preflight checks:', error);
      setPreflightRunning(false);
      setPreflightStepName('Fejl opstod');
    }
  };

  const handleRequestExpansion = () => {
    if (!articleData.content || isThinking) return;
    onSendMessage('Udvid artiklen med flere detaljer, scener og sanselige observationer – behold titel og struktur, men løft længden og dybden.');
  };

  const generateSmartTitle = async (message: string) => {
    // Lightweight local generation to avoid hitting the chat API with an incompatible payload
    onChatTitleChange(generateFallbackTitle(message));
  };

  const generateFallbackTitle = (message: string) => {
    // Extract key words and create a short title
    const words = message.toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter(word => word.length > 3);
    
    // Take first 2-3 meaningful words
    const titleWords = words.slice(0, 3);
    
    if (titleWords.length === 0) return 'Ny artikel';
    
    return titleWords
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const text = inputMessage.trim();

    // Importér artikel: kræv tekst + præcis 3 billeder før afsendelse.
    if (importMode) {
      if (!text || importImages.length !== 3) {
        flashImportInvalid();
        setShowFileDrop(true);
        return;
      }
      onImportSubmit?.(text, importImages);
      setInputMessage('');
      return;
    }

    if (!text && attachedSources.length === 0) return;
    let fullMessage = text;
    if (attachedSources.length > 0) {
      const sourcesBlock = attachedSources.map(s =>
        `Kilde: ${s.title} (${s.url})\n---\n${s.text}\n---`
      ).join('\n\n');
      fullMessage = text
        ? `Brug disse kilder KUN som inspiration — aldrig kopiér direkte:\n\n${sourcesBlock}\n\nParafrasér altid. Brugerens instruktion:\n${text}`
        : `Brug disse kilder KUN som inspiration — aldrig kopiér direkte:\n\n${sourcesBlock}\n\nParafrasér altid.`;
      setAttachedSources([]);
    }
    onSendMessage(fullMessage);
    setInputMessage('');
  };

  const handleEditMessage = (messageId: string, content: string) => {
    setEditingMessage(messageId);
    setEditContent(content);
  };

  const handleSaveEdit = async () => {
    if (!editingMessage || !editContent.trim()) return;
    
    // Find the message index
    const messageIndex = messages.findIndex(msg => msg.id === editingMessage);
    if (messageIndex === -1) return;
    
    // If this was a user message, we need to re-run AI with updated context
    if (messages[messageIndex].role === 'user') {
      // Remove all messages after the edited message (including AI responses)
      const messagesUpToEdit = messages.slice(0, messageIndex);
      
      // Update the edited message content
      const updatedMessages = [...messagesUpToEdit];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: editContent.trim()
      };
      
      // Update messages state to show only messages up to the edit
      setChatMessages(messagesUpToEdit);
      
      // Clear editing state
      setEditingMessage(null);
      setEditContent('');
      
      // Re-run AI with the updated message and correct history
      await onSendMessage(editContent.trim());
    } else {
      // For assistant messages, just update the content
      const updatedMessages = [...messages];
      updatedMessages[messageIndex] = {
        ...updatedMessages[messageIndex],
        content: editContent.trim()
      };
      
      setChatMessages(updatedMessages);
      setEditingMessage(null);
      setEditContent('');
    }
  };

  const handleCancelEdit = () => {
    setEditingMessage(null);
    setEditContent('');
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (inputMessage.trim() || attachedSources.length > 0) {
        handleSubmit();
      }
    }
  };

  const copyToClipboard = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // Show temporary success feedback
      const tempElement = document.createElement('div');
      tempElement.textContent = 'Kopieret!';
      tempElement.className = 'fixed top-4 right-4 bg-green-600 text-white px-3 py-2 rounded-lg text-sm z-50';
      document.body.appendChild(tempElement);
      setTimeout(() => {
        document.body.removeChild(tempElement);
      }, 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  const handlePreflightComplete = (warnings: string[], criticTips: string, factResults: any[], moderation: any) => {
    // Update state with Preflight results
    setPreflightWarnings(warnings);
    setPreflightCriticTips(criticTips);
    setPreflightFactResults(factResults);
    setPreflightModeration(moderation);
    
    console.log('📋 Preflight results received:', { warnings: warnings.length, hasCriticTips: !!criticTips, factResults: factResults.length });
  };

  const handleApplyPreflightRecommendations = async () => {
    try {
      console.log('🔧 Applying Preflight recommendations...');
      
      // Collect all recommendations into a single message
      const recommendations: string[] = [];
      
      if (preflightWarnings.length > 0) {
        recommendations.push(...preflightWarnings);
      }
      
      if (preflightCriticTips) {
        recommendations.push(`TOV forbedring: ${preflightCriticTips}`);
      }
      
      if (preflightFactResults && preflightFactResults.length > 0) {
        const unverified = preflightFactResults.filter((x: any) => x.status !== 'true');
        if (unverified.length > 0) {
          recommendations.push(`Fakta verificering: ${unverified.length} påstande skal verificeres`);
        }
      }
      
      if (recommendations.length > 0) {
        const message = `Anvend disse Preflight anbefalinger på artiklen:\n\n${recommendations.map(r => `• ${r}`).join('\n')}\n\nOmskriv artiklen med disse forbedringer og behold den samme struktur og længde.`;
        console.log('📤 Sending message to AI:', message.substring(0, 100) + '...');
        onSendMessage(message);
      } else {
        console.log('⚠️ No recommendations to apply');
      }
    } catch (error) {
      console.error('Error applying preflight recommendations:', error);
    }
  };

  const handleApplyCriticalFixes = async () => {
    try {
      const criticalIssues: string[] = [];
      
      // Only collect critical issues
      if (preflightWarnings.some(w => w.toLowerCase().includes('høj lighed') || w.toLowerCase().includes('plagiat'))) {
        criticalIssues.push('Omskriv teksten for at undgå plagiat og sikre originalitet');
      }
      
      if (criticalIssues.length > 0) {
        const message = `KRITISK: Fix disse problemer i artiklen:\n\n${criticalIssues.map(r => `• ${r}`).join('\n')}\n\nOmskriv de relevante dele af artiklen og behold den samme struktur.`;
        onSendMessage(message);
      }
    } catch (error) {
      console.error('Error applying critical fixes:', error);
    }
  };

  const handleApplyImprovements = async () => {
    try {
      const improvements: string[] = [];
      
      if (preflightCriticTips) {
        improvements.push(`TOV forbedring: ${preflightCriticTips}`);
      }
      
      if (improvements.length > 0) {
        const message = `Anvend disse forbedringer på artiklen:\n\n${improvements.map(r => `• ${r}`).join('\n')}\n\nForbedre artiklen med fokus på tone og stil, men behold den samme struktur og længde.`;
        onSendMessage(message);
      }
    } catch (error) {
      console.error('Error applying improvements:', error);
    }
  };

  // One-click auto-fix functions
  const handleAutoFixPlagiarism = () => {
    const message = `KRITISK: Fix plagiat problemer. Omskriv alle dele af teksten der har høj lighed med eksisterende indhold. Brug dine egne ord og perspektiv.`;
    onSendMessage(message);
  };

  const handleAutoFixFacts = () => {
    const unverifiedFacts = preflightFactResults?.filter(x => x.status !== 'true') || [];
    if (unverifiedFacts.length === 0) return;
    
    const factList = unverifiedFacts.map(f => `- "${f.claim}"`).join('\n');
    const message = `Fix fakta problemer. Tilføj kilder eller omformulér disse påstande:\n${factList}`;
    onSendMessage(message);
  };

  const handleAutoFixTOV = () => {
    if (!preflightCriticTips) return;
    
    const message = `Forbedr tone of voice: ${preflightCriticTips}`;
    onSendMessage(message);
  };



  const handleFileUploaded = (file: UploadedFile, content?: string) => {
    setUploadedFiles(prev => [...prev, file]);
    
    // Auto-send message with file info
    const fileMessage = content 
      ? `Jeg har uploadet en fil: ${file.name}\n\nIndhold:\n${content}`
      : `Jeg har uploadet en fil: ${file.name}`;
    
    onSendMessage(fileMessage, [file]);
    setShowFileDrop(false);
  };

  // Importér artikel: åbn upload-vinduet automatisk når templaten aktiveres.
  useEffect(() => {
    if (importMode) setShowFileDrop(true);
  }, [importMode]);

  /** Trigger et kraftigt rødt blink på dropzonen (fx blokeret afsendelse). */
  const flashImportInvalid = useCallback(() => {
    setImportSubmitAttempted(true);
    if (importAttemptTimeoutRef.current) window.clearTimeout(importAttemptTimeoutRef.current);
    importAttemptTimeoutRef.current = window.setTimeout(() => setImportSubmitAttempted(false), 1600);
  }, []);

  /** Upload rå import-billeder som ægte Storage-URLs (max 3, hero først). */
  const handleImportRawFiles = useCallback(async (files: File[]) => {
    if (!user) {
      handleFileError('Du skal være logget ind for at uploade billeder.');
      return;
    }
    const imageFiles = files.filter(isImageFile);
    if (imageFiles.length === 0) {
      handleFileError('Vælg billedfiler (jpg, png, webp).');
      return;
    }
    const remaining = Math.max(0, 3 - importImages.length);
    if (remaining === 0) {
      handleFileError('Du har allerede tilføjet 3 billeder. Fjern et før du tilføjer et nyt.');
      return;
    }
    const toUpload = imageFiles.slice(0, remaining);
    setImportUploading(true);
    try {
      const uploaded: { url: string; name: string }[] = [];
      for (const file of toUpload) {
        if (file.size > 15 * 1024 * 1024) {
          handleFileError(`"${file.name}" er for stor (max 15MB).`);
          continue;
        }
        try {
          const url = await uploadImportImage(file, user.uid);
          uploaded.push({ url, name: file.name });
        } catch (err) {
          console.error('Import image upload failed:', err);
          handleFileError(`Kunne ikke uploade "${file.name}". Prøv igen.`);
        }
      }
      if (uploaded.length > 0) {
        onImportImagesChange?.([...importImages, ...uploaded].slice(0, 3));
      }
    } finally {
      setImportUploading(false);
    }
  }, [user, importImages, onImportImagesChange]);

  const removeImportImage = useCallback((index: number) => {
    onImportImagesChange?.(importImages.filter((_, i) => i !== index));
  }, [importImages, onImportImagesChange]);

  const handleUrlFetch = async () => {
    const url = urlInputValue.trim();
    if (!url) return;
    try { new URL(url); } catch { setUrlError('Ugyldig URL'); return; }

    setUrlLoading(true);
    setUrlError('');
    try {
      const res = await fetch('/api/extract-url', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url }),
      });
      const data = await res.json();
      if (!res.ok) {
        setUrlError(data.error || 'Kunne ikke hente URL');
        return;
      }
      setAttachedSources(prev => [...prev, { url: data.url, title: data.title, text: data.text }]);
      setShowUrlInput(false);
      setUrlInputValue('');
    } catch {
      setUrlError('Netværksfejl — prøv igen');
    } finally {
      setUrlLoading(false);
    }
  };

  const handleFileError = (error: string) => {
    // Show error notification
    const tempElement = document.createElement('div');
    tempElement.textContent = error;
    tempElement.className = 'fixed top-4 right-4 bg-red-600 text-white px-3 py-2 rounded-lg text-sm z-50';
    document.body.appendChild(tempElement);
    setTimeout(() => {
      document.body.removeChild(tempElement);
    }, 3000);
  };

  const handleTextSelection = () => {
    const selection = window.getSelection();
    if (selection && selection.toString().trim().length > 10) {
      setSelectedText(selection.toString().trim());
      // AI suggestions disabled
    }
  };

  const handleSuggestionSelect = (suggestion: string) => {
    // Replace the selected text with the suggestion
    const selection = window.getSelection();
    if (selection && selection.rangeCount > 0) {
      const range = selection.getRangeAt(0);
      range.deleteContents();
      range.insertNode(document.createTextNode(suggestion));
      selection.removeAllRanges();
    }
    // AI suggestions disabled
    setSelectedText('');
  };

  // Parse assistant message for numbered suggestions like "1. **Title**: description"
  const parseNumberedSuggestions = (text: string) => {
    const lines = text.split(/\r?\n/);
    const items: Array<{ title: string; description: string; full: string }>=[];
    // Use RegExp constructor to avoid parser issues on some environments
    const re = new RegExp('^\\s*\\d+\\.\\s+\\*\\*(.+?)\\*\\*\\s*:\\s*(.*)$');
    for (const line of lines) {
      const m = line.match(re);
      if (m) {
        const title = m[1].trim();
        const description = m[2].trim();
        items.push({ title, description, full: `${title}: ${description}` });
      }
    }
    return items;
  };

  // Detect enumererede spørgsmål (1), 2), 3)) og klassificér dem, så vi kan vise klikbare valg
  type ParsedQuestion = { kind: 'authorProfile' | 'platform' | 'rating'; label: string };
  const parseEnumeratedQuestions = (text: string): ParsedQuestion[] => {
    const lines = text.split(/\r?\n/).map(s => s.trim());
    const q: ParsedQuestion[] = [];
    for (const line of lines) {
      // Use RegExp constructor to avoid parser issues on some environments
      const m = line.match(new RegExp('^\\d+[\\).]\\s*(.+)$'));
      if (!m) continue;
      const body = m[1].toLowerCase();
      if (/forfatterprofil|tov|ironisk|sanselig|analytisk|profil/.test(body)) {
        q.push({ kind: 'authorProfile', label: m[1] });
        continue;
      }
      if (/platform|netflix|viaplay|disney|prime|apple|hbo|max|biograf/.test(body)) {
        q.push({ kind: 'platform', label: m[1] });
        continue;
      }
      if (/stjerner|rating|vurdering/.test(body)) {
        q.push({ kind: 'rating', label: m[1] });
        continue;
      }
    }
    return q;
  };

  // Preflight state
  const [preflightWarnings, setPreflightWarnings] = useState<string[]>([]);
  const [preflightModeration, setPreflightModeration] = useState<any | null>(null);
  const [preflightCriticTips, setPreflightCriticTips] = useState<string>('');
  const [preflightFactResults, setPreflightFactResults] = useState<any[] | null>(null);
  const [preflightCompleted, setPreflightCompleted] = useState(false);
  
  // Preflight status tracking
  const [preflightRunning, setPreflightRunning] = useState(false);
  const [preflightCurrentStep, setPreflightCurrentStep] = useState(0);
  const [preflightStepName, setPreflightStepName] = useState('');

  useEffect(() => {
    setPreflightCompleted(false);
    setPreflightWarnings([]);
    setPreflightModeration(null);
    setPreflightCriticTips('');
    setPreflightFactResults(null);
  }, [articleData.content]);

  // Removed generic multiple-choice heuristics to avoid irrelevant prompts

  const handleCategorySelect = (category: any) => {
    setSelectedCategory(category);
    setSelectionStep('template');
    
    // Update article data with category info
    updateArticleData({
      title: '',
      subtitle: '',
      category: category.name,
      tags: [category.name],
      platform: ''
    });
  };

  const handleTrendingCategorySelect = (category: any, articles: any[]) => {
    setSelectedCategory(category);
    setShowArticlePicker(true);
    setTrendingTemplate({
      id: `trending-${category.name.toLowerCase()}`,
      name: `Trending ${category.name}`,
      category: category.name,
      articles: articles,
      content: `Skriv en ${category.name.toLowerCase()}-artikel baseret på de aktuelle trends.\n\nFokus på:\n- Hvad der trending inden for ${category.name.toLowerCase()}\n- Din unikke vinkel på emnet\n- Apropos' karakteristiske tone\n\nInspiration fra ${articles.length} artikler fra andre medier.`,
      tags: [category.name, 'Trending', 'Aktuel'],
      trending: true,
      articleCount: articles.length
    });
  };

  const handleTemplateSelect = (template: any) => {
    // Check if this is a trending template with articles
    if (template.trending && template.articles && template.articles.length > 0) {
      setTrendingTemplate(template);
      setShowArticlePicker(true);
    } else {
      // Regular template - proceed directly to author selection
      setSelectedTemplate(template);
      setSelectionStep('author');
      
      // Update article data with template info
      updateArticleData({
        title: '',
        subtitle: '',
        category: selectedCategory?.name || template.category,
        tags: template.tags,
        platform: ''
      });
    }
  };

  const handleArticleSelect = (article: any) => {
    if (trendingTemplate) {
      // Create template with selected article as inspiration
      const templateWithArticle = {
        ...trendingTemplate,
        content: `${trendingTemplate.content}\n\n**Inspiration fra valgt artikel:**\n"${article.title}" fra ${article.source}\n\n${article.content.substring(0, 300)}...`
      };
      
      setSelectedTemplate(templateWithArticle);
      setSelectionStep('author');
      
      // Update article data with template info
      updateArticleData({
        title: '',
        subtitle: '',
        category: trendingTemplate.category,
        tags: trendingTemplate.tags,
        platform: ''
      });
    }
    
    setShowArticlePicker(false);
    setTrendingTemplate(null);
  };

  const handleAuthorSelect = (author: WebflowAuthor) => {
    setSelectedAuthor(author);
    setSelectionStep('chat');
    
    // Update article data with author info and TOV
    updateArticleData({
      author: author.name,
      authorTOV: author.tov || ''
    });

    // Send initial message with selections
    const selectionMessage = `${selectedTemplate?.name} template valgt!\nForfatter: ${author.name}`;
    onSendMessage(selectionMessage);
    
    // Then send the full template content with TOV info
    setTimeout(() => {
      const tovInfo = author?.tov || 'Apropos stil';
      const templateMessage = `${selectedTemplate?.content}\n\n**Forfatter TOV:** ${tovInfo}\n\nLad os starte! Hvad vil du gerne skrive om?`;
      onSendMessage(templateMessage);
    }, 500);
  };


  return (
    <>
      <div className="w-full h-full md:rounded-xl md:outline md:outline-[1.50px] md:outline-offset-[-1.50px] md:outline-zinc-800 flex flex-col justify-between font-poppins chat-container relative overflow-hidden bg-[#070707]/90 backdrop-blur-3xl border border-white/20 shadow-[0_20px_70px_rgba(0,0,0,0.55)]">
        {/* Mobile empty-state gradient background (replaces Spline which causes white/blank on mobile WebGL) */}
        <div className={`md:hidden fixed inset-0 z-0 transition-opacity duration-500 ${messages.length === 0 ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}>
          <div className="absolute inset-0 bg-gradient-to-br from-[#0a0a0a] via-[#111] to-[#0d0d1a]" />
          <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_rgba(255,255,255,0.03)_0%,_transparent_60%)]" />
        </div>
        {/* Top Bar */}
        <div className={`flex items-center min-h-[56px] px-4 app-safe-top relative z-20 
          md:static md:bg-transparent md:backdrop-blur-0 md:border-b md:border-zinc-800 
          fixed top-0 inset-x-0 md:inset-auto md:top-auto
          bg-[#070707]/85 backdrop-blur-xl border-b border-white/10
        ${messages.length === 0 ? 'md:opacity-100' : ''}`}>
          {/* Left: logo/title */}
          <div className="flex items-center gap-3 min-w-0 flex-1">
            <div className="relative md:hidden h-5">
              <img
                src="/images/Apropos Research White.png"
                alt="Apropos Research"
                className={`h-5 transition-all duration-300 ${messages.length === 0 ? 'opacity-70 scale-100' : 'opacity-0 scale-95'}`}
              />
              <div className={`absolute inset-0 flex items-center transition-all duration-300 ${messages.length === 0 ? 'opacity-0 scale-95' : 'opacity-100 scale-100'}`}>
                <span className="text-white text-[15px] font-medium truncate">
                  {chatTitle === 'Ny artikkel' ? 'Ny artikel' : chatTitle}
                </span>
              </div>
            </div>
            <h1 className="hidden md:block text-white text-base font-medium truncate">
              {chatTitle === 'Ny artikkel' ? (
                <span 
                  className="bg-gradient-to-r from-white/20 via-white/70 to-white/20 bg-clip-text text-transparent"
                  style={{ backgroundSize: '200% 100%', animation: 'gradient-shift 4s ease-in-out infinite' }}
                >
                  Ny Apropos Magazine artikkel
                </span>
              ) : chatTitle}
            </h1>
            {isAutoSaving && (
              <span className="text-[11px] text-green-400/80 animate-pulse ml-auto md:ml-0">Gemmer…</span>
            )}
            {lastSaved && !isAutoSaving && (
              <span className="text-[11px] text-white/30 ml-auto md:ml-0">
                {lastSaved.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' })}
              </span>
            )}
          </div>
          {/* Right: actions */}
          <div className="flex items-center gap-1 shrink-0 ml-3">
            <button
              type="button"
              onClick={() => onClose?.()}
              className="hidden md:flex touch-target items-center justify-center rounded-lg border border-white/15 text-white/70 hover:text-white hover:bg-white/5 transition-colors"
              aria-label="Luk AI Writer og åbn SoMe Posting"
              title="Luk og åbn SoMe Posting"
            >
              <svg className="w-5 h-5 block" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <button
              className="md:hidden touch-target p-2 -mr-2 text-white/60 active:text-white transition-colors"
              aria-label="Åbn menu"
              onClick={openMobileMenu}
            >
              <svg className="w-5 h-5 block" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>
          </div>
        </div>
      
      <div className={`flex flex-col justify-start gap-2 p-[10px] md:pt-0 pt-16 pb-2 flex-1 overflow-hidden min-h-0 chat-container transition-all duration-500 ${messages.length === 0 ? 'opacity-100 translate-y-0' : 'opacity-100 translate-y-0'}`}>
        {/* Dynamic Chat Messages */}
        <div className="relative flex-1 min-h-0 overflow-hidden">
          <div
            ref={messageListRef}
            className="h-full overflow-y-auto space-y-4 nice-scrollbar"
            style={{ paddingBottom: Math.max(inputSpacerHeight, 0) + 40 }}
          >
          {messages.map((message, index) => {
            const isUser = message.role === 'user';
            const isEditing = editingMessage === message.id;
            const formattedTime = message.timestamp?.toLocaleTimeString('da-DK', { hour: '2-digit', minute: '2-digit' }) ?? '';
            const alignment = isUser ? 'justify-end' : 'justify-start';
            const widthClass = isEditing ? 'w-full max-w-[640px]' : (isUser ? 'max-w-[78%] min-w-0' : 'max-w-[78%]');
            const offsetClass = isEditing ? '' : (isUser ? 'md:ml-20' : 'md:mr-20');
            const bubbleClass = isUser
              ? 'rounded-2xl px-4 py-3 transition-all duration-300 shadow-[0_18px_44px_-30px_rgba(0,0,0,0.8)] bg-black/90 text-white border border-white/20 hover:border-white/35 hover:bg-white/5 break-words overflow-wrap-anywhere'
              : 'px-1.5 py-2 text-white/85 transition-all duration-300';

            return (
            <div
              key={`${message.id}-${index}`}
              id={`message-${index}`}
              className={`flex ${alignment} transition-all duration-500 ${
                index === messages.length - 1 ? 'animate-message-glow' : ''
              }`}
              style={{
                animation: index === messages.length - 1 ? 'message-glow 1.5s ease-out' : undefined
              }}
              onMouseEnter={() => setHoveredMessage(message.id)}
              onMouseLeave={() => setHoveredMessage(null)}
            >
              <div
                className={`${widthClass} ${offsetClass} ${isUser ? 'min-w-0' : ''}`}
                style={{ paddingLeft: isUser ? '16px' : '8px', paddingRight: isUser ? '16px' : '8px' }}
              >
                <div className={`relative group ${isUser ? 'flex flex-col items-end' : ''}`}>
                  <div className={`${bubbleClass} ${isUser ? 'inline-block' : ''}`}>
                    {message.role === 'assistant' && (parseNumberedSuggestions(message.content).length > 0 || parseEnumeratedQuestions(message.content).length > 0) ? (
                      <div className="space-y-2">
                        {/* Numbered suggestion cards */}
                        {parseNumberedSuggestions(message.content).map((item, idx) => (
                          <div
                            key={idx}
                            className="p-3 bg-white/5 hover:bg-white/10 border border-white/10 hover:border-white/20 rounded-lg transition-all cursor-pointer group"
                            onClick={() => onSendMessage(item.full)}
                          >
                            <div className="flex items-start justify-between gap-3">
                              <div className="flex-1 min-w-0">
                                <h4 className="text-white text-sm font-medium mb-1 line-clamp-2 group-hover:text-blue-300 transition-colors">
                                  {item.title}
                                </h4>
                                <p className="text-white/40 text-xs line-clamp-2">
                                  {item.description}
                                </p>
                              </div>
                              <div className="flex-shrink-0">
                                <svg 
                                  className="w-4 h-4 text-white/30 group-hover:text-blue-400 transition-colors" 
                                  fill="none" 
                                  stroke="currentColor" 
                                  viewBox="0 0 24 24"
                                >
                                  <path 
                                    strokeLinecap="round" 
                                    strokeLinejoin="round" 
                                    strokeWidth={2} 
                                    d="M9 5l7 7-7 7" 
                                  />
                                </svg>
                              </div>
                            </div>
                          </div>
                        ))}
                        {/* Enumerated question helper chips */}
                        {parseEnumeratedQuestions(message.content).length > 0 && (
                          <div className="flex flex-wrap gap-2 mt-1">
                            {parseEnumeratedQuestions(message.content).map((q, idx) => (
                              <div key={`q-${idx}`} className="flex flex-wrap gap-2">
                                {q.kind === 'authorProfile' && ['Frederik Emil (ironisk)','Liv Brandt (sanselig)','Eva Linde (analytisk)'].map((o,i)=> (
                                  <button key={`opt-a-${i}`} onClick={() => onSendMessage(o)} className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10">{o}</button>
                                ))}
                                {q.kind === 'platform' && ['Netflix','Viaplay','Disney+','Prime Video','Apple TV+','HBO Max','Biograf'].map((o,i)=> (
                                  <button key={`opt-p-${i}`} onClick={() => onSendMessage(o)} className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10">{o}</button>
                                ))}
                                {q.kind === 'rating' && [1,2,3,4,5,6].map((o,i)=> (
                                  <button key={`opt-r-${i}`} onClick={() => onSendMessage(`${o} stjerner`)} className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10">{o} ⭐</button>
                                ))}
                              </div>
                            ))}
                          </div>
                        )}
                        {/* Two-phase: quick title+intro vs full article */}
                        {message.role === 'assistant' && /arbejdstitel.*indledning|indledning.*arbejdstitel/i.test(message.content) && (
                          <div className="flex flex-wrap gap-2 mt-2">
                            <button 
                              onClick={() => onSendMessage('Generer kun en arbejdstitel og en indledning.')} 
                              className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/10 text-white border-white/40 hover:border-white/60 hover:bg-white/15 font-medium"
                            >
                              Kun titel og indledning
                            </button>
                            <button 
                              onClick={() => onSendMessage('Generer en arbejdstitel og en indledning, og skriv derefter hele artiklen med research og fuld kvalitet.')} 
                              className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/10 text-white border-white/40 hover:border-white/60 hover:bg-white/15 font-medium"
                            >
                              Skriv hele artiklen
                            </button>
                            <button 
                              onClick={() => onSendMessage('Nej')} 
                              className="px-3 py-1.5 rounded-lg text-xs transition-all border bg-white/5 text-white border-white/10 hover:border-white/20 hover:bg-white/10"
                            >
                              Nej
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      editingMessage === message.id ? (
                        <div className="space-y-3">
                          <textarea
                            value={editContent}
                            onChange={(e) => setEditContent(e.target.value)}
                            className="w-full bg-transparent focus:outline-none resize-none min-h-[100px] text-white text-sm border-none"
                            style={{ padding: '4px 0' }}
                            rows={Math.max(3, editContent.split('\n').length)}
                            autoFocus
                          />
                          <div className="flex gap-2">
                            <button
                              onClick={handleSaveEdit}
                              className="px-4 py-1.5 bg-green-600 hover:bg-green-700 text-white text-xs rounded transition-colors"
                            >
                              Gem
                            </button>
                            <button
                              onClick={handleCancelEdit}
                              className="px-4 py-1.5 bg-gray-600 hover:bg-gray-700 text-white text-xs rounded transition-colors"
                            >
                              Annuller
                            </button>
                          </div>
                        </div>
                      ) : (
                        <p className="text-sm leading-relaxed whitespace-pre-wrap text-left text-white/90 break-words overflow-wrap-anywhere">{message.content}</p>
                      )
                    )}
                    
                    {/* Show uploaded files */}
                    {message.files && message.files.length > 0 && (
                      <div className="mt-2 space-y-2">
                        {message.files.map((file) => (
                          <div key={file.id} className="flex items-start gap-2">
                            {file.type.startsWith('image/') ? (
                              <img
                                src={file.url}
                                alt={file.name}
                                className="max-w-[200px] max-h-[150px] rounded-lg object-cover border border-white/20"
                                loading="lazy"
                              />
                            ) : (
                              <div className="flex items-center gap-2 p-2 bg-white/5 rounded-lg border border-white/10">
                                <svg className="w-4 h-4 text-white/60" fill="currentColor" viewBox="0 0 20 20">
                                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                                </svg>
                                <span className="text-xs text-white/80">{file.name}</span>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {/* Combined timestamp and action buttons - only show on hover */}
                  <div className={`mt-1 flex items-center text-[10px] text-white/35 transition-opacity duration-200 opacity-100 ${isUser ? 'justify-end' : 'justify-start pl-1'} ${hoveredMessage === message.id ? 'md:opacity-100' : 'md:opacity-0'}`}>
                    {isUser && !isEditing ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => navigator.clipboard.writeText(message.content)}
                          className="p-1.5 text-white/40 hover:text-white/80 transition-colors"
                          title="Kopier besked"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                        </button>
                        <button
                          onClick={() => handleEditMessage(message.id, message.content)}
                          className="p-1.5 text-white/40 hover:text-white/80 transition-colors"
                          title="Rediger besked"
                        >
                          <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                          </svg>
                        </button>
                        <span className="text-xs ml-1">{formattedTime}</span>
                      </div>
                    ) : (
                      <span className="text-xs">{formattedTime}</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
          {editorialWarnings.length > 0 && (
            <div className="flex justify-start">
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <div className="p-4 bg-gradient-to-br from-yellow-700/40 to-yellow-600/20 border border-yellow-400/40 rounded-xl text-sm text-white/90 shadow-lg">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h4 className="text-base font-semibold text-white mb-2">Redaktionelle noter</h4>
                      <ul className="space-y-1 list-disc list-inside text-white/80">
                        {editorialWarnings.map((warning, idx) => (
                          <li key={idx}>{warning}</li>
                        ))}
                      </ul>
                    </div>
                    <button
                      onClick={onClearEditorialWarnings}
                      className="text-white/50 hover:text-white"
                      title="Skjul noter"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Preflight Status */}
          {preflightRunning && (
            <div className="flex justify-start">
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <PreflightStatus
                  isRunning={preflightRunning}
                  currentStep={preflightCurrentStep}
                  totalSteps={3}
                  stepName={preflightStepName}
                />
              </div>
            </div>
          )}

          {/* Preflight Recommendations */}
          {preflightCompleted && (
            <div className="flex justify-start">
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <PreflightRecommendations
                  warnings={preflightWarnings}
                  moderation={preflightModeration}
                  criticTips={preflightCriticTips}
                  factResults={preflightFactResults}
                  onApplyRecommendations={handleApplyPreflightRecommendations}
                  onApplyCriticalFixes={handleApplyCriticalFixes}
                  onApplyImprovements={handleApplyImprovements}
                  onAutoFixPlagiarism={handleAutoFixPlagiarism}
                  onAutoFixFacts={handleAutoFixFacts}
                  onAutoFixTOV={handleAutoFixTOV}
                />
              </div>
            </div>
          )}

          {showSimpleThinkingIndicator && (
            <div className="flex justify-start">
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <div className="px-4 py-3 rounded-2xl bg-white/5 border border-white/10 text-sm text-white/80 shadow-[0_0_20px_rgba(0,0,0,0.35)]">
                  Hurtig sparring (fast mode) – jeg svarer lige om lidt…
                </div>
              </div>
            </div>
          )}
          
          {showThinkingTimeline && (
            <div className="flex justify-start">
              <div className="max-w-[80%]" style={{ paddingLeft: '8px', paddingRight: '8px' }}>
                <div className="text-sm text-white/80">
                  <div
                    className={`text-sm inline-flex items-center gap-2 [text-shadow:0_0_8px_rgba(255,255,255,0.25)] transition-opacity duration-300 ${fadeIn ? 'opacity-100' : 'opacity-0'}`}
                  >
                    <span className="font-semibold text-white/80">{progressDisplay}%</span>
                    <span className="text-white/40">•</span>
                    <span className="text-white/90">{thinkingText}</span>
                  </div>
                  <ul className="space-y-3 mt-4">
                    {stepsToRender.map((step) => {
                      const isVisible = visibleSteps.has(step.id);
                      const opacity = getStepOpacity(step.id);
                      
                      if (!isVisible && step.status === 'pending') {
                        return null;
                      }
                      
                      return (
                        <li
                          key={step.id}
                          className="text-xs leading-relaxed transition-all duration-700 ease-out"
                          style={{ 
                            opacity: opacity,
                            transform: `translateY(${opacity === 1 ? 0 : -10}px)`
                          }}
                        >
                          <span className={getStepTextClass(step.status)}>
                            {step.label}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
          <div className={`pointer-events-none absolute inset-x-0 top-0 h-10 z-10 bg-[linear-gradient(180deg,_#050505,_rgba(5,5,5,0.7),_rgba(5,5,5,0))] transition-opacity duration-300 ${messageScrollFade ? 'opacity-100' : 'opacity-0'}`} />
        </div>

      </div>

      {/* Mobile slide-in menu (right) */}
      {mobileMenuVisible && (
        <div className="md:hidden fixed inset-0 z-50" role="dialog" aria-modal="true">
          <div
            className={`absolute inset-0 bg-black/50 transition-opacity duration-300 ${mobileMenuOpen ? 'opacity-100' : 'opacity-0'}`}
            onClick={closeMobileMenu}
          />
          <aside
            className={`absolute right-0 top-0 h-[100dvh] w-72 max-w-[85vw] bg-[#0a0a0a] border-l border-white/[0.06] shadow-2xl overflow-y-auto flex flex-col transform-gpu transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] app-safe-top app-safe-bottom ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="px-5 pt-4 pb-2 flex items-center justify-between">
              <span className="text-[13px] font-semibold text-white/40 uppercase tracking-wider">Menu</span>
              <button
                className="touch-target -mr-2 p-2 text-white/50 active:text-white transition-colors"
                aria-label="Luk menu"
                onClick={closeMobileMenu}
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Quick actions */}
            <div className="grid grid-cols-5 border-b border-white/[0.06]">
              {([
                { label: 'Drafts', icon: (<div className="grid grid-cols-3 gap-[3px] w-[18px] h-[18px]">{Array.from({ length: 9 }).map((_, i) => (<div key={i} className="w-[4px] h-[4px] bg-current rounded-full" />))}</div>), action: () => { closeMobileMenu(); onOpenDraftsPanel ? onOpenDraftsPanel() : (window.location.href = '/ai-drafts'); } },
                { label: 'SoMe', icon: (<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M4 7h16M4 12h16M4 17h16" /></svg>), action: () => { closeMobileMenu(); window.location.href = '/design-editor'; } },
                { label: 'Nyhedsbrev', icon: (<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M3 8l9 6 9-6M5 19h14a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2z" /></svg>), action: () => { closeMobileMenu(); window.location.href = '/ai/newsletter'; } },
                { label: 'Preview', icon: (<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}><path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/><circle cx="12" cy="12" r="3"/></svg>), action: () => { closeMobileMenu(); if (onOpenReviewPanel) onOpenReviewPanel(); } },
                { label: 'Ny', icon: (<svg className="w-[18px] h-[18px]" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M12 4v16m8-8H4" /></svg>), action: () => { closeMobileMenu(); onNewArticle ? onNewArticle() : (setChatMessages([]), onChatTitleChange('Ny artikkel')); } },
              ] as const).map((item) => (
                <button
                  key={item.label}
                  className="touch-target flex flex-col items-center justify-center gap-1.5 py-4 text-white/70 active:bg-white/[0.04] transition-colors"
                  onClick={item.action}
                >
                  {item.icon}
                  <span className="text-[11px] font-medium">{item.label}</span>
                </button>
              ))}
            </div>

            {/* List items */}
            <nav className="flex-1">
              <button
                className="w-full flex items-center gap-3.5 px-5 py-[14px] text-[15px] text-white/90 active:bg-white/[0.04] transition-colors"
                onClick={() => { closeMobileMenu(); if (onOpenSourcesPanel) onOpenSourcesPanel(); }}
              >
                <svg className="w-[20px] h-[20px] text-white/45 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
                <span className="flex-1 text-left">Mediekilder</span>
                <svg className="w-4 h-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="mx-5 border-t border-white/[0.06]" />
              <button
                className="w-full flex items-center gap-3.5 px-5 py-[14px] text-[15px] text-white/90 active:bg-white/[0.04] transition-colors"
                onClick={() => {
                  closeMobileMenu();
                  if (onOpenPromptArchitect) onOpenPromptArchitect();
                }}
              >
                <svg className="w-[20px] h-[20px] text-white/45 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="6" cy="6" r="2.5" />
                  <circle cx="18" cy="10" r="2.5" />
                  <circle cx="10" cy="18" r="2.5" />
                  <path d="M8.2 7.4 15.3 9.2M12.2 11.2 10.8 16.2" />
                </svg>
                <span className="flex-1 text-left">Prompt Architect</span>
                <svg className="w-4 h-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
              <div className="mx-5 border-t border-white/[0.06]" />
              <button
                className="w-full flex items-center gap-3.5 px-5 py-[14px] text-[15px] text-white/90 active:bg-white/[0.04] transition-colors"
                onClick={() => { closeMobileMenu(); if (onOpenSettingsPanel) onOpenSettingsPanel(); }}
              >
                <svg className="w-[20px] h-[20px] text-white/45 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.6 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.6a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"/>
                </svg>
                <span className="flex-1 text-left">Indstillinger</span>
                <svg className="w-4 h-4 text-white/20" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" /></svg>
              </button>
            </nav>

            {/* Footer — log out */}
            <div className="border-t border-white/[0.06] mt-auto">
              <button
                className="w-full flex items-center gap-3.5 px-5 py-[14px] text-[15px] text-red-400 active:bg-white/[0.04] transition-colors"
                onClick={async () => { try { await logout(); } catch(e) { console.error(e); } finally { closeMobileMenu(); } }}
              >
                <svg className="w-[20px] h-[20px] flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.6}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M17 16l4-4m0 0l-4-4m4 4H7" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M7 8v8a2 2 0 002 2h3" />
                </svg>
                <span className="flex-1 text-left">Log ud</span>
              </button>
            </div>
          </aside>
        </div>
      )}


        {/* Article Picker - Directly under top bar */}
        {showArticlePicker && trendingTemplate && (
          <div className="flex flex-col max-h-[75vh] mx-[10px]">
            <div className="flex items-center gap-4 px-0 py-2">
              <button
                onClick={() => {
                  setSelectionStep('category');
                  setShowArticlePicker(false);
                  setTrendingTemplate(null);
                  setSelectedCategory(null);
                }}
                className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20 flex items-center justify-center"
                style={{ backgroundColor: 'rgb(0, 0, 0)' }}
                onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
                onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
              >
                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <h3 className="text-white text-lg font-medium">Vælg inspiration til {trendingTemplate?.name}</h3>
            </div>
            <div className="px-0 py-2 overflow-y-auto">
              <ArticlePicker
                articles={trendingTemplate.articles || []}
                onSelectArticle={handleArticleSelect}
                onClose={() => {
                  setShowArticlePicker(false);
                  setTrendingTemplate(null);
                }}
                templateName={trendingTemplate.name}
              />
            </div>
          </div>
        )}

        {/* Selection Flow */}
        {messages.length === 0 && !showArticlePicker && (
          <div className="pb-2 px-4">
            {selectionStep === 'category' && null}

            {selectionStep === 'template' && (
              <div>
                <div className="flex items-center gap-4 mb-4">
                  <button
                    onClick={() => {
                      setSelectionStep('category');
                      setSelectedCategory(null);
                    }}
                    className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20 flex items-center justify-center"
                    style={{ backgroundColor: 'rgb(0, 0, 0)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  <h3 className="text-white text-lg font-medium">Vælg template</h3>
                </div>
                <ArticleTemplates 
                  onSelectTemplate={handleTemplateSelect} 
                  selectedCategory={selectedCategory?.name}
                />
              </div>
            )}
            
            {selectionStep === 'author' && (
              <div className="space-y-4">
                <h3 className="text-white text-lg font-medium mb-4">Vælg forfatter</h3>
                <div className="flex gap-2 items-center">
                  {/* Back button on same line */}
                  <button
                    onClick={() => {
                      setSelectionStep('category');
                      setSelectedTemplate(null);
                      setSelectedCategory(null);
                      setShowArticlePicker(false);
                      setTrendingTemplate(null);
                    }}
                    className="px-3 py-1.5 text-white text-xs font-medium rounded-lg transition-colors duration-200 border border-white/20 flex items-center justify-center"
                    style={{ backgroundColor: 'rgb(0, 0, 0)' }}
                    onMouseEnter={(e) => e.currentTarget.style.backgroundColor = 'rgb(20, 20, 20)'}
                    onMouseLeave={(e) => e.currentTarget.style.backgroundColor = 'rgb(0, 0, 0)'}
                  >
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                    </svg>
                  </button>
                  
                  {/* Author pills inline */}
                  <div className="flex flex-wrap gap-2">
                    <AuthorSelection onAuthorSelected={handleAuthorSelect} />
                  </div>
                </div>
                
                {/* Show article suggestions after template selection */}
                {selectedTemplate && (
                  <ArticleSuggestions 
                    category={selectedTemplate.category}
                    tags={selectedTemplate.tags}
                    onSelectSuggestion={(suggestion) => {
                      // Copy title to help user
                      const message = `Jeg vil gerne skrive en ${selectedTemplate.name.toLowerCase()} om "${suggestion.title}" (inspiration fra ${suggestion.source})`;
                      onSendMessage(message);
                    }}
                  />
                )}
              </div>
            )}
            
          </div>
        )}

        {/* Docket wizard (non-overlay) */}
        {wizardNode && (
          <div className="hidden md:block">
          <WizardAutoHeight>
            {wizardNode}
          </WizardAutoHeight>
          </div>
        )}

        {/* Input Area (sticky wrapper) */}
        <div
          ref={inputContainerRef}
          className={`md:static fixed inset-x-0 bottom-2 md:bottom-0 md:inset-auto md:bottom-auto 
          p-0 flex flex-col gap-2 md:gap-0 md:mx-[10px] md:my-0 mx-[10px] mb-0 
          z-20`}
          style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
        >
          {/* Mobile: Wizard card above writer card inside same sticky container */}
          {wizardNode && messages.length === 0 && (
            <div className="md:hidden mb-2">
              <WizardAutoHeight collapsed={false}>
                {wizardNode}
              </WizardAutoHeight>
            </div>
          )}
          {/* Retry bar when last request failed */}
          {lastFailedMessage && onRetryLast && (
            <div className="mb-2 flex items-center justify-between gap-2 rounded-lg bg-amber-500/15 border border-amber-500/40 px-3 py-2 text-sm text-amber-200">
              <span>Sidste forespørgsel fejlede.</span>
              <button
                type="button"
                onClick={onRetryLast}
                className="shrink-0 rounded-md bg-amber-500/30 px-3 py-1.5 font-medium text-amber-100 hover:bg-amber-500/50 transition-colors"
              >
                Forsøg igen
              </button>
            </div>
          )}
          {/* URL kilde (hent tekst — vises som pille i feltet) */}
          {showUrlInput && (
            <div className="mb-2">
              <div className="flex flex-col gap-1.5 p-2.5 bg-[#171717] border border-white/15 rounded-xl">
                <div className="flex gap-2 items-center">
                  <svg className="w-4 h-4 text-white/30 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                  </svg>
                  <input
                    ref={urlInputRef}
                    type="url"
                    value={urlInputValue}
                    onChange={(e) => { setUrlInputValue(e.target.value); setUrlError(''); }}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') { e.preventDefault(); handleUrlFetch(); }
                      if (e.key === 'Escape') setShowUrlInput(false);
                    }}
                    placeholder="https://..."
                    disabled={urlLoading}
                    className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => handleUrlFetch()}
                    disabled={urlLoading || !urlInputValue.trim()}
                    className="px-2.5 py-1.5 bg-white/10 hover:bg-white/20 text-white text-xs rounded-lg transition-colors disabled:opacity-30 flex-shrink-0 flex items-center gap-1.5"
                  >
                    {urlLoading ? (
                      <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                    ) : null}
                    Hent
                  </button>
                </div>
                {urlError ? <p className="text-xs text-red-400 pl-6">{urlError}</p> : null}
                <p className="text-[10px] text-white/35 pl-6">Kun inspiration — aldrig kopieret direkte</p>
              </div>
            </div>
          )}

          {importMode ? (
            <div className="mb-2 space-y-2">
              <FileDropZone
                onFileUploaded={handleFileUploaded}
                onError={handleFileError}
                onRawFiles={handleImportRawFiles}
                multiple
                invalid={importImages.length < 3}
                invalidStrong={importSubmitAttempted && importImages.length < 3}
                helperText={`Upload 3 billeder: 1 hero + 2 til brødteksten (${importImages.length}/3 valgt)`}
                className="min-h-[110px]"
              />
              {importUploading && (
                <div className="flex items-center gap-2 text-white/55 text-xs pl-1">
                  <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin inline-block" />
                  Uploader billede…
                </div>
              )}
              {importImages.length > 0 && (
                <div className="flex flex-wrap gap-2 pt-0.5">
                  {importImages.map((img, i) => (
                    <div
                      key={`${img.url}-${i}`}
                      className="relative group rounded-lg overflow-hidden border border-white/15 bg-white/[0.04]"
                      title={img.name || undefined}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={img.url} alt={i === 0 ? 'Hero' : `Brødtekst ${i}`} className="h-16 w-16 object-cover" />
                      <span className="absolute bottom-0 inset-x-0 bg-black/70 text-[9px] text-white/85 text-center py-0.5 uppercase tracking-wider">
                        {i === 0 ? 'Hero' : `Body ${i}`}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeImportImage(i)}
                        className="absolute top-0.5 right-0.5 flex size-5 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-black hover:text-white transition-colors"
                        title="Fjern billede"
                      >
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12" /></svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            showFileDrop && (
              <div className="mb-2">
                <FileDropZone
                  onFileUploaded={handleFileUploaded}
                  onError={handleFileError}
                  className="min-h-[120px]"
                />
              </div>
            )
          )}
          {/* Writer field card */}
          <div className={`relative rounded-xl ${messages.length === 0 ? 'bg-black/40 backdrop-blur-xl border border-white/15 shadow-[0_-18px_80px_-30px_rgba(255,255,255,0.28)]' : 'bg-[#171717] border border-white/15'}`}>
            <div className="p-3 md:p-4">
          <div className="relative">
            <textarea
              value={inputMessage}
              onChange={(e) => setInputMessage(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder=""
              className="w-full bg-transparent text-white text-sm md:text-sm resize-none outline-none relative z-10"
              rows={3}
              style={{ minHeight: '60px' }}
            />
            {!inputMessage && attachedSources.length === 0 && (
              <div className="absolute inset-0 pointer-events-none flex items-start pt-1">
                <span 
                  className="text-sm bg-gradient-to-r from-white/20 via-white/70 to-white/20 bg-clip-text text-transparent"
                  style={{
                    backgroundSize: '200% 100%',
                    animation: 'gradient-shift 4s ease-in-out infinite'
                  }}
                >
                  {importMode ? 'Indsæt din færdige artikel her' : 'Lad os starte med din artikel'}
                </span>
              </div>
            )}
          </div>

          {attachedSources.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2 pt-1">
              {attachedSources.map((src, i) => (
                <div
                  key={`${src.url}-${i}`}
                  className="inline-flex items-center gap-1.5 pl-2.5 pr-1 py-1 rounded-full bg-white/10 border border-white/15 text-xs text-white/80 max-w-[280px] hover:border-white/25 transition-colors"
                >
                  <svg className="w-3 h-3 text-white/40 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M10.172 13.828a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.102 1.101" />
                  </svg>
                  <span className="truncate">{src.title || (src.url.match(/^https?:\/\/([^/?#]+)/i)?.[1]?.replace(/^www\./, '') ?? src.url.slice(0, 40))}</span>
                  <button
                    type="button"
                    onClick={() => setAttachedSources(prev => prev.filter((_, j) => j !== i))}
                    className="flex-shrink-0 p-0.5 rounded-full text-white/30 hover:text-white hover:bg-white/10 transition-colors"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6L6 18M6 6l12 12"/></svg>
                  </button>
                </div>
              ))}
            </div>
          )}
          
          <div className="flex justify-between items-center">
            <div className="flex gap-3">
              <button 
                onClick={() => { setShowFileDrop(!showFileDrop); if (showUrlInput) setShowUrlInput(false); }}
                className={`touch-target w-11 h-11 flex items-center justify-center rounded transition-colors ${
                  showFileDrop ? 'text-blue-400 bg-blue-400/10' : 'text-white hover:bg-gray-700'
                }`}
                title="Upload filer"
              >
                <span className="text-lg">+</span>
              </button>
              <button
                onClick={() => { setShowUrlInput(!showUrlInput); if (showFileDrop) setShowFileDrop(false); }}
                className={`touch-target w-11 h-11 flex items-center justify-center rounded transition-colors ${
                  showUrlInput ? 'text-blue-400 bg-blue-400/10' : 'text-white hover:bg-gray-700'
                }`}
                title="Indsæt URL som kilde"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M12.586 4.586a2 2 0 112.828 2.828l-3 3a2 2 0 01-2.828 0 1 1 0 00-1.414 1.414 4 4 0 005.656 0l3-3a4 4 0 00-5.656-5.656l-1.5 1.5a1 1 0 101.414 1.414l1.5-1.5zm-5 5a2 2 0 012.828 0 1 1 0 101.414-1.414 4 4 0 00-5.656 0l-3 3a4 4 0 105.656 5.656l1.5-1.5a1 1 0 10-1.414-1.414l-1.5 1.5a2 2 0 11-2.828-2.828l3-3z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
            
            <button 
              onClick={() => handleSubmit()}
              disabled={importMode
                ? (!inputMessage.trim() || importImages.length !== 3)
                : (!inputMessage.trim() && attachedSources.length === 0)}
              title={importMode && importImages.length !== 3 ? 'Upload 3 billeder for at importere' : undefined}
              className="touch-target w-11 h-11 bg-white rounded-lg flex items-center justify-center hover:bg-gray-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
            >
              <svg className="w-4 h-4 text-gray-800" fill="currentColor" viewBox="0 0 20 20">
                <path d="M10.894 2.553a1 1 0 00-1.788 0l-7 14a1 1 0 001.169 1.409l5-1.429A1 1 0 009 15.571V11a1 1 0 112 0v4.571a1 1 0 00.725.962l5 1.428a1 1 0 001.17-1.408l-7-14z" />
              </svg>
            </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      
      {/* AI suggestions removed per UX request */}

      {/* Rating Suggestion (removed) */}

      {/* Webflow Publish Panel overlay removed — publishing lives in Review drawer */}
    </>
  );
}

// WizardAutoHeight moved to components/ui/WizardAutoHeight
