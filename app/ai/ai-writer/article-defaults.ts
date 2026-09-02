/**
 * Default-data og normaliseringshelpers til AIWriterClient.
 *
 * Ekstraheret fra `app/ai/AIWriterClient.tsx` så defaults kan genbruges af
 * fremtidige sub-komponenter (draft-shelf, prompt-architect, etc.) uden
 * cirkulære imports.
 */

import type { ArticleData } from '@/types/article';
import type { ThinkingStep } from '@/types/thinking';

export const buildDefaultArticleData = (): ArticleData => ({
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
  generationMode: 'editorial',
});

export const normalizeArticleData = (incoming?: Partial<ArticleData>): ArticleData => {
  const base = buildDefaultArticleData();
  if (!incoming) return base;
  return {
    ...base,
    ...incoming,
    tags: Array.isArray(incoming.tags) ? incoming.tags : base.tags,
    topicsSelected: Array.isArray(incoming.topicsSelected)
      ? incoming.topicsSelected
      : base.topicsSelected,
    generationMode: incoming.generationMode === 'fast' ? 'fast' : 'editorial',
  };
};

export const BASE_THINKING_STEPS: ThinkingStep[] = [
  { id: 'analysis', label: 'Analyserer brief og noter', status: 'pending', icon: 'dot' },
  { id: 'analysis-read', label: 'Indlæser template & noter', status: 'pending', icon: 'doc', indent: 1 },
  { id: 'analysis-verify', label: 'Verificerer længdekrav', status: 'pending', icon: 'dot', indent: 1 },
  { id: 'research', label: 'Finder referencer & fakta', status: 'pending', icon: 'dot' },
  { id: 'research-source', label: 'Scanner kulturkilder', status: 'pending', icon: 'doc', indent: 1 },
  { id: 'draft', label: 'Skriver Apropos-udkast', status: 'pending', icon: 'dot' },
  { id: 'draft-shape', label: 'Former intro, brødtekst, eftertanke', status: 'pending', icon: 'doc', indent: 1 },
  { id: 'polish', label: 'Finpudser tone & struktur', status: 'pending', icon: 'dot' },
];

export const GENERATION_MODE_OPTIONS: Array<{
  id: 'fast' | 'editorial';
  label: string;
  description: string;
}> = [
  { id: 'fast', label: 'Fast mode', description: 'Hurtig sparring uden tung research' },
  { id: 'editorial', label: 'Editorial', description: 'Fuld redaktionel pipeline med research' },
];

export type AIWriterView =
  | 'ai'
  | 'design-editor'
  | 'newsletter'
  | 'dashboard'
  | 'podcast'
  | 'push'
  | 'funding'
  | 'akkreditering'
  | 'liv-inbox'
  | 'seo'
  | null;

/** Resolve hvilken view URL'en peger på. */
export function resolveViewFromSearchParams(sp: {
  get: (key: string) => string | null;
}): AIWriterView {
  const view = sp.get('view');
  if (view === 'newsletter') return 'newsletter';
  if (view === 'design-editor') return 'design-editor';
  if (view === 'dashboard') return 'dashboard';
  if (view === 'podcast') return 'podcast';
  if (view === 'push') return 'push';
  if (view === 'funding') return 'funding';
  if (view === 'akkreditering') return 'akkreditering';
  if (view === 'liv-inbox') return 'liv-inbox';
  if (view === 'seo') return 'seo';
  if (view === 'ai') return 'ai';
  const n = sp.get('newsletter');
  const w = sp.get('webapp');
  if (n === '1' || n === 'true' || w === 'newsletter') return 'newsletter';
  if (w === 'dashboard') return 'dashboard';
  if (w === 'podcast') return 'podcast';
  if (w === 'push-desk') return 'push';
  if (w === 'funding-desk') return 'funding';
  if (w === 'akkreditering') return 'akkreditering';
  if (w === 'liv-inbox') return 'liv-inbox';
  return null;
}
