'use client';

import { useState, useEffect, useRef } from 'react';
import { type UploadedFile } from '@/lib/file-upload-service';
import MainChatPanel from './MainChatPanel';
import SetupWizard from '@/components/SetupWizard';
import ReviewPanel from '@/components/ReviewPanel';
import DraftsShelf from '@/components/DraftsShelf';
import MiniMenu from '@/components/MiniMenu';
import PreviewPanel from './PreviewPanel';
import AuthModal from '@/components/AuthModal';
import DraftsPanel from '@/components/DraftsPanel';
import ChatSearchModal from '@/components/ChatSearchModal';
import { useAuth } from '@/lib/auth-context';
import { saveDraft, getDraft, type ArticleDraft } from '@/lib/firebase-service';
import type { ArticleData } from '@/types/article';

const ARTICLE_FIELD_ALIASES: Record<string, string> = {
  name: 'title',
  title: 'title',
  'seo-title': 'seoTitle',
  'seo_title': 'seoTitle',
  seotitle: 'seoTitle',
  'meta-description': 'seoDescription',
  'meta_description': 'seoDescription',
  metadescription: 'seoDescription',
  'meta-desc': 'seoDescription',
  metadesc: 'seoDescription',
  subtitle: 'subtitle',
  'post-body': 'content',
  'post_body': 'content',
  postbody: 'content',
  body: 'content',
  'content-html': 'content',
  'content_html': 'content',
  contenthtml: 'content',
  'preview-title': 'previewTitle',
  'preview_title': 'previewTitle',
  previewtitle: 'previewTitle',
  section: 'category',
  category: 'category',
  categoryname: 'category',
  topic: 'topic',
  topics: 'topicsSelected',
  tags: 'tags',
  'streaming_service': 'platform',
  'streaming-service': 'platform',
  streamingservice: 'platform',
  platform: 'platform',
  stars: 'rating',
  rating: 'rating',
  'rating-value': 'rating',
  rating_value: 'rating',
  'rating-skipped': 'ratingSkipped',
  'rating_skipped': 'ratingSkipped',
  ratingskipped: 'ratingSkipped',
  press: 'press',
  'publish-date': 'publishDate',
  'publish_date': 'publishDate',
  publishdate: 'publishDate',
  'read-time': 'readTime',
  'read_time': 'readTime',
  readtime: 'readTime',
  wordcount: 'wordCount',
  'word-count': 'wordCount',
  word_count: 'wordCount',
  'author-name': 'author',
  authorname: 'author',
  writer: 'author',
  journalist: 'author',
  'author-tov': 'authorTOV',
  'author_tov': 'authorTOV',
  tov: 'authorTOV',
  reflection: 'reflection',
  template: 'template',
  'ai-draft': 'aiDraft',
  ai_draft: 'aiDraft',
  aidraft: 'aiDraft',
  'ai-suggestion': 'aiSuggestion',
  ai_suggestion: 'aiSuggestion',
  aisuggestion: 'aiSuggestion'
};

const ARTICLE_CONTAINER_KEYS = new Set([
  'fields',
  'data',
  'attributes',
  'values',
  'payload',
  'article',
  'articleUpdate',
  'article_update',
  'articleData',
  'article_data',
  'entry',
  'item',
  'record',
  'cms'
]);

const slugify = (value: string) =>
  value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .trim();

const stripHtmlToText = (html: string) =>
  html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const flattenArticlePayload = (raw: any): Record<string, any> => {
  const output: Record<string, any> = {};
  const queue: any[] = [raw];
  while (queue.length) {
    const node = queue.shift();
    if (!node || typeof node !== 'object') continue;

    if (Array.isArray(node)) {
      node.forEach(item => queue.push(item));
      continue;
    }

    Object.entries(node).forEach(([key, value]) => {
      if (value === undefined || value === null) return;

      if (Array.isArray(value) && key === 'fields') {
        value.forEach((field: any) => {
          if (!field || typeof field !== 'object') return;
          const slug = field.slug || field.id || field.name || field.key;
          if (!slug) return;
          const fieldValue = field.value ?? field.text ?? field.content ?? field.richText;
          if (fieldValue !== undefined && output[slug] === undefined) {
            output[slug] = fieldValue;
          }
        });
        return;
      }

      if (
        (ARTICLE_CONTAINER_KEYS.has(key) ||
          key.toLowerCase().endsWith('fields') ||
          key.toLowerCase().endsWith('data')) &&
        typeof value === 'object'
      ) {
        queue.push(value);
        return;
      }

      if (output[key] === undefined) {
        output[key] = value;
      }
    });
  }
  return output;
};

type NormalizeOptions = {
  retainExistingOnEmpty?: boolean;
  slugMap?: Record<string, string>;
};

const createEmptyArticleData = (): ArticleData => ({
  title: '',
  subtitle: '',
  category: '',
  author: '',
  authorTOV: '',
  content: '',
  rating: 0,
  ratingSkipped: false,
  tags: [],
  platform: '',
  press: null,
  aiDraft: null,
  previewTitle: '',
  aiSuggestion: null,
  template: '',
  inspirationSource: '',
  researchSelected: undefined,
  inspirationAcknowledged: false,
  _chatMessages: [],
  seoTitle: '',
  seoDescription: '',
  publishDate: '',
  status: 'draft',
  topicsSelected: [],
  streaming_service: ''
});

const normalizeArticleData = (
  raw: any,
  base: ArticleData,
  options: NormalizeOptions = {}
): ArticleData => {
  const retainExisting = options.retainExistingOnEmpty ?? true;
  const slugMap = options.slugMap || {};

  function cloneArray<T>(value: T[] | undefined): T[] {
    return Array.isArray(value) ? [...value] : [];
  }

  const result: ArticleData = {
    ...base,
    tags: cloneArray(base.tags),
    topicsSelected: cloneArray(base.topicsSelected),
    _chatMessages: cloneArray(base._chatMessages),
    aiDraft: base.aiDraft ? { ...base.aiDraft } : null,
    aiSuggestion: base.aiSuggestion ? { ...base.aiSuggestion } : null
  };

  const flat = flattenArticlePayload(raw);

  const assignString = (field: keyof ArticleData, value: any) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (trimmed || !retainExisting || !(result[field] && String(result[field]).trim())) {
      (result as any)[field] = trimmed;
    }
  };

  const assignNumber = (field: keyof ArticleData, value: any) => {
    if (typeof value === 'number' && !Number.isNaN(value)) {
      (result as any)[field] = value;
    } else if (typeof value === 'string') {
      const parsed = parseInt(value, 10);
      if (!Number.isNaN(parsed)) (result as any)[field] = parsed;
    }
  };

  const assignBoolean = (field: keyof ArticleData, value: any) => {
    if (typeof value === 'boolean') {
      (result as any)[field] = value;
    } else if (typeof value === 'string') {
      const lower = value.trim().toLowerCase();
      if (lower === 'true') (result as any)[field] = true;
      if (lower === 'false') (result as any)[field] = false;
    }
  };

  const assignArray = (
    field: keyof ArticleData,
    value: any,
    mapper?: (val: any) => string | null
  ) => {
    let arr: any[] | null = null;
    if (Array.isArray(value)) arr = value;
    else if (typeof value === 'string') arr = value.split(/[,;|\n]+/);
    if (!arr) return;
    const mapped = arr
      .map(item => {
        if (mapper) return mapper(item);
        if (typeof item === 'string') return item.trim();
        return item;
      })
      .filter(item => item !== null && item !== undefined && String(item).trim() !== '');
    if (mapped.length > 0 || !retainExisting) {
      const unique = Array.from(new Set(mapped));
      (result as any)[field] = unique;
    }
  };

  const assignContent = (value: any) => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed && retainExisting) return;
    const text = /<[a-z][\s\S]*>/i.test(trimmed) ? stripHtmlToText(trimmed) : trimmed;
    if (text || !retainExisting) {
      result.content = text;
    }
  };

  Object.entries(flat).forEach(([key, value]) => {
    const lower = key.toLowerCase();
    const mapped = slugMap[lower] || ARTICLE_FIELD_ALIASES[lower] || lower;
    switch (mapped) {
      case 'title':
        assignString('title', value);
        break;
      case 'subtitle':
        assignString('subtitle', value);
        break;
      case 'seoTitle':
        assignString('seoTitle', value);
        break;
      case 'seoDescription':
        assignString('seoDescription', value);
        break;
      case 'content':
        if (value && typeof value === 'object') {
          const contentObj = value as any;
          const derived = contentObj.content || contentObj.text || contentObj.value;
          assignContent(derived);
        } else {
          assignContent(value);
        }
        break;
      case 'category':
        if (value && typeof value === 'object') {
          const cat = value as any;
          const derived = cat.name || cat.title || cat.label;
          assignString('category', derived ?? '');
        } else {
          assignString('category', value);
        }
        break;
      case 'author':
        if (value && typeof value === 'object') {
          const author = value as any;
          const derived = author.name || author.title || author.fullName;
          assignString('author', derived ?? '');
          if (author.tov && typeof author.tov === 'string') assignString('authorTOV', author.tov);
        } else {
          assignString('author', value);
        }
        break;
      case 'authorTOV':
        assignString('authorTOV', value);
        break;
      case 'platform':
        assignString('platform', value);
        if (typeof value === 'string') {
          (result as any).streaming_service = value.trim();
        }
        break;
      case 'slug':
        if (value && typeof value === 'object') {
          const slugObj = value as any;
          const derived = slugObj.current || slugObj.slug || slugObj.value || '';
          if (derived || !retainExisting) (result as any).slug = slugify(String(derived));
        } else if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed || !retainExisting) (result as any).slug = slugify(trimmed);
        }
        break;
      case 'tags':
        assignArray('tags', value, item => (typeof item === 'string' ? item.trim() : null));
        break;
      case 'topic':
        if (typeof value === 'string' && value.trim()) {
          const arr = new Set(result.tags || []);
          arr.add(value.trim());
          result.tags = Array.from(arr);
        }
        break;
      case 'topicsSelected':
        assignArray(
          'topicsSelected',
          value,
          item => (typeof item === 'string' ? item.trim() : null)
        );
        break;
      case 'rating':
        assignNumber('rating', value);
        break;
      case 'ratingSkipped':
        assignBoolean('ratingSkipped', value);
        break;
      case 'press':
        assignBoolean('press', value);
        break;
      case 'previewTitle':
        assignString('previewTitle', value);
        break;
      case 'reflection':
        if (typeof value === 'string') (result as any).reflection = value.trim();
        break;
      case 'publishDate':
        if (typeof value === 'string') {
          const trimmed = value.trim();
          if (trimmed) {
            const date = new Date(trimmed);
            (result as any).publishDate = Number.isNaN(date.getTime()) ? trimmed : date.toISOString();
          } else if (!retainExisting) {
            (result as any).publishDate = '';
          }
        }
        break;
      case 'status':
        if (typeof value === 'string') {
          const trimmed = value.trim().toLowerCase();
          if (['draft', 'published', 'archived'].includes(trimmed)) {
            (result as any).status = trimmed as ArticleData['status'];
          }
        }
        break;
      case 'aiDraft':
        if (value && typeof value === 'object') {
          result.aiDraft = { ...(result.aiDraft || {}), ...(value as any) };
        }
        break;
      case 'aiSuggestion':
        if (value && typeof value === 'object') {
          result.aiSuggestion = value as any;
        } else if (!value && !retainExisting) {
          result.aiSuggestion = null;
        }
        break;
      case 'template':
        if (typeof value === 'string') (result as any).template = value.trim();
        break;
      case 'inspirationSource':
        if (typeof value === 'string') (result as any).inspirationSource = value.trim();
        break;
      case 'streaming_service':
        if (typeof value === 'string') {
          const trimmed = value.trim();
          (result as any).streaming_service = trimmed;
          if (!result.platform || !retainExisting) result.platform = trimmed;
        }
        break;
      case '_chatMessages':
        if (Array.isArray(value)) {
          result._chatMessages = value as any[];
        }
        break;
      default:
        break;
    }
  });

  if (!(result as any).slug && result.title) {
    (result as any).slug = slugify(result.title);
  }

  if (!Array.isArray(result.tags)) result.tags = [];
  if (!Array.isArray(result.topicsSelected)) result.topicsSelected = [];
  if (!Array.isArray(result._chatMessages)) result._chatMessages = [];

  return result;
};

// using shared ArticleData type

export default function AIWriterClient() {
  const { user, logout } = useAuth();
  const [currentDraftId, setCurrentDraftId] = useState<string | null>(null);
  const [showDraftsPanel, setShowDraftsPanel] = useState(false);
  const [showSearchModal, setShowSearchModal] = useState(false);
  const [isThinking, setIsThinking] = useState(false);
  const [showWizard, setShowWizard] = useState(true);
  const [wizardInstanceKey, setWizardInstanceKey] = useState(0);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [shelfOpen, setShelfOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [chatTitle, setChatTitle] = useState('Ny artikkel');
  const [articleData, setArticleData] = useState<ArticleData>(() => createEmptyArticleData());

  const [notes, setNotes] = useState('');
  const [chatMessages, setChatMessages] = useState<Array<{
    id: string;
    role: 'user' | 'assistant';
    content: string;
    timestamp: Date;
    files?: UploadedFile[];
  }>>([]);

  const updateArticleData = (updates: Partial<ArticleData>) => {
    setArticleData(prev =>
      normalizeArticleData(updates, prev, { retainExistingOnEmpty: false })
    );
  };

  // Track hydration to avoid wiping storage on first mount in dev/StrictMode
  const hydratedRef = useRef(false);

  // Persist to localStorage to survive refresh, even before auth/Firebase saves
  useEffect(() => {
    if (!hydratedRef.current) return; // wait until after initial restore
    try {
      const toSave = {
        currentDraftId,
        notes,
        articleData,
        // store timestamps as ISO strings for safe JSON
        messages: chatMessages.map(m => ({ ...m, timestamp: m.timestamp.toISOString() })),
        lastModified: new Date().toISOString(),
      };
      localStorage.setItem('ai-writer-draft', JSON.stringify(toSave));
    } catch {}
  }, [chatMessages, articleData, notes, currentDraftId]);

  // Restore from localStorage on mount
  useEffect(() => {
    try {
      const txt = localStorage.getItem('ai-writer-draft');
      if (!txt) return;
      const saved = JSON.parse(txt);
      if (!saved) return;
      if (Array.isArray(saved.messages) && saved.messages.length) {
        const restored = saved.messages.map((m: any) => ({
          ...m,
          timestamp: new Date(m.timestamp),
          files: Array.isArray(m.files) ? m.files : [],
        }));
        setChatMessages(restored);
      }
      if (saved.articleData) {
        const normalized = normalizeArticleData(
          saved.articleData,
          createEmptyArticleData(),
          { retainExistingOnEmpty: false }
        );
        normalized._chatMessages = Array.isArray(saved.messages)
          ? saved.messages.map((m: any) => ({
              ...m,
              timestamp: new Date(m.timestamp),
              files: Array.isArray(m.files) ? m.files : []
            }))
          : [];
        (normalized as any).notes = typeof saved.notes === 'string' ? saved.notes : '';
        setArticleData(normalized);
      }
      if (typeof saved.notes === 'string') setNotes(saved.notes);
      if (saved.currentDraftId) setCurrentDraftId(saved.currentDraftId);
      // Ensure SetupWizard re-initializes with restored initialData
      setWizardInstanceKey((k)=>k+1);
      // If there is existing content, open the review and hide wizard for continuity
      if ((saved.articleData?.content || '') !== '') {
        setReviewOpen(true);
        setShowWizard(false);
      }
      hydratedRef.current = true; // mark restored
    } catch {
      hydratedRef.current = true;
    }
  }, []);

  const generateMessageId = () => {
    try {
      const globalCrypto = typeof globalThis !== 'undefined' ? (globalThis.crypto as any) : undefined;
      if (globalCrypto && typeof globalCrypto.randomUUID === 'function') {
        return globalCrypto.randomUUID();
      }
    } catch {}
    return `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  };

  const addChatMessage = (role: 'user' | 'assistant', content: string, files?: UploadedFile[]) => {
    const newMessage = {
      id: generateMessageId(),
      role,
      content,
      timestamp: new Date(),
      files
    };
    setChatMessages(prev => [...prev, newMessage]);
    return newMessage;
  };

  // AI-generated smart title from current context (like ChatGPT)
  useEffect(() => {
    const rename = async () => {
      if (chatMessages.length === 0) return;
      const firstUser = chatMessages.find(m=>m.role==='user');
      const recent = chatMessages.slice(-6).map(m=>m.content).join('\n');
      const note = notes || '';
      const base = articleData.title || articleData.previewTitle || '';
      // Only rename if default title and we have some context
      const should = (chatTitle === 'Ny artikkel' || !chatTitle || /^ny\s+artik/i.test(chatTitle)) && (recent.length > 30 || note.length > 30 || base.length > 10);
      if (!should) return;
      try {
        const res = await fetch('/api/ai-chat', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            message: 'Foreslå en kort, klikbar samtaletitel (max 48 tegn). Returnér kun selve titlen.',
            chatHistory: chatMessages,
            articleData,
            notes,
          })
        });
        const j = await res.json().catch(()=>null);
        const candidate = (j?.articleUpdate?.previewTitle || j?.response || '').split('\n')[0].trim();
        if (candidate && candidate.length <= 80) setChatTitle(candidate);
      } catch {}
    };
    // Debounce a little
    const t = setTimeout(rename, 600);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chatMessages.length, notes, articleData.title, articleData.previewTitle]);

  const handleSendMessage = async (message: string, files?: UploadedFile[]) => {
    const userMessage = addChatMessage('user', message, files);
    
    try {
      setIsThinking(true);
      // Fetch live Webflow schema, mapping and a few sample items to guide the assistant
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
      const mapSlugToInternalLower = Object.entries(mapSlugToInternal).reduce((acc, [slug, internal]) => {
        acc[slug.toLowerCase()] = internal;
        return acc;
      }, {} as Record<string, string>);
      const isEmptyValue = (val: any) => {
        if (val === undefined || val === null) return true;
        if (typeof val === 'string') return val.trim() === '';
        if (Array.isArray(val)) return val.length === 0;
        if (typeof val === 'object') return Object.keys(val).length === 0;
        return false;
      };

      const readValueForSlug = (dataObj: Record<string, any>, slug: string) => {
        const lower = slug.toLowerCase();
        const candidates = new Set<string>([
          slug,
          lower,
          slug.replace(/-/g, '_'),
          slug.replace(/_/g, '-')
        ]);
        const internal = mapSlugToInternalLower[lower];
        if (internal) candidates.add(internal);
        const aliasInternal = ARTICLE_FIELD_ALIASES[lower];
        if (aliasInternal) candidates.add(aliasInternal);
        for (const key of candidates) {
          if (key in dataObj && !isEmptyValue((dataObj as any)[key])) {
            return (dataObj as any)[key];
          }
        }
        return undefined;
      };

      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          message,
          articleData,
          notes,
          chatHistory: chatMessages,
          authorTOV: articleData.authorTOV || '',
          authorName: articleData.author || '' ,
          webflowSchema: fieldMeta,
          webflowMapping: mappingEntries,
          webflowSamples: (samplesJson.items || []).slice(0,5),
          analysisPrompt: (articleData.template === 'research' && (articleData as any).aiDraft?.completed && (articleData as any).aiDraft?.prompt)
            ? String((articleData as any).aiDraft.prompt)
            : ''
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const rawArticleUpdate = (data.articleUpdate && typeof data.articleUpdate === 'object') ? data.articleUpdate : {};
        const extractedFields = (() => {
          if (rawArticleUpdate.content && Object.keys(rawArticleUpdate).length === 1) {
            const content = String(rawArticleUpdate.content);
            const titleMatch = content.match(/^(?:#\s*)?(.+?)(?:\n|$)/m);
            const extractedTitle = titleMatch ? titleMatch[1].trim() : '';
            const subtitleMatch =
              content.match(/(?:^#\s*.+?\n\n)(.+?)(?:\n\n|$)/m) ||
              content.match(/^.+?\n\n(.+?)(?:\n\n|$)/m);
            const extractedSubtitle = subtitleMatch ? subtitleMatch[1].trim() : '';
            const seoTitle =
              extractedTitle.length > 60
                ? `${extractedTitle.substring(0, 57)}...`
                : extractedTitle;
            const slug = slugify(extractedTitle);
            const firstParagraph =
              content.split('\n\n')[0] || content.split('\n')[0] || '';
            const metaDescription =
              firstParagraph.length > 155
                ? `${firstParagraph.substring(0, 152)}...`
                : firstParagraph;
            return {
              title: extractedTitle,
              subtitle: extractedSubtitle,
              slug,
              seo_title: seoTitle,
              seoTitle,
              meta_description: metaDescription,
              seoDescription: metaDescription
            };
          }
          return {};
        })();

        const mergedArticleUpdate = { ...rawArticleUpdate, ...extractedFields };

        const normalizedForFallback = normalizeArticleData(
          mergedArticleUpdate,
          createEmptyArticleData(),
          { retainExistingOnEmpty: false, slugMap: mapSlugToInternalLower }
        );

        const pickContentFallback = () => {
          const candidates = [
            typeof data.response === 'string' ? data.response : '',
            normalizedForFallback.content || '',
            typeof (rawArticleUpdate as any).content === 'string'
              ? (rawArticleUpdate as any).content
              : '',
            typeof (rawArticleUpdate as any).content_html === 'string'
              ? (rawArticleUpdate as any).content_html
              : '',
            typeof (rawArticleUpdate as any).contentHtml === 'string'
              ? (rawArticleUpdate as any).contentHtml
              : ''
          ];
          for (const candidate of candidates) {
            if (candidate && candidate.trim().length > 0) {
              return /<[a-z][\s\S]*>/i.test(candidate)
                ? stripHtmlToText(candidate)
                : candidate.trim();
            }
          }
          return '';
        };

        const assistantReply =
          typeof data.response === 'string' && data.response.trim().length > 0
            ? data.response
            : pickContentFallback() || 'Artiklen er klar – tjek forhåndsvisningen for detaljer.';

        const assistantMessage = addChatMessage('assistant', assistantReply);
        // Live preview sync: try to extract a working title from the response
        try {
          const m = String(data.response || '').match(/^(?:arbejdstitel|titel)[:\-]\s*(.+)$/im) || String(data.response||'').match(/^#\s+(.+)$/m);
          if (m && m[1]) {
            const preview = m[1].trim();
            setArticleData(prev =>
              normalizeArticleData({ previewTitle: preview }, prev, { retainExistingOnEmpty: false })
            );
          }
        } catch {}
        
        // Keep lightweight chat context for training opt-in later
        const compactMessages = (() => {
          const base = [...chatMessages];
          if (!base.some(msg => msg.id === userMessage.id)) base.push(userMessage);
          if (!base.some(msg => msg.id === assistantMessage.id)) base.push(assistantMessage);
          return base;
        })();
        let nextDataSnapshot: ArticleData | null = null;

        // Single update with all AI response data, chat messages, and notes
        setArticleData(prev => {
          const normalized = normalizeArticleData(
            mergedArticleUpdate,
            prev,
            { retainExistingOnEmpty: true, slugMap: mapSlugToInternalLower }
          );
          normalized.aiSuggestion = (data.suggestion ?? normalized.aiSuggestion) || null;
          normalized._chatMessages = compactMessages;
          (normalized as any).notes = notes;
          nextDataSnapshot = normalized;
          return normalized;
        });

        const nextData = nextDataSnapshot || normalizedForFallback || articleData;
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
          const val = readValueForSlug(nextData, slug);
          const isEmpty = isEmptyValue(val);
          if (isEmpty) missing.push(slug);
        }
        if (missing.length>0) {
          const lines = missing.map(sl=>`- ${labelFor(sl)} (${sl})`);
          addChatMessage('assistant', `For at kunne udgive i Webflow mangler vi følgende felter:\n${lines.join('\n')}\n\nSkriv værdierne, så udfylder jeg dem ét for ét.`);
        }
      } else {
        addChatMessage('assistant', 'Beklager, jeg kunne ikke behandle din forespørgsel lige nu. Prøv igen senere.');
      }
    } catch (error) {
      console.error('Error sending message to AI:', error);
      addChatMessage('assistant', 'Der opstod en fejl. Prøv igen senere.');
    } finally {
      setIsThinking(false);
    }
  };

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
          title: articleData.title || chatTitle || 'Untitled',
          chatTitle: chatTitle || chatMessages[0]?.content.substring(0, 50) || 'Ny artikel',
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
        }
      } catch (error) {
        console.error('Error auto-saving to Firebase:', error);
      }
    }, 2000); // Auto-save after 2 seconds of inactivity

    return () => clearTimeout(autoSaveTimeout);
  }, [chatMessages, articleData, notes, user, currentDraftId, chatTitle]);

  const handleLoadDraft = (draft: ArticleDraft) => {
    setCurrentDraftId(draft.id);
    // Ensure messages have Date and files array
    const restoredMsgs = (draft.messages || []).map(m => ({
      ...m,
      timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
      files: Array.isArray((m as any).files) ? (m as any).files : [],
    }));
    setChatMessages(restoredMsgs);
    // Merge saved articleData and ensure wizard resets from restored initialData
    const normalizedArticle = normalizeArticleData(
      draft.articleData || {},
      createEmptyArticleData(),
      { retainExistingOnEmpty: false }
    );
    normalizedArticle._chatMessages = restoredMsgs;
    (normalizedArticle as any).notes = draft.notes || '';
    setArticleData(normalizedArticle);
    setNotes(draft.notes || '');
    setWizardInstanceKey(key=>key+1);
    // If the restored draft already had setup completed, keep wizard collapsed
    const hasSetup = Boolean((draft.articleData||{}).template) || Boolean((draft.articleData||{}).author || (draft.articleData||{}).authorId);
    if (hasSetup) setShowWizard(false);
    setChatTitle(draft.chatTitle || draft.articleData?.title || 'Ny artikkel');
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


  const handleNewArticle = () => {
    // Reset everything for a new article
    setCurrentDraftId(null);
    setChatMessages([]);
    const emptyArticle = createEmptyArticleData();
    (emptyArticle as any).notes = '';
    setArticleData(emptyArticle);
    setNotes('');
    setShowWizard(true);
    setWizardInstanceKey(key=>key+1);
    setChatTitle('Ny artikkel');
    
    // Close drafts panel if open
    setShowDraftsPanel(false);
    
    // Show success feedback
    const tempElement = document.createElement('div');
    tempElement.textContent = 'Ny artikel oprettet!';
    tempElement.className = 'fixed top-4 right-4 bg-blue-600 text-white px-3 py-2 rounded-lg text-sm z-50';
    document.body.appendChild(tempElement);
    setTimeout(() => {
      document.body.removeChild(tempElement);
    }, 2000);
  };

  const userInitials = (() => {
    const name = (user?.displayName || user?.email || '').trim();
    if (!name) return 'U';
    const [first, last] = name.replace(/@.+$/, '').split(/[\s._-]+/);
    const f = (first || '').charAt(0);
    const l = (last || '').charAt(0);
    return (f + (l || '')).toUpperCase();
  })();

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
      {showDraftsPanel && (
        <DraftsPanel 
          onLoadDraft={handleLoadDraft}
          onClose={() => setShowDraftsPanel(false)}
        />
      )}
      {showSearchModal && (
        <ChatSearchModal
          isOpen={showSearchModal}
          onClose={() => setShowSearchModal(false)}
          onSelectMessage={handleSelectMessage}
        />
      )}
      <div className="h-screen bg-[#171717] p-[1%] flex md:flex-row flex-col gap-4 relative overflow-hidden">
        {/* Background Spline (non-interactive) */}
        <div className="absolute inset-0 z-0 hidden md:block">
          <iframe 
            src="https://my.spline.design/nexbotrobotcharacterconcept-jOiWdJXA0mBgb50nmYl1x0EC/" 
            frameBorder="0" 
            width="100%" 
            height="100%"
            className="w-full h-full"
            title="AI Background"
          />
        </div>
        {user && (
          <>
            {/* Apropos Research Logo */}
            <div className="absolute bottom-4 right-4 z-10">
              <img 
                src="/images/Apropos Research White.png" 
                alt="Apropos Research" 
                className="h-6 opacity-40 hover:opacity-60 transition-opacity"
              />
            </div>
            
            {/* Shelf - desktop: absolute with outer padding to align with chat area */}
            <div className={`hidden md:block absolute top-[1%] bottom-[1%] left-[1%] z-40`} style={{ width: shelfOpen ? 'min(300px, 50vw)' : '0px', transition: 'width 320ms cubic-bezier(0.22, 1, 0.36, 1), opacity 220ms ease', opacity: shelfOpen ? 1 : 0, pointerEvents: shelfOpen ? 'auto' : 'none' }}>
              <div className={`h-full flex flex-col rounded-xl border border-white/20 overflow-hidden transform bg-[#171717]`} style={{ transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: shelfOpen ? 'translateX(0px)' : 'translateX(-8px)' }}>
                <DraftsShelf
                  isOpen={shelfOpen}
                  onSelect={(draft)=>{
                    setShelfOpen(false);
                    setShowDraftsPanel(false);
                    const sanitizedMessages = (draft.messages || []).map(m => ({
                      ...m,
                      timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
                      files: Array.isArray((m as any).files) ? (m as any).files : [],
                    }));
                    setChatMessages(sanitizedMessages);
                    const normalizedArticle = normalizeArticleData(
                      draft.articleData || {},
                      createEmptyArticleData(),
                      { retainExistingOnEmpty: false }
                    );
                    normalizedArticle._chatMessages = sanitizedMessages;
                    (normalizedArticle as any).notes = draft.notes || '';
                    setArticleData(normalizedArticle);
                  }}
                  onClose={()=> setShelfOpen(false)}
                  onRenameLive={(id, title)=>{
                    if (currentDraftId === id) {
                      setChatTitle(title);
                      setArticleData(prev =>
                        normalizeArticleData(
                          { title, previewTitle: title, slug: title },
                          prev,
                          { retainExistingOnEmpty: false }
                        )
                      );
                    }
                  }}
                />
              </div>
            </div>
            {/* Mobile shelf */}
            <div className={`md:hidden ${shelfOpen ? 'absolute inset-0 z-40 translate-x-0' : 'hidden'} transition-transform duration-300`}>
              <div className="h-full flex flex-col rounded-none border-t border-white/10 bg-[#171717]">
                <DraftsShelf
                  isOpen={shelfOpen}
                  onSelect={(draft)=>{
                    setShelfOpen(false);
                    const sanitizedMessages = (draft.messages || []).map(m => ({
                      ...m,
                      timestamp: m.timestamp instanceof Date ? m.timestamp : new Date(m.timestamp),
                      files: Array.isArray((m as any).files) ? (m as any).files : [],
                    }));
                    setChatMessages(sanitizedMessages);
                    const normalizedArticle = normalizeArticleData(
                      draft.articleData || {},
                      createEmptyArticleData(),
                      { retainExistingOnEmpty: false }
                    );
                    normalizedArticle._chatMessages = sanitizedMessages;
                    (normalizedArticle as any).notes = draft.notes || '';
                    setArticleData(normalizedArticle);
                  }}
                  onClose={()=> setShelfOpen(false)}
                  onRenameLive={(id, title)=>{
                    if (currentDraftId === id) {
                      setChatTitle(title);
                      setArticleData(prev =>
                        normalizeArticleData(
                          { title, previewTitle: title, slug: title },
                          prev,
                          { retainExistingOnEmpty: false }
                        )
                      );
                    }
                  }}
                />
              </div>
            </div>

            {/* Main Chat with AI */}
            <div
              className="md:w-[500px] w-full flex-shrink-0 absolute top-[1%] bottom-[1%] left-[1%] z-10"
              style={{ transition: 'transform 320ms cubic-bezier(0.22, 1, 0.36, 1)', transform: shelfOpen ? 'translateX(calc(12px + min(300px, 50vw)))' : 'translateX(0)' }}
            >
              {/* Always keep chat visible underneath */}
              <MainChatPanel 
                messages={chatMessages}
                onSendMessage={handleSendMessage}
                articleData={articleData}
                isThinking={isThinking}
                chatTitle={chatTitle}
                onChatTitleChange={setChatTitle}
                wizardNode={(
                  <div>
                    {/* Persistent progress */}
                    <button type="button" onClick={()=>setShowWizard(true)} className="w-full px-3 py-2 md:py-3 flex gap-1 items-center cursor-pointer">
                        {(() => {
                          const templateDone = Boolean((articleData as any).template);
                          const isResearch = (articleData as any).template === 'research';
                          const sourceDone = isResearch ? Boolean((articleData as any).inspirationSource) : false;
                          const trendingDone = isResearch ? Boolean((articleData as any).researchSelected) : false;
                          const inspirationDone = isResearch ? Boolean((articleData as any).inspirationAcknowledged) : false;
                          const analysisDone = isResearch ? Boolean((articleData as any).aiDraft && (((articleData as any).aiDraft.prompt)||((articleData as any).aiDraft.suggestions||[]).length>0)) : false;
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
                          const segs: boolean[] = [templateDone];
                          if (isResearch) {
                            segs.push(sourceDone, trendingDone, inspirationDone, analysisDone);
                          }
                          segs.push(authorDone, sectionDone, topicDone);
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
                        <h2 className="text-white text-base font-medium">Artikel opsætning</h2>
                        <div className="flex items-center gap-2 text-xs">
                          <button onClick={()=>setShowWizard(false)} className="text-white/60 hover:text-white">Skjul</button>
                        </div>
                      </div>
                      <SetupWizard
                        key={wizardInstanceKey}
                        initialData={articleData}
                        onChange={(d:any)=> setArticleData(d)}
                        onComplete={async (setup:any)=>{
                          const merged = { ...articleData, ...setup };
                          setArticleData(merged);
                          setShowWizard(false);
                          const topics = Array.isArray(setup.topicsSelected)
                            ? setup.topicsSelected
                            : [setup.topic].filter(Boolean);
                          const tagList = Array.isArray(setup.tags) ? setup.tags : [];
                          const combinedTopics = Array.from(new Set([...topics, ...tagList].filter(Boolean))).join(', ');
                          const summaryLines: string[] = [];
                          summaryLines.push(`Template: ${setup.template === 'research' ? 'Research' : 'Noter'}`);
                          summaryLines.push(`Author: ${setup.author || '—'}`);
                          summaryLines.push(`Section: ${setup.category || setup.section || '—'}`);
                          summaryLines.push(`Topic(s): ${combinedTopics || '—'}`);
                          if (setup.template === 'research') {
                            summaryLines.push(`Kilde: ${setup.inspirationSource || '—'}`);
                            summaryLines.push(`Research-artikel: ${setup.researchSelected?.title || '—'}`);
                            if (setup.aiDraft?.prompt || setup.aiDraftPrompt) {
                              const prompt = setup.aiDraft?.prompt || setup.aiDraftPrompt;
                              summaryLines.push(`AI Prompt: ${prompt}`);
                            }
                          }
                          if (setup.platform) summaryLines.push(`Platform: ${setup.platform}`);
                          const ratingText = setup.rating ? `${setup.rating}⭐` : 'Ingen';
                          summaryLines.push(`Rating: ${ratingText}`);
                          if (Array.isArray(tagList) && tagList.length > 0) {
                            summaryLines.push(`Tags: ${tagList.join(', ')}`);
                          }
                          const pressText = setup.press === true ? 'Ja' : setup.press === false ? 'Nej' : 'Ikke angivet';
                          summaryLines.push(`Press: ${pressText}`);
                          const summary = summaryLines.join('\n');
                          
                          // Auto-generate article if template is 'notes' and we have notes
                          if (setup.template === 'notes' && notes && notes.length > 120) {
                            addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nJeg genererer nu artiklen baseret på dine noter...`);
                            // Auto-trigger article generation
                            await handleSendMessage('Generer artikel baseret på mine noter');
                          } else {
                            addChatMessage('assistant', `Super. Jeg har sat artiklen op:\n${summary}\n\nSkal vi starte med en arbejdstitel og en indledning?`);
                          }
                        }}
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
                    tags: ['Gaming', 'Anmeldelse']
                  });
                }}
                onNewCultureArticle={() => {
                  updateArticleData({
                    title: '',
                    subtitle: '',
                    category: 'Kultur',
                    tags: ['Kultur', 'Anmeldelse']
                  });
                }}
                updateArticleData={updateArticleData}
              />

            </div>

            {/* Layout placeholder for chat width so the mini‑menu keeps its placement */}
            <div className="hidden md:block md:w-[500px] flex-shrink-0" style={{ height: '1px' }} />
            
            {/* Right Sidebar with action buttons (desktop) */}
            <MiniMenu
              translateX={shelfOpen ? 'translateX(calc(12px + min(300px, 50vw) + 500px + 12px))' : 'translateX(calc(500px + 12px))'}
              onSearch={() => setShowSearchModal(true)}
              onToggleReview={() => setReviewOpen(prev=>!prev)}
              onToggleShelf={() => setShelfOpen(prev=>!prev)}
              onNewArticle={handleNewArticle}
            />

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
                  <ReviewPanel articleData={articleData} frameless />
                </div>
              </div>
            </div>

            {/* Mobile bottom bar */}
            <div className="md:hidden fixed bottom-3 left-1/2 -translate-x-1/2 z-50 rounded-2xl border border-white/20 p-1.5 flex items-center gap-1.5 bg-black/90 backdrop-blur-md shadow-lg">
              <button onClick={() => setShelfOpen(prev=>!prev)} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors min-w-[64px]" aria-label="Mine artikler">
                <div className="grid grid-cols-3 gap-0.5 w-4 h-4">
                  <div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div>
                  <div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div>
                  <div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div><div className="w-1 h-1 bg-white rounded"></div>
                </div>
                <span className="text-[10px] text-white/70">Drafts</span>
              </button>
              <button onClick={() => setReviewOpen(prev=>!prev)} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors min-w-[64px]" aria-label="Review">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-white">
                  <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
                <span className="text-[10px] text-white/70">Preview</span>
              </button>
              <button onClick={handleNewArticle} className="flex flex-col items-center gap-1 px-3 py-2 rounded-xl hover:bg-white/10 active:bg-white/15 transition-colors min-w-[64px]" aria-label="Ny artikel">
                <div className="relative w-4 h-4">
                  <div className="absolute top-1/2 left-1/2 w-3 h-0.5 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
                  <div className="absolute top-1/2 left-1/2 w-0.5 h-3 bg-white transform -translate-x-1/2 -translate-y-1/2"></div>
                </div>
                <span className="text-[10px] text-white/70">Ny</span>
              </button>
            </div>

          </>
        )}
      </div>
    </>
  );
}
