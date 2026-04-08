export type PromptSegmentKind = 'system' | 'web-append';

export type PromptSegment = {
  id: string;
  labelDa: string;
  kind: PromptSegmentKind;
  content: string;
  included: boolean;
  locked?: boolean;
};

export const PROMPT_SEGMENT_IDS = {
  base: 'base',
  authorTov: 'author-tov',
  authorName: 'author-name',
  template: 'template',
  articleMeta: 'article-meta',
  wizardResearch: 'wizard-research',
  aiSuggestions: 'ai-suggestions',
  setupPrompt: 'setup-prompt',
  editorNotes: 'editor-notes',
  structure: 'structure',
  antiPlagiarism: 'anti-plagiarism',
  styleSamples: 'style-samples',
  outputFormat: 'output-format',
  webFacts: 'web-facts',
} as const;

export type PromptSegmentId = (typeof PROMPT_SEGMENT_IDS)[keyof typeof PROMPT_SEGMENT_IDS];

export const LOCKED_SEGMENT_IDS = new Set<string>([PROMPT_SEGMENT_IDS.base, PROMPT_SEGMENT_IDS.outputFormat]);
