export type AIDraft = {
  prompt?: string;
  suggestions?: string[];
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
  aiDraft?: AIDraft | null;
  previewTitle?: string; // live title parsed from assistant drafts
  aiSuggestion?: { type: 'rating'; title: string; description: string } | null;
  // transient fields used by flows
  template?: 'notes' | 'research' | '';
  inspirationSource?: string;
  researchSelected?: any;
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
}
