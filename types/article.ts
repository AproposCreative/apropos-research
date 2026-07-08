import type { EditorialArticleType } from '@/lib/editorial/signal-store';
import type { EditorialResearchResult } from '@/lib/editorial/types';
import type { ApplicationSection, FundingResearchResult } from '@/lib/funding/types';

export type AIDraft = {
  prompt?: string;
  suggestions?: string[];
  // Mark when the analysis step is completed in the Setup Wizard
  completed?: boolean;
};

export interface ArticleData {
  title: string;
  subtitle: string;
  category: string; // also referred as section in wizard
  author: string;
  authorTOV?: string;
  content: string;
  rating?: number;
  ratingSkipped?: boolean;
  tags: string[];
  platform?: string; // streaming_service synonym
  press?: boolean | null;
  /**
   * Canonical Webflow CMS field for press accreditation. Mirrors `press` and
   * is the field actually written to Webflow via webflow-mapping.ts.
   */
  presseakkreditering?: boolean | null;
  intro?: string;
  aiDraft?: AIDraft | null;
  previewTitle?: string; // live title parsed from assistant drafts
  aiSuggestion?: { type: 'rating'; title: string; description: string } | null;
  // transient fields used by flows
  template?: 'notes' | 'research' | '';
  inspirationSource?: string;
  researchSelected?: any;
  // Whether the user acknowledged the inspiration summary in research flow
  inspirationAcknowledged?: boolean;
  recommendedSelected?: any;
  _chatMessages?: any[];
  seoTitle?: string;
  seoDescription?: string;
  publishDate?: string;
  status?: 'draft' | 'published' | 'archived';
  // compatibility aliases used in SetupWizard and flows
  authorId?: string;
  section?: string;
  topic?: string;
  topicsSelected?: string[];
  streaming_service?: string;
  featuredImage?: string;
  /** Prompt brugt ved seneste AI-billedgenerering (til debugging/visning) */
  lastGeneratedImagePrompt?: string;
  generationMode?: 'fast' | 'editorial';
  editorialSignalId?: string;
  editorialSignalTitle?: string;
  articleType?: EditorialArticleType;
  targetWordCount?: number;
  targetLengthLabel?: string;
  editorialResearch?: EditorialResearchResult | null;
  fundingOpportunityId?: string;
  fundingResearch?: FundingResearchResult | null;
  applicationSection?: ApplicationSection;
}
