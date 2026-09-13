import { afterEach, expect, it, vi } from 'vitest';
vi.mock('google-auth-library', () => ({ GoogleAuth: class {
  async getClient() { return { getAccessToken: async () => ({ token: 'test-token' }) }; }
} }));
vi.mock('../lib/firebase-admin', () => ({ getAdminAuth: vi.fn(), getAdminDb: vi.fn() }));
import { editorialRulesRelease } from '../scripts/editorial-rules-release';
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

it('requires a live verifier before making any request', async () => {
  const transport = vi.fn(); vi.stubGlobal('fetch', transport);
  await expect(editorialRulesRelease(true)).rejects.toThrow('live_rules_verifier_required');
  expect(transport).not.toHaveBeenCalled();
});

it('fails closed before rules writes when policy tests fail', async () => {
  vi.stubEnv('FIREBASE_ADMIN_PROJECT_ID', 'test-project');
  const requests: string[] = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    requests.push(url);
    let data: unknown = {};
    if (url.endsWith('/releases')) data = { releases: [
      { name: 'projects/test-project/releases/cloud.firestore', rulesetName: 'old-firestore' },
      { name: 'projects/test-project/releases/firebase.storage/test-bucket', rulesetName: 'old-storage' },
    ] };
    else if (url.endsWith(':test')) data = { testResults: [{ state: 'FAILURE' }] };
    else throw new Error('unexpected_request');
    return new Response(JSON.stringify(data));
  }));
  await expect(editorialRulesRelease(true, async () => {})).rejects.toThrow('rules_tests_failed');
  expect(requests.some(url => url.includes('setIamPolicy') || url.endsWith('/rulesets') || url.includes('updateMask'))).toBe(false);
});
