import { expect, it, vi } from 'vitest';
import { readLivIdeaOverview } from '@/lib/liv/idea-overview';

const getEditorialDesk = vi.hoisted(() => vi.fn());
vi.mock('@/lib/editorial/ideas', () => ({ getEditorialDesk }));

it('shows only unlinked saved briefs, never linked drafts or published articles', async () => {
  getEditorialDesk.mockResolvedValueOnce({
    ideas: [
      { id: 'idea-1', title: 'Mulig historie', angle: 'En vinkel', status: 'suggested', createdAt: '2026-10-19T08:00:00Z', submission: null },
      { id: 'idea-2', title: 'Christopher', angle: 'Allerede skrevet', status: 'draft_saved', createdAt: '2026-10-19T08:00:00Z', submission: { status: 'draft' } },
      { id: 'idea-3', title: 'Udgivet', angle: 'Historisk', status: 'draft_saved', createdAt: '2026-10-12T08:00:00Z', submission: { status: 'published' } },
      { id: 'idea-4', title: 'Valgt idé', angle: 'Mangler endnu tekst', status: 'selected', createdAt: '2026-10-19T08:00:00Z', submission: null },
    ], coverage: { ideasHaveMore: false }, readAt: '2026-10-23T20:00:00Z',
  });
  const overview = await readLivIdeaOverview('owner');
  expect(getEditorialDesk).toHaveBeenCalledWith('owner', { limit: 30 });
  expect(overview).toEqual({ items: [
    { id: 'idea-1', title: 'Mulig historie', angle: 'En vinkel', status: 'suggested', createdAt: '2026-10-19T08:00:00Z' },
    { id: 'idea-4', title: 'Valgt idé', angle: 'Mangler endnu tekst', status: 'selected', createdAt: '2026-10-19T08:00:00Z' },
  ], retained: [], complete: true, checkedAt: '2026-10-23T20:00:00Z' });
});

it('does not claim full coverage when the idea archive is truncated', async () => {
  getEditorialDesk.mockResolvedValueOnce({ ideas: [], coverage: { ideasHaveMore: true }, readAt: '2026-10-23T20:00:00Z' });
  expect((await readLivIdeaOverview('owner')).complete).toBe(false);
});
