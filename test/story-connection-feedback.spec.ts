import { expect, it } from 'vitest';
import { storyConnectionMessage } from '@/lib/social/story-connection-status';
import { socialReceiptChannelLabel } from '@/lib/social/receipt-feedback';
import type { SocialPublishReceipt } from '@/lib/social/publish-types';

it('tells team members that the shared Meta connection is the owner’s task', () => {
  expect(storyConnectionMessage('not_connected', false)).toContain('Ejeren skal tilslutte den fælles Meta-forbindelse');
  expect(storyConnectionMessage('not_connected', false)).toContain('Du skal ikke logge ind på Meta her.');
  expect(storyConnectionMessage('not_connected', true)).toContain('Tilslut den fælles Meta-forbindelse');
});
it('distinguishes an unavailable server from a confirmed missing login', () => {
  expect(storyConnectionMessage('unavailable', true)).toContain('kunne ikke kontrolleres');
  expect(storyConnectionMessage('unavailable', true)).not.toContain('Tilslut');
  expect(storyConnectionMessage('not_configured', false)).toContain('Story-serveren er ikke tilsluttet');
});
it('keeps pending checks separate from saved connections', () => {
  expect(storyConnectionMessage(null, false)).toContain('Kontrollerer');
  expect(storyConnectionMessage('connected', false)).toBeNull();
});
it.each([true, false])('labels the actual format from the original receipt without changing its evidence: story=%s', isStory => {
  const receipt: SocialPublishReceipt = { id: 'one', ownerUid: 'milo', articleId: 'article', requestId: 'attempt', createdAt: '2026-11-02T16:32:00Z', updatedAt: '2026-11-02T16:32:00Z', complete: true, phase: 'done', channels: { instagram: true, facebook: false }, instagram: { status: 'published', url: 'https://www.instagram.com/p/example/' }, facebook: { status: 'skipped' }, comment: { status: 'skipped' }, imageSha256: 'digest', approved: { isStory, card: { title: 'Original' }, caption: '', articleUrl: 'https://www.aproposmagazine.com/articles/original' } };
  const before = JSON.stringify(receipt);
  expect(socialReceiptChannelLabel(receipt, 'instagram')).toBe(isStory ? 'Instagram Story' : 'Instagram-opslag');
  expect(socialReceiptChannelLabel(receipt, 'facebook')).toBe('Facebook-opslag');
  expect(JSON.stringify(receipt)).toBe(before);
});
