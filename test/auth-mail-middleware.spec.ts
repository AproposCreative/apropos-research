import { expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
vi.mock('@/lib/editorial-access', () => ({ verifyEditorialToken: async () => null }));
import { isApiRequestAuthorized } from '@/lib/api/middleware-auth';
it('exempts only the exact mail POST, not neighbouring routes or read methods', async () => {
  vi.stubEnv('INTERNAL_API_SECRET','fixture-secret');
  try {
    const req = (path:string,method:string) => new NextRequest(`https://app.test${path}`,{method});
    expect(await isApiRequestAuthorized(req('/api/auth/mail','POST'))).toBe(true);
    for (const [path,method] of [['/api/auth/mail','GET'],['/api/auth/mail/other','POST'],['/api/writer/workspace','POST']]) {
      expect(await isApiRequestAuthorized(req(path,method))).toBe(false);
    }
  } finally { vi.unstubAllEnvs(); }
});
