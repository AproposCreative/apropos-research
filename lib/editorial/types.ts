import type { CoveredEditorialTopic, EditorialArticleType } from '@/lib/editorial/signal-store';

export type EditorialBeatId = 'musik' | 'film-tv' | 'gaming' | 'kultur';

export type EditorialBeat = {
  id: EditorialBeatId;
  label: string;
  searchSeeds: string[];
  audience: string;
};

export type EditorialSource = {
  title: string;
  content: string;
  source: string;
  url: string | null;
  strategy?: string;
  domain?: string;
  score?: number;
};

export type EditorialSignal = {
  id: string;
  title: string;
  source: string;
  beat: string;
  urgency: number;
  originality: number;
  brandFit: number;
  risk: number;
  audience: string;
  angle: string;
  evidence: string[];
  nextAction: string;
  sources?: EditorialSource[];
  duplicateRisk?: number;
  suggestedArticleType?: EditorialArticleType;
};

export type QualityGateCheck = {
  id: string;
  label: string;
  ok: boolean;
  detail: string;
};

export type QualityGate = {
  ready: boolean;
  score: number;
  sourceCount: number;
  sourceDiversity: number;
  checks: QualityGateCheck[];
};

export type ResearchDossier = {
  signal: EditorialSignal;
  sources: EditorialSource[];
  keyFacts: string[];
  unansweredQuestions: string[];
  danishAngle: string;
  counterpoint: string;
  suggestedArticleType: EditorialArticleType;
};

export type ArticleBrief = {
  signalId: string;
  signalTitle: string;
  articleType: EditorialArticleType;
  targetWordCount: number;
  targetLengthLabel: string;
  text: string;
};

export type EditorialResearchResult = {
  dossier: ResearchDossier;
  qualityGate: QualityGate;
  brief: ArticleBrief;
};

export type DiscoverSignalsOptions = {
  coveredTopics?: CoveredEditorialTopic[];
  limit?: number;
};

