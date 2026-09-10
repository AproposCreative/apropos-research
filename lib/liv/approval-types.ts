export type ApprovalStory = {
  itemId: string; payloadHash: string; revision: number;
  title: string; summary: string; paragraphs: string[]; category: string;
  image: string | null; imageAlt: string; credit: string;
  scheduledDay: string; kind: 'scheduled' | 'reserve';
  state: 'ready' | 'selected' | 'published' | 'rejected';
  decision: 'pending' | 'approved' | 'rejected';
};
export type ApprovalFeed = { stories: ApprovalStory[]; total: number; nextOffset: number | null;
  queueEnabled: boolean; preparationEnabled: boolean };
