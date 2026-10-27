import type { LivArticleFormat } from './review-format';
import type { LivEditorialKind } from './editorial-kind';
import type { LivCostSummary } from './cost-ledger';
import type { LivNextPreparationStatus } from './preparation-status';
import type { LivWorkItem } from './work-overview';
import type { LivIdeaItem } from './idea-overview';

export type ApprovalStory = {
  itemId: string; payloadHash: string; revision: number;
  title: string; summary: string; paragraphs: string[]; category: string;
  /** Explicit saved format; legacy/unknown metadata never implies a review. */
  articleFormat: LivArticleFormat | null; formatLabel: string;
  editorialKind?: LivEditorialKind;
  rating: number | null; ratingReason: string | null;
  /** Only returned to the authenticated author, never part of CMS content. */
  feedback: string | null;
  image: string | null; imageAlt: string; credit: string;
  scheduledDay: string; kind: 'scheduled' | 'reserve';
  state: 'ready' | 'selected' | 'published' | 'rejected';
  publicationBlockers?: string[];
  decision: 'pending' | 'approved' | 'rejected';
};
export type ApprovalFeed = { stories: ApprovalStory[]; total: number; nextOffset: number | null;
  queueUnavailable?: boolean;
  week?: import('./weekly-plan').WeeklyStory[];
  work?: { items: LivWorkItem[]; retained?: LivWorkItem[]; complete: boolean; checkedAt: string;
    sources: { submissions: number; livCheckpoints: number; editorialDesk: number; cmsRows: number } } | null;
  ideas?: { items: LivIdeaItem[]; retained?: LivIdeaItem[]; complete: boolean; checkedAt: string } | null;
  queueEnabled: boolean; preparationEnabled: boolean; cost?: LivCostSummary; preparation?: LivNextPreparationStatus };
