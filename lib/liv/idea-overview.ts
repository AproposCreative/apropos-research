import { getEditorialDesk } from '@/lib/editorial/ideas';

export type LivIdeaItem = {
  id: string;
  title: string;
  angle: string;
  status: 'suggested' | 'selected';
  createdAt: string;
};

/** Saved editorial briefs are leads, never article drafts or publication slots. */
export async function readLivIdeaOverview(uid: string) {
  const desk = await getEditorialDesk(uid, { limit: 30 });
  const items: LivIdeaItem[] = desk.ideas
    .filter(idea => !idea.submission)
    .map(idea => ({ id: idea.id, title: idea.title, angle: idea.angle,
      status: idea.status as LivIdeaItem['status'], createdAt: idea.createdAt }));
  return { items, retained: (desk.retainedIdeas || []).map(idea => ({ id: idea.id, title: idea.title, angle: idea.angle, status: 'suggested' as const, createdAt: idea.createdAt })), complete: !desk.coverage.ideasHaveMore, checkedAt: desk.readAt };
}
