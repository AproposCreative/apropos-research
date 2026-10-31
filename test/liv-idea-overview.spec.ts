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
  ], history: [], latestCreatedAt: '2026-10-19T08:00:00Z', retained: [], complete: true, checkedAt: '2026-10-23T20:00:00Z' });
});

it('shows a fresh brief first while retaining older proposals and selected work without changing their dates', async () => {
  const saved = [
    { id: 'fresh', title: 'Ny kulturguide', angle: 'En aktuel vinkel', status: 'suggested', createdAt: '2026-10-31T08:00:00Z', submission: null },
    { id: 'old', title: 'Tidligere forslag', angle: 'En bevaret vinkel', status: 'suggested', createdAt: '2026-10-19T08:00:00Z', submission: null },
    { id: 'selected', title: 'Valgt bog', angle: 'Afventer læsning', status: 'selected', createdAt: '2026-10-18T08:00:00Z', submission: null },
  ];
  const before = structuredClone(saved);
  getEditorialDesk.mockResolvedValueOnce({ ideas: saved, coverage: { ideasHaveMore: false }, readAt: '2026-10-31T13:00:00Z' });
  const overview = await readLivIdeaOverview('owner');
  expect(overview.items.map(item => item.id)).toEqual(['fresh', 'selected']);
  expect(overview.history.map(item => item.id)).toEqual(['old']);
  expect(overview.latestCreatedAt).toBe('2026-10-31T08:00:00Z');
  expect(saved).toEqual(before);
});

it('does not present a refreshed read timestamp as a new brief', async () => {
  getEditorialDesk.mockResolvedValueOnce({ ideas: [
    { id: 'old', title: 'Gammel idé', angle: 'Bevaret', status: 'suggested', createdAt: '2026-10-19T08:00:00Z', submission: null },
  ], coverage: { ideasHaveMore: false }, readAt: '2026-10-31T13:00:00Z' });
  const overview = await readLivIdeaOverview('owner');
  expect(overview.items).toEqual([]);
  expect(overview.history).toHaveLength(1);
  expect(overview.latestCreatedAt).toBe('2026-10-19T08:00:00Z');
});

it('does not claim full coverage when the idea archive is truncated', async () => {
  getEditorialDesk.mockResolvedValueOnce({ ideas: [], coverage: { ideasHaveMore: true }, readAt: '2026-10-23T20:00:00Z' });
  expect((await readLivIdeaOverview('owner')).complete).toBe(false);
});

it('keeps the brief date even when its ideas already have saved articles', async () => {
  getEditorialDesk.mockResolvedValueOnce({ ideas: [
    { id: 'linked', title: 'Allerede skrevet', createdAt: '2026-10-31T08:00:00Z', submission: { status: 'draft' } },
  ], coverage: { ideasHaveMore: false }, readAt: '2026-10-31T13:00:00Z' });
  expect(await readLivIdeaOverview('owner')).toMatchObject({ items: [], history: [], latestCreatedAt: '2026-10-31T08:00:00Z' });
});
