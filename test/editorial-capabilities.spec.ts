import { expect, it } from 'vitest';
import { canOpenEditorialApp, OWNER_APPS, requiresEditorialOwner } from '@/lib/editorial-capabilities';

it.each(OWNER_APPS)('limits %s to the owner', app => {
  expect(canOpenEditorialApp(app, { owner: false })).toBe(false);
  expect(canOpenEditorialApp(app, { owner: true })).toBe(true);
});
it.each(['/api/seo-engine/jobs', '/api/podcast/upload', '/api/newsletter/draft', '/api/liv-inbox/threads',
  '/api/push/send', '/api/admin/access', '/api/editorial/operations', '/api/cron/liv-prepare',
  '/api/accreditation/requests', '/api/accreditation/contacts', '/api/accreditation/imap', '/api/editorial/accreditation', '/api/editorial/mail',
  '/api/editorial/desk', '/api/webflow/config', '/api/instagram/config', '/api/instagram/exchange-token'])('guards %s', path => {
  expect(requiresEditorialOwner(path, 'GET')).toBe(true);
});
it('allows viewing the Liv queue, not modifying it', () => {
  expect(requiresEditorialOwner('/api/ai-cost/writer', 'GET')).toBe(false);
  expect(requiresEditorialOwner('/api/ai-cost/writer', 'POST')).toBe(true);
  expect(requiresEditorialOwner('/api/ai-cost/provider', 'GET')).toBe(true);
  expect(requiresEditorialOwner('/api/ai-cost/writer/other', 'GET')).toBe(true);
  expect(requiresEditorialOwner('/api/webflow/article-translation/status', 'GET')).toBe(false);
  expect(requiresEditorialOwner('/api/webflow/article-translation/status', 'PATCH')).toBe(true);
  expect(requiresEditorialOwner('/api/liv/delivery/feed', 'GET')).toBe(false);
  expect(requiresEditorialOwner('/api/liv/delivery/feed', 'POST')).toBe(true);
  expect(requiresEditorialOwner('/api/liv/operations/edit', 'POST')).toBe(true);
  expect(requiresEditorialOwner('/api/liv/plan', 'GET')).toBe(true);
  expect(requiresEditorialOwner('/api/liv/delivery', 'GET')).toBe(true);
  expect(requiresEditorialOwner('/api/liv/status', 'GET')).toBe(false);
  expect(requiresEditorialOwner('/api/generate-article', 'POST')).toBe(false);
  expect(requiresEditorialOwner('/api/newsletterish', 'GET')).toBe(false);
});
