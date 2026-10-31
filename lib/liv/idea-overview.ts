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
  const saved: LivIdeaItem[] = desk.ideas
    .filter(idea => !idea.submission)
    .map(idea => ({ id: idea.id, title: idea.title, angle: idea.angle,
      status: idea.status as LivIdeaItem['status'], createdAt: idea.createdAt }));
  const since = Date.parse(desk.readAt) - 7 * 86400000;
  const current = (idea: LivIdeaItem) => idea.status === 'selected' || Date.parse(idea.createdAt) >= since;
  const dates = [...desk.ideas, ...(desk.retainedIdeas || [])].map(idea => idea.createdAt).filter(date => Number.isFinite(Date.parse(date))).sort();
  return { items: saved.filter(current), history: saved.filter(idea => !current(idea)), latestCreatedAt: dates.at(-1) || null,
    retained: (desk.retainedIdeas || []).map(idea => ({ id: idea.id, title: idea.title, angle: idea.angle, status: 'suggested' as const, createdAt: idea.createdAt })), complete: !desk.coverage.ideasHaveMore, checkedAt: desk.readAt };
}
