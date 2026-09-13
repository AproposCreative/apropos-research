import { expect, it } from 'vitest';
import { canOpenEditorialApp, OWNER_APPS, requiresEditorialOwner } from '@/lib/editorial-capabilities';

it.each(OWNER_APPS)('limits %s to the owner', app => {
  expect(canOpenEditorialApp(app, { owner: false })).toBe(false);
  expect(canOpenEditorialApp(app, { owner: true })).toBe(true);
});
it.each(['/api/seo-engine/jobs', '/api/podcast/upload', '/api/newsletter/draft', '/api/liv-inbox/threads',
  '/api/push/send', '/api/admin/access', '/api/editorial/operations', '/api/cron/liv-prepare'])('guards %s', path => {
  expect(requiresEditorialOwner(path, 'GET')).toBe(true);
});
it('allows viewing the Liv queue, not modifying it', () => {
  expect(requiresEditorialOwner('/api/liv/delivery/feed', 'GET')).toBe(false);
  expect(requiresEditorialOwner('/api/liv/delivery/feed', 'POST')).toBe(true);
  expect(requiresEditorialOwner('/api/liv/operations/edit', 'POST')).toBe(true);
  expect(requiresEditorialOwner('/api/generate-article', 'POST')).toBe(false);
  expect(requiresEditorialOwner('/api/newsletterish', 'GET')).toBe(false);
});
