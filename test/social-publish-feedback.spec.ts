import { expect, it } from 'vitest';
import { socialConfigured, socialPublishFeedback, uncertainSocialPublish } from '@/lib/social-publish-feedback';

it.each([500, 502, 503, 504, 408])('does not report a lost %s response as a failed post', status => {
  const result = socialPublishFeedback(status, { error: 'Connection lost' }, false, true);
  expect(result).toEqual(uncertainSocialPublish());
  expect(result.error).toBeNull();
  expect(result.success).toBeNull();
  expect(result.warning).toContain('dobbeltopslag');
});
it.each([null, {}, { success: true }, { success: false, mediaId: '1' }, { success: true, mediaId: '' }])('requires a real success receipt, not HTTP200: %j', data => {
  expect(socialPublishFeedback(200, data, false, false)).toEqual(uncertainSocialPublish());
});
it('confirms Instagram and Facebook independently', () => {
  expect(socialPublishFeedback(200, { success: true, mediaId: 'ig', facebookPublished: true, facebookCommentPublished: true }, false, true))
    .toEqual({ success: 'Publiceret på Instagram og Facebook.', warning: null, error: null });
  const partial = socialPublishFeedback(200, { success: true, mediaId: 'ig', facebookPublished: false, facebookError: 'Connection lost' }, false, true);
  expect(partial.success).toBe('Publiceret på Instagram.');
  expect(partial.warning).toContain('Facebook:');
  expect(partial.error).toBeNull();
});
it('keeps actual rejection visible', () => {
  expect(socialPublishFeedback(400, { error: 'Ugyldigt billede' }, false, false).error).toBe('Ugyldigt billede');
});
it('does not ask for article-link comments on successful feed posts', () => {
  expect(socialPublishFeedback(200, { success: true, mediaId: 'ig', facebookPublished: true, facebookCommentPublished: false }, false, true))
    .toEqual({ success: 'Publiceret på Instagram og Facebook.', warning: null, error: null });
});
it('does not claim an unconfirmed story succeeded', () => {
  expect(socialPublishFeedback(200, {}, true, false).success).toBeNull();
  expect(socialPublishFeedback(200, { success: true, mediaId: 'ig' }, true, false).success).toBe('Story er publiceret på Instagram.');
});
it('separates connection/invalid status from confirmed missing configuration', () => {
  expect(socialConfigured(200, { configured: true })).toBe(true);
  expect(socialConfigured(200, { configured: false })).toBe(false);
  for (const status of [401, 503]) expect(socialConfigured(status, { configured: false })).toBeNull();
  expect(socialConfigured(200, {})).toBeNull();
});
