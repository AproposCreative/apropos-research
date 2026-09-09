import type { EditorialSignal, EditorialResearchResult } from './types';
import type { GeneratedArticle } from '@/lib/liv/generate-article';

export type DeskStory = {
  id: string;
  signal: EditorialSignal;
  status: 'discovered' | 'researching' | 'researched' | 'drafting' | 'draft' | 'failed';
  updatedAt: string;
  createdAt?: string;
  research?: EditorialResearchResult;
  article?: GeneratedArticle;
  cmsPreflight?: import('./cms-preflight').CmsPreflight;
  error?: string;
};
