import { expect, it } from 'vitest';
import { approvalEntries, approvalStory, APPROVAL_PAGE_SIZE } from '@/lib/liv/approval-feed';
import { emptyDeliveryState, eligibleEntries, type ReadyEntry } from '@/lib/liv/delivery-policy';
import type { WebflowArticleFields } from '@/lib/webflow/types';
import { readFileSync } from 'node:fs';
const entry: ReadyEntry = { itemId: 'a'.repeat(24), payloadHash: 'b'.repeat(64), title: 'En historie', slug: 'historie',
  scheduledDay: '2026-09-11', expiresDay: '2026-09-11', kind: 'scheduled', state: 'ready', preparedAt: '' };
const payload = { content: '<h2>En vinkel</h2><p>Analyse &amp; mening</p><script>alert(1)</script>',
  category: 'TV-serier', tags: [], excerpt: '<b>Et resumé</b>', featuredImage: 'https://cdn.prod.website-files.com/a.jpg' } as WebflowArticleFields;

const slot = (itemId: string, state: 'selected' | 'attempted' | 'published') => ({ itemId, state,
  token: 'fixture', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 });
it('shows one eligible reserve when today is published and tomorrow has no ready scheduled story', () => {
  const state = emptyDeliveryState();
  state.slots['2026-09-10'] = slot('published', 'published');
  state.entries = [{ ...entry, itemId: 'reserve', kind: 'reserve' },
    { ...entry, itemId: 'expired', kind: 'reserve', expiresDay: '2026-09-10' },
    { ...entry, itemId: 'rejected', kind: 'reserve', decision: 'rejected' },
    { ...entry, itemId: 'future', kind: 'reserve', scheduledDay: '2026-09-12' }];
  const before = structuredClone(state);
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['reserve']);
  expect(state).toEqual(before);
});
it('previews today’s eligible reserve before tomorrow’s scheduled story when today is unpublished', () => {
  const state = emptyDeliveryState();
  const todayReserve = { ...entry, itemId: 'today-reserve', kind: 'reserve' as const, scheduledDay: '2026-09-10' };
  state.entries = [entry, todayReserve];
  const before = structuredClone(state);
  expect(approvalEntries(state, '2026-09-10')).toEqual([todayReserve, entry]);
  expect(state).toEqual(before);
  state.entries = [entry];
  expect(approvalEntries(state, '2026-09-10')).toEqual([entry]);
});
it('keeps delivery approval priority across scheduled stories and reserves', () => {
  const state = emptyDeliveryState();
  state.entries = [entry, { ...entry, itemId: 'reserve', kind: 'reserve', decision: 'approved' },
    { ...entry, itemId: 'older-reserve', kind: 'reserve', preparedAt: '2020' }];
  expect(approvalEntries(state, '2026-09-11').map(e => e.itemId)).toEqual(['reserve', entry.itemId, 'older-reserve']);
  state.entries[0] = { ...entry, decision: 'rejected' };
  expect(approvalEntries(state, '2026-09-11').map(e => e.itemId)).toEqual(['reserve', 'older-reserve']);
  state.entries = [state.entries[0]];
  expect(approvalEntries(state, '2026-09-11')[0].decision).toBe('rejected');
});
it.each([false, true])('matches delivery ordering for approved reserve vs pending scheduled before future cards (today published=%s)', published => {
  const state = emptyDeliveryState();
  const day = published ? '2026-09-10' : '2026-09-11';
  if (published) state.slots[day] = slot('already-published', 'published');
  const reserve = { ...entry, itemId: 'approved-reserve', kind: 'reserve' as const, decision: 'approved' as const };
  const future = { ...entry, itemId: 'future', scheduledDay: '2026-09-14', expiresDay: '2026-09-14' };
  state.entries = [future, entry, reserve];
  const before = structuredClone(state);
  expect(approvalEntries(state, day)).toEqual([...eligibleEntries(state, '2026-09-11'), future]);
  expect(approvalEntries(state, day)[0]).toBe(reserve);
  expect(state).toEqual(before);
  state.entries[1] = { ...entry, decision: 'approved' };
  expect(approvalEntries(state, day)[0].itemId).toBe(entry.itemId); // equal approval: scheduled first
});
it.each(['selected', 'attempted'] as const)('shows only the %s slot owner, never another ready card', status => {
  const state = emptyDeliveryState();
  const selected = { ...entry, itemId: 'selected-reserve', kind: 'reserve' as const, state: 'selected' as const };
  state.entries = [entry, selected, { ...entry, itemId: 'other-reserve', kind: 'reserve' }];
  state.slots['2026-09-11'] = slot(selected.itemId, status);
  expect(approvalEntries(state, '2026-09-10')).toEqual([selected]);
  state.entries = [entry];
  expect(approvalEntries(state, '2026-09-10')).toEqual([]);
});
it('does not preview another reserve across an earlier uncertain delivery or cover hold', () => {
  const state = emptyDeliveryState(); state.entries = [{ ...entry, kind: 'reserve' }];
  state.slots['2026-09-09'] = slot('unknown', 'attempted');
  expect(approvalEntries(state, '2026-09-11')).toEqual([]);
  state.slots = {}; state.coverRevision = { id: 'hold', itemId: 'unknown', day: '2026-09-11' };
  expect(approvalEntries(state, '2026-09-11')).toEqual([]);
});
it('does not show a reserve assigned to another slot or pull future stock forward', () => {
  const state = emptyDeliveryState(); state.entries = [{ ...entry, kind: 'reserve' }];
  expect(approvalEntries(state, '2026-09-10')).toEqual([]);
  state.slots['2026-09-09'] = slot(entry.itemId, 'published');
  expect(approvalEntries(state, '2026-09-11')).toEqual([]);
});
it('labels reserve availability without promising a scheduled publication date', () => {
  const source = readFileSync('app/ai/liv/LivApprovalFeed.tsx', 'utf8');
  expect(source).toContain("story.kind === 'reserve' ? 'Reserve · klar til næste ledige udgivelse'");
  expect(source).toContain('Planlagt ${dateLabel(story.scheduledDay)}');
});
it('supplies up to three upcoming stories and retains a rejected choice for reversal without exposing old stock', () => {
  expect(APPROVAL_PAGE_SIZE).toBe(3);
  const state = emptyDeliveryState();
  state.entries = [{ ...entry, kind: 'reserve' }, { ...entry, itemId: 'b', decision: 'rejected' },
    { ...entry, expiresDay: '2026-09-09' }, { ...entry, scheduledDay: '2026-09-20', expiresDay: '2026-09-20' }];
  const before = structuredClone(state);
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['b']);
  expect(state).toEqual(before);
});
it('prioritizes today over tomorrow and excludes published/rejected-state history', () => {
  const state = emptyDeliveryState();
  state.entries = [{ ...entry, itemId: 'tomorrow' },
    { ...entry, itemId: 'today', scheduledDay: '2026-09-10', expiresDay: '2026-09-10' },
    { ...entry, itemId: 'published', state: 'published', scheduledDay: '2026-09-10' },
    { ...entry, itemId: 'archived-rejection', state: 'rejected', scheduledDay: '2026-09-10' }];
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['today', 'tomorrow']);
});
it('shows tomorrow once today has a publication receipt, not another ready story for today', () => {
  const state = emptyDeliveryState();
  state.entries = [entry, { ...entry, itemId: 'today-unused', scheduledDay: '2026-09-10' }];
  state.slots['2026-09-10'] = { itemId: 'published-item', state: 'published', token: 'fixture', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 };
  expect(approvalEntries(state, '2026-09-10')).toEqual([entry]);
});
it('displays the selected item rather than a different ready item for that day', () => {
  const state = emptyDeliveryState();
  state.entries = [entry, { ...entry, itemId: 'selected', state: 'selected' }];
  state.slots[entry.scheduledDay] = { itemId: 'selected', state: 'selected', token: 'fixture', leaseUntil: 0, attempts: 1, nextAttemptAt: 0 };
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['selected']);
});
it('shows the ready alternative over a rejected choice without mutating either decision', () => {
  const state = emptyDeliveryState();
  state.entries = [{ ...entry, decision: 'rejected' }, { ...entry, itemId: 'alternative' }];
  const before = structuredClone(state);
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['alternative']);
  expect(state).toEqual(before);
});
it('breaks same-day ties deterministically and retains approved priority', () => {
  const state = emptyDeliveryState();
  state.entries = [{ ...entry, itemId: 'b' }, { ...entry, itemId: 'a' }];
  expect(approvalEntries(state, '2026-09-10')[0].itemId).toBe('a');
  state.entries[0].decision = 'approved';
  expect(approvalEntries(state, '2026-09-10')[0].itemId).toBe('b');
});
it('shows the existing review reserve plus Monday and Tuesday scheduled stories without changing delivery state', () => {
  const state = emptyDeliveryState();
  state.slots['2026-09-12'] = slot('published-today', 'published');
  const review = { ...entry, itemId: 'gentlemen', kind: 'reserve' as const, scheduledDay: '2026-09-12', expiresDay: '2026-09-17' };
  const culture = { ...entry, itemId: 'culture', scheduledDay: '2026-09-14', expiresDay: '2026-09-14' };
  const feature = { ...entry, itemId: 'feature', scheduledDay: '2026-09-15', expiresDay: '2026-09-15' };
  state.entries = [feature, review, culture];
  const before = structuredClone(state);
  expect(approvalEntries(state, '2026-09-12')).toEqual([review, culture, feature]);
  expect(state).toEqual(before);
});
it('includes scheduled day +7 but excludes day +8, past work and work expiring before its scheduled day', () => {
  const state = emptyDeliveryState();
  const seventh = { ...entry, itemId: 'seventh', scheduledDay: '2026-09-17', expiresDay: '2026-09-17' };
  state.entries = [seventh,
    { ...entry, itemId: 'eighth', scheduledDay: '2026-09-18', expiresDay: '2026-09-18' },
    { ...entry, itemId: 'past', scheduledDay: '2026-09-09', expiresDay: '2026-09-17' },
    { ...entry, itemId: 'invalid-expiry', scheduledDay: '2026-09-16', expiresDay: '2026-09-15' }];
  expect(approvalEntries(state, '2026-09-10')).toEqual([seventh]);
});
it('caps the preview at three unique items while preserving approved and chronological ordering', () => {
  const state = emptyDeliveryState();
  const first = { ...entry, itemId: 'first', decision: 'approved' as const };
  state.entries = [entry, first, first,
    { ...entry, itemId: 'second-day', scheduledDay: '2026-09-12', expiresDay: '2026-09-12' },
    { ...entry, itemId: 'third-day', scheduledDay: '2026-09-13', expiresDay: '2026-09-13' }];
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['first', entry.itemId, 'second-day']);
});
it('never fills three cards with rejected decisions when non-rejected work exists', () => {
  const state = emptyDeliveryState();
  state.entries = [entry, { ...entry, itemId: 'rejected', decision: 'rejected' },
    { ...entry, itemId: 'rejected-state', state: 'rejected' }, { ...entry, itemId: 'published', state: 'published' }];
  expect(approvalEntries(state, '2026-09-10')).toEqual([entry]);
});
it('keeps a later-week selected slot authoritative and never substitutes a missing owner', () => {
  const state = emptyDeliveryState();
  const selected = { ...entry, itemId: 'selected', state: 'selected' as const, scheduledDay: '2026-09-15', expiresDay: '2026-09-15' };
  state.entries = [entry, selected]; state.slots['2026-09-15'] = slot('selected', 'selected');
  expect(approvalEntries(state, '2026-09-10')).toEqual([selected]);
  state.entries = [entry]; expect(approvalEntries(state, '2026-09-10')).toEqual([]);
});
it('excludes a published slot owner even if a stale ready entry has a different scheduled day', () => {
  const state = emptyDeliveryState(); state.entries = [entry];
  state.slots['2026-09-09'] = slot(entry.itemId, 'published');
  expect(approvalEntries(state, '2026-09-10')).toEqual([]);
});
it('describes three weekly previews without promising three automatic preparations', () => {
  const source = readFileSync('app/ai/liv/LivApprovalFeed.tsx', 'utf8');
  expect(source).toContain('Op til tre klargjorte historier fra i dag og syv dage frem.');
  expect(source).not.toContain('Én historie til i morgen.');
});
it('exposes a minimal plain text DTO, not HTML, research internals or editor identity', () => {
  const dto = approvalStory({ ...entry, decidedBy: 'private-editor' }, { ...payload, aiModel: 'private-model' });
  expect(dto).toMatchObject({ category: 'TV-serie', summary: 'Et resumé', decision: 'pending', revision: 0,
    paragraphs: ['En vinkel', 'Analyse & mening'] });
  expect(JSON.stringify(dto)).not.toMatch(/script|private-editor|private-model/);
});
it('shows the whole saved draft, including the ending beyond twelve paragraphs', () => {
  const paragraphs = Array.from({ length: 18 }, (_, i) => `Afsnit ${i + 1}`);
  const dto = approvalStory(entry, { ...payload, content: paragraphs.map(text => `<p>${text}</p>`).join('') });
  expect(dto.paragraphs).toEqual(paragraphs);
});
it('includes the saved introduction once in the full preview', () => {
  const dto = approvalStory(entry, { ...payload, intro: '<p>En konkret åbning.</p>', content: '<p>Resten af teksten.</p>' });
  expect(dto.paragraphs).toEqual(['En konkret åbning.', 'Resten af teksten.']);
  expect(approvalStory(entry, { ...payload, intro: 'Samme intro', content: '<p>Samme intro</p>' }).paragraphs).toEqual(['Samme intro']);
});
it.each(['javascript:alert(1)', 'http://cdn.prod.website-files.com/a.jpg', 'https://evil.example/a.jpg',
  'https://user:password@cdn.prod.website-files.com/a.jpg', 'https://cdn.prod.website-files.com:1234/a.jpg'])('blocks unsafe image URL %s', url => {
  expect(approvalStory(entry, { ...payload, featuredImage: url }).image).toBeNull();
});
it('does not infer a film label just from an article mentioning cinema in its body', () => {
  expect(approvalStory(entry, { ...payload, category: 'Kultur', content: '<p>Film og biografer</p>' }).category).toBe('Kultur');
});
it('uses the saved category rather than relabelling from incidental tags', () => {
  expect(approvalStory(entry, { ...payload, category: 'Kultur', tags: ['film', 'streaming'] }).category).toBe('Kultur');
  expect(approvalStory(entry, { ...payload, category: 'Film', tags: ['streaming'] }).category).toBe('Film');
});
it('uses explicit saved subject classification without changing the CMS section', () => {
  const saved = { ...payload, category: 'Kultur', subjectType: 'film' as const };
  expect(approvalStory(entry, saved).category).toBe('Film');
  expect(saved.category).toBe('Kultur');
  expect(approvalStory(entry, { ...saved, subjectType: 'tv-series' }).category).toBe('TV-serie');
});
const reason = 'Filmens konkrete portrætter giver plads til tvivl, men den afsluttende scene forenkler konflikten.';
it('exposes an explicit review with its saved 1–6 rating and concrete rationale', () => {
  expect(approvalStory(entry, { ...payload, articleFormat: 'research-review', rating: 4, ratingReason: reason }))
    .toMatchObject({ articleFormat: 'research-review', formatLabel: 'Researchanmeldelse', rating: 4, ratingReason: reason });
});
it.each([1, 2, 3, 4, 5, 6])('preserves an actual reasoned rating of %s without randomization or rounding', rating => {
  expect(approvalStory(entry, { ...payload, articleFormat: 'research-review', rating, ratingReason: reason }).rating).toBe(rating);
});
it.each([undefined, 0, 7, -1, 2.5, NaN, '4'])('never invents a rating from invalid review value %s', rating => {
  const value = { ...payload, articleFormat: 'research-review', rating, ratingReason: reason } as Parameters<typeof approvalStory>[1];
  expect(approvalStory(entry, value)).toMatchObject({ formatLabel: 'Researchanmeldelse', rating: null, ratingReason: null });
});
it.each([undefined, '', 'God film', 'x'.repeat(601), '<script>fake reasoning that must not qualify</script>'])('withholds stars without a usable saved rationale: %s', ratingReason => {
  expect(approvalStory(entry, { ...payload, articleFormat: 'research-review', rating: 4, ratingReason }))
    .toMatchObject({ rating: null, ratingReason: null });
});
it.each([undefined, 'article', 'unknown'])('does not infer a review from a category/title/rating when format is %s', articleFormat => {
  const value = { ...payload, category: 'Film', articleFormat, rating: 4, ratingReason: reason } as Parameters<typeof approvalStory>[1];
  expect(approvalStory({ ...entry, title: 'Anmeldelse: Filmen får fire stjerner' }, value))
    .toMatchObject({ formatLabel: 'Artikel', rating: null, ratingReason: null });
});
it('returns plain rationale text, never source markup or executable content', () => {
  const dto = approvalStory(entry, { ...payload, articleFormat: 'research-review', rating: 4,
    ratingReason: `<b>${reason}</b><script>private script</script>` });
  expect(dto.ratingReason).toBe(reason);
});
it('returns private feedback only to its author without disclosing identity or timestamp', () => {
  const withFeedback = { ...entry, editorialFeedback: { text: '<b>Min kommentar</b>', userId: 'private-editor',
    recordedAt: '2026-09-12T10:00:00Z', revision: 1 } };
  expect(approvalStory(withFeedback, payload).feedback).toBeNull();
  expect(approvalStory(withFeedback, payload, 'another-editor').feedback).toBeNull();
  const own = approvalStory(withFeedback, payload, 'private-editor');
  expect(own.feedback).toBe('<b>Min kommentar</b>');
  expect(JSON.stringify(own)).not.toMatch(/private-editor|recordedAt/);
});
