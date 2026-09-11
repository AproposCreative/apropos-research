import { afterEach, expect, it, vi } from 'vitest';
import { livInternalOrigin } from '@/lib/liv/internal-origin';
afterEach(() => vi.unstubAllEnvs());
it.each(['https://protected-deployment.vercel.app', 'https://untrusted.example'])('uses the production app, not request host %s', origin => {
  vi.stubEnv('VERCEL_ENV', 'production');
  expect(livInternalOrigin(origin)).toBe('https://ai.aproposmagazine.com');
});
it.each(['preview', 'development', ''])('does not send preview/local calls to production: %s', env => {
  vi.stubEnv('VERCEL_ENV', env);
  expect(livInternalOrigin('http://localhost:3000/path')).toBe('http://localhost:3000');
  expect(livInternalOrigin('https://preview.vercel.app')).toBe('https://preview.vercel.app');
});
it('rejects invalid protocols and embedded credentials', () => {
  vi.stubEnv('VERCEL_ENV', 'preview');
  expect(() => livInternalOrigin('file:///tmp/test')).toThrow('liv_internal_origin_invalid');
  expect(() => livInternalOrigin('https://user:password@example.com')).toThrow('liv_internal_origin_invalid');
});
