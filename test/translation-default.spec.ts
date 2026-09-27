import { afterEach, expect, it, vi } from 'vitest';
const db = vi.hoisted(() => ({ value: undefined as boolean | undefined }));
vi.mock('@/lib/firebase-admin', () => ({ getAdminDb: () => ({ collection: () => ({ doc: () => ({
  get: async () => ({ exists: db.value !== undefined, data: () => ({ autoTranslateEn: db.value }) }),
}) }) }) }));
afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); db.value = undefined; });
it.each([undefined, '', 'false'])('does not translate automatically with env %s', async flag => {
  vi.stubEnv('WEBFLOW_AUTO_TRANSLATE_EN', flag);
  const { resolveAutoTranslateEnabled } = await import('@/lib/webflow/article-translation-settings');
  expect(await resolveAutoTranslateEnabled()).toBe(false);
});
it('retains explicit activation and honors an explicit runtime stop', async () => {
  vi.stubEnv('WEBFLOW_AUTO_TRANSLATE_EN', 'true');
  const { resolveAutoTranslateEnabled } = await import('@/lib/webflow/article-translation-settings');
  expect(await resolveAutoTranslateEnabled()).toBe(true);
  db.value = false;
  expect(await resolveAutoTranslateEnabled()).toBe(false);
  db.value = true;
  expect(await resolveAutoTranslateEnabled()).toBe(true);
});
