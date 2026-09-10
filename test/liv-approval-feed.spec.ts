import { expect, it } from 'vitest';
import { approvalEntries, approvalStory, APPROVAL_PAGE_SIZE } from '@/lib/liv/approval-feed';
import { emptyDeliveryState, type ReadyEntry } from '@/lib/liv/delivery-policy';
import type { WebflowArticleFields } from '@/lib/webflow/types';
const entry: ReadyEntry = { itemId: 'a'.repeat(24), payloadHash: 'b'.repeat(64), title: 'En historie', slug: 'historie',
  scheduledDay: '2026-09-11', expiresDay: '2026-09-11', kind: 'scheduled', state: 'ready', preparedAt: '' };
const payload = { content: '<h2>En vinkel</h2><p>Analyse &amp; mening</p><script>alert(1)</script>',
  category: 'TV-serier', tags: [], excerpt: '<b>Et resumé</b>', featuredImage: 'https://cdn.prod.website-files.com/a.jpg' } as WebflowArticleFields;
it('supplies five stories per page, keeps decisions visible and sorts by planned day', () => {
  expect(APPROVAL_PAGE_SIZE).toBe(5);
  const state = emptyDeliveryState();
  state.entries = [{ ...entry, kind: 'reserve' }, { ...entry, itemId: 'b', decision: 'rejected' },
    { ...entry, expiresDay: '2026-09-09' }, { ...entry, scheduledDay: '2026-09-20', expiresDay: '2026-09-20' }];
  expect(approvalEntries(state, '2026-09-10').map(e => e.itemId)).toEqual(['b', entry.itemId]);
});
it('exposes a minimal plain text DTO, not HTML, research internals or editor identity', () => {
  const dto = approvalStory({ ...entry, decidedBy: 'private-editor' }, { ...payload, aiModel: 'private-model' });
  expect(dto).toMatchObject({ category: 'TV-serie', summary: 'Et resumé', decision: 'pending', revision: 0,
    paragraphs: ['En vinkel', 'Analyse & mening'] });
  expect(JSON.stringify(dto)).not.toMatch(/script|private-editor|private-model/);
});
it.each(['javascript:alert(1)', 'http://cdn.prod.website-files.com/a.jpg', 'https://evil.example/a.jpg',
  'https://user:password@cdn.prod.website-files.com/a.jpg', 'https://cdn.prod.website-files.com:1234/a.jpg'])('blocks unsafe image URL %s', url => {
  expect(approvalStory(entry, { ...payload, featuredImage: url }).image).toBeNull();
});
it('does not infer a film label just from an article mentioning cinema in its body', () => {
  expect(approvalStory(entry, { ...payload, category: 'Kultur', content: '<p>Film og biografer</p>' }).category).toBe('Kultur');
});
